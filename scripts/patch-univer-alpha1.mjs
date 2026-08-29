import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const supportedVersion = '0.2.9'
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

export function patchUniverForDshAlpha1({ pluginRoot }) {
  const manifestPath = join(pluginRoot, 'package.json')
  const clientPath = join(pluginRoot, 'lib/client.js')
  if (!existsSync(manifestPath) || !existsSync(clientPath)) {
    throw new Error('dsh-univer-office is incomplete: ' + pluginRoot)
  }

  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'))
  if (manifest.name !== 'dsh-univer-office' || manifest.version !== supportedVersion) {
    throw new Error(
      'Unsupported dsh-univer-office for DSH alpha.1 compatibility: '
      + (manifest.name || 'unknown') + '@' + (manifest.version || 'unknown'),
    )
  }

  let source = readFileSync(clientPath, 'utf8')
  let changed = false
  for (const { before, after } of replacements) {
    if (source.includes(after)) continue
    if (!source.includes(before)) {
      throw new Error('dsh-univer-office ' + supportedVersion + ' client layout does not match the compatibility patch')
    }
    source = source.replace(before, after)
    changed = true
  }
  if (changed) writeFileSync(clientPath, source, 'utf8')
  return changed ? 'applied' : 'already-applied'
}

export function main(args = process.argv.slice(2)) {
  const pluginRoot = resolve(args[0] || join(root, 'vendor/dsh-univer-office'))
  const result = patchUniverForDshAlpha1({ pluginRoot })
  process.stdout.write('Univer DSH alpha.1 compatibility: ' + result + String.fromCharCode(10))
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main()
