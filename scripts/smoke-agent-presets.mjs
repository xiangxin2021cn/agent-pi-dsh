import assert from 'node:assert/strict'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { constants, zstdCompressSync, zstdDecompressSync } from 'node:zlib'

const here = dirname(fileURLToPath(import.meta.url))
const root = resolve(here, '..')
const desktopDir = join(root, 'apps', 'desktop')
const electronExe = join(desktopDir, 'node_modules', 'electron', 'dist', process.platform === 'win32' ? 'electron.exe' : 'electron')
const packagedExe = process.env.AGENT_PI_PRESET_SMOKE_EXE ? resolve(process.env.AGENT_PI_PRESET_SMOKE_EXE) : ''
const pnpmStore = join(root, 'vendor', 'deepseek-harness', 'node_modules', '.pnpm')
const deadlineMs = Number(process.env.AGENT_PI_PRESET_SMOKE_MS || 45_000)

function playwrightEntry() {
  const entry = readdirSync(pnpmStore, { withFileTypes: true })
    .filter(item => item.isDirectory() && /^playwright@/.test(item.name))
    .map(item => join(pnpmStore, item.name, 'node_modules', 'playwright', 'index.mjs'))
    .find(path => existsSync(path))
  if (!entry) throw new Error('Playwright is missing from the bundled DSH toolchain')
  return entry
}

if (packagedExe) assert.ok(existsSync(packagedExe), `Packaged executable missing: ${packagedExe}`)
const { _electron: electron } = await import(pathToFileURL(playwrightEntry()).href)
const scratch = mkdtempSync(join(tmpdir(), 'agent-pi-preset-smoke-'))
const dshHome = join(scratch, 'dsh-home')
const userDataDir = join(scratch, 'electron-user-data')
const effectiveDshHome = packagedExe ? join(userDataDir, 'dsh-home') : dshHome
const artifactDir = join(root, 'output', 'playwright')
mkdirSync(effectiveDshHome, { recursive: true })
writeFileSync(join(effectiveDshHome, 'settings.yaml'), 'agent-presets:\n  default: code\nlocale:\n  preference: zh\n')
const legacySessionFile = join(
  effectiveDshHome,
  'sessions/_no-cwd/session-legacy-code/session.jsonl.zstd',
)
mkdirSync(dirname(legacySessionFile), { recursive: true })
const zstdOptions = { params: { [constants.ZSTD_c_checksumFlag]: 1 } }
const legacyHeaderFrame = zstdCompressSync(`${JSON.stringify({
  type: 'session',
  version: 0,
  id: 'session-legacy-code',
  createdAt: 1,
  delegationDepth: 0,
  agentPreset: 'code',
})}\n`, zstdOptions)
const legacyEventFrame = zstdCompressSync(`${JSON.stringify({
  type: 'user/message',
  seq: 0,
  time: 2,
  data: { content: 'preserve packaged smoke event frame' },
})}\n`, zstdOptions)
writeFileSync(legacySessionFile, Buffer.concat([legacyHeaderFrame, legacyEventFrame]))

let electronApp
let page
let processOutput = ''
const rendererErrors = []
try {
  electronApp = await electron.launch({
    executablePath: packagedExe || electronExe,
    args: packagedExe ? [`--user-data-dir=${userDataDir}`] : [`--user-data-dir=${userDataDir}`, desktopDir],
    cwd: packagedExe ? dirname(packagedExe) : root,
    env: {
      ...process.env,
      AGENT_PI_DSH_FORCE_COLD_START: '1',
      AGENT_PI_SKIP_UNIVER_INSTALL: '1',
      ...packagedExe ? {} : { DSH_CHECKOUT: join(root, 'vendor', 'deepseek-harness') },
      DSH_HOME: effectiveDshHome,
      ELECTRON_DISABLE_SECURITY_WARNINGS: 'true',
    },
    timeout: deadlineMs,
  })
  const child = electronApp.process()
  const rememberOutput = (chunk) => {
    processOutput = (processOutput + String(chunk)).slice(-32_768)
  }
  child.stdout?.on('data', rememberOutput)
  child.stderr?.on('data', rememberOutput)
  page = await electronApp.firstWindow({ timeout: deadlineMs })
  page.on('console', (message) => {
    if (message.type() === 'error') rendererErrors.push(message.text())
  })
  page.on('pageerror', (error) => rendererErrors.push(String(error)))
  await page.waitForURL(url => url.protocol === 'http:' && ['127.0.0.1', 'localhost'].includes(url.hostname), {
    timeout: deadlineMs,
  })
  await page.locator('[data-slot="sidebar"]').waitFor({ state: 'visible', timeout: deadlineMs })

  for (const text of [/继续|Continue/i, /稍后配置|Configure later/i]) {
    const button = page.locator('button').filter({ hasText: text }).first()
    await button.waitFor({ state: 'visible', timeout: 5_000 }).then(() => button.click()).catch(() => {})
  }

  const presetButton = page.locator('button[aria-haspopup="menu"]')
    .filter({ hasText: /标准模式|Standard mode/ })
    .first()
  await presetButton.waitFor({ state: 'visible', timeout: deadlineMs })
  assert.doesNotMatch(await presetButton.innerText(), /\bcode\b/i)

  await presetButton.click()
  const expected = [/标准模式|Standard mode/, /PTC 模式|PTC mode/, /极简模式|Minimal mode/, /创造模式|Creator mode/]
  for (const text of expected) {
    await page.getByRole('menuitem').filter({ hasText: text }).first().waitFor({ state: 'visible', timeout: 10_000 })
  }
  await page.getByRole('menuitem').filter({ hasText: /PTC 模式|PTC mode/ }).first().click()
  await page.locator('button[aria-haspopup="menu"]').filter({ hasText: /PTC 模式|PTC mode/ }).first()
    .waitFor({ state: 'visible', timeout: 10_000 })

  const ptcButton = page.locator('button[aria-haspopup="menu"]').filter({ hasText: /PTC 模式|PTC mode/ }).first()
  await ptcButton.click()
  await page.getByRole('menuitem').filter({ hasText: /极简模式|Minimal mode/ }).first().click()
  await page.locator('button[aria-haspopup="menu"]').filter({ hasText: /极简模式|Minimal mode/ }).first()
    .waitFor({ state: 'visible', timeout: 10_000 })

  const settings = readFileSync(join(effectiveDshHome, 'settings.yaml'), 'utf8')
  assert.match(settings, /agent-presets:\r?\n  default: standard/)
  assert.doesNotMatch(settings, /default: code/)
  const migratedSession = readFileSync(legacySessionFile)
  const migratedHeader = JSON.parse(zstdDecompressSync(migratedSession).toString('utf8'))
  assert.equal(migratedHeader.agentPreset, 'standard')
  assert.ok(
    migratedSession.subarray(migratedSession.length - legacyEventFrame.length).equals(legacyEventFrame),
    'packaged startup must leave later event frames byte-identical',
  )
  assert.equal(await page.getByText(/无法切换|Could not switch/i).count(), 0)
  assert.deepEqual(rendererErrors, [], `renderer errors: ${rendererErrors.join(' | ')}`)
  const screenshotPath = join(tmpdir(), 'agent-pi-preset-smoke-3.4.1.png')
  await page.screenshot({ path: screenshotPath, fullPage: false })
  console.log(JSON.stringify({
    status: 'ok',
    screenshot: screenshotPath,
    checks: ['legacy-default-code-migrated', 'legacy-session-code-migrated', 'event-frames-preserved', 'four-official-presets-visible', 'standard-to-ptc', 'ptc-to-minimal'],
  }))
} catch (error) {
  mkdirSync(artifactDir, { recursive: true })
  if (page) await page.screenshot({ path: join(artifactDir, 'agent-preset-smoke-failure.png'), fullPage: true }).catch(() => {})
  const diagnostics = [String(error?.stack || error), '', 'Electron output:', processOutput || '(empty)'].join('\n')
  writeFileSync(join(artifactDir, 'agent-preset-smoke-failure.log'), diagnostics)
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
