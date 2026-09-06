import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { spawnSync } from 'node:child_process'
import { existsSync, lstatSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { dirname, join, parse, resolve, sep } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import test from 'node:test'
import { removeUniverTree } from './installer-remove-univer-tree.mjs'

const repository = fileURLToPath(new URL('..', import.meta.url))
const helper = fileURLToPath(new URL('./installer-remove-univer-tree.mjs', import.meta.url))
const targetName = target => target === 'current' ? 'dsh-univer-office' : '.agent-pi-univer-previous'
const targetPath = (install, target) => join(install, 'resources/runtime/product/vendor', targetName(target))
const digest = bytes => createHash('sha256').update(bytes).digest('hex')

function fixture(t) {
  const base = join(repository, '.codex-temp')
  mkdirSync(base, { recursive: true })
  const root = mkdtempSync(join(realpathSync(base), 'remove-univer-test-'))
  t.after(() => {
    assert.equal(realpathSync(root), root)
    assert.ok(root.startsWith(realpathSync(base) + sep))
    rmSync(root, { recursive: true, force: true })
  })
  return root
}

function write(path, value = 'fixture marker\n') {
  mkdirSync(dirname(path), { recursive: true })
  writeFileSync(path, value)
}

function junction(root, target, dest) {
  assert.ok(resolve(target).startsWith(root + sep))
  assert.ok(resolve(dest).startsWith(root + sep))
  mkdirSync(dirname(dest), { recursive: true })
  symlinkSync(target, dest, process.platform === 'win32' ? 'junction' : 'dir')
  assert.ok(realpathSync(dest).startsWith(root + sep))
}

function peerTree(root, install, target, cyclic = true) {
  const tree = targetPath(install, target)
  const dsh = join(install, 'resources/runtime/deepseek-harness')
  const packages = ['packages/core/tools', 'packages/llm/llm', 'vendor/cordis']
  const files = packages.flatMap(name => ['package.json', 'lib/index.js'].map(file => join(dsh, name, file)))
  for (const file of files) write(file, `physical runtime ${file}\n`)
  write(join(tree, 'lib/index.js'), 'old optional plugin\n')
  for (const [index, name] of ['dsh-tools', 'dsh-llm', 'cordis'].entries()) {
    junction(root, join(dsh, packages[index]), join(tree, 'node_modules/@deepseek-ai', name))
  }
  junction(root, join(dsh, packages[2]), join(tree, 'cache/deep/nested-peer'))
  junction(root, join(dsh, packages[1]), join(dsh, packages[0], 'node_modules/llm'))
  if (cyclic) {
    junction(root, join(dsh, packages[0]), join(dsh, packages[1], 'node_modules/tools'))
    junction(root, tree, join(tree, 'cache/self'))
  }
  return { tree, files, hashes: files.map(file => digest(readFileSync(file))) }
}

function assertPeersPreserved(item) {
  assert.deepEqual(item.files.map(file => digest(readFileSync(file))), item.hashes)
}

for (const target of ['current', 'previous']) {
  test(`${target}: removes a normal tree, preserves siblings, and is idempotent`, (t) => {
    const root = fixture(t)
    const install = join(root, 'install with spaces')
    const tree = targetPath(install, target)
    const sibling = targetPath(install, target === 'current' ? 'previous' : 'current')
    write(join(tree, 'lib/index.js'))
    write(join(sibling, 'keep.txt'), 'keep sibling')
    assert.deepEqual(removeUniverTree(install, target), { removed: true, path: tree })
    assert.equal(existsSync(tree), false)
    assert.equal(readFileSync(join(sibling, 'keep.txt'), 'utf8'), 'keep sibling')
    assert.deepEqual(removeUniverTree(install, target), { removed: false, path: tree })
  })

  test(`${target}: peer, nested, and cyclic junctions never delete physical runtime files`, (t) => {
    const root = fixture(t)
    const install = join(root, 'install')
    const item = peerTree(root, install, target)
    assert.equal(removeUniverTree(install, target).removed, true)
    assert.equal(existsSync(item.tree), false)
    assertPeersPreserved(item)
  })

  test(`${target}: a top-level junction is unlinked without touching its target`, (t) => {
    const root = fixture(t)
    const install = join(root, 'install')
    const external = join(root, 'physical plugin')
    write(join(external, 'package.json'), 'preserve the actual package')
    const tree = targetPath(install, target)
    junction(root, external, tree)
    assert.equal(lstatSync(tree).isSymbolicLink(), true)
    assert.equal(removeUniverTree(install, target).removed, true)
    assert.equal(existsSync(tree), false)
    assert.equal(readFileSync(join(external, 'package.json'), 'utf8'), 'preserve the actual package')
  })
}

test('missing install ancestors are a no-op, but non-directory ancestors are rejected', (t) => {
  const root = fixture(t)
  const missing = join(root, 'not-created/install')
  assert.deepEqual(removeUniverTree(missing, 'current'), { removed: false, path: targetPath(missing, 'current') })
  const install = join(root, 'install')
  write(join(install, 'resources'), 'ordinary file')
  assert.throws(() => removeUniverTree(install, 'current'))
  assert.equal(readFileSync(join(install, 'resources'), 'utf8'), 'ordinary file')
  const otherInstall = join(root, 'other-install')
  const unexpectedFile = targetPath(otherInstall, 'previous')
  write(unexpectedFile, 'not an Office directory')
  assert.throws(() => removeUniverTree(otherInstall, 'previous'))
  assert.equal(readFileSync(unexpectedFile, 'utf8'), 'not an Office directory')
})

test('rejects relative/root-only install paths and any target outside the fixed pair', (t) => {
  const root = fixture(t)
  const install = join(root, 'install')
  const keep = join(targetPath(install, 'previous'), 'keep.txt')
  write(keep, 'preserved')
  for (const invalid of ['relative/install', '', parse(resolve(root)).root]) {
    assert.throws(() => removeUniverTree(invalid, 'previous'))
  }
  for (const invalid of ['../previous', '../..', 'vendor', targetPath(install, 'previous'), undefined]) {
    assert.throws(() => removeUniverTree(install, invalid))
  }
  assert.equal(readFileSync(keep, 'utf8'), 'preserved')
})

test('rejects a reparse point at the install root or any ancestor, including internal vendor ancestors', (t) => {
  const root = fixture(t)
  for (const [index, prefix] of ['', 'resources', 'resources/runtime', 'resources/runtime/product', 'resources/runtime/product/vendor'].entries()) {
    const install = join(root, `case-${index}/install`)
    const physical = join(root, `physical-${index}`)
    mkdirSync(physical, { recursive: true })
    junction(root, physical, join(install, prefix))
    const keep = join(targetPath(install, 'previous'), 'keep.txt')
    write(keep, 'ancestor target must survive')
    assert.throws(() => removeUniverTree(install, 'previous'))
    assert.equal(readFileSync(keep, 'utf8'), 'ancestor target must survive')
  }
  const physicalParent = join(root, 'physical-parent')
  mkdirSync(physicalParent, { recursive: true })
  const aliasParent = join(root, 'alias-parent')
  junction(root, physicalParent, aliasParent)
  const install = join(aliasParent, 'install')
  const keep = join(targetPath(install, 'current'), 'keep.txt')
  write(keep, 'outer ancestor target must survive')
  assert.throws(() => removeUniverTree(install, 'current'))
  assert.equal(readFileSync(keep, 'utf8'), 'outer ancestor target must survive')
})

test('CLI succeeds for allowed cleanup, rejects bad arguments, and does not swallow filesystem failures', (t) => {
  const root = fixture(t)
  const install = join(root, 'install with spaces')
  const tree = targetPath(install, 'current')
  write(join(tree, 'keep.txt'), 'must survive failed deletion')
  const injection = join(root, 'deny-delete.mjs')
  write(injection, `import fs from 'node:fs'\nimport { syncBuiltinESMExports } from 'node:module'\nconst actual = fs.rmSync\nfs.rmSync = (path, ...args) => { if (String(path) === ${JSON.stringify(tree)}) throw Object.assign(new Error('fixture deletion denied'), { code: 'EACCES' }); return actual(path, ...args) }\nsyncBuiltinESMExports()\n`)
  const options = { encoding: 'utf8', windowsHide: true, timeout: 10000 }
  const denied = spawnSync(process.execPath, ['--import', pathToFileURL(injection).href, helper, install, 'current'], options)
  assert.ifError(denied.error)
  assert.notEqual(denied.status, 0)
  assert.match(denied.stderr, /fixture deletion denied/)
  assert.equal(readFileSync(join(tree, 'keep.txt'), 'utf8'), 'must survive failed deletion')
  const invalid = spawnSync(process.execPath, [helper, install, '../previous'], options)
  assert.notEqual(invalid.status, 0)
  const ok = spawnSync(process.execPath, [helper, install, 'current'], options)
  assert.equal(ok.status, 0, ok.stderr)
  assert.equal(existsSync(tree), false)
})

function nsisString(value) {
  return String(value).replaceAll('$', () => '$$').replaceAll('"', '$\\"')
}

test('real NSIS raw RMDir loses peer files while invoking the cleanup helper preserves them', {
  skip: process.platform !== 'win32' && 'NSIS junction behavior is Windows-specific',
}, (t) => {
  const root = fixture(t)
  const compiler = [process.env.MAKENSIS, process.env.NSIS_HOME && join(process.env.NSIS_HOME, 'makensis.exe'), process.env['ProgramFiles(x86)'] && join(process.env['ProgramFiles(x86)'], 'NSIS/makensis.exe'), process.env.ProgramFiles && join(process.env.ProgramFiles, 'NSIS/makensis.exe')].find(path => path && existsSync(path))
  assert.ok(compiler, 'makensis.exe is required for the Windows cleanup behavior regression')
  for (const guarded of [false, true]) {
    const label = guarded ? 'helper' : 'unsafe-control'
    const install = join(root, label, 'install')
    const item = peerTree(root, install, 'previous', false)
    const script = join(root, label, 'probe.nsi')
    const binary = join(root, label, 'probe.exe')
    const action = guarded
      ? `nsExec::ExecToStack "${nsisString(`"${process.execPath}" "${helper}" "${install}" "previous"`)}"\nPop $0\nPop $1\nStrCmp $0 "0" done\nSetErrorLevel 1\ndone:`
      : `RMDir /r "${nsisString(item.tree)}"`
    write(script, `Unicode true\nName "Temporary cleanup behavior probe"\nOutFile "${nsisString(binary)}"\nRequestExecutionLevel user\nSilentInstall silent\nAutoCloseWindow true\nSection\n${action}\nSectionEnd\n`)
    const compile = spawnSync(compiler, ['/V2', script], { cwd: dirname(script), encoding: 'utf8', windowsHide: true, timeout: 30000 })
    assert.equal(compile.status, 0, `${compile.stdout}\n${compile.stderr}`)
    const run = spawnSync(binary, [], { cwd: dirname(script), encoding: 'utf8', windowsHide: true, timeout: 30000 })
    assert.ifError(run.error)
    assert.equal(run.status, 0, run.stderr)
    assert.equal(existsSync(item.tree), false)
    if (guarded) assertPeersPreserved(item)
    else assert.ok(item.files.every(file => !existsSync(file)), 'the control must reproduce NSIS traversal into physical peer targets')
  }
})
