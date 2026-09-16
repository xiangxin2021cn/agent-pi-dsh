import { viewerProxyFixture } from './fixtures/univer-viewer-proxy.mjs'
import assert from 'node:assert/strict'
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'
import { patchUniverForDshAlpha1, patchUniverViewerProxy } from './patch-univer-alpha1.mjs'

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
  '',
].join(newline)

function fixture(version = '0.2.9', client = legacyClient) {
  const dir = mkdtempSync(join(tmpdir(), 'agent-pi-univer-alpha1-'))
  mkdirSync(join(dir, 'lib'), { recursive: true })
  writeFileSync(join(dir, 'package.json'), JSON.stringify({ name: 'dsh-univer-office', version }) + newline)
  writeFileSync(join(dir, 'lib/client.js'), client)
  return dir
}

for (const version of ['0.2.9', '0.2.10']) {
  test(`patches Univer ${version} to the current conversation service and snapshots, and is idempotent`, () => {
    const pluginRoot = fixture(version)

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
}

test('refuses an unverified Univer version without changing it', () => {
  const pluginRoot = fixture('0.2.15', nativeClient)

  assert.throws(
    () => patchUniverForDshAlpha1({ pluginRoot }),
    /Unsupported dsh-univer-office/,
  )
  assert.equal(readFileSync(join(pluginRoot, 'lib/client.js'), 'utf8'), nativeClient)
})

for (const version of ['0.2.13', '0.2.14']) test(`accepts the verified native ${version} conversation adapter without changing one byte`, () => {
  const pluginRoot = fixture(version, nativeClient)

  assert.equal(patchUniverForDshAlpha1({ pluginRoot }), 'native-compatible')
  assert.equal(readFileSync(join(pluginRoot, 'lib/client.js'), 'utf8'), nativeClient)
})

test('refuses a malformed 0.2.13 native adapter without changing it', () => {
  const source = nativeClient.replace(
    'registerDefinition(uiConversation.events, definition);',
    'registerDefinition(definition);',
  )
  const pluginRoot = fixture('0.2.13', source)

  assert.throws(
    () => patchUniverForDshAlpha1({ pluginRoot }),
    /native client layout does not match/,
  )
  assert.equal(readFileSync(join(pluginRoot, 'lib/client.js'), 'utf8'), source)
})

test('accepts the 0.3.0 native API without rewriting it and rejects obsolete or missing registration', () => {
  const source = [
    'var inject = ["slots", "locale", "conversation"];',
    'const uiConversation = ctx.get("uiConversation");',
    'uiConversation.events.register(univerTurnDefinition);',
    'props.useChat((snapshot) => snapshot.timeline)',
    'throw new Error("dsh-univer-office: active DSH Client exposes no uiConversation service");',
  ].join(newline)
  const pluginRoot = fixture('0.3.0', source)
  writeFileSync(join(pluginRoot, 'lib/index.js'), viewerProxyFixture)
  assert.equal(patchUniverForDshAlpha1({ pluginRoot }), 'native-compatible')
  assert.equal(readFileSync(join(pluginRoot, 'lib/client.js'), 'utf8'), source)
  for (const invalid of [source.replace('uiConversation.events.register(univerTurnDefinition);', ''), source + '\nprops.useSession(() => {})']) {
    writeFileSync(join(pluginRoot, 'lib/client.js'), invalid)
    assert.throws(() => patchUniverForDshAlpha1({ pluginRoot }), /native client/)
    assert.equal(readFileSync(join(pluginRoot, 'lib/client.js'), 'utf8'), invalid)
  }
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

test('development vendoring and all desktop packages materialize the official compatible Office plugin', () => {
  const root = join(import.meta.dirname, '..')
  const vendorSource = readFileSync(join(root, 'scripts/vendor-dsh-plugins.ps1'), 'utf8')
  const windowsSource = readFileSync(join(root, 'scripts/pack-win.ps1'), 'utf8')
  const portableSource = readFileSync(join(root, 'scripts/pack-runtime-payload.mjs'), 'utf8')

  assert.match(vendorSource, /materialize-dsh-univer-office/)
  assert.doesNotMatch(vendorSource, /Set-Content[^\n]+dsh-univer-office\.pin/)
  assert.match(windowsSource, /IncludeLicensedUniver/)
  assert.match(windowsSource, /materialize-dsh-univer-office/)
  assert.match(windowsSource, /univer-public-release/)
  assert.match(portableSource, /univer-public-release/)
  assert.match(portableSource, /materialize-dsh-univer-office/)
  assert.match(portableSource, /await materializeDshUniverOffice\(/)
  assert.doesNotMatch(portableSource, /removeBundledUniverFromProduct|sanitize/)
})

test('Viewer tunnel preserves the ticket and queued/live text and binary frames', async () => {
  const { EventEmitter } = await import('node:events')
  const patched = patchUniverViewerProxy(viewerProxyFixture)
  assert.equal(patchUniverViewerProxy(patched),patched)
  assert.throws(()=>patchUniverViewerProxy('unknown host layout'),/Viewer proxy layout/)
  const client = new EventEmitter(), upstream = new EventEmitter(), sent = [], received = []
  upstream.readyState = 0
  upstream.send = (data,options)=>sent.push({data:String(data),...options})
  client.send = (data,options)=>received.push({data:String(data),...options})
  const AsyncFunction = Object.getPrototypeOf(async function(){}).constructor
  const run = new AsyncFunction('target','rewriteLoopback','resolveOrigin','req','client','upstream','toBuffer',patched)
  const url = await run('/uf/test/events',x=>x,async()=>'http://127.0.0.1:9999',{url:'/univer-viewer/ws?sessionTicket=fixture%2Bticket'},client,upstream,Buffer.from)
  assert.equal(url.searchParams.get('sessionTicket'),'fixture+ticket')
  client.emit('message',Buffer.from('queued text'),false)
  client.emit('message',Buffer.from('queued bytes'),true)
  upstream.readyState = 1; upstream.emit('open')
  client.emit('message',Buffer.from('live text'),false)
  upstream.emit('message',Buffer.from('reply'),false)
  assert.deepEqual(sent,[{data:'queued text',binary:false},{data:'queued bytes',binary:true},{data:'live text',binary:false}])
  assert.deepEqual(received,[{data:'reply',binary:false}])
})
