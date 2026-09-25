import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
/** Minimal Office 0.3.2 adaptation to DSH 0.1.7's entry-backed settings. */
function replaceOnce(source, before, after) {
  if (source.includes(after)) return source
  if (source.split(before).length !== 2) throw new Error('Univer 0.3.2 settings layout changed; refusing a partial adaptation')
  return source.replace(before, after)
}

export function patchUniver017Host(source) {
  source = replaceOnce(source, '  telemetry: z.boolean().default(true)\n',
    '  autoOpenLivePreview: z.boolean().default(true).volatile(),\n  telemetry: z.boolean().default(true)\n')
  return replaceOnce(source, '  ctx.plugin(plugin_exports2);',
    '  // DSH 0.1.7 projects the root univer Config into settings; no legacy settings.register child.')
}

export function patchUniver017Client(source) {
  source = replaceOnce(source, 'var UNIVER_SETTINGS_NAMESPACE = "univer-office";', 'var UNIVER_SETTINGS_NAMESPACE = "univer";')
  source = replaceOnce(source, 'ctx.inject(["settingsScope"], (settingsCtx) => {', 'ctx.inject(["configForms"], (settingsCtx) => {')
  source = replaceOnce(source,
    'const settings = settingsCtx.settingsScope.bind({\n          namespace: UNIVER_SETTINGS_NAMESPACE\n        });',
    'const settings = settingsCtx.configForms.get(UNIVER_SETTINGS_NAMESPACE);')
  source = replaceOnce(source, 'settingsCtx.slots.inject(\n          "settings.plugin.item",', 'settingsCtx.slots.inject(\n          "settings.section",')
  return replaceOnce(source, 'name: "settings.plugin.item",\n              key: UNIVER_SETTINGS_NAMESPACE,',
    'name: "settings.section",\n              id: "univer-office",\n              order: 35,\n              label: "Univer Office",')
}


const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const legacyPatchVersions = new Set(['0.2.9', '0.2.10'])
const nativeCompatibleVersions = new Set(['0.2.13', '0.2.14', '0.3.0', '0.3.2', '0.3.5'])
const alpha2TurnTailReplacements = [
  ['name: "conversation.chat.turnTail",\n              priority: -10,', 'name: "conversation.chat.turnTail",\n              id: "univer-turn-preview",\n              order: -10,'],
  ['              select: selectUniverTurn,\n', ''],
  ['return /* @__PURE__ */ (0, import_jsx_runtime3.jsx)(PreviewCardContent, { ...props, timeline, cwd });', 'const matched = selectUniverTurn(props);\n      if (matched === null) return null;\n      return /* @__PURE__ */ (0, import_jsx_runtime3.jsx)(PreviewCardContent, { ...props, matched, timeline, cwd });'],
]

/** alpha.2 changed turnTail from a matching chain to an additive list. */
export function patchUniverTurnTail(source) {
  if (source.includes('id: "univer-turn-preview"')) {
    if (!source.includes('const matched = selectUniverTurn(props);') || source.includes('select: selectUniverTurn,')) {
      throw new Error('dsh-univer-office 0.3.2 partial turn-tail compatibility patch')
    }
    return source
  }
  let result = source
  for (const [before, after] of alpha2TurnTailReplacements) {
    if (result.split(before).length !== 2) throw new Error('dsh-univer-office 0.3.2 native client turn-tail layout does not match')
    result = result.replace(before, after)
  }
  return result
}
const replacements = [
  {
    before: 'var inject = ["slots", "locale", "conversationEvents"];',
    after: 'var inject = ["slots", "locale", "uiConversation"];',
  },
  {
    before: 'ctx.conversationEvents.register(univerTurnDefinition);',
    after: 'ctx.uiConversation.events.register(univerTurnDefinition);',
  },
  {
    before: 'function turnFilesOfSession(session, cwd) {\n      if (session === void 0) return [];',
    after: 'function turnFilesOfSession(chat, cwd) {\n      if (chat === void 0) return [];',
  },
  {
    before: 'for (const turn of session.chat.timeline.turns.values()) {',
    after: 'for (const turn of chat.timeline.turns.values()) {',
  },
  {
    before: 'const session = props.useSession((snapshot) => snapshot);',
    after: 'const chat = props.useConversation((snapshot) => snapshot.views.get("chat"));',
  },
  {
    before: 'const latestTurns = React4.useMemo(() => latestWorktreeTurns(session), [session]);',
    after: 'const latestTurns = React4.useMemo(() => latestWorktreeTurns(chat), [chat]);',
  },
  {
    before: 'function latestWorktreeTurns(session) {\n      const latest = /* @__PURE__ */ new Map();',
    after: 'function latestWorktreeTurns(chat) {\n      const latest = /* @__PURE__ */ new Map();\n      if (chat === void 0) return latest;',
  },
  {
    before: 'for (const [turnNumber, turn] of session.chat.timeline.turns) {',
    after: 'for (const [turnNumber, turn] of chat.timeline.turns) {',
  },
  {
    before: 'const cwd = props.useSessions((state) => state.byId[props.sessionId]?.cwd);\n      const turnFiles = React6.useMemo(() => turnFilesOfSession(props.session, cwd), [props.session, cwd]);',
    after: 'const cwd = props.useSessions((state) => state.byId[props.sessionId]?.cwd);\n      const chat = props.useConversation((snapshot) => snapshot.views.get("chat"));\n      const turnFiles = React6.useMemo(() => turnFilesOfSession(chat, cwd), [chat, cwd]);',
  },
]

const legacyPatchedMarkers = [
  'var inject = ["slots", "locale", "uiConversation"];',
  'ctx.uiConversation.events.register(univerTurnDefinition);',
  'snapshot.views.get("chat")',
]
const legacyObsoleteMarkers = ['conversationEvents', 'session.chat.timeline', 'props.useSession(']
const nativeMarkers = [
  'function registerConversationDefinition(ctx, definition) {',
  'var inject = ["slots", "locale", "conversation"];',
  'props.useChat((snapshot) => snapshot.timeline)',
  'conversationApi === "split" ? SplitSnapshotPreviewCard : CombinedSnapshotPreviewCard',
  'if (uiConversation !== void 0) {',
  'if (conversationEvents === void 0) {',
  'throw new Error("dsh-univer-office: active conversation service exposes no event registry");',
]
const nativeConversationSequence = [
  'const uiConversation = ctx.get("uiConversation");',
  'registerDefinition(uiConversation.events, definition);',
  'return "split";',
  'const conversationEvents = ctx.get("conversationEvents");',
  'registerDefinition(conversationEvents, definition);',
  'return "combined";',
]

export function assertUniverClientCompatibility({ version, source }) {
  if (typeof source !== 'string') {
    throw new Error(`dsh-univer-office ${version || 'unknown'} client layout does not match the compatibility contract`)
  }
  if (legacyPatchVersions.has(version)) {
    for (const marker of legacyPatchedMarkers) {
      if (!source.includes(marker)) {
        throw new Error(`dsh-univer-office ${version} client layout does not match the compatibility patch`)
      }
    }
    for (const marker of legacyObsoleteMarkers) {
      if (source.includes(marker)) {
        throw new Error(`dsh-univer-office ${version} compatibility patch left obsolete marker ${marker}`)
      }
    }
    return 'legacy-patched'
  }
  if (nativeCompatibleVersions.has(version)) {
    if (version === '0.3.5') {
      // Upstream now handles the list slot and entry-backed settings itself.
      // Its guarded legacy fallbacks are retained; do not rewrite the bundle.
      for (const marker of [
        'var inject = ["slots", "locale", "conversation", "uiConversation"];',
        'uiConversation.events.register(univerTurnDefinition);',
        'props.useChat((snapshot) => snapshot.timeline)',
        'const matched = selectUniverTurn(props);',
        'id: "univer-turn-preview",',
        'forms.get(UNIVER_CONFIG_ENTRY_ID)',
        'name: "plugins.bundle.config",',
      ]) {
        if (!source.includes(marker)) throw new Error(`dsh-univer-office ${version} native client layout does not match the compatibility contract`)
      }
      return 'native-compatible'
    }
    if (version === '0.3.0' || version === '0.3.2') {
      for (const marker of [
        'var inject = ["slots", "locale", "conversation"];',
        'const uiConversation = ctx.get("uiConversation");',
        'uiConversation.events.register(univerTurnDefinition);',
        'props.useChat((snapshot) => snapshot.timeline)',
        'throw new Error("dsh-univer-office: active DSH Client exposes no uiConversation service");',
      ]) {
        if (!source.includes(marker)) throw new Error(`dsh-univer-office ${version} native client layout does not match the compatibility contract`)
      }
      if (source.includes('conversationEvents') || source.includes('props.useSession(')) {
        throw new Error(`dsh-univer-office ${version} native client contains an obsolete conversation API`)
      }
      if (version === '0.3.2' && (!source.includes('id: "univer-turn-preview"') || !source.includes('const matched = selectUniverTurn(props);') || source.includes('select: selectUniverTurn,'))) {
        throw new Error('dsh-univer-office 0.3.2 native client requires the alpha.2 turn-tail adapter')
      }
      return 'native-compatible'
    }
    for (const marker of nativeMarkers) {
      if (!source.includes(marker)) {
        throw new Error(`dsh-univer-office ${version} native client layout does not match the compatibility contract`)
      }
    }
    let previous = -1
    for (const marker of nativeConversationSequence) {
      const index = source.indexOf(marker, previous + 1)
      if (index === -1) {
        throw new Error(`dsh-univer-office ${version} native client layout does not match the compatibility contract`)
      }
      previous = index
    }
    return 'native-compatible'
  }
  throw new Error(`Unsupported dsh-univer-office for the current DSH conversation API: dsh-univer-office@${version || 'unknown'}`)
}

export function patchUniverViewerProxy(source) {
  // The 0.3.0 SDK appends its collaboration ticket to the tunnel URL. Forward
  // that ticket, and retain WebSocket text/binary framing in both directions.
  const fixes = [
    ['const upstreamUrl = new URL(target, rewriteLoopback(await resolveOrigin()));', 'const upstreamUrl = new URL(target, rewriteLoopback(await resolveOrigin()));\n      const sessionTicket = new URL(req.url, "http://localhost").searchParams.get("sessionTicket");\n      if (sessionTicket !== null) upstreamUrl.searchParams.set("sessionTicket", sessionTicket);'],
    ['client.on("message", (data) => {', 'client.on("message", (data, isBinary) => {'],
    ['upstream.send(data);', 'upstream.send(data, { binary: isBinary });'],
    ['pending.push(toBuffer(data));', 'pending.push({ data: toBuffer(data), isBinary });'],
    ['upstream.send(frame);', 'upstream.send(frame.data, { binary: frame.isBinary });'],
    ['upstream.on("message", (data) => {', 'upstream.on("message", (data, isBinary) => {'],
    ['client.send(data);', 'client.send(data, { binary: isBinary });'],
  ]
  for (const [before, after] of fixes) {
    if (source.includes(after)) continue
    if (source.split(before).length !== 2) throw new Error('dsh-univer-office 0.3.0 Viewer proxy layout does not match the compatibility patch')
    source = source.replace(before, after)
  }
  return source
}

export function patchUniverForDshAlpha1({ pluginRoot }) {
  const manifestPath = join(pluginRoot, 'package.json')
  const clientPath = join(pluginRoot, 'lib/client.js')
  if (!existsSync(manifestPath) || !existsSync(clientPath)) {
    throw new Error('dsh-univer-office is incomplete: ' + pluginRoot)
  }

  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'))
  if (manifest.name !== 'dsh-univer-office'
      || (!legacyPatchVersions.has(manifest.version) && !nativeCompatibleVersions.has(manifest.version))) {
    throw new Error(
      'Unsupported dsh-univer-office for the current DSH conversation API: '
      + (manifest.name || 'unknown') + '@' + (manifest.version || 'unknown'),
    )
  }

  let source = readFileSync(clientPath, 'utf8')
  if (nativeCompatibleVersions.has(manifest.version)) {
    if (manifest.version === '0.3.2') {
      const patched = patchUniver017Client(patchUniverTurnTail(source))
      assertUniverClientCompatibility({ version: manifest.version, source: patched })
      const hostPath = join(pluginRoot, 'lib/index.js')
      const originalHost = readFileSync(hostPath, 'utf8')
      const patchedHost = patchUniver017Host(originalHost)
      if (patchedHost !== originalHost) writeFileSync(hostPath, patchedHost, 'utf8')
      if (patched !== source) writeFileSync(clientPath, patched, 'utf8')
      return '017-adapted'
    }
    assertUniverClientCompatibility({ version: manifest.version, source })
    if (manifest.version === '0.3.0') {
      const hostPath = join(pluginRoot, 'lib/index.js')
      const original = readFileSync(hostPath, 'utf8')
      const patched = patchUniverViewerProxy(original)
      if (patched !== original) writeFileSync(hostPath, patched, 'utf8')
    }
    return 'native-compatible'
  }
  let changed = false
  for (const { before, after } of replacements) {
    if (source.includes(after)) continue
    if (!source.includes(before)) {
      throw new Error('dsh-univer-office ' + manifest.version + ' client layout does not match the compatibility patch')
    }
    source = source.replace(before, after)
    changed = true
  }
  assertUniverClientCompatibility({ version: manifest.version, source })
  if (changed) writeFileSync(clientPath, source, 'utf8')
  return changed ? 'applied' : 'already-applied'
}

export function main(args = process.argv.slice(2)) {
  const pluginRoot = resolve(args[0] || join(root, 'vendor/dsh-univer-office'))
  const result = patchUniverForDshAlpha1({ pluginRoot })
  process.stdout.write('Univer DSH conversation compatibility: ' + result + String.fromCharCode(10))
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main()
