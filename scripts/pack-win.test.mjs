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
const prepareRuntimeSource = readFileSync(join(root, 'scripts', 'prepare-win-runtime.ps1'), 'utf8')
const runtimePayloadSource = readFileSync(join(root, 'scripts', 'pack-runtime-payload.mjs'), 'utf8')
const makensis = [
  join(process.env['ProgramFiles(x86)'] ?? '', 'NSIS', 'makensis.exe'),
  join(process.env.ProgramFiles ?? '', 'NSIS', 'makensis.exe'),
].find((candidate) => existsSync(candidate))

function writeCmd(path, body) {
  writeFileSync(path, `@echo off\r\n${body}\r\n`)
}

function makeToolchainFixture(t, npmExit = 0, { version = '3.3.5', extraArgs = [] } = {}) {
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
  mkdirSync(join(nodeBin, 'node_modules', 'npm', 'bin'), { recursive: true })
  mkdirSync(globalBin, { recursive: true })
  copyFileSync(packScript, fixtureScript)
  writeFileSync(join(desktop, 'package.json'), JSON.stringify({ version }))
  copyFileSync(process.execPath, join(nodeBin, 'node.exe'))
  writeFileSync(join(nodeBin, 'node_modules', 'npm', 'bin', 'npm-cli.js'), [
    "const { appendFileSync, mkdirSync } = require('node:fs')",
    "const { join } = require('node:path')",
    "const args = process.argv.slice(2)",
    "appendFileSync(process.env.PACK_TEST_LOG, `node-npm:${args.join(' ')}\\n`)",
    "const exit = Number(process.env.PACK_TEST_NPM_EXIT || 0)",
    "if (exit) process.exit(exit)",
    "mkdirSync(join(process.env.PACK_TEST_DESKTOP, 'node_modules', 'electron-builder'), { recursive: true })",
  ].join('\n'))
  writeCmd(join(globalBin, 'npm.cmd'), 'echo global-npm:%*>> "%PACK_TEST_LOG%"\r\nexit /b 97')
  writeCmd(join(globalBin, 'npx.cmd'), 'echo global-npx:%*>> "%PACK_TEST_LOG%"\r\nexit /b 97')
  writeCmd(join(desktop, 'node_modules', '.bin', 'install-electron.cmd'), [
    'echo install-electron:%*>> "%PACK_TEST_LOG%"',
    'mkdir "%PACK_TEST_DESKTOP%\\node_modules\\electron\\dist"',
    'echo v43.4.1> "%PACK_TEST_DESKTOP%\\node_modules\\electron\\dist\\version"',
    'exit /b 0',
  ].join('\r\n'))
  writeCmd(join(desktop, 'node_modules', '.bin', 'electron-builder.cmd'), 'echo electron-builder:%*>> "%PACK_TEST_LOG%"\r\nexit /b 0')

  const result = spawnSync('pwsh', ['-NoProfile', '-File', fixtureScript, '-ToolchainOnly', ...extraArgs], {
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

test('runs npm through the resolved Node npm CLI and local Electron commands', (t) => {
  const result = makeToolchainFixture(t)
  assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`)
  assert.deepEqual(result.log, [
    'node-npm:install --no-fund --no-audit',
    'install-electron:--no',
    'electron-builder:--win --dir',
  ])
})

test('stops before Electron commands when the resolved npm CLI fails', (t) => {
  const result = makeToolchainFixture(t, 47)
  assert.notEqual(result.status, 0)
  assert.match(`${result.stdout}\n${result.stderr}`, /desktop npm install --no-fund --no-audit failed: 47/)
  assert.deepEqual(result.log, ['node-npm:install --no-fund --no-audit'])
})

test('v3.6.0 and later packaging rejects stale-runtime reuse switches', (t) => {
  for (const version of ['3.6.0', '3.6.1']) {
    for (const flag of ['-SkipPrepare', '-ReuseUnpacked']) {
      const result = makeToolchainFixture(t, 0, { version, extraArgs: [flag] })
      assert.notEqual(result.status, 0)
      assert.ok(`${result.stdout}\n${result.stderr}`.includes(`${version} packaging forbids -SkipPrepare and -ReuseUnpacked`))
      assert.deepEqual(result.log, [])
    }
  }
})

test('licensed Univer packaging is explicit, freshly materialized, and verified as required', () => {
  assert.match(packSource, /\[switch\]\$IncludeLicensedUniver/)
  assert.match(packSource, /IncludeLicensedUniver[\s\S]*materialize-dsh-univer-office\.mjs/)
  assert.match(packSource, /IncludeLicensedUniver[\s\S]*install-univer-runtime-deps\.mjs/)
  assert.match(packSource, /prepare-win-runtime\.ps1[^\r\n]*-IncludeLicensedUniver/)
  assert.match(packSource, /DINCLUDE_LICENSED_UNIVER=1/)
  assert.match(packSource, /installer-univer-lifecycle\.mjs"\) verify-product[^\r\n]*--required/)
  assert.match(prepareRuntimeSource, /\[switch\]\$IncludeLicensedUniver/)
  assert.match(prepareRuntimeSource, /vendor\\dsh-univer-office/)
  assert.match(prepareRuntimeSource, /installer-univer-lifecycle\.mjs"\) verify-product[^\r\n]*--required/)
  assert.match(prepareRuntimeSource, /if \(\$IncludeLicensedUniver\)[\s\S]*else[\s\S]*univer-public-release\.mjs"\) sanitize/)
})

test('Windows packaging preserves and validates the explicit clean CAD runtime', () => {
  assert.match(packSource, /node_modules\\npm\\bin\\npm-cli\.js/)
  assert.doesNotMatch(packSource, /Get-NodeAdjacentCommand/)
  assert.match(packSource, /\[string\]\$CadCleanOutput/)
  assert.match(packSource, /\$CadViewer = Join-Path \$CadCleanOutput "cad-viewer"/)
  assert.match(packSource, /scripts\\cad-clean-release\.mjs"\) verify/)
  assert.doesNotMatch(packSource, /Invoke-NpmCi \$CadPoc/)
  assert.doesNotMatch(packSource, /Invoke-NpmBuild \$CadPoc/)
  assert.match(packSource, /Install-CadCleanRuntime \$runtimeCadViewer/)
  assert.match(packSource, /Install-CadCleanRuntime \$unpackedCadViewer/)
  assert.match(packSource, /Test-CadViewerAssets/)
  for (const marker of [
    'libredwg-parser-worker.js',
    'libredwg-web.wasm',
    'mtext-renderer-worker.js',
    'CAD-CLEAN-BUILD.json',
    'LICENSE-BOUNDARY.md',
    'THIRD_PARTY_NOTICES.md',
    'mlightcad-cad-simple-viewer-LICENSE',
    'mlightcad-libredwg-converter-LICENSE',
    'GPL-3.0.txt',
    'SourceHanSansCN-Regular.otf',
    'SourceHanSansCN-OFL-1.1.txt',
  ]) {
    assert.match(packSource, new RegExp(marker.replaceAll('.', '\\.')))
  }
  assert.match(packSource, /E2BC8A2E7F37474B774FFF8DB758681ECE40BB6947A90D571BCE9DD60671A8E4/)
  assert.match(packSource, /resources\\runtime\\product\\bundles\\tender-web\\lib\\cad-viewer/)
})

test('portable runtime payload preserves and verifies the same clean CAD runtime', () => {
  assert.match(runtimePayloadSource, /--cad-clean-output/)
  assert.match(runtimePayloadSource, /join\(cadCleanOutput, 'cad-viewer'\)/)
  assert.match(runtimePayloadSource, /verifyCadCleanRelease/)
  assert.doesNotMatch(runtimePayloadSource, /npm-cli\.js/)
  assert.doesNotMatch(runtimePayloadSource, /\[npmCli, 'run', 'build'\]/)
  assert.match(runtimePayloadSource, /verifyCadViewerAssets\(cadViewer, 'source'\)/)
  assert.match(runtimePayloadSource, /verifyCadViewerAssets\(stagedCadViewer, 'staged runtime'\)/)
  assert.match(runtimePayloadSource, /CAD-CLEAN-BUILD\.json/)
  assert.match(runtimePayloadSource, /SourceHanSansCN-Regular\.otf/)
  assert.match(runtimePayloadSource, /SourceHanSansCN-OFL-1\.1\.txt/)
  assert.match(runtimePayloadSource, /e2bc8a2e7f37474b774fff8db758681ece40bb6947a90d571bce9dd60671a8e4/)
  assert.match(runtimePayloadSource, /'package\.json', 'package-lock\.json'/)
  assert.match(runtimePayloadSource, /'package\.json', 'LICENSE', 'README\.md'/)
  assert.match(runtimePayloadSource, /'vendor\/dsh-router-standard\.pin'/)
  assert.match(prepareRuntimeSource, /"LICENSE"/)
  assert.match(prepareRuntimeSource, /"vendor\\dsh-router-standard\.pin"/)
  assert.match(packSource, /"vendor\\dsh-router-standard\.pin"/)
  assert.match(packSource, /verify-dsh-runtime\.mjs/)
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
    /asar_restore:[\s\S]*Call RollbackAppAsar/,
  )
  assert.match(
    nsisSource,
    /Function RollbackAppAsar[\s\S]*IfFileExists "\$INSTDIR\\resources\\app\.asar\.old"[\s\S]*Rename "\$INSTDIR\\resources\\app\.asar\.old" "\$INSTDIR\\resources\\app\.asar"[\s\S]*FunctionEnd/,
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

test('portable runtime installs the locked tender-host document dependencies', () => {
  assert.match(packSource, /\$TenderHost = Join-Path \$Root "bundles\\tender-host"/)
  assert.match(packSource, /node_modules\\pdf-lib/)
  assert.match(packSource, /Invoke-NpmCi \$TenderHost "tender-host"/)
  assert.match(prepareRuntimeSource, /function Stage-ProjectNodeModules/)
  assert.match(prepareRuntimeSource, /Stage-ProjectNodeModules "bundles\\tender-host" "pdf-lib"/)
  assert.match(prepareRuntimeSource, /Stage-ProjectNodeModules "packages\\business-core" "zod"/)
  assert.match(packSource, /product\\bundles\\tender-host\\node_modules\\pdf-lib\\package\.json/)
  assert.match(packSource, /product\\packages\\business-core\\node_modules\\zod\\package\.json/)
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

test('Windows packaging writes the checksum required by the immutable upload flow', () => {
  assert.match(packSource, /Get-FileHash -Algorithm SHA256 -LiteralPath \$published/)
  assert.match(packSource, /Join-Path \$releaseDir "\$InstallerName\.sha256"/)
  assert.match(packSource, /\$installerHash  \$InstallerName`n/)
  assert.match(packSource, /windows-build-receipt\.mjs"\) create/)
  assert.match(packSource, /--payload \$payload/)
  assert.match(packSource, /--cad-runtime \$unpackedCadViewer/)
  assert.match(packSource, /--cad-source \$CadSourceArchive/)
  assert.match(packSource, /--dsh-receipt \(Join-Path \$unpackedDsh \$DshReceiptName\)/)
})

test('runtime cleanup uses bounded native PowerShell paths, not a second shell', () => {
  assert.doesNotMatch(packSource + prepareRuntimeSource, /cmd\s+\/c\s+"rmdir/i)
  assert.match(prepareRuntimeSource, /\$dshTarget\.StartsWith\(\$runtimeFull/)
  assert.match(prepareRuntimeSource, /Remove-Item -LiteralPath \$dshTarget -Recurse -Force/)
  assert.match(packSource, /\$trashPath\.StartsWith\(\$runtimeFull/)
  assert.match(packSource, /if \(\$_\.LinkType\) \{ \$_\.Delete\(\) \}/)
})

test('Windows verifies native modules using the staged and unpacked Node executables', () => {
  assert.match(prepareRuntimeSource, /& \$nodeDest[^\r\n]*verify-dsh-runtime\.mjs[^\r\n]*--native/)
  assert.match(packSource, /& \$unpackedNode[^\r\n]*verify-dsh-runtime\.mjs[^\r\n]*--native/)
})
