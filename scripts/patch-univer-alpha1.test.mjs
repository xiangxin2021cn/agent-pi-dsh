import assert from 'node:assert/strict'
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'
import { patchUniverForDshAlpha1 } from './patch-univer-alpha1.mjs'

const newline = String.fromCharCode(10)
const legacyClient = [
  'var inject = ["slots", "locale", "conversationEvents"];',
  'ctx.conversationEvents.register(univerTurnDefinition);',
  'function turnFilesOfSession(session, cwd) {',
  '      if (session === void 0) return [];',
  '      for (const turn of session.chat.timeline.turns.values()) {',
  'const session = props.useSession((snapshot) => snapshot);',
  'const latestTurns = React4.useMemo(() => latestWorktreeTurns(session), [session]);',
  'function latestWorktreeTurns(session) {',
  '      const latest = /* @__PURE__ */ new Map();',
  '      for (const [turnNumber, turn] of session.chat.timeline.turns) {',
  'const cwd = props.useSessions((state) => state.byId[props.sessionId]?.cwd);',
  '      const turnFiles = React6.useMemo(() => turnFilesOfSession(props.session, cwd), [props.session, cwd]);',
  '',
].join(newline)

function fixture(version = '0.2.9', client = legacyClient) {
  const dir = mkdtempSync(join(tmpdir(), 'agent-pi-univer-alpha1-'))
  mkdirSync(join(dir, 'lib'), { recursive: true })
  writeFileSync(join(dir, 'package.json'), JSON.stringify({ name: 'dsh-univer-office', version }) + newline)
  writeFileSync(join(dir, 'lib/client.js'), client)
  return dir
}

test('patches Univer 0.2.9 to the alpha.1 conversation service and snapshots, and is idempotent', () => {
  const pluginRoot = fixture()

  assert.equal(patchUniverForDshAlpha1({ pluginRoot }), 'applied')
  const patched = readFileSync(join(pluginRoot, 'lib/client.js'), 'utf8')
  assert.ok(patched.includes('var inject = ["slots", "locale", "uiConversation"]'))
  assert.ok(patched.includes('ctx.uiConversation.events.register(univerTurnDefinition)'))
  assert.ok(patched.includes('snapshot.views.get("chat")'))
  assert.ok(patched.includes('turnFilesOfSession(chat, cwd)'))
  assert.ok(patched.includes('latestWorktreeTurns(chat)'))
  assert.ok(patched.includes('chat.timeline.turns'))
  assert.ok(!patched.includes('conversationEvents'))
  assert.ok(!patched.includes('session.chat.timeline'))
  assert.ok(!patched.includes('props.useSession('))
  assert.equal(patchUniverForDshAlpha1({ pluginRoot }), 'already-applied')
  assert.equal(readFileSync(join(pluginRoot, 'lib/client.js'), 'utf8'), patched)
})

test('refuses an unpinned Univer version without changing it', () => {
  const pluginRoot = fixture('0.2.10')

  assert.throws(
    () => patchUniverForDshAlpha1({ pluginRoot }),
    /Unsupported dsh-univer-office/,
  )
  assert.equal(readFileSync(join(pluginRoot, 'lib/client.js'), 'utf8'), legacyClient)
})

test('refuses a mismatched 0.2.9 client layout without changing it', () => {
  const source = 'export const inject = []' + newline
  const pluginRoot = fixture('0.2.9', source)

  assert.throws(
    () => patchUniverForDshAlpha1({ pluginRoot }),
    /client layout does not match/,
  )
  assert.equal(readFileSync(join(pluginRoot, 'lib/client.js'), 'utf8'), source)
})

test('development and materialization entrypoints enforce Univer alpha.1 compatibility', () => {
  const root = join(import.meta.dirname, '..')
  for (const file of [
    'scripts/init-tender-profile.ps1',
    'scripts/materialize-dsh-univer-office.mjs',
  ]) {
    assert.ok(readFileSync(join(root, file), 'utf8').includes('patch-univer-alpha1'))
  }
})

test('development vendoring keeps the materializer while public packages exclude Univer', () => {
  const root = join(import.meta.dirname, '..')
  const vendorSource = readFileSync(join(root, 'scripts/vendor-dsh-plugins.ps1'), 'utf8')
  const windowsSource = readFileSync(join(root, 'scripts/pack-win.ps1'), 'utf8')
  const portableSource = readFileSync(join(root, 'scripts/pack-runtime-payload.mjs'), 'utf8')

  assert.match(vendorSource, /materialize-dsh-univer-office/)
  assert.doesNotMatch(vendorSource, /Set-Content[^\n]+dsh-univer-office\.pin/)
  for (const source of [windowsSource, portableSource]) {
    assert.doesNotMatch(source, /materialize-dsh-univer-office/)
    assert.doesNotMatch(source, /verifyMaterializedUniver/)
    assert.match(source, /univer-public-release/)
  }
})
