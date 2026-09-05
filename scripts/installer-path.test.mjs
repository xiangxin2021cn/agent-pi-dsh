import assert from 'node:assert/strict'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, parse } from 'node:path'
import { spawnSync } from 'node:child_process'
import test from 'node:test'

const setupPath = new URL('./nsis/setup.nsi', import.meta.url)

function findMakensis() {
  const candidates = [
    process.env.MAKENSIS,
    process.env.NSIS_HOME && join(process.env.NSIS_HOME, 'makensis.exe'),
    process.env.LOCALAPPDATA && join(process.env.LOCALAPPDATA, 'tauri', 'NSIS', 'makensis.exe'),
    process.env.LOCALAPPDATA && join(process.env.LOCALAPPDATA, 'tauri', 'NSIS', 'Bin', 'makensis.exe'),
    process.env['ProgramFiles(x86)'] && join(process.env['ProgramFiles(x86)'], 'NSIS', 'makensis.exe'),
    process.env.ProgramFiles && join(process.env.ProgramFiles, 'NSIS', 'makensis.exe'),
  ].filter(Boolean)
  const direct = candidates.find((candidate) => existsSync(candidate))
  if (direct) return direct
  const found = spawnSync('where.exe', ['makensis.exe'], { encoding: 'utf8', windowsHide: true })
  if (found.status === 0) {
    const first = String(found.stdout).split(/\r?\n/).map((line) => line.trim()).find(Boolean)
    if (first && existsSync(first)) return first
  }
  throw new Error('makensis.exe is required for the Windows installer path behavior test')
}

function extractDefine(source, name) {
  const line = source.match(new RegExp(`^!define ${name} [^\\r\\n]+$`, 'm'))?.[0]
  assert.ok(line, `setup.nsi is missing ${name}`)
  return line
}

function buildProbeSource(setup, executableName) {
  const original = setup.match(/Function ValidateInstallRoot\r?\n[\s\S]*?\r?\nFunctionEnd/)?.[0]
  assert.ok(original, 'setup.nsi is missing ValidateInstallRoot')
  const instrumented = original.replace(
    /(\r?\n\s*SetErrorLevel 5)\r?\n\s*MessageBox[^\r\n]*\r?\n\s*Abort(?=\r?\n\s*install_root_ok:)/,
    '$1\n    FileWrite $R9 "reject"\n    FileClose $R9\n    Quit',
  )
  assert.notEqual(instrumented, original, 'could not replace only the invalid-path UI side effects')
  return [
    'Unicode true',
    'SilentInstall silent',
    'AutoCloseWindow true',
    'RequestExecutionLevel user',
    `OutFile "${executableName}"`,
    '!include "LogicLib.nsh"',
    '!include "FileFunc.nsh"',
    extractDefine(setup, 'PRODUCT_ID'),
    extractDefine(setup, 'INSTALL_ROOT_RECEIPT'),
    extractDefine(setup, 'INSTALL_ROOT_RECEIPT_SECTION'),
    instrumented,
    'Section',
    '  ReadEnvStr $INSTDIR "AGENT_PI_NSIS_PROBE_TARGET"',
    '  ReadEnvStr $R8 "AGENT_PI_NSIS_PROBE_RESULT"',
    '  FileOpen $R9 "$R8" w',
    '  Call ValidateInstallRoot',
    '  FileWrite $R9 "accept"',
    '  FileClose $R9',
    'SectionEnd',
    '',
  ].join('\n')
}

function write(path, content = '') {
  mkdirSync(dirname(path), { recursive: true })
  writeFileSync(path, content)
}

function writeReceipt(path, installLocation) {
  write(path, [
    '[AgentPiDSH]',
    'Schema=1',
    'Product=do.agentpi.dsh',
    `InstallLocation=${installLocation}`,
    '',
  ].join('\r\n'))
}

test('ValidateInstallRoot accepts owned roots and rejects unsafe roots in a real NSIS process', {
  skip: process.platform !== 'win32' ? 'NSIS path behavior is Windows-specific' : false,
}, (t) => {
  const fixture = mkdtempSync(join(tmpdir(), 'agent-pi-installer-path-'))
  t.after(() => rmSync(fixture, { recursive: true, force: true }))

  const setup = readFileSync(setupPath, 'utf8')
  const probeSource = join(fixture, 'validate-root-probe.nsi')
  const probeExe = join(fixture, 'validate-root-probe.exe')
  writeFileSync(probeSource, buildProbeSource(setup, 'validate-root-probe.exe'))
  const compile = spawnSync(findMakensis(), ['/V2', probeSource], {
    cwd: fixture,
    encoding: 'utf8',
    windowsHide: true,
    timeout: 30_000,
  })
  assert.equal(compile.status, 0, `NSIS probe did not compile:\n${compile.stdout}\n${compile.stderr}`)
  assert.ok(existsSync(probeExe), 'NSIS probe executable was not created')

  let caseNumber = 0
  function validate(path) {
    const resultPath = join(fixture, `result-${caseNumber++}.txt`)
    const run = spawnSync(probeExe, [], {
      cwd: fixture,
      env: {
        ...process.env,
        AGENT_PI_NSIS_PROBE_TARGET: String(path),
        AGENT_PI_NSIS_PROBE_RESULT: resultPath,
      },
      encoding: 'utf8',
      windowsHide: true,
      timeout: 15_000,
    })
    assert.equal(run.error, undefined, `NSIS probe failed to launch for ${path}`)
    assert.ok(existsSync(resultPath), `NSIS probe produced no decision for ${path}`)
    return readFileSync(resultPath, 'utf8')
  }

  const existingInstall = process.env.AGENT_PI_EXISTING_INSTALL_PATH
  if (existingInstall) {
    assert.ok(existsSync(existingInstall), `AGENT_PI_EXISTING_INSTALL_PATH is missing: ${existingInstall}`)
    assert.equal(
      validate(existingInstall),
      'accept',
      'the existing Agent Pi DSH installation must remain upgradeable in place',
    )
  }

  const legacy = join(fixture, 'legacy', 'Agent Pi DSH')
  write(join(legacy, 'agent-pi-DSH.exe'))
  write(join(legacy, 'resources', 'app.asar'))
  assert.equal(validate(legacy), 'accept', 'a legacy Agent Pi DSH install must be upgradeable without a receipt')
  assert.equal(validate(`${legacy}\\`), 'accept', 'a trailing separator must not block an in-place legacy upgrade')

  const fresh = join(fixture, 'fresh', 'Agent Pi DSH')
  mkdirSync(fresh, { recursive: true })
  assert.equal(validate(fresh), 'accept', 'an empty dedicated Agent Pi DSH directory must be accepted')

  const notCreated = join(fixture, 'not-created', 'Agent Pi DSH')
  mkdirSync(dirname(notCreated), { recursive: true })
  assert.equal(validate(notCreated), 'accept', 'a not-yet-created dedicated Agent Pi DSH directory must be accepted')

  const occupied = join(fixture, 'occupied', 'Agent Pi DSH')
  write(join(occupied, 'unrelated-user-file.txt'), 'keep me')
  assert.equal(validate(occupied), 'reject', 'an occupied unreceipted directory without the legacy app signature must be rejected')

  const owned = join(fixture, 'custom-owned-location')
  mkdirSync(owned, { recursive: true })
  writeReceipt(join(owned, '.agent-pi-install-root.ini'), owned)
  assert.equal(validate(owned), 'accept', 'a matching Agent Pi DSH ownership receipt must be accepted')

  const mismatchedReceipt = join(fixture, 'mismatched-receipt')
  mkdirSync(mismatchedReceipt, { recursive: true })
  writeReceipt(join(mismatchedReceipt, '.agent-pi-install-root.ini'), join(fixture, 'somewhere-else'))
  assert.equal(validate(mismatchedReceipt), 'reject', 'a receipt for another location must be rejected')

  assert.equal(validate(parse(fixture).root), 'reject', 'a drive root must be rejected')

  const shared = join(fixture, 'Shared App Folder')
  mkdirSync(shared, { recursive: true })
  assert.equal(validate(shared), 'reject', 'an unreceipted non-dedicated folder must be rejected')

  const realParent = join(fixture, 'real-parent')
  const linkedParent = join(fixture, 'linked-parent')
  mkdirSync(join(realParent, 'Agent Pi DSH'), { recursive: true })
  symlinkSync(realParent, linkedParent, 'junction')
  assert.equal(validate(join(linkedParent, 'Agent Pi DSH')), 'reject', 'a path with a junction ancestor must be rejected')
})
