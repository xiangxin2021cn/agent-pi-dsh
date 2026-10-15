import childProcess from 'node:child_process'
import { existsSync, mkdirSync, writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'
import { pathToFileURL } from 'node:url'

const nativeCua = '@deepseek-ai/dsh-experimental-computer-use-cua-driver-native'
const nativeClaude = '@deepseek-ai/dsh-subagent-claude-code'
const voiceIds = ['speech-to-text', 'speech-to-text-sensevoice', 'api-speech-to-text', 'ui-voice-input']

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
    const { entryListSchema } = await import(pathToFileURL(join(includeRoot, 'lib/index.js')).href)
    rows = yaml.load(result.stdout, { schema: entryListSchema })
    if (!Array.isArray(rows)) throw new Error()
  } catch {
    throw new Error('Intel compatibility configuration inspection returned an invalid tree')
  }
  const patches = voiceIds.map(id => ({ id, disabled: true }))
  let nativeEntries = 0
  function visit(entries) {
    for (const row of entries) {
      if (row?.name === nativeCua || row?.name === nativeClaude) {
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
