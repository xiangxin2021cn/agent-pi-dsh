import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readlinkSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, relative } from 'node:path'
import test from 'node:test'
import { repairDshRuntimePeers } from './repair-dsh-runtime-peers.mjs'

function fixture(t) {
  const home = mkdtempSync(join(tmpdir(), 'dsh-runtime-peers-'))
  t.after(() => rmSync(home, { recursive: true, force: true }))
  const root = join(home, 'dsh'), importers = {}
  function pkg(directory, name, extra = {}, source = 'export const name = "locked-provider"') {
    const target = join(root, directory)
    mkdirSync(target, { recursive: true })
    writeFileSync(join(target, 'package.json'), JSON.stringify({ name, version: '1.2.3', type: 'module', main: 'index.js', ...extra }))
    writeFileSync(join(target, 'index.js'), source)
    importers[directory] = {}
    return target
  }
  function link(directory, name, target) {
    const path = join(root, directory, 'node_modules', name)
    mkdirSync(dirname(path), { recursive: true })
    symlinkSync(process.platform === 'win32' ? target : relative(dirname(path), target), path, process.platform === 'win32' ? 'junction' : 'dir')
    return path
  }
  const cli = pkg('apps/cli', '@fixture/cli', { dependencies: { '@fixture/app-boot': 'workspace:*', '@fixture/cordis': 'workspace:~' } })
  const app = pkg('packages/boot/app-boot', '@fixture/app-boot', { peerDependencies: { '@fixture/cordis': 'workspace:~' }, devDependencies: { '@fixture/cordis': 'workspace:~', '@fixture/test-only': 'workspace:*' } }, 'export { name } from "@fixture/cordis"')
  const cordis = pkg('vendor/cordis', '@fixture/cordis', { peerDependencies: { '@fixture/group': 'workspace:*' } }, 'export { name } from "@fixture/group"')
  pkg('vendor/group', '@fixture/group')
  pkg('packages/test-support/unused', '@fixture/test-only', { peerDependencies: { '@fixture/absent-dev': 'workspace:*' } })
  importers['apps/cli'].dependencies = { '@fixture/app-boot': { version: 'link:../../packages/boot/app-boot' }, '@fixture/cordis': { version: 'link:../../vendor/cordis' } }
  importers['packages/boot/app-boot'].devDependencies = { '@fixture/cordis': { version: 'link:../../../vendor/cordis' }, '@fixture/test-only': { version: 'link:../../test-support/unused' } }
  importers['vendor/cordis'].devDependencies = { '@fixture/group': { version: 'link:../group' } }
  link('apps/cli', '@fixture/app-boot', app)
  link('apps/cli', '@fixture/cordis', cordis)
  const lock = { importers }
  writeFileSync(join(root, 'pnpm-lock.yaml'), JSON.stringify(lock))
  writeFileSync(join(root, 'DSH-BUILD-RECEIPT.json'), '{"unchanged":true}')
  return { root, cli, app, cordis, lock, link, pkg }
}

test('repairs the prod-only peer import failure and recursive peers without dev installation or source edits', t => {
  const { root, app, lock } = fixture(t)
  const protectedPaths = ['pnpm-lock.yaml', 'DSH-BUILD-RECEIPT.json', 'packages/boot/app-boot/package.json', 'packages/boot/app-boot/index.js']
  const before = protectedPaths.map(path => readFileSync(join(root, path), 'utf8'))
  assert.match(spawnSync(process.execPath, [join(app, 'index.js')], { encoding: 'utf8' }).stderr, /ERR_MODULE_NOT_FOUND/)
  const { restoredLinks, ...summary } = repairDshRuntimePeers(root, lock)
  assert.deepEqual(summary, { packages: 4, peers: 2, links: 2 })
  assert.deepEqual(restoredLinks.map(({ name, version }) => ({ name, version })), ['cordis', 'group'].map(name => ({ name: '@fixture/' + name, version: '1.2.3' })))
  const imported = spawnSync(process.execPath, ['--input-type=module', '-e', 'import { name } from "@fixture/app-boot"; console.log(name)'], { cwd: join(root, 'apps/cli'), encoding: 'utf8' })
  assert.equal(imported.status, 0, imported.stderr)
  assert.equal(imported.stdout.trim(), 'locked-provider')
  assert.deepEqual(protectedPaths.map(path => readFileSync(join(root, path), 'utf8')), before)
  assert.equal(existsSync(join(root, 'node_modules/@fixture/test-only')), false)
  assert.deepEqual(repairDshRuntimePeers(root, lock), { packages: 4, peers: 2, links: 0, restoredLinks: [] })
})

test('preserves valid consumer links instead of replacing their installation', t => {
  const { root, cordis, lock, link } = fixture(t)
  const path = link('packages/boot/app-boot', '@fixture/cordis', cordis)
  const before = readlinkSync(path)
  assert.equal(repairDshRuntimePeers(root, lock).links, 1)
  assert.equal(readlinkSync(path), before)
  assert.equal(existsSync(join(root, 'node_modules/@fixture/cordis')), false)
})

test('rejects an unlocked or mismatched peer before projecting any links', t => {
  const { root, lock } = fixture(t)
  delete lock.importers['vendor/cordis'].devDependencies['@fixture/group']
  assert.throws(() => repairDshRuntimePeers(root, lock), /no locked link/)
  assert.equal(existsSync(join(root, 'node_modules')), false)
  lock.importers['vendor/cordis'].devDependencies['@fixture/group'] = { version: 'link:../cordis' }
  assert.throws(() => repairDshRuntimePeers(root, lock), /does not match package/)
})

test('rejects conflicting consumer providers and paths outside the packaged runtime', t => {
  const { root, lock, link, pkg } = fixture(t)
  const other = pkg('vendor/different', '@fixture/cordis')
  link('packages/boot/app-boot', '@fixture/cordis', other)
  assert.throws(() => repairDshRuntimePeers(root, lock), /different locked peer/)
  rmSync(join(root, 'packages/boot/app-boot/node_modules/@fixture/cordis'), { recursive: true })
  mkdirSync(join(root, '../outside'), { recursive: true })
  lock.importers['packages/boot/app-boot'].devDependencies['@fixture/cordis'] = { version: 'link:../../../../outside' }
  assert.throws(() => repairDshRuntimePeers(root, lock), /outside DSH runtime/)
  assert.equal(existsSync(join(root, 'node_modules')), false)
})
