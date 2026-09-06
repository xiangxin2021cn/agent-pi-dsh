import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { test } from 'node:test'

const verifier = join(import.meta.dirname, 'verify-runtime-payload-stage.mjs')
const pin = JSON.parse(readFileSync(new URL('../vendor/dsh-univer-office.pin', import.meta.url), 'utf8'))
const patch = readFileSync(new URL('./patch-univer-alpha1.mjs', import.meta.url))
const sha = bytes => createHash('sha256').update(bytes).digest('hex')
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

function write(path, content) {
  mkdirSync(dirname(path), { recursive: true })
  writeFileSync(path, content)
}

function fixture(t) {
  const stage = mkdtempSync(join(tmpdir(), 'agent-pi-payload-stage-'))
  t.after(() => rmSync(stage, { recursive: true, force: true }))
  const product = join(stage, 'product')
  const plugin = join(product, 'vendor/dsh-univer-office')
  const files = [
    ['LICENSE', 'Apache License\nVersion 2.0, January 2004\n'],
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
  write(join(plugin, 'AGENT-PI-VENDOR-RECEIPT.json'), JSON.stringify({
    schema: 'agent-pi-dsh/univer-office-vendor-receipt/v1',
    package: { name: pin.name, version: pin.version, license: pin.license }, source: pin.source,
    tarball: { url: pin.tarball, integrity: pin.integrity, shasum: pin.shasum, bytes: pin.archiveBytes, entries: pin.archiveEntries },
    compatibilityPatch: { path: 'scripts/patch-univer-alpha1.mjs', sha256: sha(patch) },
    patchedClient: { path: 'lib/client.js', sha256: sha(Buffer.from(nativeClient)) },
    files: files.map(([path, content]) => ({ path, size: Buffer.byteLength(content), sha256: sha(content) }))
      .sort((a, b) => a.path < b.path ? -1 : a.path > b.path ? 1 : 0),
  }))
  write(join(product, 'vendor/dsh-univer-office.pin'), JSON.stringify(pin))
  write(join(product, 'scripts/patch-univer-alpha1.mjs'), patch)
  write(join(stage, 'deepseek-harness/package.json'), '{}\n')
  return { stage, plugin }
}

function run(stage) {
  return spawnSync(process.execPath, [verifier, stage], {
    encoding: 'utf8',
    windowsHide: true,
  })
}

test('portable runtime payload validates its nested official Office source without platform dependencies', (t) => {
  const { stage } = fixture(t)
  const result = run(stage)
  assert.equal(result.status, 0, result.stderr || result.stdout)
  assert.match(result.stdout, /runtime payload stage is portable/)
})

test('portable runtime payload stage rejects VCS and dependency trees', async (t) => {
  for (const forbidden of ['.git', 'node_modules']) await t.test(forbidden, (t) => {
    const { stage } = fixture(t)
    if (forbidden === '.git') write(join(stage, 'deepseek-harness/.git'), 'gitdir: elsewhere\n')
    else mkdirSync(join(stage, 'product/vendor/plugin/node_modules'), { recursive: true })
    const result = run(stage)
    assert.notEqual(result.status, 0)
    assert.match(result.stderr, /runtime payload contains forbidden entry:/)
    assert.ok(result.stderr.includes(forbidden))
  })
})

test('portable runtime payload still rejects missing or modified official Office files', async (t) => {
  for (const mutation of ['missing-viewer', 'modified-gateway']) await t.test(mutation, (t) => {
    const { stage, plugin } = fixture(t)
    if (mutation === 'missing-viewer') rmSync(join(plugin, 'artifacts/viewer/index.html'))
    else write(join(plugin, 'artifacts/gateway.cjs'), 'modified')
    const result = run(stage)
    assert.notEqual(result.status, 0)
    assert.match(result.stderr, /missing receipted file|mismatch/)
  })
})
