import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
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
const sourceFile = join(workspace, '招标说明.md')
const artifactDir = resolve(process.env.AGENT_PI_QA_ARTIFACT_DIR || join(root, '.codex-temp', 'task-guide-ui-3.7.5'))
mkdirSync(workspace, { recursive: true })
mkdirSync(artifactDir, { recursive: true })
writeFileSync(sourceFile, [
  '# 招标说明',
  '',
  '- 项目：N3 公路升级',
  '- 截止时间：2030-06-30 12:00',
  '- 本文件仅用于 Agent Pi DSH 本地端到端回归。',
  '',
].join('\n'), 'utf8')

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
writeFileSync(qaPlugin,`export const name='qa-session';export const inject=['sessions','sessionPersistence','sessionController'];export async function apply(ctx){await ctx.sessionController.create({sessionId:'qa-guided-task',cwd:process.env.AGENT_PI_QA_WORKSPACE});const s=ctx.sessions.get('qa-guided-task');s.append('turn/start',{turn:1});s.append('user/message',{content:[{type:'text',text:'Professional task guide QA fixture; do not execute model work.'}],source:{kind:'user'}},{surfaceOp:'append'});s.append('turn/end',{turn:1,reason:{kind:'completed'}});await ctx.sessionController.rename({sessionId:s.id,title:'Professional task guide QA'});await ctx.sessions.flush(s)}`)
writeFileSync(profilePatchPath,readFileSync(profilePatchPath,'utf8')+'\n- insert:\n    - id: qa-session\n      name: '+JSON.stringify(qaPlugin.replaceAll('\\','/'))+'\n')

let electronApp
let page
const qaLoader = join(scratch, 'desktop-loader.mjs')
writeFileSync(qaLoader, "import {app} from 'electron';import {pathToFileURL} from 'node:url';app.setPath('userData',process.env.AGENT_PI_QA_USER_DATA);await import(pathToFileURL(process.env.AGENT_PI_QA_DESKTOP_MAIN).href)")
let processOutput = ''
const pageErrors = []
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
  page.on('dialog', (dialog) => dialog.accept())
  await page.waitForURL(
    (url) => url.protocol === 'http:' && (url.hostname === '127.0.0.1' || url.hostname === 'localhost'),
    { timeout: remaining() },
  )
  await page.locator('[data-slot="sidebar"]').waitFor({ state: 'visible', timeout: remaining() })
  await clickOptional(/继续|Continue/i)
  await clickOptional(/稍后配置|Configure later/i, 5_000)

  const workspaceChooser = page.getByRole('textbox', { name: /选择工作区|Choose workspace/i }).first()
  await workspaceChooser.waitFor({ state: 'visible', timeout: remaining() })
  await workspaceChooser.click()
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
  console.log(JSON.stringify(await page.evaluate(async()=>{const r=await fetch('/api/agent-pi/professional-task?sessionId=qa-guided-task');return{fixtureSessionStatus:r.status,treeRows:document.querySelectorAll('[role=treeitem]').length}})));
  for (const label of [/^workspace$/, /^未分组$/]) { const row = page.getByRole('treeitem').filter({hasText:label}); if (await row.count() && await row.getAttribute('aria-expanded') === 'false') await row.click(); }
  await page.getByRole('treeitem').filter({hasText:/qa-guided-task|Professional task guide QA/}).last().click({timeout:30000});
  console.log(JSON.stringify({rows:await page.getByRole('treeitem').evaluateAll(rows=>rows.map(row=>({level:row.getAttribute('aria-level'),selected:row.getAttribute('aria-selected'),expanded:row.getAttribute('aria-expanded'),label:row.getAttribute('aria-label'),text:row.textContent?.slice(0,120)})))}));
  const capabilityFlags=await page.evaluate(()=>fetch('/api/agent-pi/capabilities').then(r=>r.json()))
  assert.equal(capabilityFlags.taskGuide,true,'native task plugin must actually be active')
  let observed
  page.on('response',async response=>{if(response.url().includes('/api/agent-pi/professional-task')&&response.ok())observed=await response.json().catch(()=>null)})
  const trigger=page.getByRole('tab',{name:'本次任务',exact:true})
  const originalFileRail = await page.locator('.ap-files-dock').boundingBox()
  await trigger.waitFor({timeout:remaining()});await trigger.click()
  const dialog=page.getByRole('region',{name:'本次任务',exact:true})
  await dialog.getByLabel('本次要完成什么').waitFor({timeout:remaining()})
  const guideLayout = await dialog.evaluate(element => ({position:getComputedStyle(element).position,region:element.getBoundingClientRect().toJSON(),tabs:document.querySelector('[data-conversation-tabs]').getBoundingClientRect().toJSON()}))
  assert.notEqual(guideLayout.position,'fixed','task view does not create a fixed side drawer')
  assert.ok(guideLayout.region.x >= guideLayout.tabs.x - 30 && guideLayout.region.right <= guideLayout.tabs.right + 30,'task guide stays inside the main conversation column')
  assert.equal((await page.locator('.ap-files-dock').boundingBox()).width,originalFileRail.width,'task view preserves the existing right file rail width')
  await dialog.getByLabel('本次要完成什么').fill('根据纳米比亚项目招标要求，编制逐项BOQ资源与成本及必交文件')
  await dialog.getByLabel('工作范围与边界').fill('复核选定源文件、属地依据、资源计算、策划和声明表；不代替客户签署')
  await dialog.getByLabel('专业方向').selectOption('tender')
  await dialog.getByLabel('输出格式（逗号分隔）').fill('docx, xlsx')
  await dialog.getByLabel('交付语言').fill('English')
  await dialog.getByRole('button',{name:'保存需求',exact:true}).click()
  await dialog.getByText('已保存，后续执行将采用本次需求。',{exact:true}).waitFor()
  await dialog.getByRole('tab',{name:'项目依据',exact:true}).click()
  await dialog.getByLabel('项目国家/地区').fill('Namibia')
  await dialog.getByLabel('项目地点').fill('Windhoek')
  await dialog.getByLabel('合同及版本').fill('To be confirmed from selected tender')
  await dialog.getByLabel('计量计价依据').fill('Actual BOQ preambles; pending clause review')
  await dialog.getByRole('button',{name:'保存需求',exact:true}).click()
  await dialog.getByText('已保存，后续执行将采用本次需求。',{exact:true}).waitFor()
  assert.equal(observed.task.brief.basis.country,'Namibia')
  assert.deepEqual(observed.task.brief.formats,['docx','xlsx'])
  assert.ok(observed.capabilities.some(row=>row.id==='tool:read'),'catalogue includes the actual session-scoped reader');
  assert.ok(observed.capabilities.some(row=>row.owner==='dsh-agent-pi-workbench-tender'),'actual Cordis domain contributions visible')
  await page.screenshot({path:join(artifactDir,'01-basis-desktop.png'),fullPage:true})
  await dialog.getByRole('tab',{name:'可用能力',exact:true}).click()
  await dialog.getByText('招标全文解析与要求覆盖',{exact:true}).waitFor()
  await page.screenshot({path:join(artifactDir,'02-capabilities-desktop.png'),fullPage:true})
  await dialog.getByRole('button',{name:'关闭',exact:true}).click()
  await page.locator('select.ap-lang').selectOption('en')
  await page.getByRole('tab',{name:'Current task',exact:true}).click()
  const englishDialog = page.getByRole('region',{name:'Current task',exact:true})
  await englishDialog.getByRole('tab',{name:'Goal & brief',exact:true}).click()
  await englishDialog.getByLabel('What should this task accomplish?').waitFor()
  await page.screenshot({path:join(artifactDir,'04-brief-english.png'),fullPage:true})
  await englishDialog.getByRole('button',{name:'Close',exact:true}).click()
  await page.locator('select.ap-lang').selectOption('zh')
  await trigger.click()
  await page.getByRole('button',{name:'收起资源文件',exact:true}).click()
  await page.setViewportSize({width:390,height:844})
  await dialog.getByRole('tab',{name:'目标与需求',exact:true}).click()
  await page.screenshot({path:join(artifactDir,'03-brief-mobile.png'),fullPage:true})
  assert.ok(await dialog.evaluate(element=>element.scrollWidth<=element.clientWidth),'panel fits narrow viewport')
  await dialog.getByRole('button',{name:'关闭',exact:true}).click()
  await page.reload();await clickOptional(/继续|Continue/i);await clickOptional(/稍后配置|Configure later/i)
  await trigger.waitFor({timeout:remaining()});await trigger.click()
  await dialog.getByLabel('本次要完成什么').waitFor()
  assert.match(await dialog.getByLabel('本次要完成什么').inputValue(),/纳米比亚/)
  assert.deepEqual(pageErrors,[])
  console.log(JSON.stringify({status:'ok',checks:['actual-plugin-service','real-session-task-brief-save','Cordis-domain-capability-catalogue','country-and-format-retained','reload-persistence','main-conversation-view','narrow-layout','english-ui','actual-session-tools','no-render-errors'],artifactDir}))
} catch(error){
  if(page)await page.screenshot({path:join(artifactDir,'failure.png'),fullPage:true}).catch(()=>{})
  writeFileSync(join(artifactDir,'failure.log'),String(error.stack||error)+'\n'+processOutput)
  console.log(JSON.stringify({visibleControls:await page.locator('[data-slot=sidebar] button').allTextContents()}));throw error
} finally{
  if(electronApp){await electronApp.evaluate(({app})=>{app.isQuitting=true;app.quit()}).catch(()=>{});await electronApp.close().catch(()=>{})}
  assert.ok(resolve(scratch).startsWith(resolve(tmpdir()) + '\\') || resolve(scratch).startsWith(resolve(tmpdir()) + '/'))
  rmSync(scratch,{recursive:true,force:true})
}

