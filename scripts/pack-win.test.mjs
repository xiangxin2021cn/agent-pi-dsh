import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { existsSync, mkdtempSync, mkdirSync, writeFileSync, copyFileSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { test } from 'node:test'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const packScript = join(root, 'scripts', 'pack-win.ps1')
const nsisScript = join(root, 'scripts', 'nsis', 'setup.nsi')
const nsisSource = readFileSync(nsisScript, 'utf8')
const packSource = readFileSync(packScript, 'utf8')
const makensis = [
  join(process.env['ProgramFiles(x86)'] ?? '', 'NSIS', 'makensis.exe'),
  join(process.env.ProgramFiles ?? '', 'NSIS', 'makensis.exe'),
].find((candidate) => existsSync(candidate))

function writeCmd(path, body) {
  writeFileSync(path, `@echo off\r\n${body}\r\n`)
}

function makeToolchainFixture(t, npmExit = 0) {
  const dir = mkdtempSync(join(tmpdir(), 'agent-pi-pack-win-'))
  t.after(() => rmSync(dir, { recursive: true, force: true, maxRetries: 3 }))

  const fixtureScript = join(dir, 'scripts', 'pack-win.ps1')
  const desktop = join(dir, 'apps', 'desktop')
  const nodeBin = join(dir, 'node-bin')
  const globalBin = join(dir, 'global-bin')
  const log = join(dir, 'toolchain.log')
  mkdirSync(dirname(fixtureScript), { recursive: true })
  mkdirSync(join(desktop, 'node_modules', 'electron'), { recursive: true })
  mkdirSync(join(desktop, 'node_modules', '.bin'), { recursive: true })
  mkdirSync(nodeBin, { recursive: true })
  mkdirSync(globalBin, { recursive: true })
  copyFileSync(packScript, fixtureScript)
  writeFileSync(join(desktop, 'package.json'), '{"version":"3.3.5"}')
  writeFileSync(join(nodeBin, 'node.exe'), '')

  writeCmd(join(nodeBin, 'npm.cmd'), [
    'echo node-npm:%*>> "%PACK_TEST_LOG%"',
    'if not "%PACK_TEST_NPM_EXIT%"=="0" exit /b %PACK_TEST_NPM_EXIT%',
    'mkdir "%PACK_TEST_DESKTOP%\\node_modules\\electron-builder"',
    'exit /b 0',
  ].join('\r\n'))
  writeCmd(join(globalBin, 'npm.cmd'), 'echo global-npm:%*>> "%PACK_TEST_LOG%"\r\nexit /b 97')
  writeCmd(join(globalBin, 'npx.cmd'), 'echo global-npx:%*>> "%PACK_TEST_LOG%"\r\nexit /b 97')
  writeCmd(join(desktop, 'node_modules', '.bin', 'install-electron.cmd'), [
    'echo install-electron:%*>> "%PACK_TEST_LOG%"',
    'mkdir "%PACK_TEST_DESKTOP%\\node_modules\\electron\\dist"',
    'echo v43.4.1> "%PACK_TEST_DESKTOP%\\node_modules\\electron\\dist\\version"',
    'exit /b 0',
  ].join('\r\n'))
  writeCmd(join(desktop, 'node_modules', '.bin', 'electron-builder.cmd'), 'echo electron-builder:%*>> "%PACK_TEST_LOG%"\r\nexit /b 0')

  const result = spawnSync('pwsh', ['-NoProfile', '-File', fixtureScript, '-ToolchainOnly'], {
    encoding: 'utf8',
    env: {
      ...process.env,
      PATH: `${globalBin};${nodeBin};${process.env.PATH}`,
      PACK_TEST_DESKTOP: desktop,
      PACK_TEST_LOG: log,
      PACK_TEST_NPM_EXIT: String(npmExit),
    },
  })
  return {
    ...result,
    log: existsSync(log) ? readFileSync(log, 'utf8').trim().split(/\r?\n/).filter(Boolean) : [],
  }
}

test('runs the resolved node toolchain and local Electron commands', (t) => {
  const result = makeToolchainFixture(t)
  assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`)
  assert.deepEqual(result.log, [
    'node-npm:install --no-fund --no-audit',
    'install-electron:--no',
    'electron-builder:--win --dir',
  ])
})

test('stops before Electron commands when adjacent npm fails', (t) => {
  const result = makeToolchainFixture(t, 47)
  assert.notEqual(result.status, 0)
  assert.match(`${result.stdout}\n${result.stderr}`, /desktop npm install failed: 47/)
  assert.deepEqual(result.log, ['node-npm:install --no-fund --no-audit'])
})

test('compiled finish page defaults to launching the installed application', {
  skip: !makensis && 'makensis.exe is required for the Windows installer contract',
}, () => {
  const result = spawnSync(makensis, ['/PPO', nsisScript], {
    cwd: dirname(nsisScript),
    encoding: 'utf8',
  })

  assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`)
  assert.match(result.stdout, /PageCallbacks mui\.FinishPage\.Pre_[^\s]+ mui\.FinishPage\.Leave_[^\s]+/)
  assert.match(result.stdout, /SendMessage \$mui\.FinishPage\.Run 0x00F1 1 0/)
  assert.match(result.stdout, /Exec "\$\\"\$INSTDIR\\agent-pi-DSH\.exe\$\\""/)
})

test('installer commits a separately extracted app.asar or restores the previous archive', () => {
  assert.match(
    nsisSource,
    /DetailPrint "Installing app\.asar transactionally[\s\S]*7za\.exe" e[\s\S]*IfFileExists "\$INSTDIR\\resources\\app\.asar" asar_ok asar_restore/,
  )
  assert.match(
    nsisSource,
    /asar_restore:[\s\S]*IfFileExists "\$INSTDIR\\resources\\app\.asar\.old" 0 asar_fail[\s\S]*Rename "\$INSTDIR\\resources\\app\.asar\.old" "\$INSTDIR\\resources\\app\.asar"/,
  )
  assert.match(
    nsisSource,
    /Rename "\$PLUGINSDIR\\app\.asar" "\$INSTDIR\\resources\\app\.asar"/,
  )
})

test('portable runtime requires the Agent Pi preset compaction plugin', () => {
  assert.match(packSource, /product\\bundles\\agent-pi-compaction\\lib\\index\.js/)
  assert.match(packSource, /bundles\\agent-pi-compaction\\lib\\index\.js/)
})

test('installer branding is generated from the desktop app logo and passed to NSIS', () => {
  assert.match(packSource, /brand\\app-logo\.png/)
  assert.match(packSource, /make-installer-brand\.py/)
  assert.match(packSource, /Copy-Item -Force \$InstallerIcon .*app-icon\.ico/)
  assert.match(packSource, /DAPP_ICON=app-icon\.ico/)
  assert.match(packSource, /DINSTALLER_HEADER=installer-header\.bmp/)
  assert.match(nsisSource, /Icon "\$\{APP_ICON\}"/)
  assert.match(nsisSource, /!define MUI_HEADERIMAGE_BITMAP "\$\{INSTALLER_HEADER\}"/)
})
