import assert from 'node:assert/strict'
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { basename, dirname, join, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const root = resolve(here, '..')
const desktopDir = join(root, 'apps', 'desktop')
const electronExe = join(desktopDir, 'node_modules', 'electron', 'dist', process.platform === 'win32' ? 'electron.exe' : 'electron')
const pnpmStore = join(root, 'vendor', 'deepseek-harness', 'node_modules', '.pnpm')
const deadlineMs = Number(process.env.AGENT_PI_COLD_START_MS || 120_000)
const requireUniver = process.env.AGENT_PI_SMOKE_REQUIRE_UNIVER === '1'

function playwrightEntry() {
  const packageDir = readdirSync(pnpmStore, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && /^playwright@/.test(entry.name))
    .map((entry) => join(pnpmStore, entry.name, 'node_modules', 'playwright', 'index.mjs'))
    .find((path) => existsSync(path))
  if (!packageDir) throw new Error('Playwright is missing from the bundled DSH toolchain')
  return packageDir
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

assert.ok(existsSync(electronExe), `Electron executable missing: ${electronExe}`)
assert.ok(existsSync(join(root, 'vendor', 'deepseek-harness', 'apps', 'web', 'dist', 'index.html')), 'DSH web dist is not built')

const { _electron: electron } = await import(pathToFileURL(playwrightEntry()).href)
const scratch = mkdtempSync(join(tmpdir(), 'agent-pi-cold-start-'))
const userDataDir = join(scratch, 'electron-user-data')
const dshHome = join(scratch, 'dsh-home')
const seedHome = process.env.AGENT_PI_SMOKE_DSH_HOME_SOURCE
const seedSessionDir = process.env.AGENT_PI_SMOKE_SESSION_DIR
const artifactDir = join(root, 'output', 'playwright')
let electronApp
let page
let processOutput = ''
const startedAt = Date.now()
if (seedHome && existsSync(join(seedHome, 'storages'))) {
  mkdirSync(dshHome, { recursive: true })
  cpSync(join(seedHome, 'storages'), join(dshHome, 'storages'), { recursive: true })
  if (seedSessionDir && existsSync(seedSessionDir)) {
    cpSync(seedSessionDir, join(dshHome, 'sessions', basename(seedSessionDir)), { recursive: true })
  }
}

try {
  electronApp = await electron.launch({
    executablePath: electronExe,
    args: [`--user-data-dir=${userDataDir}`, desktopDir],
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
  const remaining = () => Math.max(1, deadlineMs - (Date.now() - startedAt))
  await page.waitForURL((url) => url.protocol === 'http:' && (url.hostname === '127.0.0.1' || url.hostname === 'localhost'), {
    timeout: remaining(),
  })
  await page.locator('[data-slot="sidebar"]').waitFor({ state: 'visible', timeout: remaining() })
  if (requireUniver) {
    const profile = JSON.parse(readFileSync(join(dshHome, 'profiles', 'tender', 'package.json'), 'utf8'))
    assert.ok(profile.dsh?.profile?.bundles?.includes('dsh-univer-office'), 'Office must be active in the profile')
    await page.locator('style[data-plugin="dsh-univer-office"]').first().waitFor({ state: 'attached', timeout: remaining() })
    const status = await page.evaluate(async () => {
      const response = await fetch('/univer-api/status')
      return { status: response.status, contentType: response.headers.get('content-type'), body: await response.json() }
    })
    assert.equal(status.status, 200, 'Office host status endpoint must respond')
    assert.match(status.contentType || '', /application\/json/)
    assert.notEqual(status.body?.ok, false, 'Office host must not report a startup failure')
  }
  const continueButton = page.locator('button').filter({ hasText: /继续|Continue/i }).first()
  await continueButton.waitFor({ state: 'visible', timeout: Math.min(3_000, remaining()) })
    .then(() => continueButton.click())
    .catch(() => {})
  const configureLaterButton = page.locator('button').filter({ hasText: /稍后配置|Configure later/i }).first()
  await configureLaterButton.waitFor({ state: 'visible', timeout: Math.min(5_000, remaining()) })
    .then(() => configureLaterButton.click())
    .catch(() => {})
  if (seedHome) {
    const sessionRow = page.locator('[role="treeitem"][aria-selected]').first()
    await sessionRow.waitFor({ state: 'visible', timeout: remaining() })
    await sessionRow.click()
    await page.locator('.ap-files-dock').waitFor({ state: 'visible', timeout: remaining() })
  }
  const workbenchButton = page.locator('[data-ap-place="ap-mount-wb"] button').first()
  await workbenchButton.waitFor({ state: 'visible', timeout: remaining() })
  assert.equal(await page.locator('.ap-keydlg').count(), 0, 'legacy API Key overlay must not return during startup')
  await workbenchButton.click()
  await page.getByText(/专业化工作台|Workbench/, { exact: true }).first().waitFor({ state: 'visible', timeout: remaining() })
  if (process.env.AGENT_PI_SMOKE_SCREENSHOT) {
    await page.screenshot({ path: resolve(process.env.AGENT_PI_SMOKE_SCREENSHOT), fullPage: true })
  }
  const elapsedMs = Date.now() - startedAt
  assert.ok(elapsedMs <= deadlineMs, `cold start took ${elapsedMs}ms (limit ${deadlineMs}ms)`)
  console.log(JSON.stringify({
    status: 'ok',
    elapsedMs,
    limitMs: deadlineMs,
    url: safeUrl(page.url()),
    checks: ['authenticated-dsh-url', 'sidebar-visible', ...(requireUniver ? ['office-profile-active', 'office-client-active', 'office-host-status'] : []), ...(seedHome ? ['session-files-rail-visible'] : []), 'workbench-interactive', 'no-legacy-api-key-overlay'],
  }))
} catch (error) {
  mkdirSync(artifactDir, { recursive: true })
  if (page) {
    await page.screenshot({ path: join(artifactDir, 'desktop-cold-start-failure.png'), fullPage: true }).catch(() => {})
  }
  const launchLog = join(userDataDir, 'dsh-launch.log')
  const dshOutput = existsSync(launchLog) ? readFileSync(launchLog, 'utf8') : ''
  const diagnostics = [
    String(error && error.stack || error),
    '',
    'Electron output:',
    processOutput || '(empty)',
    '',
    'DSH launch log:',
    dshOutput || '(missing)',
  ].join('\n')
  writeFileSync(join(artifactDir, 'desktop-cold-start-failure.log'), diagnostics)
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
