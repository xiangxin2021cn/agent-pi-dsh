import { spawnSync } from 'node:child_process'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const scriptsDir = dirname(fileURLToPath(import.meta.url))

/** Agent Pi-owned runtime presets; official DSH presets are never mutated. */
export function runtimePresetFiles(_dshRoot, productRoot) {
  return [join(productRoot, 'vendor/dsh-router-standard/preset/agent.cordis.yml')]
}

export function main(args = process.argv.slice(2), run = spawnSync) {
  if (args.length !== 2) {
    throw new Error('Usage: apply-runtime-overlays.mjs <dsh-root> <product-root>')
  }
  const files = runtimePresetFiles(resolve(args[0]), resolve(args[1]))
  for (const script of [
    'enable-desktop-web-fetch.mjs',
    'enable-desktop-codex.mjs',
    'enable-desktop-compaction.mjs',
  ]) {
    const result = run(process.execPath, [join(scriptsDir, script), ...files], {
      encoding: 'utf8',
      windowsHide: true,
    })
    if (result.status !== 0) {
      throw new Error(`${script} failed: ${result.stderr || result.stdout || result.status}`)
    }
    process.stdout.write(result.stdout || '')
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main()
