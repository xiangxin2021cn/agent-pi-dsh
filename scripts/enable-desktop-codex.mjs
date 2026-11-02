/** Retire the former product Codex provider/tool without changing DSH sources. */
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
function profileYaml() {
  const dsh = process.env.DSH_CHECKOUT || join(root, 'vendor/deepseek-harness')
  return createRequire(join(dsh, 'packages/settings/settings/package.json'))('yaml')
}
export function retireCodexInText(text, yaml = profileYaml()) {
  if (!text.includes('subagent-codex') && !text.includes('dsh-tender-host/codex-')) return text
  const document = yaml.parseDocument(text, {
    customTags: [{ tag: 'tag:yaml.org,2002:js', resolve: value => value }],
  })
  if (document.errors.length) throw new Error('Cannot migrate invalid Codex profile/preset overlay')
  let changed = false
  const visit = (node) => {
    if (!node || !Array.isArray(node.items)) return
    for (let index = node.items.length - 1; index >= 0; index--) {
      const row = node.items[index]
      const id = row?.get?.('id')
      const name = row?.get?.('name')
      const product = name === 'dsh-tender-host/codex-provider' || name === 'dsh-tender-host/codex-tool'
      const provider = (id === 'subagent-codex' || id === 'agent-pi-subagent-codex')
        && (name === undefined || name === '@deepseek-ai/dsh-subagent-codex' || name === 'dsh-tender-host/codex-provider')
      const tool = id === 'tool-subagent-codex'
        && (name === undefined || name === '@deepseek-ai/dsh-tool-subagent')
      if (product || provider || tool) { node.items.splice(index, 1); changed = true; continue }
      if (row?.value) visit(row.value)
      else visit(row)
      if (row?.get?.('insert')?.items?.length === 0) { node.items.splice(index, 1); changed = true }
    }
  }
  visit(document.contents)
  return changed ? document.toString() : text
}

export function retireCodexInFile(file) {
  if (!existsSync(file)) return false
  const text = readFileSync(file, 'utf8')
  const next = retireCodexInText(text)
  if (next === text) return false
  writeFileSync(file, next)
  return true
}

export function main(args = process.argv.slice(2)) {
  if (args.length === 0) throw new Error('Usage: enable-desktop-codex.mjs <product-preset-file> [...]')
  let changed = 0
  for (const file of args) {
    if (!retireCodexInFile(file)) continue
    changed += 1
  }
  process.stdout.write(`legacy Codex migration: ${changed} file(s) updated; DSH delegates through official OAR\n`)
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main()
