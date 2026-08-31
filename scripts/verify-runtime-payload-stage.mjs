import { readdirSync } from 'node:fs'
import { resolve, join } from 'node:path'
import { pathToFileURL } from 'node:url'

const forbiddenNames = new Set(['.git', 'node_modules'])

export function verifyRuntimePayloadStage(stage) {
  const root = resolve(stage)
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
