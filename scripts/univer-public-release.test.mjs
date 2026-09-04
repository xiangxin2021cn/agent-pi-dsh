import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { mkdtempSync, mkdirSync, readFileSync, symlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'

import {
  assertUniverPublicReleaseArchive,
  assertUniverPublicReleaseTree,
  removeBundledUniverFromProduct,
} from './univer-public-release.mjs'
import { removeMissingProductUniverDependency } from './univer-profile-migration.mjs'
import { applyAgentPiUniverPolicy } from '../vendor/dshmarket/lib/registry.js'

function write(path, content = '') {
  mkdirSync(join(path, '..'), { recursive: true })
  writeFileSync(path, content)
}

test('public product sanitizer removes the wrapper, Pro closure, pin and receipt', () => {
  const root = mkdtempSync(join(tmpdir(), 'agent-pi-univer-public-'))
  write(join(root, 'vendor/dsh-univer-office/AGENT-PI-VENDOR-RECEIPT.json'), '{}')
  write(join(root, 'vendor/dsh-univer-office/node_modules/@univerjs-pro/cli-assets/package.json'), '{}')
  write(join(root, 'vendor/dsh-univer-office.pin'), '{}')
  write(join(root, 'scripts/dsh-univer-office-runtime.package-lock.json'), '{}')

  assert.throws(() => assertUniverPublicReleaseTree(root), /bundled Univer Pro integration/)
  const removed = removeBundledUniverFromProduct(root)
  assert.ok(removed.includes('vendor/dsh-univer-office'))
  assert.ok(removed.includes('vendor/dsh-univer-office.pin'))
  assertUniverPublicReleaseTree(root)
})

test('public archive gate rejects a bundled Univer wrapper path', () => {
  const root = mkdtempSync(join(tmpdir(), 'agent-pi-univer-archive-'))
  const stage = join(root, 'stage')
  const archive = join(root, 'payload.tar.gz')
  write(join(stage, 'product/vendor/dsh-univer-office/package.json'), '{}')
  const packed = spawnSync('tar', ['-czf', archive, '-C', stage, 'product'], { encoding: 'utf8' })
  assert.equal(packed.status, 0, packed.stderr)
  assert.throws(() => assertUniverPublicReleaseArchive(archive), /bundled Univer Pro integration/)
})

test('public gate rejects the Univer runtime receipt without rejecting unrelated vendor receipts', () => {
  const root = mkdtempSync(join(tmpdir(), 'agent-pi-univer-receipt-'))
  write(join(root, 'vendor/another-plugin/AGENT-PI-VENDOR-RECEIPT.json'), '{}')
  assert.doesNotThrow(() => assertUniverPublicReleaseTree(root))

  write(join(root, 'cache/AGENT-PI-UNIVER-RUNTIME-RECEIPT.json'), '{}')
  assert.throws(() => assertUniverPublicReleaseTree(root), /bundled Univer Pro integration/)
})

test('profile migration removes only a missing product link and preserves an npm install', () => {
  const root = mkdtempSync(join(tmpdir(), 'agent-pi-univer-profile-'))
  const profileDir = join(root, 'home/profiles/tender')
  const oldProduct = join(root, 'old/resources/runtime/product')
  const missingVendor = join(oldProduct, 'vendor/dsh-univer-office')
  const modulePath = join(profileDir, 'node_modules/dsh-univer-office')
  mkdirSync(join(modulePath, '..'), { recursive: true })
  symlinkSync(missingVendor, modulePath, process.platform === 'win32' ? 'junction' : 'dir')
  const dependencies = { 'dsh-univer-office': `link:${missingVendor}` }

  const migrated = removeMissingProductUniverDependency({ dependencies, profileDir, productRoot: root })
  assert.equal(migrated.changed, true)
  assert.equal(dependencies['dsh-univer-office'], undefined)

  const registryInstall = { 'dsh-univer-office': '^0.2.9' }
  const preserved = removeMissingProductUniverDependency({ dependencies: registryInstall, profileDir, productRoot: root })
  assert.equal(preserved.changed, false)
  assert.equal(registryInstall['dsh-univer-office'], '^0.2.9')

  const unrelatedFileInstall = { 'dsh-univer-office': 'file:C:\\user%package\\dsh-univer-office' }
  assert.doesNotThrow(() => removeMissingProductUniverDependency({
    dependencies: unrelatedFileInstall,
    profileDir,
    productRoot: root,
  }))
  assert.equal(unrelatedFileInstall['dsh-univer-office'], 'file:C:\\user%package\\dsh-univer-office')
})

test('market always exposes the optional plugin with the commercial-license and rc.1 warning', () => {
  const registry = applyAgentPiUniverPolicy({
    updated: 'test',
    count: 0,
    categories: { tools: { zh: '工具', en: 'Tools' } },
    plugins: [],
  })
  const plugin = registry.plugins.find((entry) => entry.name === 'dsh-univer-office')
  assert.ok(plugin)
  assert.match(plugin.description.zh, /商业许可/)
  assert.match(plugin.description.zh, /rc\.1.*待验证/)
  assert.match(plugin.description.en, /commercial license/i)
  assert.match(plugin.description.en, /rc\.1.*pending/i)
  assert.equal(registry.count, 1)
})

test('release scripts gate both Windows and portable output trees', () => {
  const packWin = readFileSync(new URL('./pack-win.ps1', import.meta.url), 'utf8')
  const prepareWin = readFileSync(new URL('./prepare-win-runtime.ps1', import.meta.url), 'utf8')
  const portable = readFileSync(new URL('./pack-runtime-payload.mjs', import.meta.url), 'utf8')
  const workflow = readFileSync(new URL('../.github/workflows/build-desktop-assets.yml', import.meta.url), 'utf8')
  assert.match(packWin, /univer-public-release\.mjs.*assert-tree/)
  assert.match(prepareWin, /univer-public-release\.mjs.*sanitize/)
  assert.match(portable, /removeBundledUniverFromProduct/)
  assert.match(portable, /assertUniverPublicReleaseTree/)
  assert.doesNotMatch(workflow, /install-univer-runtime-deps/)
  assert.doesNotMatch(workflow, /Verify staged Univer native runtime/)
})
