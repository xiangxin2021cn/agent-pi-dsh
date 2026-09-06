import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { spawnSync } from 'node:child_process'
import { existsSync, linkSync, mkdtempSync, mkdirSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'
import { assertUniverPublicReleaseArchive, assertUniverPublicReleaseTree } from './univer-public-release.mjs'
import { removeMissingProductUniverDependency } from './univer-profile-migration.mjs'
import { applyAgentPiUniverPolicy } from '../vendor/dshmarket/lib/registry.js'

const cli = new URL('./univer-public-release.mjs', import.meta.url)
const pin = JSON.parse(readFileSync(new URL('../vendor/dsh-univer-office.pin', import.meta.url), 'utf8'))
const patch = readFileSync(new URL('./patch-univer-alpha1.mjs', import.meta.url))
const sha = bytes => createHash('sha256').update(bytes).digest('hex')
function write(path, content = '') { mkdirSync(dirname(path), { recursive: true }); writeFileSync(path, content) }
function fixture(t) {
  const root = mkdtempSync(join(tmpdir(), 'agent-pi-univer-public-'))
  t.after(() => rmSync(root, { recursive: true, force: true }))
  const product = join(root, 'product')
  const plugin = join(product, 'vendor/dsh-univer-office')
  const files = [
    ['LICENSE', 'Apache License\nVersion 2.0, January 2004\n'],
    ['README.md', 'Complete official Gateway, Viewer and converter distribution.\n'],
    ['lib/index.js', 'export {}\n'], ['lib/client.js', nativeClient],
    ['artifacts/gateway.cjs', 'module.exports = {}\n'],
    ['artifacts/unit-content-worker.mjs', 'export {}\n'],
    ['artifacts/viewer/index.html', '<html><div id="app"></div></html>'],
    ['artifacts/render-machine/index.js', 'export {}\n'],
    ['skills/univer-sheet/SKILL.md', '# Univer sheet\n'],
    ['cordis.patch.yml', '- insert:\n    - id: univer\n      name: dsh-univer-office\n'],
    ['package.json', JSON.stringify({ name: pin.name, version: pin.version, license: pin.license, dsh: { bundle: { patch: './cordis.patch.yml' } } })],
  ]
  for (const [name, content] of files) write(join(plugin, name), content)
  const receipt = {
    schema: 'agent-pi-dsh/univer-office-vendor-receipt/v1',
    package: { name: pin.name, version: pin.version, license: pin.license }, source: pin.source,
    tarball: { url: pin.tarball, integrity: pin.integrity, shasum: pin.shasum, bytes: pin.archiveBytes, entries: pin.archiveEntries },
    compatibilityPatch: { path: 'scripts/patch-univer-alpha1.mjs', sha256: sha(patch) },
    patchedClient: { path: 'lib/client.js', sha256: sha(Buffer.from(nativeClient)) },
    files: files.map(([name]) => { const bytes = readFileSync(join(plugin, name)); return { path: name, size: bytes.length, sha256: sha(bytes) } }).sort((a, b) => a.path < b.path ? -1 : a.path > b.path ? 1 : 0),
  }
  write(join(plugin, 'AGENT-PI-VENDOR-RECEIPT.json'), JSON.stringify(receipt))
  write(join(product, 'vendor/dsh-univer-office.pin'), JSON.stringify(pin))
  write(join(product, 'scripts/patch-univer-alpha1.mjs'), patch)
  return { root, product, plugin, receipt }
}
function archive(item) {
  const path = join(item.root, 'payload.tar.gz')
  const result = spawnSync('tar', ['-czf', path, '-C', item.root, 'product'], { encoding: 'utf8', windowsHide: true })
  assert.equal(result.status, 0, result.stderr)
  return path
}

const nativeClient = [
  'function CombinedSnapshotPreviewCard(props) {',
  '  const timeline = props.useSession((snapshot) => snapshot.chat.timeline);',
  '}',
  'function SplitSnapshotPreviewCard(props) {',
  '  const timeline = props.useChat((snapshot) => snapshot.timeline);',
  '}',
  'function registerConversationDefinition(ctx, definition) {',
  '  const uiConversation = ctx.get("uiConversation");',
  '  if (uiConversation !== void 0) {',
  '    registerDefinition(uiConversation.events, definition);',
  '    return "split";',
  '  }',
  '  const conversationEvents = ctx.get("conversationEvents");',
  '  if (conversationEvents === void 0) {',
  '    throw new Error("dsh-univer-office: active conversation service exposes no event registry");',
  '  }',
  '  registerDefinition(conversationEvents, definition);',
  '  return "combined";',
  '}',
  'var inject = ["slots", "locale", "conversation"];',
  'const PreviewCard = conversationApi === "split" ? SplitSnapshotPreviewCard : CombinedSnapshotPreviewCard;',
].join('\n')


test('public portable source preserves the complete official Office package and notices', (t) => {
  const item = fixture(t)
  const before = sha(readFileSync(join(item.plugin, 'AGENT-PI-VENDOR-RECEIPT.json')))
  assert.doesNotThrow(() => assertUniverPublicReleaseTree(item.product, { runtime: false }))
  assert.equal(sha(readFileSync(join(item.plugin, 'AGENT-PI-VENDOR-RECEIPT.json'))), before)
  assert.ok(existsSync(join(item.plugin, 'artifacts/gateway.cjs')))
  assert.ok(existsSync(join(item.plugin, 'artifacts/viewer/index.html')))
  assert.match(readFileSync(join(item.plugin, 'LICENSE'), 'utf8'), /Apache License/)
})

test('public tree requires Office and rejects changed, missing and unreceipted official files', async (t) => {
  for (const mutation of ['absent', 'changed', 'missing-viewer', 'extra']) await t.test(mutation, (t) => {
    const item = fixture(t)
    if (mutation === 'absent') rmSync(item.plugin, { recursive: true })
    if (mutation === 'changed') write(join(item.plugin, 'artifacts/gateway.cjs'), 'modified')
    if (mutation === 'missing-viewer') rmSync(join(item.plugin, 'artifacts/viewer/index.html'))
    if (mutation === 'extra') write(join(item.plugin, 'artifacts/unreceipted.js'), 'extra')
    assert.throws(() => assertUniverPublicReleaseTree(item.product, { runtime: false }), /required|missing|not bundled|mismatch/i)
  })
})

test('public tree rejects wrong Office provenance, pin and license text', async (t) => {
  for (const mutation of ['source', 'tarball', 'pin', 'patch', 'license']) await t.test(mutation, (t) => {
    const item = fixture(t)
    if (mutation === 'source') item.receipt.source = { ...pin.source, commit: '0'.repeat(40) }
    if (mutation === 'tarball') item.receipt.tarball.integrity = 'sha512-' + Buffer.alloc(64).toString('base64')
    if (mutation === 'patch') write(join(item.product, 'scripts/patch-univer-alpha1.mjs'), 'changed patch')
    if (mutation === 'pin') write(join(item.product, 'vendor/dsh-univer-office.pin'), JSON.stringify({ ...pin, version: '0.2.9' }))
    if (mutation === 'license') {
      write(join(item.plugin, 'LICENSE'), 'No license text')
      const entry = item.receipt.files.find(entry => entry.path === 'LICENSE')
      entry.size = Buffer.byteLength('No license text'); entry.sha256 = sha(Buffer.from('No license text'))
    }
    write(join(item.plugin, 'AGENT-PI-VENDOR-RECEIPT.json'), JSON.stringify(item.receipt))
    assert.throws(() => assertUniverPublicReleaseTree(item.product, { runtime: false }), /mismatch|identity|Apache|license|stale/i)
  })
})

test('default public tree runs the required platform runtime verifier and propagates its failures', (t) => {
  const item = fixture(t)
  assert.throws(() => assertUniverPublicReleaseTree(item.product), /runtime verifier|lock.*missing/i)
  const marker = join(item.root, 'native-verifier-called.json')
  write(join(item.product, 'scripts/dsh-univer-office-runtime.package-lock.json'), '{}')
  write(join(item.product, 'scripts/install-univer-runtime-deps.mjs'), 'import fs from "node:fs";fs.writeFileSync(' + JSON.stringify(marker) + ',JSON.stringify(process.argv.slice(2)));')
  assert.doesNotThrow(() => assertUniverPublicReleaseTree(item.product))
  assert.deepEqual(JSON.parse(readFileSync(marker, 'utf8')), ['--verify-only', item.plugin])
  write(join(item.product, 'scripts/install-univer-runtime-deps.mjs'), 'process.stderr.write("native dependency unavailable");process.exit(37)')
  assert.throws(() => assertUniverPublicReleaseTree(item.product), /native dependency unavailable/)
})

test('public source archive accepts complete Office and rejects missing or corrupted Viewer content', async (t) => {
  for (const mutation of ['none', 'absent', 'changed']) await t.test(mutation, (t) => {
    const item = fixture(t)
    if (mutation === 'absent') rmSync(item.plugin, { recursive: true })
    if (mutation === 'changed') write(join(item.plugin, 'artifacts/viewer/index.html'), 'corrupt viewer')
    const path = archive(item)
    if (mutation === 'none') assert.doesNotThrow(() => assertUniverPublicReleaseArchive(path))
    else assert.throws(() => assertUniverPublicReleaseArchive(path), /required|missing|not bundled|mismatch|missing.*archive|cannot extract/i)
  })
})

test('removed sanitize command cannot silently delete a complete Office package', (t) => {
  const item = fixture(t)
  const result = spawnSync(process.execPath, [fileURLToPath(cli), 'sanitize', item.product], { encoding: 'utf8', windowsHide: true })
  assert.notEqual(result.status, 0)
  assert.ok(existsSync(join(item.plugin, 'artifacts/gateway.cjs')))
  assert.doesNotThrow(() => assertUniverPublicReleaseTree(item.product, { runtime: false }))
})

test('portable Office archive rejects platform dependencies and hard links before extraction', async (t) => {
  for (const mutation of ['platform-dependency', 'hard-link']) await t.test(mutation, (t) => {
    const item = fixture(t)
    if (mutation === 'platform-dependency') {
      write(join(item.plugin, 'node_modules/platform-binding/binding.node'), 'wrong-platform binary')
    } else {
      linkSync(join(item.plugin, 'LICENSE'), join(item.plugin, 'LICENSE.link'))
    }
    assert.throws(() => assertUniverPublicReleaseArchive(archive(item)), /platform node_modules|unsafe Office source archive entry/)
  })
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

test('market describes the bundled official Office without the obsolete rc.1 exclusion', () => {
  const registry = applyAgentPiUniverPolicy({ updated: 'test', count: 0, categories: {}, plugins: [] })
  const plugin = registry.plugins.find(entry => entry.name === 'dsh-univer-office')
  assert.ok(plugin)
  assert.match(plugin.description.zh, /预装|内置/)
  assert.match(plugin.description.en, /bundled|preinstalled/i)
  assert.match(plugin.description.zh + plugin.description.en, /0\.2\.13/)
  assert.doesNotMatch(plugin.description.zh + plugin.description.en, /rc\.1|待验证|pending verification|不预装|not preinstalled/i)
  assert.equal(registry.count, 1)
})

test('Windows, portable and platform jobs preserve and verify complete Office by default', () => {
  const packWin = readFileSync(new URL('./pack-win.ps1', import.meta.url), 'utf8')
  const prepareWin = readFileSync(new URL('./prepare-win-runtime.ps1', import.meta.url), 'utf8')
  const portable = readFileSync(new URL('./pack-runtime-payload.mjs', import.meta.url), 'utf8')
  const workflow = readFileSync(new URL('../.github/workflows/build-desktop-assets.yml', import.meta.url), 'utf8')
  assert.match(packWin, /univer-public-release\.mjs.*assert-tree/)
  assert.doesNotMatch(prepareWin + portable, /removeBundledUniverFromProduct|univer-public-release\.mjs[^\r\n]*sanitize/)
  assert.match(portable, /assertUniverPublicReleaseTree/)
  assert.match(portable, /runtime:\s*false/)
  assert.match(portable, /vendor\/dsh-univer-office/)
  assert.match(workflow, /install-univer-runtime-deps/)
  assert.match(workflow, /--verify-only/)
})
