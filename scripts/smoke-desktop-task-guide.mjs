import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'

const root = process.cwd()
const desktopDir = join(root, 'apps', 'desktop')
const electronExe = join(desktopDir, 'node_modules', 'electron', 'dist', process.platform === 'win32' ? 'electron.exe' : 'electron')
const pnpmStore = join(root, 'vendor', 'deepseek-harness', 'node_modules', '.pnpm')
const deadlineMs = Number(process.env.AGENT_PI_WORKBENCH_E2E_MS || 120_000)
function playwrightEntry() {
  const entry = readdirSync(pnpmStore, { withFileTypes: true })
    .filter((item) => item.isDirectory() && /^playwright@/.test(item.name))
    .map((item) => join(pnpmStore, item.name, 'node_modules', 'playwright', 'index.mjs'))
    .find((path) => existsSync(path))
  if (!entry) throw new Error('Playwright is missing from the bundled DSH toolchain')
  return entry
}

assert.ok(existsSync(electronExe), 'Electron executable missing: ' + electronExe)
assert.ok(existsSync(join(root, 'vendor', 'deepseek-harness', 'apps', 'web', 'dist', 'index.html')), 'DSH web dist is not built')

const { _electron: electron } = await import(pathToFileURL(playwrightEntry()).href)
const scratch = mkdtempSync(join(tmpdir(), 'agent-pi-task-guide-'))
const userDataDir = join(scratch, 'electron-user-data')
const dshHome = join(scratch, 'dsh-home')
const workspace = join(scratch, 'workspace')
const sourceFile = join(workspace, '项目资料.md')
const reportFile = join(workspace, '工期建议.md')
const objective = '判断当前施工方案的工期是否可实现，形成给领导决策的建议'
const assistantReply = '我会先核对材料中的工期条件，再整理影响工期判断的约束与待确认事项。'
const artifactDir = resolve(process.env.AGENT_PI_QA_ARTIFACT_DIR || join(tmpdir(), 'agent-pi-task-guide-ui-3.7.9'))
mkdirSync(workspace, { recursive: true })
mkdirSync(artifactDir, { recursive: true })
writeFileSync(sourceFile, [
  '# 项目资料',
  '',
  '- 项目：现场施工计划审阅',
  '- 正文工期：120 天',
  '- 补遗工期：90 天',
  '- 本文件仅用于 Agent Pi DSH 本地端到端回归。',
  '',
].join('\n'), 'utf8')
writeFileSync(reportFile, '# 工期建议\n\n正文和补遗的工期不同，需确认文件优先顺序与实际资源配置。\n', 'utf8')

const profileInit = spawnSync(process.execPath, [join(root, 'scripts', 'init-tender-profile.mjs')], {
  cwd: root,
  env: {
    ...process.env,
    DSH_CHECKOUT: join(root, 'vendor', 'deepseek-harness'),
    DSH_HOME: dshHome, AGENT_PI_QA_WORKSPACE: workspace, AGENT_PI_QA_USER_DATA: userDataDir, AGENT_PI_QA_DESKTOP_MAIN: join(desktopDir,'main.mjs'), OPENAI_API_KEY: '', DEEPSEEK_API_KEY: '',
  },
  encoding: 'utf8',
  windowsHide: true,
})
assert.equal(profileInit.status, 0, profileInit.stderr || profileInit.stdout || 'profile init failed')
const profilePatchPath = join(dshHome, 'profiles', 'tender', 'cordis.patch.yml')
const profilePatch = readFileSync(profilePatchPath, 'utf8').replace(/^\[\]\s*$/m, '')
  .replace('# agent-pi:managed-defaults', '# agent-pi:e2e-browse-picker')
writeFileSync(profilePatchPath, profilePatch + [
  '',
  '# Playwright cannot drive an OS directory dialog; pin DSH official browser picker.',
  '- id: directory-picker',
  '  disabled: true',
  '- insert:',
  '    - id: directory-picker-browse',
  "      name: '@deepseek-ai/dsh-host-directory-picker-browse'",
  '    - id: ui-directory-picker-browse',
  "      name: '@deepseek-ai/dsh-client-ui-directory-picker-browse'",
  '',
].join('\n'), 'utf8')


const qaPlugin=join(scratch,'qa-session.mjs')
writeFileSync(qaPlugin, `
import {createMessage,createUserMessage} from ${JSON.stringify(pathToFileURL(join(root,'vendor','deepseek-harness','packages','llm','llm','src','index.ts')).href)};
export const name='qa-session';
export const inject=['sessions','sessionPersistence','sessionController','webServer','tools','agents','taskGuide'];
export async function apply(ctx) {
  await ctx.sessionController.create({sessionId:'qa-guided-task',cwd:process.env.AGENT_PI_QA_WORKSPACE});
  const s=ctx.sessions.get('qa-guided-task');
  s.append('turn/start',{turn:1});
  s.append('user/message',createUserMessage({content:[{type:'text',text:${JSON.stringify(objective)}}],source:{kind:'user'}}),{surfaceOp:'append'});
  s.append('step/start',{turn:1,step:1});
  s.append('assistant/message',{turn:1,step:1,stream:[],message:createMessage({role:'assistant',content:[{type:'text',text:${JSON.stringify(assistantReply)}}],source:{kind:'model',provider:'qa-fixture',model:'qa-fixture'}})},{surfaceOp:'append'});
  s.append('step/end',{turn:1,step:1});
  s.append('turn/end',{turn:1,reason:{kind:'completed'}});
  await ctx.sessionController.rename({sessionId:s.id,title:'Professional task guide QA'});
  await ctx.sessions.flush(s);
  ctx.webServer.register({kind:'exact',path:'/api/agent-pi/qa-task-tool',async handler(req,res) {
    const send=(code,value)=>{res.writeHead(code,{'Content-Type':'application/json'});res.end(JSON.stringify(value))};
    try {
      if(req.method==='GET')return send(200,{humanMessages:s.deriveMessages().filter(row=>row.role==='user').length});
      req.setEncoding('utf8');let raw='';for await(const part of req)raw+=part;
      const input=JSON.parse(raw);if(!['professional_task','professional_depth'].includes(input.tool))throw new Error('Unsupported QA tool');
      const agent=ctx.agents.get(s.id);if(!agent)throw new Error('QA session agent is not ready');
      const result=await agent.ctx.get('tools').execute({callId:'qa-'+Date.now(),name:input.tool,arguments:input.args,agent,signal:new AbortController().signal});
      if(result.isError)throw new Error(JSON.stringify(result.content));
      send(200,result.value);
    }catch(error){send(409,{error:String(error.message||error)})}
  }});
}
`)
writeFileSync(profilePatchPath,readFileSync(profilePatchPath,'utf8')+'\n- insert:\n    - id: qa-session\n      name: '+JSON.stringify(qaPlugin.replaceAll('\\','/'))+'\n')

let electronApp
let page
const qaLoader = join(scratch, 'desktop-loader.mjs')
writeFileSync(qaLoader, "import {app} from 'electron';import {pathToFileURL} from 'node:url';app.setPath('userData',process.env.AGENT_PI_QA_USER_DATA);await import(pathToFileURL(process.env.AGENT_PI_QA_DESKTOP_MAIN).href)")
let processOutput = ''
const pageErrors = []
const consoleErrors = []
const startedAt = Date.now()
const remaining = () => Math.max(1, deadlineMs - (Date.now() - startedAt))

async function clickOptional(pattern, timeout = 3_000) {
  const button = page.getByRole('button', { name: pattern }).first()
  const visible = await button.waitFor({ state: 'visible', timeout: Math.min(timeout, remaining()) })
    .then(() => true)
    .catch(() => false)
  if (visible) await button.click()
}

try {
  electronApp = await electron.launch({
    executablePath: electronExe,
    args: ['--user-data-dir=' + userDataDir, qaLoader],
    cwd: root,
    env: {
      ...process.env,
      AGENT_PI_DSH_FORCE_COLD_START: '1',
      DSH_CHECKOUT: join(root, 'vendor', 'deepseek-harness'),
      DSH_HOME: dshHome,
      ELECTRON_DISABLE_SECURITY_WARNINGS: 'true', AGENT_PI_QA_WORKSPACE: workspace, AGENT_PI_QA_USER_DATA: userDataDir, AGENT_PI_QA_DESKTOP_MAIN: join(desktopDir,'main.mjs'), OPENAI_API_KEY: '', DEEPSEEK_API_KEY: '',
    },
    timeout: deadlineMs,
  })
  const electronProcess = electronApp.process()
  const rememberOutput = (chunk) => {
    processOutput = (processOutput + String(chunk)).slice(-32_768)
  }
  electronProcess.stdout?.on('data', rememberOutput)
  electronProcess.stderr?.on('data', rememberOutput)

  assert.equal(await electronApp.evaluate(({app})=>app.getPath('userData')),userDataDir);
  page = await electronApp.firstWindow({ timeout: deadlineMs })
  page.on('pageerror', (error) => pageErrors.push(String(error && error.stack || error)))
  page.on('console', message => { if (message.type() === 'error') consoleErrors.push(message.text()) })
  page.on('dialog', (dialog) => dialog.accept())
  await page.waitForURL(
    (url) => url.protocol === 'http:' && (url.hostname === '127.0.0.1' || url.hostname === 'localhost'),
    { timeout: remaining() },
  )
  await page.locator('[data-slot="sidebar"]').waitFor({ state: 'visible', timeout: remaining() })
  await clickOptional(/继续|Continue/i)
  await clickOptional(/稍后配置|Configure later/i, 5_000)

  const workspaceChooser = page.getByRole('textbox', { name: /选择工作区|Choose workspace/i }).first()
  if (await workspaceChooser.waitFor({ state: 'visible', timeout: Math.min(4_000, remaining()) }).then(() => true).catch(() => false)) {
    await workspaceChooser.click()
  } else {
    await page.locator('[data-composer-seat]').getByRole('button', { name: /选择工作区|Choose workspace/i }).click()
    await page.getByRole('menuitem', { name: '添加工作区…' }).click()
  }
  const picker = page.getByRole('dialog', { name: /选择工作区目录|Select Workspace Directory/i })
  await picker.waitFor({ state: 'visible', timeout: remaining() })
  await picker.getByRole('button', { name: /编辑路径|Edit path/i }).click()
  const pathInput = picker.getByRole('textbox', { name: /编辑路径|Edit path/i })
  await pathInput.fill(workspace)
  await pathInput.press('Enter')
  await picker.getByRole('button', { name: /打开|Open/i, exact: true }).click()

  await page.locator('[data-composer-input][contenteditable="true"]').waitFor({
    state: 'visible',
    timeout: remaining(),
  })
  for (const label of [/^workspace$/, /^未分组$/]) { const row = page.getByRole('treeitem').filter({hasText:label}); if (await row.count() && await row.getAttribute('aria-expanded') === 'false') await row.click(); }
  await page.getByRole('treeitem').filter({hasText:/qa-guided-task|Professional task guide QA/}).last().click({timeout:30000});
  async function request(url, body) {
    return page.evaluate(async ({url,body}) => {
      const response=await fetch(url,body?{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)}:undefined)
      const result=await response.json()
      if(!response.ok)throw new Error(result.error||'HTTP '+response.status)
      return result
    },{url,body})
  }
  const taskUrl='/api/agent-pi/professional-task?sessionId=qa-guided-task'
  const runTool=(tool,args)=>request('/api/agent-pi/qa-task-tool',{tool,args})
  const capabilityFlags=await request('/api/agent-pi/capabilities')
  assert.equal(capabilityFlags.taskGuide,true,'native task plugin must actually be active')
  assert.equal(capabilityFlags.workbench,true,'existing workbench plugin remains active')
  const empty=await request(taskUrl)
  await request(taskUrl,{revision:empty.task.revision,patch:{brief:{...empty.task.brief,objective,audience:'领导',scope:'检查材料中的工期条件和实施资源，缺少的条件保留为待确认项',profession:'report',formats:['md'],language:'中文'}}})
  const seeded=await request(taskUrl)
  const parsed=await runTool('professional_task',{action:'parse_source',revision:seeded.task.revision,input:{id:'schedule',path:'项目资料.md'}})
  assert.equal(parsed.version,createHash('sha256').update(readFileSync(sourceFile)).digest('hex'),'source provenance is the actual selected file hash')
  assert.match(parsed.content,/120 天/)
  console.log(JSON.stringify({phase:'actual-source-tool',status:'ok',sourceHash:parsed.version}))
  const finding={id:'period-conflict',title:'正文和补遗中的工期不一致',summary:'正文工期为 120 天，补遗工期为 90 天。',goalImpact:'未明确文件优先顺序前，无法可靠判断当前方案能否按期完成。',importance:'critical',evidenceIds:['source:schedule'],actions:[{label:'查看项目原稿',kind:'source',target:'source:schedule'},{label:'确认最新补遗及优先顺序',kind:'question'}]}
  const found=await runTool('professional_task',{action:'record_finding',revision:parsed.task.revision,operationId:'qa-period-finding',input:finding})
  const replay=await runTool('professional_task',{action:'record_finding',revision:parsed.task.revision,operationId:'qa-period-finding',input:finding})
  assert.equal(replay.revision,found.revision)
  console.log(JSON.stringify({phase:'actual-finding-tool-and-replay',status:'ok'}))
  const summary=page.getByRole('region',{name:'共同任务理解',exact:true})
  await summary.getByText(objective,{exact:true}).waitFor({timeout:Math.min(30_000,remaining())})
  await page.getByText(assistantReply,{exact:true}).waitFor({timeout:Math.min(30_000,remaining())})
  await summary.locator('[data-finding-id="period-conflict"]').waitFor({timeout:remaining()})
  assert.equal(await summary.locator('[data-finding-id="period-conflict"]').count(),1)
  assert.match(await summary.innerText(),/对当前目标的影响/)
  assert.equal(await page.locator('vite-error-overlay,nextjs-portal,#webpack-dev-server-client-overlay').count(),0)
  assert.match(await page.title(),/Agent Pi|DSH|DeepSeek|Professional/i)
  await page.screenshot({path:join(artifactDir,'01-chat-goal-and-finding-desktop.png'),fullPage:true})
  console.log(JSON.stringify({phase:'main-chat-understanding',status:'ok',sourceHash:parsed.version}))
  await page.getByRole('tab',{name:'Codex',exact:true}).click()
  await summary.getByText(objective,{exact:true}).waitFor({timeout:Math.min(30_000,remaining())})
  assert.equal(await summary.locator('[data-finding-id="period-conflict"]').count(),1,'Codex view reads the same task findings')
  await page.getByRole('tab',{name:'对话',exact:true}).click()

  const humanCount=(await request('/api/agent-pi/qa-task-tool')).humanMessages
  const depthToggle=page.getByRole('button',{name:'专业深度',exact:true})
  await depthToggle.click()
  await page.waitForFunction(()=>document.querySelector('button[aria-label="专业深度"]')?.getAttribute('aria-pressed')==='true')
  let depth=await request('/api/agent-pi/professional-depth?sessionId=qa-guided-task')
  depth=await runTool('professional_depth',{action:'brief',revision:depth.revision,brief:{purpose:objective,depth:'分析实际工期与资源约束',evidence:'以项目资料为依据；文件优先顺序待确认',format:'Markdown 建议',acceptance:'给出依据、影响和下一步'},criteria:[{id:'report-file',title:'实际建议文件',kind:'file',path:'工期建议.md'},{id:'professional-review',title:'工期判断与资源条件适用性',kind:'review'}]})
  depth=await runTool('professional_depth',{action:'check',revision:depth.revision,reviewNotes:'已检查实际 Markdown 文件；专业判断仍需补充资源条件与文件优先顺序。'})
  assert.equal(depth.checks[0].status,'passed')
  assert.equal(depth.checks[0].sha256,createHash('sha256').update(readFileSync(reportFile)).digest('hex'),'quality history records actual report bytes')
  assert.equal(depth.checks[1].status,'review')
  const priorChecks=depth.checks
  await depthToggle.click()
  await page.waitForFunction(()=>document.querySelector('button[aria-label="专业深度"]')?.getAttribute('aria-pressed')==='false')
  assert.deepEqual((await request('/api/agent-pi/professional-depth?sessionId=qa-guided-task')).checks,priorChecks)
  await depthToggle.click()
  await page.waitForFunction(()=>document.querySelector('button[aria-label="专业深度"]')?.getAttribute('aria-pressed')==='true')
  await page.getByRole('button',{name:'专业深度设置',exact:true}).click()
  const depthPanel=page.getByRole('dialog',{name:'专业深度任务说明',exact:true})
  await depthPanel.getByText('实际建议文件',{exact:true}).waitFor()
  await depthPanel.getByText('机器检查通过',{exact:true}).waitFor()
  await depthPanel.getByText('需专业审阅',{exact:true}).waitFor()
  await depthPanel.getByText(objective,{exact:true}).waitFor()
  await page.screenshot({path:join(artifactDir,'02-depth-shared-goal-and-check-history.png'),fullPage:true})
  await depthPanel.getByRole('button',{name:'关闭专业深度面板',exact:true}).click()
  assert.equal((await request('/api/agent-pi/qa-task-tool')).humanMessages,humanCount,'toggle and settings do not inject a synthetic task message')

  const trigger=page.getByRole('tab',{name:'本次任务',exact:true})
  const originalFileRail = await page.locator('.ap-files-dock').boundingBox()
  await trigger.waitFor({timeout:remaining()});await trigger.click()
  const dialog=page.getByRole('region',{name:'本次任务',exact:true})
  await dialog.getByRole('tab',{name:'任务概览',exact:true}).waitFor({timeout:remaining()})
  assert.equal(await dialog.getByRole('tab',{name:'任务概览',exact:true}).getAttribute('aria-selected'),'true')
  assert.equal(await dialog.getByLabel('本次要完成什么').count(),0,'default task view is an automatic record, not a form')
  assert.equal(await summary.count(),0,'shared summary is confined to the conversation views')
  await dialog.getByText('共同理解的目标',{exact:true}).waitFor()
  await dialog.locator('[data-finding-id="period-conflict"]').waitFor()
  assert.match(await dialog.innerText(),/资料抽取：1\/1/)
  assert.match(await dialog.innerText(),/专业复核：0\/1/)
  const guideLayout = await dialog.evaluate(element => ({position:getComputedStyle(element).position,region:element.getBoundingClientRect().toJSON(),tabs:document.querySelector('[data-conversation-tabs]').getBoundingClientRect().toJSON()}))
  assert.notEqual(guideLayout.position,'fixed','task view does not create a fixed side drawer')
  assert.ok(guideLayout.region.x >= guideLayout.tabs.x - 30 && guideLayout.region.right <= guideLayout.tabs.right + 30,'task guide stays inside the main conversation column')
  assert.equal((await page.locator('.ap-files-dock').boundingBox()).width,originalFileRail.width,'task view preserves the existing right file rail width')
  await page.screenshot({path:join(artifactDir,'03-task-overview-desktop.png'),fullPage:true})
  await dialog.getByRole('button',{name:'修正某项理解',exact:true}).click()
  await dialog.getByLabel('成果给谁使用').fill('领导决策会')
  const beforeFinding=await request(taskUrl)
  await runTool('professional_task',{action:'record_finding',revision:beforeFinding.task.revision,input:{id:'resource-gap',title:'实施资源尚未得到确认',summary:'当前材料没有给出实际班组配置。',goalImpact:'资源条件会影响工期可实现性的判断。',evidenceIds:['source:schedule'],actions:[{label:'补充实际资源配置',kind:'question'}]}})
  await dialog.getByRole('tab',{name:'任务概览',exact:true}).click()
  await dialog.locator('[data-finding-id="resource-gap"]').waitFor({timeout:remaining()})
  await dialog.getByRole('tab',{name:'修正目标',exact:true}).click()
  assert.equal(await dialog.getByLabel('成果给谁使用').inputValue(),'领导决策会','live findings do not erase a field correction draft')
  await dialog.getByRole('button',{name:'保存修正',exact:true}).click()
  await dialog.getByText('已保存，后续执行将采用本次需求。',{exact:true}).waitFor()
  const corrected=await request(taskUrl)
  assert.equal(corrected.task.brief.audience,'领导决策会')
  assert.equal(corrected.task.findings.length,2,'saving one correction preserves later professional findings')
  assert.ok(corrected.capabilities.some(row=>row.id==='tool:read'),'catalogue includes the actual session-scoped reader')
  assert.ok(corrected.capabilities.some(row=>row.owner==='dsh-agent-pi-workbench-tender'),'actual Cordis domain contributions remain loaded')
  await dialog.getByRole('tab',{name:'可用能力',exact:true}).click()
  await dialog.getByText('招标全文解析与要求覆盖',{exact:true}).waitFor()
  await dialog.getByRole('button',{name:'返回对话',exact:true}).click()
  await summary.locator('[data-finding-id="period-conflict"]').waitFor()
  const source=await request(taskUrl+'&action=source&evidenceId=source%3Aschedule')
  assert.equal(source.versionVerified,true)
  assert.equal(resolve(source.path),resolve(sourceFile))
  const sourceResponse=page.waitForResponse(response=>response.url().includes('action=source')&&response.status()===200)
  await summary.locator('[data-finding-id="period-conflict"]').getByRole('button',{name:'项目资料.md',exact:true}).first().click()
  assert.equal((await (await sourceResponse).json()).versionVerified,true)
  await page.getByText(/正文工期：120 天/).first().waitFor({timeout:remaining()})
  await page.screenshot({path:join(artifactDir,'04-verified-source-preview.png'),fullPage:true})
  await page.getByRole('dialog',{name:'项目资料.md',exact:true}).getByRole('button',{name:'关闭',exact:true}).click()
  await page.locator('select.ap-lang').selectOption('en')
  await page.getByRole('tab',{name:'Current task',exact:true}).click()
  const englishDialog = page.getByRole('region',{name:'Current task',exact:true})
  await englishDialog.getByRole('tab',{name:'Task overview',exact:true}).waitFor()
  assert.equal(await englishDialog.getByRole('tab',{name:'Task overview',exact:true}).getAttribute('aria-selected'),'true')
  await englishDialog.getByText('Shared understanding of the goal',{exact:true}).waitFor()
  await englishDialog.getByRole('tab',{name:'Capabilities',exact:true}).click()
  await englishDialog.getByText('Full tender document analysis',{exact:true}).waitFor()
  assert.equal(await englishDialog.getByText('招标全文解析与要求覆盖',{exact:true}).count(),0)
  await page.getByRole('button',{name:'Professional depth',exact:true}).waitFor()
  await englishDialog.getByRole('tab',{name:'Task overview',exact:true}).click()
  await page.screenshot({path:join(artifactDir,'05-task-overview-english.png'),fullPage:true})
  await englishDialog.getByRole('button',{name:'Return to conversation',exact:true}).click()
  await page.locator('select.ap-lang').selectOption('zh')
  await trigger.click()
  await page.getByRole('button',{name:'收起资源文件',exact:true}).click()
  await page.setViewportSize({width:390,height:844})
  await dialog.getByRole('tab',{name:'任务概览',exact:true}).click()
  await page.screenshot({path:join(artifactDir,'06-task-overview-mobile.png'),fullPage:true})
  assert.ok(await dialog.evaluate(element=>element.scrollWidth<=element.clientWidth),'panel fits narrow viewport')
  await dialog.getByRole('button',{name:'返回对话',exact:true}).click()
  await page.setViewportSize({width:1440,height:980})
  await page.reload();await clickOptional(/继续|Continue/i);await clickOptional(/稍后配置|Configure later/i)
  await trigger.waitFor({timeout:remaining()});await trigger.click()
  await dialog.getByText(objective,{exact:true}).waitFor()
  assert.equal(await dialog.locator('[data-finding-id="period-conflict"]').count(),1)
  assert.equal(await dialog.locator('[data-finding-id="resource-gap"]').count(),1)
  assert.match(await dialog.innerText(),/领导决策会/)
  const persisted=await request(taskUrl)
  assert.equal(persisted.task.quality.enabled,true)
  assert.deepEqual(persisted.task.quality.checks.map(row=>row.id),priorChecks.map(row=>row.id))
  assert.deepEqual(pageErrors,[])
  assert.deepEqual(consoleErrors,[])
  console.log(JSON.stringify({status:'ok',browser:'Browser plugin not available; existing Playwright Electron workflow',viewports:['desktop','390x844'],checks:['actual-plugin-service','actual-professional-source-and-finding-tools','main-chat-shared-understanding','stable-finding-replay','default-automatic-task-overview','independent-field-draft-with-live-findings','shared-depth-goal-and-byte-checks','toggle-keeps-check-history-without-messages','verified-source-preview','Cordis-domain-capability-catalogue','reload-persistence','narrow-layout','english-ui','no-render-errors'],artifactDir,limitation:'Isolated deterministic fixture; no paid model requests or logged-in autonomous Codex turn.'}))
} catch(error){
  if(page)await page.screenshot({path:join(artifactDir,'failure.png'),fullPage:true}).catch(()=>{})
  const diagnostics=page?{url:page.url(),pageErrors,consoleErrors,regions:await page.locator('section[aria-label]').evaluateAll(rows=>rows.map(row=>row.getAttribute('aria-label'))),body:(await page.locator('body').innerText()).slice(-8000)}:{}
  writeFileSync(join(artifactDir,'failure.log'),(String(error.stack||error)+'\n'+JSON.stringify(diagnostics,null,2)+'\n'+processOutput).replace(/([?&]token=)[^&#\s"'<>]+/giu,'$1REDACTED'))
  console.log(JSON.stringify({visibleControls:await page.locator('[data-slot=sidebar] button').allTextContents()}));throw error
} finally{
  if(electronApp){await electronApp.evaluate(({app})=>{app.isQuitting=true;app.quit()}).catch(()=>{});await electronApp.close().catch(()=>{})}
  assert.ok(resolve(scratch).startsWith(resolve(tmpdir()) + '\\') || resolve(scratch).startsWith(resolve(tmpdir()) + '/'))
  rmSync(scratch,{recursive:true,force:true})
}

