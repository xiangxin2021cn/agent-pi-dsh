import childProcess from 'node:child_process'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { homedir } from 'node:os'
import { dirname, join } from 'node:path'
import { pathToFileURL } from 'node:url'

const nativeCua = ['@deepseek-ai/dsh-experimental-computer-use-cua-driver-native', '@deepseek-ai/dsh-cua-macos', '@deepseek-ai/dsh-experimental-cua-macos']
const nativeClaude = '@deepseek-ai/dsh-subagent-claude-code'
const voiceIds = ['speech-to-text', 'speech-to-text-sensevoice', 'api-speech-to-text', 'ui-voice-input']

/** Check the shipped OAR bridge without starting a native CLI or reading its authentication. */
export async function inspectMacOSOarProviders(dshRoot, { env = process.env, home = homedir() } = {}) {
  const root = join(dshRoot, 'packages/experimental/subagent-oar')
  const toolRoot = join(dshRoot, 'packages/experimental/tool-subagent-oar')
  for (const [directory, name] of [[root, '@deepseek-ai/dsh-experimental-subagent-oar'], [toolRoot, '@deepseek-ai/dsh-experimental-tool-subagent-oar']]) {
    if (JSON.parse(readFileSync(join(directory, 'package.json'), 'utf8')).name !== name) throw new Error('Unexpected official OAR package identity')
  }
  const { apply } = await import(pathToFileURL(join(root, 'lib/index.js')).href)
  const { apply: applyTool } = await import(pathToFileURL(join(toolRoot, 'lib/index.js')).href)
  const providers = []
  let tool
  const ctx = {
    subagents: { registerProvider(value) { providers.push(value) } },
    tools: { register(value) { tool = value } },
  }
  for (const runtime of ['codex', 'claude']) apply(ctx, { runtime, providerName: 'oar-' + runtime })
  applyTool(ctx, { providers: { codex: 'oar-codex', claude: 'oar-claude' } })
  if (providers.length !== 2 || providers.some(provider => typeof provider.start !== 'function' || provider.inheritsParentContext !== false)
    || tool?.name !== 'subagent_oar') throw new Error('Official OAR delegation registration failed')
  const which = createRequire(join(root, 'package.json'))('which')
  const localCLI = ['codex', 'claude'].map(runtime => {
    const pinned = env['OAR_' + runtime.toUpperCase() + '_BIN']
    const candidates = pinned ? [pinned] : [which.sync(runtime, { path: env.PATH || '', pathExt: env.PATHEXT, nothrow: true }),
      ...(runtime === 'codex' ? [
        '/Applications/ChatGPT.app/Contents/Resources/codex', '/Applications/Codex.app/Contents/Resources/codex',
        join(home, 'Applications/ChatGPT.app/Contents/Resources/codex'), join(home, 'Applications/Codex.app/Contents/Resources/codex'),
        ...(env.CODEX_INSTALL_DIR ? [join(env.CODEX_INSTALL_DIR, 'codex')] : []),
      ] : []), join(home, '.local/bin', runtime)]
    const detected = candidates.some(candidate => candidate && existsSync(candidate))
    return { runtime, status: detected ? 'detected' : 'unsupported', reason: detected
      ? 'Local CLI detected; native compatibility, authentication and task execution are checked on delegation.'
      : 'Local CLI not found. Install the native CLI or configure its OAR executable path before delegation.' }
  })
  return { backend: 'official-oar', providers: providers.map(provider => provider.name), tool: tool.name, localCLI }
}

/** The distribution marker, rather than the current OS, owns omitted capabilities. */
export function macOSIntelCapabilitiesPatch(productRoot, home) {
  return existsSync(join(productRoot, 'MACOS-INTEL-MONTEREY.json'))
    ? join(home, '.agent-pi-presets/macos-intel-compat.patch.yml') : null
}

/** Capture the official composition privately; only disabled row identities reach disk. */
export async function writeMacOSIntelCapabilities({ productRoot, dshRoot, home }) {
  const patchPath = macOSIntelCapabilitiesPatch(productRoot, home)
  if (!patchPath) return null
  const bin = join(dshRoot, 'apps/cli/lib/bin.js')
  const args = existsSync(bin) ? [bin] : ['--import', 'tsx/esm', join(dshRoot, 'apps/cli/src/bin.ts')]
  const result = childProcess.spawnSync(process.execPath, [...args, '--profile', 'tender', '--dump-config'], {
    cwd: dshRoot, env: { ...process.env, DSH_HOME: home, DSH_CHECKOUT: dshRoot },
    encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true,
    timeout: 60000, maxBuffer: 24 * 1024 * 1024,
  })
  // Dump output may contain user credentials. Never forward stdout, stderr or parser diagnostics.
  if (result.error || result.status !== 0) throw new Error('Intel compatibility configuration inspection failed')
  let rows, yaml
  try {
    const includeRoot = join(dshRoot, 'vendor/include')
    yaml = createRequire(join(includeRoot, 'package.json'))('js-yaml')
    const { parseEntryYaml } = await import(pathToFileURL(join(includeRoot, 'lib/index.js')).href)
    rows = parseEntryYaml(result.stdout)
    if (!Array.isArray(rows)) throw new Error()
  } catch {
    throw new Error('Intel compatibility configuration inspection returned an invalid tree')
  }
  const patches = voiceIds.map(id => ({ id, disabled: true }))
  let nativeEntries = 0
  function visit(entries) {
    for (const row of entries) {
      if (nativeCua.includes(row?.name) || row?.name === nativeClaude) {
        if (typeof row.id !== 'string' || !row.id) throw new Error('Intel compatibility cannot isolate an unnamed native-provider entry')
        patches.push({ id: row.id, name: row.name, disabled: true })
        nativeEntries += 1
      }
      // Match the official patch composer's addressable group traversal.
      if (row?.group && Array.isArray(row.config)) visit(row.config)
    }
  }
  visit(rows)
  mkdirSync(dirname(patchPath), { recursive: true })
  writeFileSync(patchPath, '# Agent Pi Intel Monterey compatibility: launcher-owned capability exclusions.\n'
    + '# Applied after saved profile/home settings; user configuration and model caches stay intact.\n'
    + yaml.dump(patches, { noRefs: true }), { mode: 0o600 })
  return { patchPath, nativeEntries }
}
