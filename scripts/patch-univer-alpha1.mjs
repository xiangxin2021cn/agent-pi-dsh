import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const legacyPatchVersions = new Set(['0.2.9', '0.2.10'])
const nativeCompatibleVersion = '0.2.13'
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
  if (version === nativeCompatibleVersion) {
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

export function patchUniverForDshAlpha1({ pluginRoot }) {
  const manifestPath = join(pluginRoot, 'package.json')
  const clientPath = join(pluginRoot, 'lib/client.js')
  if (!existsSync(manifestPath) || !existsSync(clientPath)) {
    throw new Error('dsh-univer-office is incomplete: ' + pluginRoot)
  }

  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'))
  if (manifest.name !== 'dsh-univer-office'
      || (!legacyPatchVersions.has(manifest.version) && manifest.version !== nativeCompatibleVersion)) {
    throw new Error(
      'Unsupported dsh-univer-office for the current DSH conversation API: '
      + (manifest.name || 'unknown') + '@' + (manifest.version || 'unknown'),
    )
  }

  let source = readFileSync(clientPath, 'utf8')
  if (manifest.version === nativeCompatibleVersion) {
    assertUniverClientCompatibility({ version: manifest.version, source })
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
