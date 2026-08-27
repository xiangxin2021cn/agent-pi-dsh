/** Enable the optional Codex product-subagent tool in selected agent presets. */
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const DISABLED_CODEX_TOOL = /(^[ \t]*- id:\s*tool-subagent-codex\s*\r?\n^[ \t]+name:\s*['"]?@deepseek-ai\/dsh-tool-subagent['"]?\s*\r?\n)^[ \t]+disabled:\s*true\s*\r?\n/gm

export function enableCodexInText(text) {
  return text.replace(DISABLED_CODEX_TOOL, '$1')
}

export function enableCodexInFile(file) {
  if (!existsSync(file)) return false
  const text = readFileSync(file, 'utf8')
  const next = enableCodexInText(text)
  if (next === text) return false
  writeFileSync(file, next)
  return true
}

function presetFiles(dshRoot) {
  return ['standard', 'code', 'cordis'].map((id) => (
    join(dshRoot, 'apps/cli/config/agent-presets', id, 'agent.cordis.yml')
  ))
}

export function main(args = process.argv.slice(2)) {
  const files = args.length > 0
    ? args
    : [
        ...presetFiles(process.env.DSH_CHECKOUT || join(root, 'vendor/deepseek-harness')),
        join(root, 'vendor/dsh-router-standard/preset/agent.cordis.yml'),
      ]
  let changed = 0
  for (const file of files) {
    if (!enableCodexInFile(file)) continue
    changed += 1
    process.stdout.write(`enabled Codex subagent in ${file}\n`)
  }
  process.stdout.write(`desktop Codex overlay: ${changed} file(s) updated\n`)
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main()
