import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const supportedVersion = '0.1.0'

function patchFile(path, replacements) {
  const original = readFileSync(path, 'utf8')
  const crlf = original.includes('\r\n')
  let source = original.replaceAll('\r\n', '\n')
  let changed = false
  for (const { before, after } of replacements) {
    if (source.includes(after)) continue
    if (!source.includes(before)) {
      throw new Error('dsh-router-standard layout does not match the rc.1 compatibility patch: ' + path)
    }
    source = source.replace(before, after)
    changed = true
  }
  if (changed) writeFileSync(path, crlf ? source.replaceAll('\n', '\r\n') : source, 'utf8')
  return changed
}

export function patchRouterStandardForDshRc1({ pluginRoot }) {
  const manifestPath = join(pluginRoot, 'package.json')
  const corePath = join(pluginRoot, 'preset', 'router-core.mjs')
  const bootstrapPath = join(pluginRoot, 'preset', 'router-bootstrap.mjs')
  if (![manifestPath, corePath, bootstrapPath].every(existsSync)) {
    throw new Error('dsh-router-standard is incomplete: ' + pluginRoot)
  }
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'))
  if (manifest.name !== 'dsh-router-standard' || manifest.version !== supportedVersion) {
    throw new Error(
      'Unsupported dsh-router-standard for DSH rc.1 compatibility: '
      + (manifest.name || 'unknown') + '@' + (manifest.version || 'unknown'),
    )
  }

  const coreChanged = patchFile(corePath, [{
    before: 'export function sessionMode(session) {\n  const events = session.events',
    after: "export function sessionEvents(session) {\n  if (typeof session?.snapshotEvents === 'function') return session.snapshotEvents()\n  return Array.isArray(session?.events) ? session.events : []\n}\n\nexport function sessionMode(session) {\n  const events = sessionEvents(session)",
  }])
  const bootstrapChanged = patchFile(bootstrapPath, [
    {
      before: '  applyPersona, bandFor, coreFor, parseMode, personaFor, sessionMode, testinessFor, clamp01,',
      after: '  applyPersona, bandFor, bandOf, coreFor, extractText, parseMode, personaFor, sessionEvents, sessionMode, testinessFor, clamp01,',
    },
    {
      before: "    if (session.events.some((event) => event.type === 'tool/call')) {",
      after: "    if (sessionEvents(session).some((event) => event.type === 'tool/call')) {",
    },
  ])
  return coreChanged || bootstrapChanged ? 'applied' : 'already-applied'
}

export function main(args = process.argv.slice(2)) {
  const pluginRoot = resolve(args[0] || join(root, 'vendor', 'dsh-router-standard'))
  const result = patchRouterStandardForDshRc1({ pluginRoot })
  process.stdout.write('Router Standard DSH rc.1 compatibility: ' + result + String.fromCharCode(10))
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main()
