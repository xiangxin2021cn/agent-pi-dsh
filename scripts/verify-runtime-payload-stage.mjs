import { readdirSync, readFileSync, statSync } from 'node:fs'
import { resolve, join, dirname } from 'node:path'
import { pathToFileURL } from 'node:url'
import { assertUniverPublicReleaseTree } from './univer-public-release.mjs'

const forbiddenNames = new Set(['.git', 'node_modules'])

function verifyDesktopImports(desktop) {
  const pending = [join(desktop, 'main.mjs')]
  const visited = new Set()
  while (pending.length > 0) {
    const file = pending.pop()
    if (visited.has(file)) continue
    visited.add(file)
    if (!statSync(file, { throwIfNoEntry: false })?.isFile()) {
      throw new Error(`runtime payload desktop module missing: ${file}`)
    }
    // Check the desktop shell's local static ESM imports without launching Electron.
    const imports = readFileSync(file, 'utf8').matchAll(/^\s*import\s+(?:[^'";]+?\s+from\s+)?['"](\.[^'"]+)['"]/gm)
    for (const [, specifier] of imports) pending.push(resolve(dirname(file), specifier))
  }
}

export function verifyRuntimePayloadStage(stage) {
  const root = resolve(stage)
  verifyDesktopImports(join(root, 'desktop'))
  assertUniverPublicReleaseTree(join(root, 'product'), { runtime: false })
  const pending = [root]
  while (pending.length > 0) {
    const directory = pending.pop()
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      const path = join(directory, entry.name)
      if (forbiddenNames.has(entry.name)) {
        throw new Error(`runtime payload contains forbidden entry: ${path}`)
      }
      if (entry.isDirectory()) pending.push(path)
    }
  }
  return root
}

export function main(args = process.argv.slice(2)) {
  if (args.length !== 1) throw new Error('Usage: verify-runtime-payload-stage.mjs <stage>')
  const stage = verifyRuntimePayloadStage(args[0])
  process.stdout.write(`runtime payload stage is portable: ${stage}\n`)
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main()
