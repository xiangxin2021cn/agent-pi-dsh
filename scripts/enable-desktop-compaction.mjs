/** Configure Agent Pi automatic compaction in alpha.1 per-session presets. */
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const COMPACTION_BASIC_ROW = /(^    - id:\s*compaction-basic[ \t]*\r?\n)      name:\s*['"]?(?:@deepseek-ai\/dsh-compaction-basic|dsh-agent-pi-compaction)['"]?[ \t]*\r?\n(?:\r?\n)*(?:      config:\r?\n(?: {8,}.*\r?\n)*)?(?:\r?\n)*/gm

export function configureCompactionInText(text, { fallbackEnabled = true } = {}) {
  const newline = text.includes('\r\n') ? '\r\n' : '\n'
  const fallback = fallbackEnabled
    ? [
        '        summarizationFallbacks:',
        '          - provider: deepseek-official',
        '            model: deepseek-v4-flash-vision-exp',
        '            maxTokens: 32768',
      ]
    : []
  const config = [
    '      config:',
    '        thresholdRatio: 0.72',
    ...fallback,
    '',
    '',
  ].join(newline)
  return text.replace(COMPACTION_BASIC_ROW, `$1      name: 'dsh-agent-pi-compaction'${newline}${config}`)
}

export function configureCompactionInFile(file, options) {
  if (!existsSync(file)) return false
  const text = readFileSync(file, 'utf8')
  const next = configureCompactionInText(text, options)
  if (next === text) return false
  writeFileSync(file, next)
  return true
}

function presetFiles(dshRoot) {
  return ['standard', 'ptc', 'cordis'].map((id) => (
    join(dshRoot, 'packages/preset/agent-presets/presets', id, 'agent.cordis.yml')
  ))
}

export function main(args = process.argv.slice(2)) {
  const fallbackEnabled = !args.includes('--no-fallback')
  const targets = args.filter(arg => arg !== '--no-fallback')
  const files = targets.length > 0
    ? targets
    : [
        ...presetFiles(process.env.DSH_CHECKOUT || join(root, 'vendor/deepseek-harness')),
        join(root, 'vendor/dsh-router-standard/preset/agent.cordis.yml'),
      ]
  let changed = 0
  for (const file of files) {
    if (!configureCompactionInFile(file, { fallbackEnabled })) continue
    changed += 1
    process.stdout.write(`configured per-session compaction in ${file}\n`)
  }
  process.stdout.write(`desktop compaction overlay: ${changed} file(s) updated\n`)
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main()
