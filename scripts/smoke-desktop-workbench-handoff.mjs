import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const root = resolve(here, '..')
const desktopDir = join(root, 'apps', 'desktop')
const electronExe = join(desktopDir, 'node_modules', 'electron', 'dist', process.platform === 'win32' ? 'electron.exe' : 'electron')
const pnpmStore = join(root, 'vendor', 'deepseek-harness', 'node_modules', '.pnpm')
const deadlineMs = Number(process.env.AGENT_PI_WORKBENCH_E2E_MS || 60_000)
const browserHold = process.env.AGENT_PI_WORKBENCH_BROWSER_HOLD === '1'
const promptMarker = '【阶段切换 — 请在本项目主会话继续】'
const requirementMarker = '【用户最新要求 — 请在本项目主会话优先处理】'
const closeoutMarker = '【用户验收口径已确认 — 只做硬门禁收口】'
const requirementText = '只修改重大风险结论和澄清清单，不要重做已完成的招标文件解析。'
const projectName = 'N3 端到端投标'
const projectId = 'n3-e2e-tender'

function playwrightEntry() {
  const entry = readdirSync(pnpmStore, { withFileTypes: true })
    .filter((item) => item.isDirectory() && /^playwright@/.test(item.name))
    .map((item) => join(pnpmStore, item.name, 'node_modules', 'playwright', 'index.mjs'))
    .find((path) => existsSync(path))
  if (!entry) throw new Error('Playwright is missing from the bundled DSH toolchain')
  return entry
}

function safeUrl(raw) {
  try {
    const url = new URL(raw)
    if (url.searchParams.has('token')) url.searchParams.set('token', '<redacted>')
    return url.toString()
  } catch {
    return String(raw || '')
  }
}

assert.ok(existsSync(electronExe), 'Electron executable missing: ' + electronExe)
assert.ok(existsSync(join(root, 'vendor', 'deepseek-harness', 'apps', 'web', 'dist', 'index.html')), 'DSH web dist is not built')

const { _electron: electron } = await import(pathToFileURL(playwrightEntry()).href)
const scratch = mkdtempSync(join(tmpdir(), 'agent-pi-workbench-handoff-'))
const userDataDir = join(scratch, 'electron-user-data')
const dshHome = join(scratch, 'dsh-home')
const workspace = join(scratch, 'workspace')
const sourceFile = join(workspace, '招标说明.md')
const artifactDir = join(root, 'output', 'playwright', 'workbench-handoff')
const screenshots = {
  blank: join(artifactDir, '01-blank-main-project-entry.png'),
  files: join(artifactDir, '02-project-file-selected.png'),
  workbench: join(artifactDir, '03-created-workbench.png'),
  handoff: join(artifactDir, '04-main-chat-received-stage-prompt.png'),
  requirement: join(artifactDir, '05-user-requirement-in-workbench.png'),
  delta: join(artifactDir, '06-main-chat-received-delta-prompt.png'),
  accepted: join(artifactDir, '07-user-baseline-accepted.png'),
  closeout: join(artifactDir, '08-user-baseline-hard-gate-closeout.png'),
  nativeCreate: join(artifactDir, '09-native-create-mode.png'),
  monitor: join(artifactDir, '10-committed-monitor-running.png'),
}
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
    DSH_HOME: dshHome,
  },
  encoding: 'utf8',
  windowsHide: true,
})
assert.equal(profileInit.status, 0, profileInit.stderr || profileInit.stdout || 'profile init failed')
const profilePatchPath = join(dshHome, 'profiles', 'tender', 'cordis.patch.yml')
const profilePatch = readFileSync(profilePatchPath, 'utf8')
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

let electronApp
let page
let processOutput = ''
const stageActions = []
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

async function screenshot(name) {
  await page.screenshot({ path: screenshots[name], fullPage: true })
}

try {
  electronApp = await electron.launch({
    executablePath: electronExe,
    args: ['--user-data-dir=' + userDataDir, desktopDir],
    cwd: root,
    env: {
      ...process.env,
      AGENT_PI_DSH_FORCE_COLD_START: '1',
      DSH_CHECKOUT: join(root, 'vendor', 'deepseek-harness'),
      DSH_HOME: dshHome,
      ELECTRON_DISABLE_SECURITY_WARNINGS: 'true',
    },
    timeout: deadlineMs,
  })
  const electronProcess = electronApp.process()
  const rememberOutput = (chunk) => {
    processOutput = (processOutput + String(chunk)).slice(-32_768)
  }
  electronProcess.stdout?.on('data', rememberOutput)
  electronProcess.stderr?.on('data', rememberOutput)

  page = await electronApp.firstWindow({ timeout: deadlineMs })
  page.on('pageerror', (error) => pageErrors.push(String(error && error.stack || error)))
  page.on('dialog', (dialog) => dialog.accept())
  page.on('request', (request) => {
    if (!request.url().includes('/api/agent-pi/stage') || request.method() !== 'POST') return
    try {
      const body = request.postDataJSON()
      stageActions.push(String(body && body.action || ''))
    } catch {
      stageActions.push('<invalid-json>')
    }
  })

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
  if (browserHold) {
    const launchLogPath = join(userDataDir, 'dsh-launch.log')
    const launchText = existsSync(launchLogPath) ? readFileSync(launchLogPath, 'utf8') : processOutput
    const matches = [...launchText.matchAll(/dsh web:\s*(https?:\/\/[^\s\u001b]+)/gi)]
    const authUrl = matches.at(-1)?.[1]
    assert.ok(authUrl, 'authenticated dsh web URL was not advertised')
    console.log(JSON.stringify({ status: 'browser-ready', authUrl, workspace, sourceFile, scratch }))
    await new Promise((resolveHold) => {
      process.once('SIGINT', resolveHold)
      process.once('SIGTERM', resolveHold)
    })
    await electronApp.evaluate(({ app }) => {
      app.isQuitting = true
      app.quit()
    }).catch(() => {})
    await electronApp.close().catch(() => {})
    electronApp = null
    rmSync(scratch, { recursive: true, force: true })
    process.exit(0)
  }
  const starter = page.locator('[aria-label="新建专业工作台项目"]')
  await starter.waitFor({ state: 'visible', timeout: remaining() })
  await screenshot('blank')
  await starter.getByRole('button', { name: '投标项目', exact: true }).click()

  const createDialog = page.locator('.ap-modal.wide').filter({ hasText: /新建.*投标.*项目/ })
  await createDialog.waitFor({ state: 'visible', timeout: remaining() })
  await createDialog.locator('input').nth(0).fill(projectName)
  await createDialog.locator('input').nth(1).fill(projectId)
  await createDialog.getByRole('button', { name: '下一步', exact: true }).click()
  await createDialog.getByRole('button', { name: /使用当前工作区/ }).click()
  await createDialog.getByRole('button', { name: '下一步', exact: true }).click()

  const sourceButton = createDialog.locator('.ap-tree-pick button').filter({ hasText: '招标说明.md' })
  await sourceButton.waitFor({ state: 'visible', timeout: remaining() })
  await sourceButton.click()
  await createDialog.getByText('已选', { exact: true }).waitFor({ state: 'visible', timeout: remaining() })
  await screenshot('files')
  await createDialog.getByRole('button', { name: '下一步', exact: true }).click()
  await createDialog.getByText('登记资料：').waitFor({ state: 'visible', timeout: remaining() })
  assert.match(await createDialog.innerText(), /登记资料：\s*1 个/)
  assert.equal(stageActions.includes('prepare'), false, 'project creation must not reserve a stage offer')
  await createDialog.getByRole('button', {
    name: '创建项目（登记资料后再启动阶段）',
    exact: true,
  }).click()
  await createDialog.waitFor({ state: 'detached', timeout: remaining() })

  const workbench = page.locator('.ap-wb-page')
  await workbench.waitFor({ state: 'visible', timeout: remaining() })
  await workbench.getByRole('heading', { name: projectName, exact: true }).waitFor({
    state: 'visible',
    timeout: remaining(),
  })
  await screenshot('workbench')

  const registryPath = join(workspace, 'business-projects.json')
  assert.ok(existsSync(registryPath), 'project registry was not written')
  const registry = JSON.parse(readFileSync(registryPath, 'utf8'))
  const persisted = registry.projects.find((item) => item.projectId === projectId && item.module === 'tender')
  assert.ok(persisted, 'created tender project is missing from the registry')
  assert.deepEqual(persisted.inputPaths, [sourceFile])
  assert.ok(existsSync(persisted.rootPath), 'project directory was not created')

  await workbench.getByRole('button', { name: '继续推进', exact: true }).click()
  await workbench.waitFor({ state: 'detached', timeout: remaining() })
  await page.waitForFunction(
    () => document.documentElement.classList.contains('ap-wb-open') === false,
    undefined,
    { timeout: remaining() },
  )
  await page.waitForFunction(
    (marker) => document.body.innerText.includes(marker),
    promptMarker,
    { timeout: remaining() },
  )
  await screenshot('handoff')

  const bodyText = await page.locator('body').innerText()
  assert.equal(bodyText.split(promptMarker).length - 1, 1, 'stage prompt must appear in main chat exactly once')

  const composer = page.locator('[data-composer-input][contenteditable="true"]')
  await composer.fill(requirementText)
  await composer.press('Enter')
  await page.waitForFunction(
    () => document.body.innerText.includes('只修改重大风险结论和澄清清单'),
    undefined,
    { timeout: remaining() },
  )
  await page.waitForFunction(
    () => window.__apWorkbenchSessionBindings && window.__apWorkbenchSessionBindings.size > 0,
    undefined,
    { timeout: remaining() },
  )
  await page.waitForTimeout(250)
  assert.equal(stageActions.filter((action) => action === 'record_requirement').length, 1)

  await page.getByRole('button', { name: '专业化工作台', exact: true }).click()
  await workbench.waitFor({ state: 'visible', timeout: remaining() })
  const requirementSection = workbench.getByRole('region', { name: '用户要求（最高优先级）' })
  await requirementSection.waitFor({ state: 'visible', timeout: remaining() })
  assert.match(await requirementSection.innerText(), new RegExp(requirementText))
  await screenshot('requirement')

  await workbench.getByRole('button', { name: '继续推进', exact: true }).click()
  await workbench.waitFor({ state: 'detached', timeout: remaining() })
  await page.waitForFunction(
    (marker) => document.body.innerText.includes(marker),
    requirementMarker,
    { timeout: remaining() },
  )
  await screenshot('delta')
  const afterDeltaText = await page.locator('body').innerText()
  assert.equal(afterDeltaText.split(promptMarker).length - 1, 1, 'delta handling must not repeat the full stage prompt')
  assert.equal(afterDeltaText.split(requirementMarker).length - 1, 1, 'requirement delta prompt must appear exactly once')

  await page.getByRole('button', { name: '专业化工作台', exact: true }).click()
  await workbench.waitFor({ state: 'visible', timeout: remaining() })
  await workbench.getByRole('button', { name: '标记已落实', exact: true }).click()
  await workbench.getByRole('button', { name: '采用为验收口径', exact: true }).waitFor({ state: 'visible', timeout: remaining() })
  await workbench.getByRole('button', { name: '采用为验收口径', exact: true }).click()
  await workbench.getByText('已采用为验收口径', { exact: true }).waitFor({ state: 'visible', timeout: remaining() })
  await screenshot('accepted')

  await workbench.getByRole('button', { name: '继续推进', exact: true }).click()
  await workbench.waitFor({ state: 'detached', timeout: remaining() })
  await page.waitForFunction(
    (marker) => document.body.innerText.includes(marker),
    closeoutMarker,
    { timeout: remaining() },
  )
  await screenshot('closeout')
  const afterCloseoutText = await page.locator('body').innerText()
  // The DSH conversation list virtualizes older turns, so cumulative DOM counts
  // are not stable once another turn is queued. Per-turn visibility plus the
  // mark_dispatched count below verifies exactly-once delivery.
  assert.equal(afterCloseoutText.split(closeoutMarker).length - 1, 1, 'hard-gate closeout must appear exactly once')

  await page.getByRole('button', { name: '专业化工作台', exact: true }).click()
  await workbench.waitFor({ state: 'visible', timeout: remaining() })
  const automaticMonitorCheck = page.waitForRequest((request) => {
    if (!request.url().includes('/api/agent-pi/stage') || request.method() !== 'POST') return false
    try { return request.postDataJSON()?.action === 'check' } catch { return false }
  }, { timeout: remaining() })
  await workbench.getByRole('button', { name: '继续推进', exact: true }).click()
  await workbench.waitFor({ state: 'detached', timeout: remaining() })
  await page.waitForFunction(
    () => window.__apWorkbenchTransactions?.committed().length === 1
      && Boolean(localStorage.getItem('ap-wb-session-transactions:v1')),
    undefined,
    { timeout: remaining() },
  )
  const afterDedupeText = await page.locator('body').innerText()
  assert.equal(afterDedupeText.split(closeoutMarker).length - 1, 1, 'repeated continue must not duplicate hard-gate closeout')

  await page.getByRole('button', { name: '专业化工作台', exact: true }).click()
  await workbench.waitFor({ state: 'visible', timeout: remaining() })
  await workbench.getByText(/当前会话事务(?:空闲|已暂停)/).waitFor({ state: 'visible', timeout: remaining() })
  await screenshot('monitor')
  await automaticMonitorCheck

  await workbench.getByRole('button', { name: '模块管理', exact: true }).click()
  await workbench.getByText('模块创造模式', { exact: true }).waitFor({ state: 'visible', timeout: remaining() })
  await workbench.getByRole('button', { name: /做过一单，照这个来/ }).click()
  await workbench.waitFor({ state: 'detached', timeout: remaining() })
  await page.getByText(/创造模式|Creator mode/, { exact: true }).first()
    .waitFor({ state: 'visible', timeout: remaining() })
  await page.waitForFunction(
    () => document.body.innerText.includes('【Agent Pi 来源上下文】')
      && document.body.innerText.includes('不能把“文件存在”当成“用户认可”'),
    undefined,
    { timeout: remaining() },
  )
  await screenshot('nativeCreate')

  assert.equal(stageActions.filter((action) => action === 'prepare').length, 0)
  assert.equal(stageActions.filter((action) => action === 'complete').length, 1)
  assert.ok(stageActions.filter((action) => action === 'resume').length >= 3)
  assert.ok(stageActions.filter((action) => action === 'check').length >= 1)
  assert.equal(stageActions.filter((action) => action === 'mark_dispatched').length, 3)
  assert.equal(stageActions.filter((action) => action === 'satisfy_requirement').length, 1)
  assert.equal(stageActions.filter((action) => action === 'accept_requirement').length, 1)
  assert.deepEqual(pageErrors, [])

  console.log(JSON.stringify({
    status: 'ok',
    elapsedMs: Date.now() - startedAt,
    url: safeUrl(page.url()),
    checks: [
      'blank-main-project-entry',
      'tender-project-created',
      'workspace-file-selected-and-persisted',
      'no-hidden-prepare',
      'explicit-workbench-advance',
      'single-main-chat-stage-prompt',
      'workbench-returned-to-chat',
      'manual-user-requirement-persisted',
      'delta-only-requirement-prompt',
      'no-full-stage-repeat',
      'user-baseline-explicitly-accepted',
      'accepted-baseline-hard-gate-closeout-once',
      'accepted-closeout-deduped',
      'committed-session-monitor-persisted-and-running',
      'native-create-mode-session',
      'native-create-source-context',
    ],
    stageActions,
    screenshots,
  }))
} catch (error) {
  if (page) {
    await page.screenshot({ path: join(artifactDir, 'failure.png'), fullPage: true }).catch(() => {})
  }
  const launchLog = join(userDataDir, 'dsh-launch.log')
  const diagnostics = [
    String(error && error.stack || error),
    '',
    'stage actions: ' + JSON.stringify(stageActions),
    'page errors: ' + JSON.stringify(pageErrors),
    '',
    'Electron output:',
    processOutput || '(empty)',
    '',
    'DSH launch log:',
    existsSync(launchLog) ? readFileSync(launchLog, 'utf8') : '(missing)',
  ].join('\n')
  writeFileSync(join(artifactDir, 'failure.log'), diagnostics, 'utf8')
  throw new Error(diagnostics)
} finally {
  if (electronApp) {
    await electronApp.evaluate(({ app }) => {
      app.isQuitting = true
      app.quit()
    }).catch(() => {})
    await electronApp.close().catch(() => {})
  }
  rmSync(scratch, { recursive: true, force: true })
}
