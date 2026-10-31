import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { existsSync, lstatSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, renameSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'
import test from 'node:test'
import { stageRuntime } from './installer-stage-runtime.mjs'

const repository = fileURLToPath(new URL('..', import.meta.url))
const modulePath = 'resources/runtime/deepseek-harness/node_modules'
const targetPath = 'resources/runtime/product/bundles/project-plan/target'
const dependencyBackup = 'resources/runtime/.agent-pi-previous-dsh-node-modules'
const targetBackup = 'resources/runtime/.agent-pi-previous-project-plan-target'
const journalName = '.agent-pi-runtime-upgrade.json'

function write(path, value = 'fixture sentinel') {
  mkdirSync(dirname(path), { recursive: true })
  writeFileSync(path, value)
}

function fixture(t) {
  const base = join(repository, '.codex-temp')
  mkdirSync(base, { recursive: true })
  const root = mkdtempSync(join(realpathSync(base), 'stage-runtime-test-'))
  t.after(() => {
    assert.equal(realpathSync(root), root)
    assert.ok(root.startsWith(realpathSync(base) + sep))
    rmSync(root, { recursive: true, force: true })
  })
  return root
}

function ownership(install, product = 'do.agentpi.dsh') {
  write(join(install, '.agent-pi-install-root.ini'), `[AgentPiDSH]\nSchema=1\nProduct=${product}\nInstallLocation=${resolve(install)}\n`)
}

function junction(root, source, target) {
  assert.ok(resolve(source).startsWith(root + sep) && resolve(target).startsWith(root + sep))
  mkdirSync(dirname(target), { recursive: true })
  symlinkSync(source, target, process.platform === 'win32' ? 'junction' : 'dir')
}

function oldInstall(t) {
  const root = fixture(t)
  const install = join(root, 'install with spaces')
  ownership(install)
  const oldDev = join(install, modulePath, '.pnpm/dev-only/package.json')
  const oldBuild = join(install, targetPath, 'lib/redundant.jar')
  const preserved = [
    join(root, 'profile/plugins/user-plugin/keep.txt'),
    join(root, 'projects/original.dwg'),
    join(install, 'customer-notes.txt'),
    join(install, 'resources/runtime/deepseek-harness/packages/retired/source.ts'),
    join(install, 'resources/runtime/deepseek-harness/packages/core/tools/lib/index.js'),
    join(install, 'resources/runtime/product/vendor/dsh-univer-office/lib/client.js'),
    join(install, 'resources/runtime/product/knowledge/user-template.docx'),
    join(install, 'resources/runtime/product/bundles/project-plan/runtime/lib/required.jar'),
  ]
  for (const path of [oldDev, oldBuild, ...preserved]) write(path, path)
  junction(root, dirname(preserved[4]), join(install, modulePath, 'peer'))
  junction(root, join(install, modulePath), join(install, modulePath, 'cycle'))
  junction(root, dirname(preserved[0]), join(install, targetPath, 'external-profile'))
  return { root, install, oldDev, oldBuild, preserved }
}

function newDependencies(install) {
  write(join(install, modulePath, '.pnpm/production/package.json'), 'new production dependency')
}

function commit(install) {
  stageRuntime(install, 'commit')
  stageRuntime(install, 'finish')
}

function assertPreserved(value) {
  for (const path of value.preserved) assert.equal(readFileSync(path, 'utf8'), path)
}

test('fresh production tree replaces only root dev closure and redundant build output; junction peers survive', t => {
  const value = oldInstall(t)
  assert.equal(stageRuntime(value.install, 'stage').active, true)
  assert.equal(existsSync(join(value.install, modulePath)), false)
  assert.equal(existsSync(join(value.install, targetPath)), false)
  assert.equal(existsSync(join(value.install, dependencyBackup, '.pnpm/dev-only/package.json')), true)
  newDependencies(value.install)
  commit(value.install)
  assert.equal(existsSync(value.oldDev), false)
  assert.equal(existsSync(value.oldBuild), false)
  assert.equal(existsSync(join(value.install, dependencyBackup)), false)
  assert.equal(existsSync(join(value.install, targetBackup)), false)
  assert.equal(existsSync(join(value.install, journalName)), false)
  assertPreserved(value)
  assert.doesNotThrow(() => stageRuntime(value.install, 'commit'))
})

test('failure restores original dependencies and build output without touching source, Office, knowledge, or user data', t => {
  const value = oldInstall(t)
  stageRuntime(value.install, 'stage')
  newDependencies(value.install)
  stageRuntime(value.install, 'rollback')
  assert.equal(readFileSync(value.oldDev, 'utf8'), value.oldDev)
  assert.equal(readFileSync(value.oldBuild, 'utf8'), value.oldBuild)
  assert.equal(existsSync(join(value.install, modulePath, '.pnpm/production')), false)
  assertPreserved(value)
  assert.doesNotThrow(() => stageRuntime(value.install, 'rollback'))
})

test('interrupted stage rolls back before retry; interrupted commit finishes only verified cleanup', t => {
  const value = oldInstall(t)
  stageRuntime(value.install, 'stage')
  newDependencies(value.install)
  stageRuntime(value.install, 'stage')
  assert.equal(existsSync(join(value.install, dependencyBackup, '.pnpm/dev-only/package.json')), true)
  assert.equal(existsSync(join(value.install, dependencyBackup, '.pnpm/production')), false)
  newDependencies(value.install)
  const journal = join(value.install, journalName)
  const state = JSON.parse(readFileSync(journal))
  writeFileSync(`${journal}.new`, JSON.stringify({ ...state, phase: 'committing' }))
  renameSync(`${journal}.new`, journal)
  rmSync(join(value.install, targetBackup), { recursive: true })
  assert.throws(() => stageRuntime(value.install, 'rollback'), /verified commit/)
  stageRuntime(value.install, 'commit')
  stageRuntime(value.install, 'finish')
  assert.equal(existsSync(join(value.install, modulePath, '.pnpm/production/package.json')), true)
  assert.equal(existsSync(join(value.install, dependencyBackup)), false)
  assert.equal(existsSync(journal), false)
  assertPreserved(value)
})

test('first install and failed first install retry stay recognizable without an old runtime', t => {
  const root = fixture(t)
  const install = join(root, 'Agent Pi DSH')
  stageRuntime(install, 'stage')
  assert.equal(existsSync(join(install, '.agent-pi-install-root.ini')), true)
  newDependencies(install)
  stageRuntime(install, 'rollback')
  assert.equal(existsSync(join(install, modulePath)), false)
  stageRuntime(install, 'stage')
  newDependencies(install)
  commit(install)
  assert.equal(existsSync(join(install, modulePath, '.pnpm/production/package.json')), true)
})

test('rejects linked managed roots and ancestors, wrong ownership, unowned backups, and invalid control files before deletion', t => {
  for (const relative of ['', 'resources', 'resources/runtime', 'resources/runtime/deepseek-harness', modulePath, 'resources/runtime/product/bundles/project-plan']) {
    const root = fixture(t)
    const physical = join(root, 'physical')
    const install = join(root, 'install')
    const ancestor = relative ? join(install, relative) : install
    mkdirSync(physical, { recursive: true })
    write(join(physical, 'keep.txt'))
    if (relative) ownership(install)
    junction(root, physical, ancestor)
    assert.throws(() => stageRuntime(install, 'stage'), /linked/)
    assert.equal(readFileSync(join(physical, 'keep.txt'), 'utf8'), 'fixture sentinel')
    assert.equal(lstatSync(ancestor).isSymbolicLink(), true)
  }
  for (const kind of ['wrong-product', 'backup', 'journal', 'journal-path', 'pending']) {
    const value = oldInstall(t)
    if (kind === 'wrong-product') ownership(value.install, 'do.agentpi.dsh.tender')
    if (kind === 'backup') write(join(value.install, dependencyBackup, 'unowned.txt'))
    if (kind === 'journal') write(join(value.install, journalName), '{"schemaVersion":1,"deletePath":"C:/"}')
    if (kind === 'journal-path') junction(value.root, dirname(value.preserved[0]), join(value.install, journalName))
    if (kind === 'pending') junction(value.root, dirname(value.preserved[0]), join(value.install, `${journalName}.new`))
    assert.throws(() => stageRuntime(value.install, 'stage'))
    assert.equal(readFileSync(value.oldDev, 'utf8'), value.oldDev)
    assertPreserved(value)
  }
})

test('a truncated pending write is recoverable with a valid journal, or owned installation without backups', t => {
  for (const active of [false, true]) {
    const value = oldInstall(t)
    if (active) {
      stageRuntime(value.install, 'stage')
      newDependencies(value.install)
    }
    const pending = join(value.install, `${journalName}.new`)
    write(pending, '{"schemaVersion":')
    assert.doesNotThrow(() => stageRuntime(value.install, 'check'))
    assert.equal(readFileSync(pending, 'utf8'), '{"schemaVersion":', 'preflight must be read-only')
    stageRuntime(value.install, 'stage')
    assert.equal(existsSync(pending), false)
    assert.equal(existsSync(join(value.install, dependencyBackup, '.pnpm/dev-only/package.json')), true)
    newDependencies(value.install)
    commit(value.install)
    assertPreserved(value)
  }
  const value = oldInstall(t)
  write(join(value.install, dependencyBackup, 'unowned.txt'))
  write(join(value.install, `${journalName}.new`), '{"schemaVersion":')
  assert.throws(() => stageRuntime(value.install, 'check'), /Unowned/)
  assert.throws(() => stageRuntime(value.install, 'stage'), /Unowned/)
  assert.equal(readFileSync(value.oldDev, 'utf8'), value.oldDev)
  assert.equal(existsSync(join(value.install, dependencyBackup, 'unowned.txt')), true)
})

test('cannot commit an absent production store or an unexpectedly repackaged build directory', t => {
  const value = oldInstall(t)
  stageRuntime(value.install, 'stage')
  assert.throws(() => stageRuntime(value.install, 'commit'), /not ready/)
  newDependencies(value.install)
  write(join(value.install, targetPath, 'unexpected.jar'))
  assert.throws(() => stageRuntime(value.install, 'commit'), /not ready/)
  stageRuntime(value.install, 'rollback')
  assert.equal(readFileSync(value.oldBuild, 'utf8'), value.oldBuild)
})

test('all commit interruption boundaries keep the verified current tuple until Office and archive cleanup finishes', t => {
  for (const boundary of ['marker', 'first-dependency-backup', 'Office', 'archive']) {
    const value = oldInstall(t)
    stageRuntime(value.install, 'stage')
    newDependencies(value.install)
    const office = join(value.install, 'resources/runtime/product/vendor/.agent-pi-univer-previous')
    const archive = join(value.install, 'resources/app.asar.old')
    write(join(office, 'old.txt'))
    write(archive)
    const journal = join(value.install, journalName)
    const state = JSON.parse(readFileSync(journal))
    writeFileSync(`${journal}.new`, JSON.stringify({ ...state, phase: 'committing' }))
    renameSync(`${journal}.new`, journal)
    if (boundary !== 'marker') rmSync(join(value.install, dependencyBackup), { recursive: true })
    if (['Office', 'archive'].includes(boundary)) {
      rmSync(join(value.install, targetBackup), { recursive: true })
      rmSync(office, { recursive: true })
    }
    if (boundary === 'archive') rmSync(archive)
    assert.equal(stageRuntime(value.install, 'check').committing, true)
    assert.throws(() => stageRuntime(value.install, 'stage'), /verified commit/)
    assert.throws(() => stageRuntime(value.install, 'rollback'), /verified commit/)
    if (boundary !== 'archive') assert.throws(() => stageRuntime(value.install, 'finish'), /before finishing/)
    stageRuntime(value.install, 'commit')
    assert.equal(existsSync(journal), true, 'dependency cleanup must keep the global commit marker')
    rmSync(office, { recursive: true, force: true })
    rmSync(archive, { force: true })
    stageRuntime(value.install, 'finish')
    assert.equal(existsSync(journal), false)
    assert.equal(readFileSync(join(value.install, modulePath, '.pnpm/production/package.json'), 'utf8'), 'new production dependency')
    assertPreserved(value)
  }
})

test('native NSIS atomically publishes Unicode ownership and retries before publication or after legacy archive staging', {
  skip: process.platform !== 'win32' && 'Production NSIS receipt handling requires Windows',
  timeout: 30000,
}, t => {
  const root = fixture(t)
  const setup = readFileSync(join(repository, 'scripts/nsis/setup.nsi'), 'utf8')
  const compiler = [process.env.MAKENSIS, process.env.NSIS_HOME && join(process.env.NSIS_HOME, 'makensis.exe'), process.env['ProgramFiles(x86)'] && join(process.env['ProgramFiles(x86)'], 'NSIS/makensis.exe')].find(path => path && existsSync(path))
  assert.ok(compiler, 'makensis.exe is required')
  const defines = ['PRODUCT_NAME', 'PRODUCT_EXE', 'PRODUCT_ID', 'INSTALL_ROOT_RECEIPT', 'INSTALL_ROOT_RECEIPT_SECTION'].map(name => setup.match(new RegExp(`^[ \\t]*!define ${name} [^\\r\\n]+$`, 'm'))?.[0]).join('\n')
  const functions = ['ValidateInstallRoot', 'EnsureInstallRootReceipt', 'StageAppAsar'].map(name => {
    const body = setup.match(new RegExp(`Function ${name}\\r?\\n[\\s\\S]*?\\r?\\nFunctionEnd`))?.[0]
    assert.ok(body, `missing production ${name}`)
    return body.replace(/^\s*MessageBox[^\r\n]*$/gm, '    DetailPrint "Fixture failure UI suppressed"')
      .replace(/^\s*Abort\s*$/gm, '    Quit')
  }).join('\n').replace('  Rename "$9" "$INSTDIR\\${INSTALL_ROOT_RECEIPT}"', '  StrCmp $R7 "before-publish" 0 +3\n  SetErrorLevel 42\n  Quit\n  Rename "$9" "$INSTDIR\\${INSTALL_ROOT_RECEIPT}"')
  const probe = join(root, 'receipt-probe.nsi')
  const binary = join(root, 'receipt-probe.exe')
  const nsis = value => value.replaceAll('$', () => '$$').replaceAll('"', '$\\"')
  write(probe, `Unicode true\nSilentInstall silent\nAutoCloseWindow true\nRequestExecutionLevel user\n!include "LogicLib.nsh"\n!include "FileFunc.nsh"\nOutFile "${nsis(binary)}"\n${defines}\n${functions}\nSection\nReadEnvStr $INSTDIR "AGENT_PI_RECEIPT_FIXTURE_ROOT"\nReadEnvStr $R7 "AGENT_PI_RECEIPT_FIXTURE_CUT"\nCall ValidateInstallRoot\nCall EnsureInstallRootReceipt\nCall StageAppAsar\nStrCmp $R7 "after-archive" 0 +3\nSetErrorLevel 43\nQuit\nSectionEnd\n`)
  const compiled = spawnSync(compiler, ['/V2', probe], { cwd: root, windowsHide: true, encoding: 'utf8', timeout: 30000 })
  assert.equal(compiled.status, 0, `${compiled.stdout}\n${compiled.stderr}`)
  const run = (install, cut = '') => spawnSync(binary, [], { cwd: root, windowsHide: true, timeout: 15000, env: { ...process.env, AGENT_PI_RECEIPT_FIXTURE_ROOT: install, AGENT_PI_RECEIPT_FIXTURE_CUT: cut } })
  const fresh = join(root, '中文用户目录', 'Agent Pi DSH')
  mkdirSync(dirname(fresh), { recursive: true })
  assert.equal(run(fresh, 'before-publish').status, 42)
  assert.equal(existsSync(join(fresh, '.agent-pi-install-root.ini')), false)
  assert.equal(run(fresh).status, 0, 'an unpublished sibling temp must not block a first-install retry')
  const bytes = readFileSync(join(fresh, '.agent-pi-install-root.ini'))
  assert.equal(bytes.subarray(0, 2).toString('hex'), 'fffe')
  assert.ok(bytes.subarray(2).toString('utf16le').includes(`InstallLocation=${fresh}`))
  assert.doesNotThrow(() => stageRuntime(fresh, 'check'), 'Node must read the actual Unicode NSIS receipt')
  const legacy = join(root, '旧版中文安装目录', 'Agent Pi DSH')
  write(join(legacy, 'agent-pi-DSH.exe'), 'old executable')
  write(join(legacy, 'resources/app.asar'), 'old archive')
  assert.equal(run(legacy, 'after-archive').status, 43)
  assert.equal(existsSync(join(legacy, 'resources/app.asar')), false)
  assert.equal(readFileSync(join(legacy, 'resources/app.asar.old'), 'utf8'), 'old archive')
  assert.equal(run(legacy).status, 0, 'root ownership must permit reentry after app.asar was staged')
  assert.doesNotThrow(() => stageRuntime(legacy, 'check'))
})
