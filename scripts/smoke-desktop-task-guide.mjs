import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { createRequire } from 'node:module'
import { createServer } from 'node:net'

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
// A separate profile must also use a separate Office gateway: probing its
// default port could otherwise reach the user's already-running application.
const officeGatewayPort = await new Promise((resolvePort, reject) => {
  const server = createServer()
  server.once('error', reject)
  server.listen(0, '127.0.0.1', () => {
    const port = server.address().port
    server.close(error => error ? reject(error) : resolvePort(port))
  })
})
const userDataDir = join(scratch, 'electron-user-data')
const dshHome = join(scratch, 'dsh-home')
const workspace = join(scratch, 'workspace')
const sourceFile = join(workspace, '项目资料.md')
const linkedSourceFile = join(workspace, 'workbench-source.txt')
const reportFile = join(workspace, '工期建议.md')
const objective = '判断当前施工方案的工期是否可实现，形成给领导决策的建议'
const priorHumanText = 'longhorizonproof379：预算上限600元，不要改项目原稿。'
const assistantReply = '我会先核对材料中的工期条件，再整理影响工期判断的约束与待确认事项。'
const artifactDir = resolve(process.env.AGENT_PI_QA_ARTIFACT_DIR || join(tmpdir(), 'agent-pi-task-guide-ui-3.8.0'))
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
writeFileSync(linkedSourceFile, '真实工作台联动回归资料：施工范围与工期需要对照原稿分析，本地测试不涉及真实投标文件。\n', 'utf8')
const pdfFile = join(workspace, 'qa-drawing.pdf'), cadFile = join(workspace, 'qa-drawing.dxf')
const hostRequire = createRequire(join(root, 'bundles/tender-host/package.json'))
const { PDFDocument } = hostRequire('pdf-lib')
const pdf = await PDFDocument.create()
const pdfPage = pdf.addPage([720, 480]); pdfPage.drawText('QA reinforcement note: 4 bars, 6000 mm', { x: 60, y: 240, size: 6 })
pdf.addPage([720, 480])
writeFileSync(pdfFile, await pdf.save())
writeFileSync(cadFile, ['0','SECTION','2','HEADER','9','$ACADVER','1','AC1027','9','$INSUNITS','70','4','0','ENDSEC','0','SECTION','2','ENTITIES','0','LINE','5','1A','8','QA-ROAD','10','0','20','0','30','0','11','6000','21','0','31','0','0','TEXT','5','1B','8','QA-NOTE','10','0','20','200','30','0','40','100','1','QA ROAD 6000mm','0','ENDSEC','0','EOF',''].join('\n'))

const profileInit = spawnSync(process.execPath, [join(root, 'scripts', 'init-tender-profile.mjs')], {
  cwd: root,
  env: {
    ...process.env,
    DSH_CHECKOUT: join(root, 'vendor', 'deepseek-harness'),
    DSH_HOME: dshHome, AGENT_PI_KB_ROOT: join(dshHome,'knowledge-base'), AGENT_PI_SKILLS_ROOT: join(dshHome,'skills'), AGENT_PI_MODULES_ROOT: join(dshHome,'workbench','modules'), AGENT_PI_QA_WORKSPACE: workspace, AGENT_PI_QA_USER_DATA: userDataDir, AGENT_PI_QA_DESKTOP_MAIN: join(desktopDir,'main.mjs'), OPENAI_API_KEY: '', DEEPSEEK_API_KEY: '',
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
  '- id: univer',
  '  config:',
  '    gatewayPort: ' + officeGatewayPort,
  '',
].join('\n'), 'utf8')


const qaPlugin=join(scratch,'qa-session.mjs')
writeFileSync(qaPlugin, `
import {createMessage,createUserMessage} from ${JSON.stringify(pathToFileURL(join(root,'vendor','deepseek-harness','packages','llm','llm','src','index.ts')).href)};
export const name='qa-session';
export const inject=['sessions','sessionPersistence','sessionController','sessionQuery','webServer','tools','agents','taskGuide'];
export async function apply(ctx) {
  let releaseRun;
  let heldRun;
  ctx.on('agent/pre-step',async ({agent,messages},next)=>{
    if(agent?.session.id!=='qa-guided-task')return next();
    for(const message of messages || [])agent.session.append('user/message',message,{surfaceOp:'append'});
    if(heldRun)await heldRun;
    return {kind:'reject'};
  },{prepend:true});
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
  for(const [id,cwd] of [['qa-prior-context',process.env.AGENT_PI_QA_WORKSPACE],['qa-other-workspace',${JSON.stringify(join(scratch,'other-workspace'))}]]){
    await ctx.sessionController.create({sessionId:id,cwd});
    const prior=ctx.sessions.get(id);
    prior.append('turn/start',{turn:1});
    prior.append('user/message',createUserMessage({content:[{type:'text',text:${JSON.stringify(priorHumanText)}}],source:{kind:'user'}}),{surfaceOp:'append'});
    prior.append('turn/end',{turn:1,reason:{kind:'completed'}});
    await ctx.sessions.flush(prior);
  }
  ctx.webServer.register({kind:'exact',path:'/api/agent-pi/qa-task-tool',async handler(req,res) {
    const send=(code,value)=>{res.writeHead(code,{'Content-Type':'application/json'});res.end(JSON.stringify(value))};
    try {
      if(req.method==='GET')return send(200,{humanMessages:s.deriveMessages().filter(row=>row.role==='user').length});
      req.setEncoding('utf8');let raw='';for await(const part of req)raw+=part;
      const input=JSON.parse(raw);
      if(input.action==='dispose_office'){
        const office=ctx.get('univer');
        if(typeof office?.dispose!=='function')throw new Error('Native Office disposal is unavailable');
        await office.dispose();return send(200,{gateway:await office.gatewayStatus()});
      }
      const agent=ctx.agents.get(s.id);if(!agent)throw new Error('QA session agent is not ready');
      if(input.action==='hold'){
        if(heldRun)throw new Error('A QA native step is already held');
        heldRun=new Promise(resolve=>{releaseRun=resolve});return send(200,{held:true});
      }
      if(input.action==='native_receipt'){
        if(await ctx.sessions.flush(s)!==true)throw new Error('Native session flush was not confirmed');
        const snapshot=await ctx.sessionQuery.readSession(s.id);
        return send(200,{sessionId:s.id,cwd:snapshot.session.cwd,events:snapshot.events.filter(event=>event.type==='user/message'&&event.data.id===input.messageId||event.type==='agent/inbox/spliced'&&event.data.inserted?.some(message=>message.id===input.messageId))});
      }
      if(input.action==='finish'){
        releaseRun?.();await agent.whenIdle();heldRun=undefined;releaseRun=undefined;return send(200,{finished:true});
      }
      if(input.action==='admit'||input.action==='run'){
        if(input.control)ctx.taskGuide.registerControlPrompt(s.id,input.text);
        if(input.action==='run')heldRun=new Promise(resolve=>{releaseRun=resolve});
        const message=createUserMessage({content:[{type:'text',text:input.text}],source:{kind:'user'}});
        agent.send(message,'next-turn',true);
        if(input.action==='admit')await agent.whenIdle();
        return send(200,{messageId:message.id});
      }
       if(!['engineering_project','engineering_pdf','engineering_export','cad_read','bim_engine_health','professional_task','professional_depth','tender_project','tender_stage','session_search','session_event_search','session_trace','session_event_trace','session_event_read'].includes(input.tool))throw new Error('Unsupported QA tool');
      const result=await agent.ctx.get('tools').execute({callId:'qa-'+Date.now(),name:input.tool,arguments:input.args,agent,signal:new AbortController().signal});
      if(result.isError)throw new Error(JSON.stringify(result.content));
      let value=result.value;
      if(typeof value==='string'){try{value=JSON.parse(value)}catch{value={text:value}}}
      send(200,value);
    }catch(error){send(409,{error:String(error.message||error)})}
  }});
}
`)
writeFileSync(profilePatchPath,readFileSync(profilePatchPath,'utf8')+'\n- insert:\n    - id: qa-session\n      name: '+JSON.stringify(qaPlugin.replaceAll('\\','/'))+'\n')

let electronApp
let page
let officeStarted = false
const qaLoader = join(scratch, 'desktop-loader.mjs')
writeFileSync(qaLoader, "import {app} from 'electron';import {pathToFileURL} from 'node:url';app.setPath('userData',process.env.AGENT_PI_QA_USER_DATA);await import(pathToFileURL(process.env.AGENT_PI_QA_DESKTOP_MAIN).href)")
let processOutput = ''
const pageErrors = []
const consoleErrors = []
const errorDetails = []
const requestFailures = []
const sessionSnapshots = []
const snapshotWaiters = new Set()
let phase = 'launch'
const startedAt = Date.now()
const remaining = () => Math.max(1, deadlineMs - (Date.now() - startedAt))
const diagnosticTime = () => ({phase, elapsedMs: Date.now() - startedAt, time: new Date().toISOString()})

function observeSessionSnapshots(socket) {
  if (new URL(socket.url()).pathname !== '/api/remote.mux') return
  const streams = new Map()
  socket.on('framesent', ({payload}) => {
    const frame = JSON.parse(String(payload))
    if (frame.type !== 'open' || frame.endpoint !== 'session/follow') return
    const address = frame.payload?.args?.request?.address
    if (address?.kind === 'session') streams.set(frame.streamId, address.sessionId)
  })
  socket.on('framereceived', ({payload}) => {
    const frame = JSON.parse(String(payload))
    const sessionId = streams.get(frame.streamId)
    if (!sessionId || frame.type !== 'item' || frame.value?.type !== 'snapshot') return
    sessionSnapshots.push({sessionId, streamId: frame.streamId, ...diagnosticTime()})
    for (const check of snapshotWaiters) check()
  })
}

async function waitForSelectedSession(expectedSessionId, afterSnapshot = 0) {
  const selected = await page.waitForFunction(expected => {
    const sessionId = JSON.parse(localStorage.getItem('dsh.sessions.current') || '{}').sessionId
    return typeof sessionId === 'string' && (!expected || sessionId === expected) ? sessionId : false
  }, expectedSessionId, {timeout: remaining()})
  const sessionId = await selected.jsonValue()
  await selected.dispose()
  // A blank-session composer is visible before its native history stream opens.
  // Await the actual opening snapshot before releasing its sidebar reference.
  await new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      snapshotWaiters.delete(check)
      reject(new Error(`No session/follow opening snapshot for ${sessionId} during ${phase}`))
    }, Math.min(30_000, remaining()))
    const check = () => {
      if (!sessionSnapshots.slice(afterSnapshot).some(row => row.sessionId === sessionId)) return
      clearTimeout(timer)
      snapshotWaiters.delete(check)
      resolve()
    }
    snapshotWaiters.add(check)
    check()
  })
  // Let native stream consumption and the subscribed React stores finish rendering.
  await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))))
}

async function reloadQaSession(nextPhase) {
  phase = nextPhase
  const afterSnapshot = sessionSnapshots.length
  await page.reload()
  await clickOptional(/继续|Continue/i)
  await clickOptional(/稍后配置|Configure later/i)
  await waitForSelectedSession('qa-guided-task', afterSnapshot)
}

async function disposeOffice() {
  const stopped = await page.evaluate(async () => {
    const response = await fetch('/api/agent-pi/qa-task-tool',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action:'dispose_office'})})
    const result = await response.json()
    if (!response.ok) throw new Error(result.error || 'Office disposal failed')
    return result
  })
  assert.equal(stopped.gateway.phase,'stopped','only this fixture-owned native Office gateway is stopped')
  officeStarted = false
  return stopped
}

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
      ELECTRON_DISABLE_SECURITY_WARNINGS: 'true', AGENT_PI_KB_ROOT: join(dshHome,'knowledge-base'), AGENT_PI_SKILLS_ROOT: join(dshHome,'skills'), AGENT_PI_MODULES_ROOT: join(dshHome,'workbench','modules'), AGENT_PI_QA_WORKSPACE: workspace, AGENT_PI_QA_USER_DATA: userDataDir, AGENT_PI_QA_DESKTOP_MAIN: join(desktopDir,'main.mjs'), OPENAI_API_KEY: '', DEEPSEEK_API_KEY: '',
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
  page.on('websocket', observeSessionSnapshots)
  page.on('pageerror', error => {
    const text = String(error && error.stack || error)
    pageErrors.push(text)
    errorDetails.push({kind:'pageerror', text, ...diagnosticTime()})
  })
  page.on('console', message => {
    if (message.type() !== 'error') return
    consoleErrors.push(message.text())
    errorDetails.push({kind:'console', text:message.text(), location:message.location(), ...diagnosticTime()})
  })
  page.on('requestfailed', request => requestFailures.push({url:request.url(), method:request.method(), resourceType:request.resourceType(), error:request.failure()?.errorText, ...diagnosticTime()}))
  page.on('dialog', (dialog) => dialog.accept())
  await page.waitForURL(
    (url) => url.protocol === 'http:' && (url.hostname === '127.0.0.1' || url.hostname === 'localhost'),
    { timeout: remaining() },
  )
  await page.locator('[data-slot="sidebar"]').waitFor({ state: 'visible', timeout: remaining() })
  await clickOptional(/继续|Continue/i)
  await clickOptional(/稍后配置|Configure later/i, 5_000)

  phase = 'select-workspace'
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
  await waitForSelectedSession()
  phase = 'open-qa-session'
  for (const label of [/^workspace$/, /^未分组$/]) { const row = page.getByRole('treeitem').filter({hasText:label}); if (await row.count() && await row.getAttribute('aria-expanded') === 'false') await row.click(); }
  await page.getByRole('treeitem').filter({hasText:/qa-guided-task|Professional task guide QA/}).last().click({timeout:30000});
  await waitForSelectedSession('qa-guided-task')
  phase = 'task-guide-and-history'
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
  const history=await runTool('session_search',{query:'longhorizonproof379',session_ids:['qa-prior-context','qa-other-workspace'],event_types:['user/message']})
  assert.match(history.text,/qa-prior-context/)
  assert.doesNotMatch(history.text,/qa-other-workspace/,'official history search enforces the actual caller workspace')
  const historicalEvents=await runTool('session_event_search',{session_id:'qa-prior-context',query:'longhorizonproof379',event_types:['user/message']})
  const priorSeq=Number(historicalEvents.text.match(/seq (\d+) \| user\/message/)?.[1])
  assert.ok(Number.isSafeInteger(priorSeq))
  const priorTrace=await runTool('session_trace',{session_id:'qa-prior-context'})
  assert.match(priorTrace.text,/qa-prior-context/)
  const eventTrace=await runTool('session_event_trace',{session_id:'qa-prior-context',seq:priorSeq})
  assert.match(eventTrace.text,/user\/message/)
  const historicalRead=await runTool('session_event_read',{session_id:'qa-prior-context',seq:priorSeq,before:1,after:1})
  assert.ok(historicalRead.text.includes(priorHumanText),'exact earlier human text is read through the official native tool')
  assert.match(historicalRead.text,/"kind": "user"/)
  writeFileSync(join(artifactDir,'08-official-session-history.json'),JSON.stringify({history,historicalEvents,priorTrace,eventTrace,historicalRead},null,2),'utf8')
  console.log(JSON.stringify({phase:'official-session-history-workspace-scope',status:'ok',priorSessionId:'qa-prior-context',priorSeq}))
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

  await request('/api/agent-pi/qa-task-tool',{action:'admit',text:'不要改项目原稿，预算上限900元，禁止联网。'})
  const budgetMessage=await request('/api/agent-pi/qa-task-tool',{action:'admit',text:'预算上限改为600元。'})
  const durable=await request(taskUrl)
  assert.equal(durable.task.latestMessageId,budgetMessage.messageId)
  assert.ok(durable.task.directives.some(row=>row.key==='budget'&&row.status==='active'&&row.text==='预算上限改为600元'))
  assert.ok(durable.task.directives.some(row=>row.key==='budget'&&row.status==='superseded'&&row.text==='预算上限900元'))
  await runTool('professional_task',{action:'update',revision:durable.task.revision,patch:{deliverables:[{id:'qa-verification-report',title:'QA 实际工期建议',path:reportFile,status:'draft',signature:'not_required',evidenceIds:['source:schedule'],requirementIds:[],stepIds:[],checks:[]}]}})

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
  await dialog.getByText(objective,{exact:true}).waitFor({timeout:remaining()})
  await dialog.locator('[data-finding-id="period-conflict"]').waitFor({timeout:remaining()})
  await page.screenshot({path:join(artifactDir,'06-task-overview-mobile.png'),fullPage:true})
  assert.ok(await dialog.evaluate(element=>element.scrollWidth<=element.clientWidth),'panel fits narrow viewport')
  await dialog.getByRole('button',{name:'返回对话',exact:true}).click()
  await page.setViewportSize({width:1440,height:980})
  await reloadQaSession('task-guide-reload')
  await trigger.waitFor({timeout:remaining()});await trigger.click()
  await dialog.getByText(objective,{exact:true}).waitFor()
  assert.equal(await dialog.locator('[data-finding-id="period-conflict"]').count(),1)
  assert.equal(await dialog.locator('[data-finding-id="resource-gap"]').count(),1)
  assert.match(await dialog.innerText(),/领导决策会/)
  const persisted=await request(taskUrl)
  assert.equal(persisted.task.quality.enabled,true)
  assert.deepEqual(persisted.task.quality.checks.map(row=>row.id),priorChecks.map(row=>row.id))
  const activeBudget=persisted.task.directives.find(row=>row.key==='budget'&&row.status==='active')
  assert.equal(activeBudget.text,'预算上限改为600元','latest constraints survive a real renderer reload')
  await dialog.locator(`[data-directive-id="${activeBudget.id}"]`).getByRole('button',{name:'撤销这项约束',exact:true}).click()
  await dialog.getByText('已撤销该约束，后续执行与审核将采用最新要求。',{exact:true}).waitFor({timeout:remaining()})
  const revoked=await request(taskUrl)
  assert.equal(revoked.task.directives.find(row=>row.id===activeBudget.id).status,'revoked')
  assert.equal(revoked.task.latestMessageId,persisted.task.latestMessageId,'explicit UI revocation does not fabricate a native human message')
  await dialog.getByRole('tab',{name:'交付检查',exact:true}).click()
  await dialog.getByRole('button',{name:'核验实际成果',exact:true}).click()
  await dialog.getByText('已核验实际成果，请查看审核结果和待解决项。',{exact:true}).waitFor({timeout:remaining()})
  const verified=await request(taskUrl), checkedReport=verified.task.deliverables.find(row=>row.id==='qa-verification-report')
  assert.equal(checkedReport.verification.artifactSha256,createHash('sha256').update(readFileSync(reportFile)).digest('hex'))
  assert.equal(checkedReport.verification.ruleVersion,'professional-delivery/v1')
  assert.equal(checkedReport.verification.status,'review','remaining source and semantic gaps are retained')
  assert.notEqual(checkedReport.status,'accepted')
  assert.equal(await dialog.getByRole('button',{name:'确认验收全部成果',exact:true}).count(),0)
  await page.screenshot({path:join(artifactDir,'09-durable-constraints-and-actual-verification.png'),fullPage:true})
  console.log(JSON.stringify({phase:'durable-constraint-revoke-and-actual-verification-ui',status:'ok',reportSha:checkedReport.verification.artifactSha256}))

  // Exercise the project tool -> host projection -> all three native views.
  // This uses isolated local files and the real inbox, with the model step rejected above.
  const projectId='qa-linked-tender'
  await runTool('tender_project',{action:'create',module:'tender',projectId,name:'真实工作台联动 QA',inputPaths:[linkedSourceFile],projectGoal:objective})
  await runTool('tender_stage',{action:'complete',module:'tender',projectId})
  let linked=await request(taskUrl)
  assert.equal(linked.task.binding.projectId,projectId)
  assert.equal(linked.task.binding.stageId,'bid-risk-decision')
  assert.equal(linked.task.coverage.filter(row=>row.id.startsWith('workbench:')&&row.kind==='file').length,1)
  assert.equal(linked.task.coverage.find(row=>row.id.startsWith('workbench:')).status,'parsed')
  const bidSummary=join(workspace,'Agent Pi Outputs',projectId,'bid-decision','投标决策与重大风险评估.md')
  mkdirSync(join(bidSummary,'..'),{recursive:true})
  writeFileSync(bidSummary,'# 投标决策与重大风险评估\n\n建议参与本地回归项目，理由是当前范围可以进一步分析；实施资源仍待确认。本文仅供确定性界面与阶段门禁回归使用，不能代替实际客户专业决策。\n','utf8')
  await runTool('tender_stage',{action:'status',module:'tender',projectId})
  const decision=await request('/api/agent-pi/qa-task-tool',{action:'admit',text:'确定投标，按计划推进'})
  linked=await request(taskUrl)
  assert.equal(linked.task.latestMessageId,decision.messageId)
  assert.equal(linked.task.latestRequest,'确定投标，按计划推进')
  const boardPath=join(workspace,'.agent-pi','business','tender',projectId,'orchestration','stage-state.json')
  let board=JSON.parse(readFileSync(boardPath,'utf8'))
  assert.equal(board.stages['bid-risk-decision'].approval.decision,'approved')
  assert.equal(board.stages['bid-risk-decision'].approval.source.messageId,decision.messageId)
  assert.equal((await runTool('tender_stage',{action:'status',module:'tender',projectId})).userRequirements.length,0,'a trusted stage decision must not become another requirement awaiting acceptance')
  const beforeControl=await request(taskUrl)
  const controlText='【阶段切换 — 请在本项目主会话继续】\n已注册的 QA 阶段控制消息'
  await request('/api/agent-pi/qa-task-tool',{action:'admit',control:true,text:controlText})
  const afterControl=await request(taskUrl)
  assert.equal(afterControl.task.latestMessageId,beforeControl.task.latestMessageId,'registered stage control keeps actual latest human intent')
  const prepared=await runTool('tender_stage',{action:'prepare',module:'tender',projectId,stageId:'tender-document-analysis'})
  assert.equal(prepared.blocked,undefined)
  assert.equal(prepared.state.status,'idle','a prepared draft has not yet been dispatched')
  linked=await request(taskUrl)
  assert.equal(linked.task.binding.stageId,'tender-document-analysis')
  assert.ok(linked.task.plan.some(row=>row.id.includes(':stage:')&&row.title==='招标文件解析'&&row.status==='pending'),'shared stage state agrees with the actual prepared board')
  const taskStatePath=join(dshHome,'agent-pi','professional-tasks',createHash('sha256').update('qa-guided-task').digest('hex')+'.json')
  const oldShape=JSON.parse(readFileSync(taskStatePath,'utf8'))
  oldShape.plan.push({id:'qa-legacy-plan',title:'旧任务计划记录',status:'pending',dependsOn:[],capabilityIds:[],evidenceIds:[],requirementIds:[]})
  oldShape.deliverables.push({id:'qa-legacy-report',path:reportFile,status:'draft',signature:'not_required',stepIds:[],requirementIds:[],evidenceIds:[]})
  oldShape.brief.basis.standards.push({name:'旧规范名称',evidenceId:'source:schedule'})
  writeFileSync(taskStatePath,JSON.stringify(oldShape,null,2),'utf8')
  await request(taskUrl)
  await request('/api/agent-pi/qa-task-tool',{action:'run',text:'查看当前进度'})
  await page.waitForFunction(()=>!!document.querySelector('[data-composer-seat] button[aria-label*="停止"]'),undefined,{timeout:20_000})
  await trigger.click()
  for(const label of ['任务概览','修正目标','项目依据','执行计划','可用能力','交付检查']){
    await dialog.getByRole('tab',{name:label,exact:true}).click()
    assert.ok((await dialog.innerText()).trim().length>60,'running task tab stays readable: '+label)
    assert.equal(await page.locator('[data-slot-error]').count(),0,'no native slot boundary swallowed a legacy rendering exception')
  }
  await dialog.getByRole('tab',{name:'执行计划',exact:true}).click()
  await dialog.getByText('旧任务计划记录',{exact:true}).waitFor()
  await page.getByRole('tab',{name:'专业化工作台',exact:true}).click()
  const linkedWorkbench=page.locator('.ap-wb')
  await linkedWorkbench.getByRole('heading',{name:'真实工作台联动 QA',exact:true}).waitFor({timeout:20_000})
  await runTool('tender_stage',{action:'execution_update',module:'tender',projectId,stageId:'tender-document-analysis',executionStatus:'working',objective,currentBatch:'正在核对工期与资源',planItems:[{id:'qa-stage-plan',title:'逐文件核对工期条件',status:'in_progress'}],nextAction:'继续核对实际文件'})
  linked=await request(taskUrl)
  assert.ok(linked.task.plan.some(row=>row.id.includes(':execution:')&&row.status==='working'),'the actual execution ledger contributes its current work separately from stage gates')
  assert.equal(JSON.parse(readFileSync(boardPath,'utf8')).stages['tender-document-analysis'].status,'idle','recording execution progress does not dispatch or complete the actual stage')
  await linkedWorkbench.getByText(/当前批次：正在核对工期与资源/).waitFor({timeout:20_000})
  await page.locator('.ap-task-process').getByText(/正在解决：正在核对工期与资源/).waitFor({timeout:20_000})
  const workbenchSource=linked.task.coverage.find(row=>row.id.startsWith('workbench:')&&row.kind==='file'&&row.locator===linkedSourceFile)
  assert.ok(workbenchSource,'the workbench has an authoritative original-file coverage row')
  await runTool('professional_task',{action:'update',revision:linked.task.revision,patch:{coverage:[{...workbenchSource,review:'reviewed'}]}})
  linked=await request(taskUrl)
  assert.equal(linked.task.coverage.find(row=>row.id===workbenchSource.id).review,'reviewed','a complete original-file review survives the project projection')
  await page.locator('.ap-task-process').getByText(/专业复核\s*1\/1/).waitFor({timeout:20_000})
  console.log(JSON.stringify({phase:'explicit-original-file-review-and-live-count',status:'ok',sourceVersion:workbenchSource.version}))
  await runTool('professional_task',{action:'record_finding',revision:linked.task.revision,input:{id:'hidden-view-live-finding',title:'运行期间发现的资源缺口',summary:'切换工作台期间登记的新发现。',goalImpact:'需要补足班组条件后才能完成工期判断。',evidenceIds:['source:schedule']}})
  await trigger.click()
  await dialog.getByRole('tab',{name:'任务概览',exact:true}).click()
  await dialog.getByText(/当前重点：正在核对工期与资源/).waitFor({timeout:20_000})
  await dialog.locator('[data-finding-id="hidden-view-live-finding"]').waitFor({timeout:20_000})
  await dialog.getByRole('tab',{name:'执行计划',exact:true}).click()
  await dialog.getByRole('region',{name:'执行者登记的工作进度',exact:true}).getByText('正在核对工期与资源',{exact:true}).waitFor({timeout:20_000})
  assert.doesNotMatch(await dialog.locator('section[aria-label="工作台阶段与实际门禁"]').innerText(),/正在核对工期与资源/)
  await page.getByRole('tab',{name:'对话',exact:true}).click()
  await summary.locator('[data-finding-id="hidden-view-live-finding"]').waitFor({timeout:20_000})
  assert.match(await summary.innerText(),/正在核对工期与资源/)
  assert.match(await summary.innerText(),/专业复核[：:]\s*1\/1/)
  assert.equal(await summary.getByText(objective,{exact:true}).count(),1)
  await page.screenshot({path:join(artifactDir,'07-live-workbench-task-chat-linkage.png'),fullPage:true})
  await request('/api/agent-pi/qa-task-tool',{action:'finish'})
  const approvalFingerprint=board.stages['bid-risk-decision'].approval.source.fingerprint
  await runTool('tender_stage',{action:'status',module:'tender',projectId})
  await request(taskUrl)
  board=JSON.parse(readFileSync(boardPath,'utf8'))
  assert.equal(board.stages['bid-risk-decision'].approval.source.fingerprint,approvalFingerprint,'read-only polling preserves the byte-based approval receipt')
  assert.equal(board.stages['bid-risk-decision'].approval.decision,'approved')
  console.log(JSON.stringify({phase:'actual-workbench-inbox-and-running-tabs',status:'ok',decisionMessageId:decision.messageId,artifactDir}))

  phase = 'host-runtime-native-dispatch'
  const stageUrl='/api/agent-pi/stage?cwd='+encodeURIComponent(workspace)
  const stageBody={module:'tender',projectId,stageId:'tender-document-analysis',sessionId:'qa-guided-task'}
  const intentBeforeRuntime=(await request(taskUrl)).task
  const offered=await request(stageUrl,{...stageBody,action:'resume'})
  assert.ok(offered.draft&&offered.dispatch?.key,'actual stage HTTP registers a trusted native dispatch offer')
  assert.equal(offered.dispatch.stageId,'tender-document-analysis')
  await request('/api/agent-pi/qa-task-tool',{action:'hold'})
  const dispatched=await request(stageUrl,{...stageBody,action:'runtime_dispatch',key:offered.dispatch.key})
  assert.equal(dispatched.runtime.phase,'waiting')
  const attempt=dispatched.runtime.attempt
  assert.equal(attempt.status,'dispatched');assert.ok(attempt.messageId)
  const nativeReceipt=await request('/api/agent-pi/qa-task-tool',{action:'native_receipt',messageId:attempt.messageId})
  assert.equal(resolve(nativeReceipt.cwd),resolve(workspace))
  assert.ok(nativeReceipt.events.some(event=>event.type==='agent/inbox/spliced'&&event.data.inserted.some(row=>row.id===attempt.messageId)),'durable dispatch identity exists in the actual native inbox')
  const nativeMessage=nativeReceipt.events.find(event=>event.type==='user/message'&&event.data.id===attempt.messageId)
  assert.ok(nativeMessage,'the dispatched attempt is claimed into the actual native conversation')
  assert.equal(nativeMessage.data.source.kind,'plugin:tender-host')
  const actualNativeRead=await runTool('session_event_read',{session_id:'qa-guided-task',seq:nativeMessage.seq})
  assert.ok(actualNativeRead.text.includes(attempt.messageId))
  assert.match(actualNativeRead.text,/plugin:tender-host/)
  const during=await request(taskUrl)
  assert.equal(during.task.latestMessageId,intentBeforeRuntime.latestMessageId,'runtime instruction is not new human intent')
  assert.equal(during.task.latestRequest,intentBeforeRuntime.latestRequest)
  assert.notEqual(during.task.latestMessageId,attempt.messageId)
  await page.evaluate(()=>{for(const store of [localStorage,sessionStorage])for(const key of Object.keys(store))if(/(?:transaction|registry|long-task|session-monitor)/i.test(key))store.removeItem(key)})
  await reloadQaSession('runtime-active-reload')
  const restored=await request(stageUrl,{...stageBody,action:'runtime_status'})
  assert.equal(restored.runtime.phase,'waiting')
  assert.equal(restored.runtime.attempt.id,attempt.id);assert.equal(restored.runtime.attempt.messageId,attempt.messageId)
  assert.equal(restored.runtime.run.attempts.length,1,'renderer reload never duplicates a host attempt')
  const paused=await request(stageUrl,{...stageBody,action:'runtime_pause',paused:true})
  assert.equal(paused.runtime.phase,'paused')
  await request('/api/agent-pi/qa-task-tool',{action:'finish'})
  await reloadQaSession('runtime-paused-reload')
  const pausedReload=await request(stageUrl,{...stageBody,action:'runtime_status'})
  assert.equal(pausedReload.runtime.phase,'paused')
  assert.equal(pausedReload.runtime.run.paused,true)
  assert.equal(pausedReload.runtime.attempt.id,attempt.id)
  assert.equal(pausedReload.runtime.attempt.status,'settled','only the native turn-end receipt settles the held attempt')
  const finalReceipt=await request('/api/agent-pi/qa-task-tool',{action:'native_receipt',messageId:attempt.messageId})
  assert.equal(finalReceipt.events.filter(event=>event.type==='user/message').length,1,'the exact native message is never sent twice')
  writeFileSync(join(artifactDir,'10-host-runtime-native-receipt.json'),JSON.stringify({offered,dispatched,nativeReceipt,actualNativeRead,restored,pausedReload,finalReceipt},null,2),'utf8')
  console.log(JSON.stringify({phase:'durable-host-runtime-native-dispatch-reload-pause',status:'ok',attemptId:attempt.id,messageId:attempt.messageId}))
   // 5.8: actual independent providers, shared engineering records and the native views.
   phase = 'engineering-provider-and-three-views'
   let engineering = await runTool('engineering_project', {action:'status'})
   assert.ok(engineering.providers.some(row=>row.id==='rebar'))
   assert.ok(engineering.providers.some(row=>row.id==='china-tender'))
   const drawingHash=createHash('sha256').update(readFileSync(linkedSourceFile)).digest('hex')
   const drawingRef={sourceId:'qa-drawing',sourceHash:drawingHash,locator:'L1'}
   const beam={id:'qa-beam',type:'beam',title:'QA 梁 KL1',sources:[drawingRef],parameters:{length:{value:6000,unit:'mm',status:'confirmed',sources:[drawingRef]}}}
   engineering=await runTool('engineering_project',{action:'update',revision:engineering.revision,operationId:'qa-engineering-source',patch:{sources:[{id:'qa-drawing',title:'QA 钢筋料表依据',path:linkedSourceFile,sha256:drawingHash,status:'active'}],objects:[beam]}})
   const rebarInput={action:'calculate',data:{schemaVersion:1,rows:[{id:'qa-bars',hostId:'qa-beam',inputMode:'bbs',mark:'KL1-01',diameterMm:'20',steelGrade:'HRB400',count:4,lengths:{geometry:{value:'6',unit:'m'},fabrication:{value:'6',unit:'m'}},unitMassKgPerM:'2.466',sourceRefs:[{documentId:'qa-drawing',sha256:drawingHash,page:1}]}],coverage:{expectedGroupIds:['qa-bars','qa-unread-bars']}}}
   const engineeringDependencies=[{kind:'parameter',id:'qa-beam',parameter:'length'}]
   engineering=await runTool('engineering_project',{action:'run',providerId:'rebar',input:rebarInput,dependencies:engineeringDependencies,revision:engineering.revision,operationId:'qa-rebar-calculate'})
   assert.equal(engineering.runs.at(-1).output.details.totalsByBasis.fabrication.knownMassKg,'59.184')
   assert.equal(engineering.runs.at(-1).output.details.coverage.complete,false,'a missing expected bar group remains a coverage gap')
   assert.equal(engineering.runs.at(-1).output.details.fabricationApproved,false)
   const engineeringTask=(await request(taskUrl)).task
   assert.ok(engineeringTask.findings.some(row=>row.source?.engine==='engineering'),'actual run projects into the shared task')
   await page.getByRole('tab',{name:'本次任务',exact:true}).click()
   await dialog.getByRole('tab',{name:'任务概览',exact:true}).click()
   const engineeringPanel=dialog.getByRole('region',{name:'工程数据与计算',exact:true})
   await engineeringPanel.locator('[data-engineering-provider="rebar"]').waitFor({timeout:20_000})
   await engineeringPanel.getByRole('button',{name:'QA 梁 KL1',exact:true}).click()
   assert.match(await engineeringPanel.innerText(),/KL1-01/)
   assert.match(await engineeringPanel.innerText(),/59.184/)
   await page.screenshot({path:join(artifactDir,'13-engineering-rebar-task-desktop.png'),fullPage:true})
   await page.setViewportSize({width:390,height:844})
   assert.ok(await engineeringPanel.evaluate(element=>element.scrollWidth<=element.clientWidth),'engineering tables scroll within narrow task layout')
   await page.screenshot({path:join(artifactDir,'14-engineering-rebar-mobile.png'),fullPage:true})
   await page.setViewportSize({width:1440,height:980})
   engineering=await runTool('engineering_project',{action:'update',revision:engineering.revision,operationId:'qa-rebar-dimension-change',patch:{objects:[{...beam,parameters:{length:{...beam.parameters.length,value:7000}}}]}})
   assert.equal(engineering.runs.at(-1).status,'stale')
   await engineeringPanel.getByRole('button',{name:'刷新工程记录',exact:true}).click()
   await engineeringPanel.getByText(/依据变化，待重算/).waitFor({timeout:20_000})
   await page.getByRole('tab',{name:'专业化工作台',exact:true}).click()
   const workbenchEngineering=page.locator('.ap-wb').getByRole('region',{name:'工程数据与计算',exact:true})
   await workbenchEngineering.getByText(/依据变化，待重算/).waitFor({timeout:20_000})
   await reloadQaSession('engineering-stale-reload')
   assert.equal((await runTool('engineering_project',{action:'status'})).runs.at(-1).status,'stale','engineering stale state survives renderer reload')
   await page.getByRole('tab',{name:'对话',exact:true}).click()
   await page.locator('.ap-task-summary').getByText(/依据已变化/).first().waitFor({timeout:20_000})
   console.log(JSON.stringify({phase:'engineering-provider-task-workbench-chat-and-reload',status:'ok',revision:engineering.revision}))
    phase = 'pdf-cad-ifc-native-tools-and-preview'
    const pdfRead=await runTool('engineering_pdf',{action:'render',path:pdfFile,page:1,dpi:288,roi:{x:0.05,y:0.3,width:0.7,height:0.4}})
    assert.equal(pdfRead.engineeringSync.status,'synced')
    assert.ok(existsSync(pdfRead.imagePath))
    const cadRead=await runTool('cad_read',{action:'inventory',path:cadFile})
    assert.equal(cadRead.synchronization.status,'recorded')
    assert.ok(cadRead.synchronization.sourceId)
    engineering=await runTool('engineering_project',{action:'status'})
    assert.ok(engineering.project.coverage.filter(row=>row.id.includes('drawing:pdf:')).length===2,'PDF inventory covers unread pages too')
    assert.ok(engineering.project.coverage.every(row=>row.status!=='reviewed'),'reading never approves professional review')
    assert.equal(engineering.runs.find(row=>row.providerId==='rebar').status,'stale','new unrelated drawing reads do not reset stale calculation')
    const roadInput={schemaVersion:1,intervals:[{id:'qa-cut',scope:'QA道路挖方',startM:0,endM:20,startAreaM2:10,endAreaM2:14,method:'average_end_area',sources:[{sourceId:cadRead.synchronization.sourceId,sourceHash:cadRead.source.sha256,locator:'QA synthetic section mapping'}]}],expectedRanges:[{id:'qa-road-range',scope:'QA道路挖方',startM:0,endM:20}]}
    engineering=await runTool('engineering_project',{action:'run',providerId:'road',input:roadInput,dependencies:[{kind:'source',id:cadRead.synchronization.sourceId}],revision:engineering.revision,operationId:'qa-road'})
    assert.equal(engineering.runs.at(-1).output.details.subtotals[0].knownVolumeM3,240)
    const health=await runTool('bim_engine_health',{})
    assert.equal(health.engine.available,true,'full engineering UI smoke requires a configured or bundled IFC engine')
    engineering=await runTool('engineering_project',{action:'run',providerId:'bim-ifc',input:{action:'generate',outputPath:'qa-model.ifc',projectName:'QA model',components:[{id:'qa-slab',type:'IfcSlab',name:'QA road slab',sizeMeters:[6,3,0.2],positionMeters:[0,0,0]},{id:'qa-beam',type:'IfcBeam',name:'QA beam',sizeMeters:[6,0.3,0.6],positionMeters:[0,0,0.2]}]},dependencies:[],revision:engineering.revision,operationId:'qa-ifc-generate'})
    const ifcSource=engineering.runs.at(-1).output.details.source
    engineering=await runTool('engineering_project',{action:'update',patch:{sources:[...engineering.project.sources,{id:'qa-ifc',title:'QA IFC model',path:ifcSource.path,sha256:ifcSource.sha256,status:'active'}]},revision:engineering.revision,operationId:'qa-ifc-source'})
    engineering=await runTool('engineering_project',{action:'run',providerId:'bim-ifc',input:{action:'preview',sourceId:'qa-ifc'},dependencies:[{kind:'source',id:'qa-ifc'}],revision:engineering.revision,operationId:'qa-ifc-preview'})
    const meshes=engineering.runs.at(-1).output.details.elements
    assert.equal(meshes.length,2)
    assert.ok(meshes.every(row=>row.mesh.vertices.length>0))
    assert.ok(Math.abs(meshes.find(row=>row.type==='IfcSlab').netVolumeM3-3.6)<1e-8)
    await page.getByRole('tab',{name:'本次任务',exact:true}).click()
    await dialog.getByRole('tab',{name:'任务概览',exact:true}).click()
    await engineeringPanel.getByRole('button',{name:'刷新工程记录',exact:true}).click()
    const ifcPreview=engineeringPanel.getByRole('region',{name:'IFC 几何预览',exact:true})
    await ifcPreview.waitFor({timeout:20_000})
    await ifcPreview.scrollIntoViewIfNeeded()
    await ifcPreview.getByRole('combobox',{name:'选择 IFC 构件',exact:true}).selectOption({label:'QA beam'})
    await ifcPreview.getByRole('button',{name:'旋转',exact:true}).click()
    assert.match(await ifcPreview.innerText(),/GlobalId:/)
    await page.screenshot({path:join(artifactDir,'15-real-ifc-preview-and-quantities.png'),fullPage:true})
    writeFileSync(join(artifactDir,'16-drawing-and-bim-runtime.json'),JSON.stringify({pdfRead,cadRead,health,engineering},null,2))
    console.log(JSON.stringify({phase:'real-pdf-cad-road-ifc-native-tools-and-preview',status:'ok',artifactDir}))
  phase = 'civil-quantities-and-export'
  const civilFile = join(workspace, 'qa-civil-measurements.json')
  const civilDocument = {
    description:'Synthetic documented geometry and independent expected inventory for local QA only.',
    catalog:[{physicalId:'qa-civil-whole',kind:'pipe',title:'QA 完整平面管线'},{physicalId:'qa-civil-partial',kind:'pipe',title:'QA 间断管线'},{physicalId:'qa-civil-layer',kind:'road_layer',title:'QA 道路结构层'},{physicalId:'qa-civil-missing',kind:'rectangular',title:'QA 缺失详图构件'}],
    objects:[
      {id:'civil-pipe',physicalId:'qa-civil-whole',title:'QA 完整平面管线',kind:'pipe',dimension:'2d',pathKind:'polyline',unit:'m',points:[[0,0],[3,4]]},
      {id:'civil-partial',physicalId:'qa-civil-partial',title:'QA 间断管线',kind:'pipe',dimension:'2d',pathKind:'polyline',unit:'m',points:[[0,0],[0,4],null,[0,10]]},
      {id:'civil-layer',physicalId:'qa-civil-layer',title:'QA 道路结构层',kind:'road_layer',unit:'m',outline:[[0,0],[10,0],[10,2],[0,2],[0,0]],holes:'none',surface:'planar',thickness:{value:300,unit:'mm'}},
    ],
  }
  writeFileSync(civilFile, JSON.stringify(civilDocument,null,2))
  const civilHash = createHash('sha256').update(readFileSync(civilFile)).digest('hex')
  const civilRef = {sourceId:'qa-civil-source',sourceHash:civilHash,locator:'catalog and objects: documented coordinates, thickness and independent missing detail'}
  engineering = await runTool('engineering_project',{action:'update',revision:engineering.revision,operationId:'qa-civil-source',patch:{sources:[...engineering.project.sources,{id:civilRef.sourceId,title:'QA 土建市政原始几何及独立目录',path:civilFile,sha256:civilHash,status:'active'}]}})
  assert.ok(engineering.providers.some(row=>row.id==='civil-quantities'),'civil provider is actually loaded')
  const civilInput = {action:'calculate',data:{catalog:{id:'qa-civil-catalog',title:'QA 独立预期对象目录',sources:[civilRef],items:civilDocument.catalog.map(row=>({...row,sources:[civilRef],disposition:'include'}))},objects:civilDocument.objects.map(row=>({...row,sources:[civilRef]}))}}
  engineering = await runTool('engineering_project',{action:'run',providerId:'civil-quantities',input:civilInput,dependencies:[{kind:'source',id:civilRef.sourceId}],revision:engineering.revision,operationId:'qa-civil-calculation'})
  const civilRun = engineering.runs.at(-1), civil = civilRun.output.details
  assert.equal(civil.rows.find(row=>row.physicalId==='qa-civil-whole').quantity,5)
  assert.equal(civil.rows.find(row=>row.physicalId==='qa-civil-layer').quantity,6)
  assert.equal(civil.rows.find(row=>row.physicalId==='qa-civil-partial').quantity,null)
  assert.equal(civil.rows.find(row=>row.physicalId==='qa-civil-partial').knownPortion,4)
  assert.equal(civil.rows.find(row=>row.physicalId==='qa-civil-missing').status,'missing')
  assert.equal(civil.rows.find(row=>row.physicalId==='qa-civil-missing').quantity,null)
  assert.equal(civil.totals.find(row=>row.kind==='pipe').completeSubtotal,5)
  assert.equal(civil.totals.find(row=>row.kind==='pipe').knownPartialSubtotal,4)
  assert.equal(civil.coverage.completeWithinDeclaredCatalog,false)
  assert.equal(civil.reviewStatus,'needs_review')
  await engineeringPanel.getByRole('button',{name:'刷新工程记录',exact:true}).click()
  await engineeringPanel.locator('[data-engineering-provider="civil-quantities"]').waitFor({timeout:20_000})
  await page.screenshot({path:join(artifactDir,'17-civil-known-and-missing-quantities.png'),fullPage:true})

  const delivery = await runTool('engineering_export',{outputBasename:'QA工程计算交付'})
  assert.equal(delivery.synchronization.status,'recorded',delivery.synchronization.message)
  assert.equal(delivery.snapshotChanged,false)
  assert.equal(delivery.fabricationApproved,false)
  assert.equal(delivery.customerAccepted,false)
  const xlsxFile = delivery.files.find(file=>file.path.endsWith('.xlsx'))
  const htmlFile = delivery.files.find(file=>file.path.endsWith('.html'))
  assert.ok(xlsxFile && htmlFile,'actual XLSX and HTML are required, not a CSV fallback')
  for (const file of delivery.files) assert.equal(createHash('sha256').update(readFileSync(file.path)).digest('hex'),file.sha256)
  assert.equal(readFileSync(xlsxFile.path).subarray(0,2).toString(),'PK')
  assert.match(readFileSync(htmlFile.path,'utf8'),/qa-civil-missing/)
  const exportedTables = JSON.parse(readFileSync(delivery.files.find(file=>file.path.endsWith('tables.json')).path,'utf8'))
  assert.equal(exportedTables['civil-objects'].find(row=>row.physicalId==='qa-civil-whole').currentQuantity,5)
  assert.equal(exportedTables['civil-objects'].find(row=>row.physicalId==='qa-civil-missing').currentQuantity,null)
  const exportedTask = (await request(taskUrl)).task
  const exportDeliverables = exportedTask.deliverables.filter(row=>row.id.startsWith('engineering-delivery:'+delivery.exportId+':'))
  assert.equal(exportDeliverables.length,3)
  assert.ok(exportDeliverables.every(row=>row.status==='draft' && row.checks.some(check=>check.kind==='professional' && check.status==='review')))
  assert.ok(exportDeliverables.every(row=>row.evidenceIds.every(id=>exportedTask.evidence.find(evidence=>evidence.id===id)?.dependsOn.length>0)))
  await dialog.getByRole('button',{name:'读取最新状态',exact:true}).click()
  await dialog.getByRole('tab',{name:'交付检查',exact:true}).click()
  const xlsxDelivery = dialog.locator('article').filter({hasText:xlsxFile.path})
  await xlsxDelivery.getByText('草稿 · 无需签署',{exact:true}).waitFor({timeout:20_000})
  await page.screenshot({path:join(artifactDir,'18-engineering-export-draft-deliverables.png'),fullPage:true})

  phase = 'engineering-xlsx-native-office'
  await page.locator('style[data-plugin="dsh-univer-office"]').first().waitFor({state:'attached',timeout:remaining()})
  officeStarted = true
  const gateway = await request('/univer-api/gateway/start',{})
  assert.equal(gateway.ok,true,gateway.reason)
  assert.equal(new URL(gateway.gateway).port,String(officeGatewayPort),'Office uses the isolated test port, never the user application gateway')
  await dialog.getByRole('tab',{name:'任务概览',exact:true}).click()
  const [officeResponse] = await Promise.all([
    page.waitForResponse(response=>{const url=new URL(response.url());return url.pathname==='/api/agent-pi/files/content' && url.searchParams.get('path')===xlsxFile.path},{timeout:remaining()}),
    dialog.locator(`[data-finding-id="engineering-delivery:${delivery.exportId}"]`).getByRole('button',{name:'工程计算工作簿',exact:true}).first().click(),
  ])
  const office = await officeResponse.json()
  assert.equal(office.engine,'univer-office','exported workbook must use the actual Office import and Viewer')
  assert.ok(office.viewerUrl && office.univerFile)
  const gatewayOrigin = new URL(gateway.gateway).origin, fileKey = Buffer.from(office.univerFile,'utf8').toString('base64url')
  const trees = await (await fetch(`${gatewayOrigin}/uf/${fileKey}/worktrees`)).json()
  const tree = trees.worktrees.find(row=>row.status==='draft')
  assert.ok(tree?.worktreeId)
  const imported = await (await fetch(`${gatewayOrigin}/uf/${fileKey}/worktrees/${encodeURIComponent(tree.worktreeId)}/units`)).json()
  assert.ok(imported.units.some(row=>row.type===2 && Number(row.headRev)>=1),'Office contains an actual imported spreadsheet revision')
  const officeDialog = page.getByRole('dialog',{name:/engineering-workbook\.xlsx$/})
  const officeFrame = officeDialog.locator('iframe.ap-univer-frame').contentFrame()
  await officeFrame.locator('#app > *').first().waitFor({state:'attached',timeout:remaining()})
  // The sheet DOM exists beneath the Office startup skeleton. A real click
  // waits for its hit target to be exposed, rather than only checking the DOM.
  await officeFrame.getByText('项目与导出说明',{exact:true}).first().click({timeout:remaining()})
  assert.ok(await officeFrame.locator('canvas').count(),'native Office must render its spreadsheet canvas')
  await officeFrame.locator('body').evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))))
  await page.screenshot({path:join(artifactDir,'19-engineering-workbook-native-office.png'),fullPage:true})
  await officeDialog.locator('.ap-doc-actions button[title="关闭"]').click()
  await officeDialog.waitFor({state:'detached',timeout:remaining()})
  const officeStopped = await disposeOffice()

  phase = 'engineering-export-source-change'
  writeFileSync(civilFile,JSON.stringify({...civilDocument,revision:2,change:'Geometry source revised; previous calculations require review.'},null,2))
  engineering = await runTool('engineering_project',{action:'status'})
  assert.equal(engineering.sourceChecks.find(row=>row.sourceId===civilRef.sourceId).status,'changed','the actual changed source bytes are detected without a model updating their hash')
  assert.equal(engineering.runs.find(row=>row.id===civilRun.id).status,'stale')
  assert.equal(engineering.project.sources.find(row=>row.id===civilRef.sourceId).sha256,civilHash,'source changes cannot silently update the adopted hash')
  const changedTask = (await request(taskUrl)).task
  assert.ok(exportDeliverables.every(previous=>changedTask.deliverables.find(row=>row.id===previous.id)?.status==='stale'),'engineering source changes invalidate the registered export through its state-evidence dependency')
  await dialog.getByRole('button',{name:'读取最新状态',exact:true}).click()
  await dialog.getByRole('tab',{name:'交付检查',exact:true}).click()
  await xlsxDelivery.getByText('条件已变更，待复核 · 无需签署',{exact:true}).waitFor({timeout:20_000})
  assert.equal(createHash('sha256').update(readFileSync(xlsxFile.path)).digest('hex'),xlsxFile.sha256,'marking stale preserves the exported historical workbook')
  await page.screenshot({path:join(artifactDir,'20-engineering-export-stale-after-source-change.png'),fullPage:true})
  writeFileSync(join(artifactDir,'21-civil-export-office-and-stale.json'),JSON.stringify({civil,delivery,officeGatewayPort,gateway,officeStopped,importedUnits:imported.units,sourceChecks:engineering.sourceChecks,deliverablesBefore:exportDeliverables,deliverablesAfter:changedTask.deliverables.filter(row=>exportDeliverables.some(previous=>previous.id===row.id))},null,2))
  console.log(JSON.stringify({phase:'civil-export-native-office-and-stale',status:'ok',exportId:delivery.exportId,artifactDir}))
   await page.getByRole('tab',{name:'专业化工作台',exact:true}).click()
   await page.locator('.ap-wb .ap-mods').getByRole('button',{name:'模块管理',exact:true}).click()
  await page.getByRole('region',{name:'技能版本与独立验证',exact:true}).waitFor({timeout:remaining()})
  assert.match(await page.getByRole('region',{name:'技能版本与独立验证',exact:true}).innerText(),/来源成果被用户验收、独立案例验证通过并经人工批准/)
  phase = 'module-skill-and-knowledge-panels'
  await page.screenshot({path:join(artifactDir,'11-module-skill-lifecycle-desktop.png'),fullPage:true})
  const kb=await request('/api/agent-pi/kb?cwd='+encodeURIComponent(workspace),{action:'add',slug:'qa-horizon-source',fileName:'qa-origin.md',name:'QA 版本原始条款',text:'# QA 原始条款\n\n项目工期为120天；这份材料只用于本地版本界面核验。\n'})
  assert.match(kb.entry.versionId,/^[a-f0-9]{64}$/)
  await page.locator('.ap-wb .ap-mods').getByRole('button',{name:'知识库',exact:true}).click()
  await page.getByRole('heading',{name:'本地知识库',exact:true}).waitFor({timeout:remaining()})
  const knowledgeCard=page.getByRole('button',{name:'qa-origin.md',exact:true}).locator('xpath=ancestor::div[.//details/summary[text()="来源与不可变版本"]][1]')
  await knowledgeCard.getByText('来源与不可变版本',{exact:true}).click()
  await knowledgeCard.getByText(new RegExp('v'+kb.entry.versionId)).waitFor({timeout:remaining()})
  assert.match(await knowledgeCard.innerText(),/旧引用继续定位旧版本/)
  await page.screenshot({path:join(artifactDir,'12-knowledge-immutable-version-desktop.png'),fullPage:true})
  console.log(JSON.stringify({phase:'actual-module-skill-and-knowledge-version-panels',status:'ok',knowledgeVersion:kb.entry.versionId}))
  assert.deepEqual(pageErrors,[])
  assert.deepEqual(consoleErrors,[])
  writeFileSync(join(artifactDir,'session-readiness.json'),JSON.stringify({sessionSnapshots,errorDetails,requestFailures},null,2).replace(/([?&]token=)[^&#\s"'<>]+/giu,'$1REDACTED'))
  console.log(JSON.stringify({status:'ok',browser:'Browser plugin not available; existing Playwright Electron workflow',viewports:['desktop','390x844'],checks:['actual-plugin-service','actual-professional-source-and-finding-tools','main-chat-shared-understanding','stable-finding-replay','default-automatic-task-overview','independent-field-draft-with-live-findings','shared-depth-goal-and-byte-checks','toggle-keeps-check-history-without-messages','verified-source-preview','Cordis-domain-capability-catalogue','reload-persistence','narrow-layout','english-ui','real-workbench-source-and-decision-artifact','native-inbox-stage-decision','host-registered-control-preserves-user-intent','six-running-task-tabs-with-legacy-records','shared-workbench-header-task-chat-execution-focus','live-finding-during-view-switch','explicit-original-file-review-and-live-count','execution-progress-does-not-approve-stage','stable-approval-during-polling','official-five-history-tools-and-workspace-authorization','durable-constraints-through-renderer-reload','human-revocation-keeps-native-request-identity','actual-artifact-verification-receipt-with-unresolved-gaps','trusted-stage-http-offer-to-native-runtime-dispatch','actual-native-inbox-and-message-receipt','runtime-reload-dedup-without-browser-registry','user-pause-survives-native-settlement-and-refresh','module-manager-skill-lifecycle-panel','knowledge-immutable-version-panel','no-render-errors'],artifactDir,limitation:'Isolated deterministic fixture; no paid model requests or logged-in autonomous Codex turn.'}))
} catch(error){
  if(page)await page.screenshot({path:join(artifactDir,'failure.png'),fullPage:true}).catch(()=>{})
  const diagnostics=page?{url:page.url(),...diagnosticTime(),pageErrors,consoleErrors,errorDetails,requestFailures,sessionSnapshots,regions:await page.locator('section[aria-label]').evaluateAll(rows=>rows.map(row=>row.getAttribute('aria-label'))),body:(await page.locator('body').innerText()).slice(-8000)}:{}
  writeFileSync(join(artifactDir,'failure.log'),(String(error.stack||error)+'\n'+JSON.stringify(diagnostics,null,2)+'\n'+processOutput).replace(/([?&]token=)[^&#\s"'<>]+/giu,'$1REDACTED'))
  console.log(JSON.stringify({visibleControls:await page.locator('[data-slot=sidebar] button').allTextContents()}));throw error
} finally{
  let officeCleanupError
  if (officeStarted && page) {
    try { await disposeOffice() } catch (error) {
      officeCleanupError = error
      writeFileSync(join(artifactDir,'office-cleanup-failure.log'),String(error.stack || error))
    }
  }
  if(electronApp){await electronApp.evaluate(({app})=>{app.isQuitting=true;app.quit()}).catch(()=>{});await electronApp.close().catch(()=>{})}
  assert.ok(resolve(scratch).startsWith(resolve(tmpdir()) + '\\') || resolve(scratch).startsWith(resolve(tmpdir()) + '/'))
  rmSync(scratch,{recursive:true,force:true,maxRetries:15,retryDelay:100})
  if (officeCleanupError) throw officeCleanupError
}

