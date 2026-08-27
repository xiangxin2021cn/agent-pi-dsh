import { app, BrowserWindow, dialog, ipcMain, Menu, nativeImage, session, shell, Tray } from 'electron'
import { spawn, spawnSync } from 'node:child_process'
import { copyFileSync, createWriteStream, existsSync, mkdirSync, readFileSync, renameSync, rmSync, statSync, unlinkSync, writeFileSync } from 'node:fs'
import { randomBytes } from 'node:crypto'
import { tmpdir } from 'node:os'
import { createServer } from 'node:net'
import { Readable } from 'node:stream'
import { pipeline } from 'node:stream/promises'
import { delimiter, dirname, isAbsolute, join, normalize, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { createCodexAuthController, resolveCodexWrapper } from './codex-auth.mjs'

const APP_NAME = 'agent-pi-DSH'
const here = dirname(fileURLToPath(import.meta.url))
const repoRoot = resolve(here, '../..')
const packaged = app.isPackaged
const resources = packaged ? process.resourcesPath : repoRoot
const runtimeRoot = packaged ? join(resources, 'runtime') : null
const dshRoot = packaged && runtimeRoot && existsSync(join(runtimeRoot, 'deepseek-harness', 'package.json'))
  ? join(runtimeRoot, 'deepseek-harness')
  : (process.env.DSH_CHECKOUT || join(repoRoot, 'vendor/deepseek-harness'))
const productRoot = runtimeRoot && existsSync(join(runtimeRoot, 'product', 'package.json'))
  ? join(runtimeRoot, 'product')
  : repoRoot
const dshHome = packaged
  ? join(app.getPath('userData'), 'dsh-home')
  : (process.env.DSH_HOME || join(repoRoot, '.dsh-home'))
const codexHome = packaged
  ? join(app.getPath('userData'), 'codex-home')
  : join(repoRoot, '.codex-home')
const bundledNode = runtimeRoot
  ? join(runtimeRoot, 'node', process.platform === 'win32' ? 'node.exe' : 'node')
  : null
const nodeDir = bundledNode ? dirname(bundledNode) : null
const packedBrandIcon = [
  join(here, 'brand/app-icon.ico'),
  join(here, 'brand/app-icon.png'),
  join(here, 'build/icon.ico'),
  join(here, 'brand/app-logo.png'),
].find((path) => existsSync(path))
const launchLog = () => join(app.getPath('userData'), 'dsh-launch.log')

function isLoosePath(path) {
  return Boolean(path) && !String(path).includes('app.asar')
}

function resolveWindowIconPng() {
  const packedPng = join(here, 'brand/app-icon.png')
  const loose = [
    packaged ? join(dirname(process.execPath), 'app-icon.png') : null,
    packaged ? join(process.resourcesPath, 'app-icon.png') : null,
    join(app.getPath('userData'), 'app-icon.png'),
  ].filter(Boolean)
  const existing = loose.find((path) => existsSync(path) && isLoosePath(path))
  if (existing) return existing
  const source = existsSync(packedPng) ? packedPng : packedBrandIcon
  if (!source) return null
  const dest = join(app.getPath('userData'), 'app-icon.png')
  try {
    mkdirSync(dirname(dest), { recursive: true })
    copyFileSync(source, dest)
    return dest
  } catch {
    return source
  }
}

function applyWindowIcon(win) {
  const source = resolveWindowIconPng() || packedBrandIcon
  if (!source) return
  const image = nativeImage.createFromPath(source)
  if (!image.isEmpty()) win.setIcon(image)
}

app.setName(APP_NAME)
if (process.platform === 'win32') {
  app.setAppUserModelId('do.agentpi.dsh')
  // Packaged Chromium on Windows 11 runs the print compositor in LPAC; that
  // utility process crashes the whole app on printToPDF. Disable before ready.
  app.commandLine.appendSwitch('disable-features', 'PrintCompositorLPAC')
}

let child = null
let mainWindow = null
let appUrl = process.env.AGENT_PI_DSH_URL || 'http://127.0.0.1:3080'
let launchLogStream = null
let dshPort = 3080
let dshRestartCount = 0
const DSH_HEAP_MB = 8192
const DSH_RESTART_LIMIT = 3

function logLine(text) {
  try { launchLogStream?.write(`${text}\n`) } catch {}
}

function consumeRelaunchRequest() {
  const file = join(dshHome, 'request-relaunch.json')
  if (!existsSync(file)) return false
  try { unlinkSync(file) } catch {
    // Stale marker still means the child asked for a supervised relaunch.
  }
  return true
}

function writeHostRestartMarker(code) {
  try {
    mkdirSync(dshHome, { recursive: true })
    const n = Number(code)
    const reason = (n === 134 || n === 3221226505 || n === 3221225794 || n === 3221225477) ? 'oom' : 'crash'
    writeFileSync(join(dshHome, 'host-restart.json'), `${JSON.stringify({
      at: Date.now(),
      code: Number.isFinite(n) ? n : null,
      reason,
      pending: true,
    })}\n`, 'utf8')
  } catch {
    // Restart marker is best-effort; the child still restarts.
  }
}

function childAlive() {
  return Boolean(child && child.pid && child.exitCode === null)
}

function taskkillTree(pid) {
  if (!pid) return
  spawnSync('taskkill', ['/PID', String(pid), '/T', '/F'], {
    stdio: 'ignore',
    windowsHide: true,
  })
}

function pidsListeningOn(port) {
  const result = spawnSync('netstat', ['-ano'], { encoding: 'utf8', windowsHide: true })
  const pids = new Set()
  const needle = `:${port}`
  for (const line of String(result.stdout || '').split(/\r?\n/)) {
    if (!/LISTENING/i.test(line) || !line.includes(needle)) continue
    const parts = line.trim().split(/\s+/)
    const pid = Number(parts[parts.length - 1])
    if (Number.isInteger(pid) && pid > 0) pids.add(pid)
  }
  return [...pids]
}

function stopDshTree() {
  if (!childAlive()) return
  const pid = child.pid
  logLine(`[stop] pid=${pid}`)
  if (process.platform === 'win32') taskkillTree(pid)
  else {
    // dsh spawns its own worker/subprocess tree; the child is started detached
    // so the whole process group can be signalled at once.
    try { process.kill(-pid, 'SIGTERM') } catch {
      try { child.kill('SIGTERM') } catch {}
    }
    setTimeout(() => {
      try { process.kill(-pid, 'SIGKILL') } catch {}
    }, 4000).unref()
  }
}

function reapPackagedPort(port) {
  if (!packaged || process.platform !== 'win32') return
  for (const pid of pidsListeningOn(port)) {
    if (pid === process.pid) continue
    logLine(`[reap] port=${port} pid=${pid}`)
    taskkillTree(pid)
  }
}

function runtimeEnv() {
  const sysRoot = process.env.SystemRoot || process.env.WINDIR || (process.platform === 'win32' ? 'C:\\Windows' : '')
  const env = {
    ...process.env,
    DSH_HOME: dshHome,
    DSH_CHECKOUT: dshRoot,
    DSH_BUNDLED_SKILL_DIR: join(productRoot, 'skills'),
    AGENT_PI_DESKTOP: '1',
    CODEX_HOME: codexHome,
  }
  // Official Models onboarding treats a process-environment DEEPSEEK_API_KEY
  // as a ready, read-only credential. The desktop stores the key through the
  // DSH credential file so first-run users get the official dialog and can
  // change the default DeepSeek key later.
  delete env.DEEPSEEK_API_KEY
  delete env.DEEPSEEK_BASE_URL
  // Keep the Codex child on this app's ChatGPT login. A machine-wide API key
  // must not silently override the isolated CODEX_HOME selected in Settings.
  delete env.OPENAI_API_KEY
  delete env.OPENAI_ACCESS_TOKEN
  delete env.CODEX_API_KEY
  delete env.CODEX_ACCESS_TOKEN
  if (sysRoot && !env.SystemRoot) env.SystemRoot = sysRoot
  const pathParts = []
  if (nodeDir && existsSync(nodeDir)) pathParts.push(nodeDir)
  if (sysRoot) {
    const programFiles = process.env.ProgramFiles || 'C:\\Program Files'
    const pwshDir = join(programFiles, 'PowerShell', '7')
    if (existsSync(join(pwshDir, 'pwsh.exe'))) pathParts.push(pwshDir)
    const winpsDir = join(sysRoot, 'System32', 'WindowsPowerShell', 'v1.0')
    if (existsSync(join(winpsDir, 'powershell.exe'))) pathParts.push(winpsDir)
    pathParts.push(join(sysRoot, 'System32'))
    pathParts.push(sysRoot)
  }
  if (env.PATH) pathParts.push(env.PATH)
  env.PATH = pathParts.join(delimiter)
  return env
}

function resolveNode() {
  if (bundledNode && existsSync(bundledNode)) return bundledNode
  return process.execPath.includes('electron') ? 'node' : process.execPath
}

let codexAuthController = null

function getCodexAuthController() {
  if (codexAuthController) return codexAuthController
  const wrapperPath = resolveCodexWrapper(dshRoot)
  if (!wrapperPath) return null
  codexAuthController = createCodexAuthController({
    nodePath: resolveNode(),
    wrapperPath,
    codexHome,
    baseEnv: runtimeEnv(),
  })
  return codexAuthController
}

function dshArgs(extra = []) {
  const heap = `--max-old-space-size=${DSH_HEAP_MB}`
  const bin = join(dshRoot, 'apps/cli/lib/bin.js')
  const src = join(dshRoot, 'apps/cli/src/bin.ts')
  // rc.8 web-runtime defaults openBrowser: true. The Electron window is the
  // only UI; --no-open keeps the default browser closed.
  const args = ['--profile', 'tender', '--no-open', ...extra]
  return existsSync(bin)
    ? [heap, bin, ...args]
    : [heap, '--import', 'tsx/esm', src, ...args]
}

function assertDshRuntime() {
  const markers = [
    join(dshRoot, 'package.json'),
    join(dshRoot, 'apps/web/dist/index.html'),
    join(dshRoot, 'node_modules/@deepseek-ai'),
  ]
  const missing = markers.filter((path) => !existsSync(path))
  if (missing.length > 0) {
    throw new Error(
      `${APP_NAME} 运行时不完整，缺少 DeepSeek Harness 预装包。\n${missing.join('\n')}\n请重新安装应用（Windows: scripts/pack-win.ps1 重打）。`,
    )
  }
}

async function urlAlive(url) {
  try {
    const res = await fetch(url, { method: 'HEAD' })
    return res.ok || res.status === 404 || res.status === 405
  } catch {
    return false
  }
}

function findFreePort(preferred = 3080) {
  return new Promise((resolvePort, reject) => {
    const probe = createServer()
    probe.unref()
    probe.once('error', () => {
      const fallback = createServer()
      fallback.unref()
      fallback.once('error', reject)
      fallback.listen(0, '127.0.0.1', () => {
        const address = fallback.address()
        const port = typeof address === 'object' && address ? address.port : preferred
        fallback.close(() => resolvePort(port))
      })
    })
    probe.listen(preferred, '127.0.0.1', () => {
      probe.close(() => resolvePort(preferred))
    })
  })
}

function repairPackedLinks() {
  const script = join(productRoot, 'scripts/repair-dsh-links.mjs')
  if (!existsSync(script) || !existsSync(join(dshRoot, '.agent-pi-links.json'))) return
  const result = spawnSync(resolveNode(), [script, 'repair', dshRoot], {
    cwd: productRoot,
    env: runtimeEnv(),
    encoding: 'utf8',
    windowsHide: true,
    shell: resolveNode() === 'node' && process.platform === 'win32',
  })
  if (result.stdout) process.stdout.write(result.stdout)
  if (result.status !== 0) {
    throw new Error(`dsh link repair failed: ${result.stderr || result.status}`)
  }
}

function ensureProfile() {
  mkdirSync(dshHome, { recursive: true })
  const initScript = join(productRoot, 'scripts/init-tender-profile.mjs')
  if (!existsSync(initScript)) {
    throw new Error(`missing profile init script: ${initScript}`)
  }
  const result = spawnSync(resolveNode(), [initScript], {
    cwd: productRoot,
    env: runtimeEnv(),
    stdio: 'inherit',
    windowsHide: true,
    shell: resolveNode() === 'node' && process.platform === 'win32',
  })
  if (result.status !== 0) {
    throw new Error(`tender profile init failed (${result.status ?? 'spawn'})`)
  }
}

function startDsh(port) {
  dshPort = Number.isInteger(port) ? port : dshPort
  mkdirSync(app.getPath('userData'), { recursive: true })
  launchLogStream = createWriteStream(launchLog(), { flags: 'a' })
  const env = runtimeEnv()
  const extra = Number.isInteger(port) ? ['--port', String(port)] : []
  const stdio = ['ignore', 'pipe', 'pipe']
  if (bundledNode && existsSync(bundledNode)) {
    child = spawn(bundledNode, dshArgs(extra), {
      cwd: dshRoot,
      env,
      stdio,
      windowsHide: true,
      detached: process.platform !== 'win32',
    })
  } else {
    const pnpm = process.platform === 'win32' ? 'pnpm.cmd' : 'pnpm'
    child = spawn(pnpm, ['dsh', '--profile', 'tender', '--no-open', ...extra], {
      cwd: dshRoot,
      env,
      stdio,
      shell: process.platform === 'win32',
    })
  }
  const prefix = (stream) => (chunk) => {
    const text = String(chunk)
    launchLogStream?.write(`[${stream}] ${text}`)
    process.stderr.write(text)
  }
  child.stdout?.on('data', prefix('out'))
  child.stderr?.on('data', prefix('err'))
  child.on('exit', (code) => {
    logLine(`[exit] ${code}`)
    const requested = consumeRelaunchRequest()
    if (code && !app.isQuitting && !requested) writeHostRestartMarker(code)
    if (!app.isQuitting && (requested || code) && dshRestartCount < DSH_RESTART_LIMIT) {
      logLine(`[restart] dsh web exited ${requested ? 'relaunch' : code}; attempt ${dshRestartCount + 1}/${DSH_RESTART_LIMIT}`)
    }
    launchLogStream?.end()
    launchLogStream = null
    child = null
    if (app.isQuitting) return
    if (!requested && !code) return
    if (!requested && dshRestartCount >= DSH_RESTART_LIMIT) {
      dialog.showErrorBox(
        `${APP_NAME} 无法启动`,
        `dsh web exited ${code}\n日志: ${launchLog()}`,
      )
      return
    }
    if (!requested) dshRestartCount += 1
    else dshRestartCount = 0
    setTimeout(() => {
      if (app.isQuitting) return
      startDsh(dshPort)
      void waitForUrl(appUrl).then(() => {
        dshRestartCount = 0
        if (mainWindow && !mainWindow.isDestroyed()) void mainWindow.loadURL(appUrl)
      }).catch((error) => {
        dialog.showErrorBox(
          `${APP_NAME} 无法启动`,
          `${String(error?.message ?? error)}\n日志: ${launchLog()}`,
        )
      })
    }, 800).unref()
  })
}

async function waitForUrl(url, timeoutMs = 120000) {
  const start = Date.now()
  while (Date.now() - start < timeoutMs) {
    if (child && child.exitCode && child.exitCode !== 0) {
      throw new Error(`dsh web exited ${child.exitCode}. 见 ${launchLog()}`)
    }
    if (await urlAlive(url)) return
    await new Promise((r) => setTimeout(r, 400))
  }
  throw new Error(`timed out waiting for ${url}. 见 ${launchLog()}`)
}

function createWindow() {
  const win = new BrowserWindow({
    width: 1440,
    height: 900,
    title: 'Agent Pi DSH',
    icon: packedBrandIcon || undefined,
    backgroundColor: '#eef2f6',
    webPreferences: {
      preload: join(here, 'preload.mjs'),
      contextIsolation: true,
    },
  })
  mainWindow = win
  applyWindowIcon(win)
  win.on('page-title-updated', (event, title) => {
    const next = String(title || '')
      .replace(/DSH Local Build/g, 'Agent Pi DSH')
      .replace(/DeepSeek Harness/g, 'Agent Pi DSH')
      .replace(/Agent π/g, 'Agent Pi DSH')
      .trim() || 'Agent Pi DSH'
    if (next === title) return
    event.preventDefault()
    win.setTitle(next)
  })
  for (const event of ['page-favicon-updated', 'did-finish-load', 'did-navigate', 'did-navigate-in-page']) {
    win.webContents.on(event, () => applyWindowIcon(win))
  }
  attachRendererGuards(win)
  win.loadFile(join(here, 'boot.html'))
  win.webContents.setWindowOpenHandler(({ url }) => {
    void oshellOpen(url)
    return { action: 'deny' }
  })
  win.on('close', (event) => {
    if (app.isQuitting) {
      stopDshTree()
      return
    }
    const action = closeAction()
    if (action === 'quit') {
      app.isQuitting = true
      stopDshTree()
      return
    }
    // 'tray' keeps the DSH backend warm; 'ask' decides asynchronously.
    event.preventDefault()
    if (action === 'tray') {
      hideToTray(win)
    } else {
      void askCloseAction(win)
    }
  })
  win.on('closed', () => {
    if (mainWindow === win) mainWindow = null
    if (process.platform !== 'darwin') app.quit()
  })
  return win
}

function oshellOpen(url) {
  return shell.openExternal(url)
}

function attachRendererGuards(win) {
  const crashAt = []
  win.webContents.on('render-process-gone', (_event, details) => {
    logLine(`[renderer] gone reason=${details?.reason} exit=${details?.exitCode}`)
    if (win.isDestroyed() || app.isQuitting) return
    const now = Date.now()
    while (crashAt.length && now - crashAt[0] > 20_000) crashAt.shift()
    crashAt.push(now)
    if (crashAt.length >= 3) {
      logLine('[renderer] crash loop detected; not reloading')
      return
    }
    const target = appUrl
    setTimeout(() => {
      if (win.isDestroyed() || app.isQuitting) return
      void win.loadURL(target).catch((error) => {
        logLine(`[renderer] reload failed: ${error}`)
      })
    }, 400)
  })
  win.webContents.on('unresponsive', () => {
    logLine('[renderer] unresponsive')
  })
  win.webContents.on('responsive', () => {
    logLine('[renderer] responsive')
  })
}

process.on('uncaughtException', (error) => {
  logLine(`[uncaughtException] ${error?.stack || error}`)
})
process.on('unhandledRejection', (reason) => {
  logLine(`[unhandledRejection] ${reason instanceof Error ? reason.stack : String(reason)}`)
})

// ---------------------------------------------------------------------------
// Close behavior: minimize to tray (DSH backend stays warm, no second boot
// wait) or quit outright. Persisted in window-prefs.json; 'ask' shows a
// dialog with a remember checkbox. The tray menu and app menu can change it.
const prefsPath = () => join(app.getPath('userData'), 'window-prefs.json')

function readPrefs() {
  try {
    return JSON.parse(readFileSync(prefsPath(), 'utf8'))
  } catch {
    return {}
  }
}

function writePrefs(patch) {
  const next = { ...readPrefs(), ...patch }
  try {
    mkdirSync(dirname(prefsPath()), { recursive: true })
    writeFileSync(prefsPath(), JSON.stringify(next, null, 2))
  } catch {}
  return next
}

function closeAction() {
  const value = readPrefs().closeAction
  return value === 'tray' || value === 'quit' ? value : 'ask'
}

let tray = null
let trayBalloonShown = false

function resolveTrayIcon() {
  const candidates = [
    packaged ? join(dirname(process.execPath), 'app-icon.ico') : null,
    packaged ? join(process.resourcesPath, 'app-icon.ico') : null,
    resolveWindowIconPng(),
    packedBrandIcon,
  ].filter(Boolean)
  for (const path of candidates) {
    if (!existsSync(path)) continue
    const image = nativeImage.createFromPath(path)
    if (!image.isEmpty()) return image
  }
  return nativeImage.createEmpty()
}

function showMainWindow() {
  if (mainWindow && !mainWindow.isDestroyed()) {
    if (mainWindow.isMinimized()) mainWindow.restore()
    mainWindow.show()
    mainWindow.focus()
    return
  }
  const win = createWindow()
  buildAppMenu(win)
  void win.loadURL(appUrl)
}

function ensureTray() {
  if (tray && !tray.isDestroyed()) return tray
  tray = new Tray(resolveTrayIcon())
  tray.setToolTip('Agent Pi DSH — 点击打开')
  tray.setContextMenu(Menu.buildFromTemplate([
    { label: '打开 Agent Pi DSH', click: () => showMainWindow() },
    {
      label: '检查更新...',
      click: () => {
        showMainWindow()
        if (mainWindow) void checkUpdateInteractive(mainWindow)
      },
    },
    { type: 'separator' },
    { label: '退出', click: () => quitApp() },
  ]))
  tray.on('click', () => showMainWindow())
  tray.on('double-click', () => showMainWindow())
  return tray
}

function hideToTray(win) {
  ensureTray()
  win.hide()
  if (process.platform === 'win32' && !trayBalloonShown) {
    trayBalloonShown = true
    try {
      tray.displayBalloon({
        title: 'Agent Pi DSH 仍在后台运行',
        content: '点击托盘图标随时回来；右键托盘图标可退出。',
        iconType: 'info',
      })
    } catch {
      // balloon support varies by Windows shell configuration
    }
  }
}

function quitApp() {
  app.isQuitting = true
  app.quit()
}

async function askCloseAction(win) {
  const { response, checkboxChecked } = await dialog.showMessageBox(win, {
    type: 'question',
    title: '关闭窗口',
    message: '关闭窗口时想怎么处理？',
    detail: '最小化到托盘：后台保持运行，从托盘一键回来，免去二次启动等待。',
    buttons: ['最小化到托盘', '直接退出', '取消'],
    defaultId: 0,
    cancelId: 2,
    checkboxLabel: '记住我的选择，下次不再询问',
    checkboxChecked: false,
    noLink: true,
  })
  if (response === 2) return
  const choice = response === 0 ? 'tray' : 'quit'
  if (checkboxChecked) {
    writePrefs({ closeAction: choice })
    buildAppMenu(win)
  }
  if (choice === 'tray') {
    hideToTray(win)
  } else {
    quitApp()
  }
}

// ---------------------------------------------------------------------------
// In-app update: GitHub releases/latest -> download the Windows installer to
// temp -> launch it and quit. No code signing, so electron-updater's verified
// channel does not apply; the NSIS installer itself guides the user through.
const UPDATE_REPO = 'xiangxin2021cn/agent-pi-dsh'
const RELEASES_PAGE = `https://github.com/${UPDATE_REPO}/releases/latest`
const updateState = {
  phase: 'idle', // idle | checking | available | downloading | ready | none | error
  info: null, // { version, assetUrl, assetName, size, notes }
  progress: 0,
  file: null,
  dismissed: false,
}

function parseVersion(text) {
  const m = String(text || '').match(/(\d+)\.(\d+)\.(\d+)/)
  return m ? [Number(m[1]), Number(m[2]), Number(m[3])] : null
}

function isNewerVersion(remote, local) {
  const a = parseVersion(remote)
  const b = parseVersion(local)
  if (!a || !b) return false
  for (let i = 0; i < 3; i += 1) {
    if (a[i] !== b[i]) return a[i] > b[i]
  }
  return false
}

async function fetchLatestRelease() {
  const res = await fetch(`https://api.github.com/repos/${UPDATE_REPO}/releases/latest`, {
    headers: { accept: 'application/vnd.github+json', 'user-agent': 'agent-pi-dsh-updater' },
  })
  if (!res.ok) throw new Error(`GitHub API ${res.status}`)
  return res.json()
}

async function checkForUpdate() {
  updateState.phase = 'checking'
  try {
    const release = await fetchLatestRelease()
    const remote = String(release.tag_name || '').replace(/^v/, '')
    if (!isNewerVersion(remote, app.getVersion())) {
      updateState.phase = 'none'
      updateState.info = null
      return null
    }
    const wanted = `Agent-Pi-DSH-${remote}-x64.exe`
    const asset = (release.assets || []).find((a) => a.name === wanted)
    updateState.info = {
      version: remote,
      assetName: asset?.name ?? null,
      assetUrl: asset?.browser_download_url ?? null,
      size: asset?.size ?? 0,
      notes: String(release.body || '').slice(0, 600),
    }
    updateState.phase = 'available'
    return updateState.info
  } catch (error) {
    updateState.phase = 'error'
    updateState.info = null
    throw error
  }
}

function sendUpdateProgress() {
  const payload = {
    phase: updateState.phase,
    progress: updateState.progress,
    version: updateState.info?.version ?? null,
  }
  try { mainWindow?.webContents.send('update-progress', payload) } catch {}
}

async function downloadUpdate() {
  const info = updateState.info
  if (!info?.assetUrl) throw new Error('no downloadable asset for this platform')
  const dir = join(app.getPath('temp'), 'agent-pi-update')
  mkdirSync(dir, { recursive: true })
  const file = join(dir, info.assetName)
  if (existsSync(file) && info.size > 0 && statSync(file).size === info.size) {
    updateState.file = file
    updateState.phase = 'ready'
    sendUpdateProgress()
    return file
  }
  updateState.phase = 'downloading'
  updateState.progress = 0
  const res = await fetch(info.assetUrl, { headers: { 'user-agent': 'agent-pi-dsh-updater' } })
  if (!res.ok || !res.body) throw new Error(`download failed: ${res.status}`)
  const total = Number(res.headers.get('content-length')) || info.size || 0
  let received = 0
  let lastTick = 0
  const partial = `${file}.part`
  const counter = new TransformStream({
    transform(chunk, controller) {
      received += chunk.byteLength
      if (total > 0) {
        updateState.progress = received / total
        const now = Date.now()
        if (now - lastTick > 250) {
          lastTick = now
          try { mainWindow?.setProgressBar(updateState.progress) } catch {}
          sendUpdateProgress()
        }
      }
      controller.enqueue(chunk)
    },
  })
  try {
    await pipeline(Readable.fromWeb(res.body.pipeThrough(counter)), createWriteStream(partial))
    if (total > 0 && statSync(partial).size !== total) {
      throw new Error(`download incomplete: ${statSync(partial).size}/${total}`)
    }
    if (existsSync(file)) unlinkSync(file)
    renameSync(partial, file)
  } catch (error) {
    try { unlinkSync(partial) } catch {}
    updateState.phase = 'error'
    throw error
  } finally {
    try { mainWindow?.setProgressBar(-1) } catch {}
  }
  updateState.file = file
  updateState.phase = 'ready'
  updateState.progress = 1
  sendUpdateProgress()
  return file
}

function installUpdate() {
  if (!updateState.file || !existsSync(updateState.file)) throw new Error('installer not downloaded')
  const installer = spawn(updateState.file, [], { detached: true, stdio: 'ignore' })
  installer.unref()
  app.isQuitting = true
  app.quit()
}

async function checkUpdateInteractive(win) {
  let info = null
  try {
    info = await checkForUpdate()
  } catch (error) {
    await dialog.showMessageBox(win, {
      type: 'warning',
      title: '检查更新',
      message: '检查更新失败',
      detail: `${error?.message ?? error}\n可直接访问发布页下载。`,
      buttons: ['打开发布页', '关闭'],
      cancelId: 1,
    }).then(({ response }) => {
      if (response === 0) void oshellOpen(RELEASES_PAGE)
    })
    return
  }
  if (!info) {
    await dialog.showMessageBox(win, {
      type: 'info',
      title: '检查更新',
      message: `当前已是最新版本（${app.getVersion()}）`,
      buttons: ['好的'],
    })
    return
  }
  await promptDownload(win, info, false)
}

async function promptDownload(win, info, silent) {
  const canAuto = Boolean(info.assetUrl) && process.platform === 'win32'
  const { response } = await dialog.showMessageBox(win, {
    type: 'info',
    title: '发现新版本',
    message: `发现新版本 ${info.version}（当前 ${app.getVersion()}）`,
    detail: info.notes ? info.notes.split('\n').slice(0, 8).join('\n') : '',
    buttons: canAuto ? ['下载并安装', '查看发布页', silent ? '本次忽略' : '取消'] : ['查看发布页', silent ? '本次忽略' : '取消'],
    cancelId: canAuto ? 2 : 1,
    defaultId: 0,
  })
  if (canAuto && response === 0) {
    try {
      await downloadUpdate()
    } catch (error) {
      await dialog.showMessageBox(win, {
        type: 'error',
        title: '下载更新',
        message: '下载失败',
        detail: `${error?.message ?? error}\n可直接访问发布页下载。`,
        buttons: ['打开发布页', '关闭'],
        cancelId: 1,
      }).then(({ response: r }) => {
        if (r === 0) void oshellOpen(RELEASES_PAGE)
      })
      return
    }
    const { response: r } = await dialog.showMessageBox(win, {
      type: 'info',
      title: '更新就绪',
      message: `新版本 ${info.version} 已下载完成`,
      detail: '安装程序将引导完成升级，应用会先退出。',
      buttons: ['立即安装', '稍后'],
      cancelId: 1,
      defaultId: 0,
    })
    if (r === 0) installUpdate()
  } else if ((canAuto && response === 1) || (!canAuto && response === 0)) {
    void oshellOpen(RELEASES_PAGE)
  } else if (silent) {
    updateState.dismissed = true
  }
}

function scheduleStartupUpdateCheck(win) {
  setTimeout(async () => {
    if (updateState.dismissed) return
    try {
      const info = await checkForUpdate()
      if (info && !win.isDestroyed()) await promptDownload(win, info, true)
    } catch {
      // silent check: network failures surface only through the menu action
    }
  }, 12000)
}

function buildAppMenu(win) {
  const template = [
    {
      label: '应用',
      submenu: [
        { label: `版本 ${app.getVersion()}`, enabled: false },
        { label: '检查更新...', click: () => void checkUpdateInteractive(win) },
        { label: '打开发布页', click: () => void oshellOpen(RELEASES_PAGE) },
        { type: 'separator' },
        {
          label: '关闭窗口时',
          submenu: [
            {
              label: '每次询问',
              type: 'radio',
              checked: closeAction() === 'ask',
              click: () => writePrefs({ closeAction: 'ask' }),
            },
            {
              label: '最小化到托盘（后台常驻）',
              type: 'radio',
              checked: closeAction() === 'tray',
              click: () => writePrefs({ closeAction: 'tray' }),
            },
            {
              label: '直接退出',
              type: 'radio',
              checked: closeAction() === 'quit',
              click: () => writePrefs({ closeAction: 'quit' }),
            },
          ],
        },
        { label: '打开启动日志', click: () => shell.showItemInFolder(launchLog()) },
        { type: 'separator' },
        { role: 'quit', label: '退出' },
      ],
    },
    {
      label: '编辑',
      submenu: [
        { role: 'undo', label: '撤销' },
        { role: 'redo', label: '重做' },
        { type: 'separator' },
        { role: 'cut', label: '剪切' },
        { role: 'copy', label: '复制' },
        { role: 'paste', label: '粘贴' },
        { role: 'selectAll', label: '全选' },
      ],
    },
    {
      label: '视图',
      submenu: [
        { role: 'reload', label: '刷新' },
        { role: 'toggleDevTools', label: '开发者工具' },
        { type: 'separator' },
        { role: 'resetZoom', label: '实际大小' },
        { role: 'zoomIn', label: '放大' },
        { role: 'zoomOut', label: '缩小' },
        { type: 'separator' },
        { role: 'togglefullscreen', label: '全屏' },
      ],
    },
  ]
  Menu.setApplicationMenu(Menu.buildFromTemplate(template))
}

ipcMain.handle('app-relaunch', () => {
  logLine('[relaunch] renderer requested')
  app.isQuitting = true
  app.relaunch()
  app.quit()
  return true
})
ipcMain.handle('app-version', () => app.getVersion())
ipcMain.handle('codex-auth-status', () => (
  getCodexAuthController()?.status() ?? { available: false, state: 'unavailable' }
))
ipcMain.handle('codex-auth-login', () => (
  getCodexAuthController()?.login() ?? { available: false, state: 'unavailable' }
))
ipcMain.handle('codex-auth-logout', () => (
  getCodexAuthController()?.logout() ?? { available: false, state: 'unavailable' }
))
ipcMain.handle('update-check', async () => {
  const info = await checkForUpdate().catch((error) => ({ error: String(error?.message ?? error) }))
  return info
})
ipcMain.handle('update-download', async () => {
  await downloadUpdate()
  return { file: updateState.file }
})
ipcMain.handle('update-install', () => {
  installUpdate()
  return true
})

let lastDialogPath = ''

function dialogParent() {
  if (mainWindow && !mainWindow.isDestroyed()) return mainWindow
  return BrowserWindow.getFocusedWindow()
}

function dialogDefaultPath() {
  if (lastDialogPath && existsSync(lastDialogPath)) return lastDialogPath
  try { return app.getPath('documents') } catch { return app.getPath('home') }
}

function rememberDialogPath(filePaths) {
  const first = filePaths && filePaths[0]
  if (!first) return
  lastDialogPath = existsSync(first) && statSync(first).isDirectory() ? first : dirname(first)
}

async function openDialog(options) {
  const parent = dialogParent()
  const payload = { defaultPath: dialogDefaultPath(), ...options }
  return parent ? dialog.showOpenDialog(parent, payload) : dialog.showOpenDialog(payload)
}

ipcMain.handle('pick-folder', async () => {
  const result = await openDialog({ properties: ['openDirectory'] })
  if (result.canceled || result.filePaths.length === 0) return null
  rememberDialogPath(result.filePaths)
  return result.filePaths[0]
})

function toNativePath(raw) {
  let target = String(raw || '').trim()
  if (!target) return ''
  if ((target.startsWith('"') && target.endsWith('"')) || (target.startsWith("'") && target.endsWith("'"))) {
    target = target.slice(1, -1)
  }
  if (target.startsWith('file:')) {
    try { target = fileURLToPath(target) } catch {}
  }
  if (process.platform === 'win32') target = target.replace(/\//g, '\\')
  target = normalize(target)
  if (!isAbsolute(target)) target = resolve(target)
  return target
}

function windowsExplorerBin() {
  return join(process.env.SystemRoot || process.env.WINDIR || 'C:\\Windows', 'explorer.exe')
}

function spawnExplorer(args) {
  return new Promise((resolveSpawn, reject) => {
    let settled = false
    const finish = (error) => {
      if (settled) return
      settled = true
      if (error) reject(error)
      else resolveSpawn('')
    }
    const child = spawn(windowsExplorerBin(), args, {
      detached: true,
      stdio: 'ignore',
      windowsHide: false,
      windowsVerbatimArguments: true,
    })
    child.once('error', finish)
    child.once('spawn', () => {
      child.unref()
      finish()
    })
  })
}

async function openNativeFolder(rawPath, reveal = false) {
  const target = toNativePath(rawPath)
  if (!target || !existsSync(target)) return 'path does not exist'
  const isDir = statSync(target).isDirectory()
  if (process.platform === 'win32') {
    // explorer.exe splits unquoted /select, paths on spaces, so "Agent Pi Outputs"
    // would fall through to the user's Documents folder. Quote the path after /select,.
    const args = (reveal || !isDir)
      ? [`/select,"${target}"`]
      : [`"${target}"`]
    await spawnExplorer(args)
    return ''
  }
  if (reveal || !isDir) {
    shell.showItemInFolder(target)
    return ''
  }
  return shell.openPath(target)
}

ipcMain.handle('open-path', async (_event, rawPath) => {
  try {
    return await openNativeFolder(rawPath, false)
  } catch (error) {
    return error instanceof Error ? error.message : String(error)
  }
})

ipcMain.handle('reveal-path', async (_event, rawPath) => {
  try {
    return await openNativeFolder(rawPath, true)
  } catch (error) {
    return error instanceof Error ? error.message : String(error)
  }
})

ipcMain.handle('pick-files', async () => {
  const result = await openDialog({
    properties: ['openFile', 'multiSelections'],
    filters: [
      { name: '文档', extensions: ['pdf', 'doc', 'docx', 'ppt', 'pptx', 'xls', 'xlsx', 'md', 'markdown', 'txt', 'json', 'png', 'jpg', 'jpeg', 'jp2', 'webp', 'gif', 'bmp'] },
      { name: '全部', extensions: ['*'] },
    ],
  })
  if (result.canceled || result.filePaths.length === 0) return []
  rememberDialogPath(result.filePaths)
  return result.filePaths
})

function findSystemChromium() {
  const candidates = [
    process.env.PROGRAMFILES ? join(process.env.PROGRAMFILES, 'Google/Chrome/Application/chrome.exe') : '',
    process.env.LOCALAPPDATA ? join(process.env.LOCALAPPDATA, 'Google/Chrome/Application/chrome.exe') : '',
    process.env['PROGRAMFILES(X86)'] ? join(process.env['PROGRAMFILES(X86)'], 'Google/Chrome/Application/chrome.exe') : '',
    process.env.PROGRAMFILES ? join(process.env.PROGRAMFILES, 'Microsoft/Edge/Application/msedge.exe') : '',
    process.env['PROGRAMFILES(X86)'] ? join(process.env['PROGRAMFILES(X86)'], 'Microsoft/Edge/Application/msedge.exe') : '',
    process.env.LOCALAPPDATA ? join(process.env.LOCALAPPDATA, 'Microsoft/Edge/Application/msedge.exe') : '',
  ].filter(Boolean)
  return candidates.find((path) => existsSync(path)) ?? null
}

function readPrintedPdf(pdfPath) {
  if (!existsSync(pdfPath) || statSync(pdfPath).size < 800) return null
  const body = readFileSync(pdfPath)
  return body.subarray(0, 5).toString() === '%PDF-' ? body : null
}

function spawnChromiumPrint(chrome, args) {
  return new Promise((resolve) => {
    const child = spawn(chrome, args, { windowsHide: true, stdio: 'ignore' })
    const timer = setTimeout(() => {
      try { child.kill() } catch { /* already exited */ }
      resolve(false)
    }, 90_000)
    child.once('error', () => {
      clearTimeout(timer)
      resolve(false)
    })
    child.once('exit', () => {
      clearTimeout(timer)
      resolve(true)
    })
  })
}

async function printHtmlWithSystemChromium(htmlPath) {
  const chrome = findSystemChromium()
  if (!chrome) return null
  const id = randomBytes(8).toString('hex')
  const pdfPath = join(tmpdir(), `ap-print-${id}.pdf`)
  const userDataDir = join(tmpdir(), `ap-print-ud-${id}`)
  mkdirSync(userDataDir, { recursive: true })
  try {
    const attempts = [
      ['--headless=new'],
      ['--headless=new', '--no-sandbox'],
      ['--headless'],
      ['--headless', '--no-sandbox'],
    ]
    for (const extra of attempts) {
      await spawnChromiumPrint(chrome, [
        ...extra,
        '--disable-gpu',
        '--disable-extensions',
        '--disable-background-networking',
        '--disable-sync',
        '--disable-default-apps',
        '--no-first-run',
        '--no-default-browser-check',
        '--no-pdf-header-footer',
        '--hide-scrollbars',
        '--run-all-compositor-stages-before-draw',
        '--virtual-time-budget=20000',
        '--font-render-hinting=none',
        '--allow-file-access-from-files',
        `--user-data-dir=${userDataDir}`,
        `--print-to-pdf=${pdfPath}`,
        pathToFileURL(htmlPath).href,
      ])
      const body = readPrintedPdf(pdfPath)
      if (body) return body
    }
    return null
  } finally {
    try { unlinkSync(pdfPath) } catch { /* leftover temp pdf */ }
    try { rmSync(userDataDir, { recursive: true, force: true }) } catch { /* leftover profile */ }
  }
}

async function printHtmlWithElectron(htmlPath) {
  const hidden = new BrowserWindow({
    show: false,
    width: 1024,
    height: 768,
    skipTaskbar: true,
    paintWhenInitiallyHidden: true,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
      backgroundThrottling: false,
    },
  })
  try {
    const gone = new Promise((_, reject) => {
      hidden.webContents.once('render-process-gone', (_event, details) => {
        reject(new Error(`print renderer exited (${details?.reason || 'unknown'})`))
      })
    })
    const printed = (async () => {
      await hidden.loadFile(htmlPath)
      await hidden.webContents.executeJavaScript(`
        (async () => {
          if (document.fonts && document.fonts.ready) await document.fonts.ready
          await Promise.all([...document.images].map((img) => {
            if (img.complete) return true
            return new Promise((resolve) => {
              img.onload = img.onerror = () => resolve(true)
            })
          }))
          return true
        })()
      `).catch(() => true)
      return await hidden.webContents.printToPDF({
        printBackground: true,
        preferCSSPageSize: true,
        displayHeaderFooter: false,
        generateDocumentOutline: false,
        pageSize: 'A4',
        margins: { top: 0, bottom: 0, left: 0, right: 0 },
      })
    })()
    return await Promise.race([printed, gone])
  } finally {
    if (!hidden.isDestroyed()) hidden.destroy()
  }
}

let printToPdfJob = Promise.resolve()

ipcMain.handle('print-to-pdf', async (_event, html) => {
  const source = String(html || '')
  if (!source) throw new Error('print-to-pdf requires HTML')
  if (Buffer.byteLength(source, 'utf8') > 32 * 1024 * 1024) {
    throw new Error('print-to-pdf HTML exceeds 32MB')
  }
  const htmlPath = join(tmpdir(), `ap-print-${randomBytes(8).toString('hex')}.html`)
  writeFileSync(htmlPath, source, 'utf8')
  const run = printToPdfJob.then(async () => {
    try {
      // Isolated Chrome/Edge first: a compositor crash dies in the child, not here.
      const isolated = await printHtmlWithSystemChromium(htmlPath)
      if (isolated) return isolated
      return await printHtmlWithElectron(htmlPath)
    } finally {
      try { unlinkSync(htmlPath) } catch { /* leftover temp html */ }
    }
  })
  printToPdfJob = run.then(() => undefined, () => undefined)
  return run
})

const gotLock = app.requestSingleInstanceLock()
if (!gotLock) {
  app.quit()
} else {
  app.on('second-instance', () => {
    if (!mainWindow) return
    if (mainWindow.isMinimized()) mainWindow.restore()
    mainWindow.show()
    mainWindow.focus()
  })

  app.whenReady().then(async () => {
    try {
      await session.defaultSession.clearCache()
    } catch {}
    const win = createWindow()
    buildAppMenu(win)
    if (packaged) scheduleStartupUpdateCheck(win)
    try {
      assertDshRuntime()
      repairPackedLinks()
      ensureProfile()
      if (!process.env.AGENT_PI_DSH_URL) {
        const existing = packaged
          ? null
          : (await urlAlive('http://127.0.0.1:3080')
            ? 'http://127.0.0.1:3080'
            : await urlAlive('http://127.0.0.1:3081')
              ? 'http://127.0.0.1:3081'
              : null)
        if (existing) {
          appUrl = existing
        } else {
          reapPackagedPort(3080)
          const port = await findFreePort(3080)
          dshPort = port
          appUrl = `http://127.0.0.1:${port}`
          startDsh(port)
        }
      }
      await waitForUrl(appUrl)
      await win.loadURL(appUrl)
      applyWindowIcon(win)
    } catch (error) {
      dialog.showErrorBox(`${APP_NAME} 无法启动`, String(error?.message ?? error))
      app.quit()
    }
  })
}

app.on('before-quit', () => {
  app.isQuitting = true
  codexAuthController?.dispose()
  stopDshTree()
  try { tray?.destroy() } catch {
    // tray may already be gone during shutdown
  }
  tray = null
})

app.on('window-all-closed', () => {
  stopDshTree()
  if (process.platform !== 'darwin') app.quit()
})
