/**
 * Desktop workbench overlay: turn `web_fetch` on in shipped agent presets.
 *
 * Stock DSH keeps `tool-web.fetch: false` (no SSRF guard on the HTTP
 * provider). The model then falls back to bash curl and invents a Chrome
 * CDP story. Windows file sandbox does not block network. This script
 * flips only the `tool-web` fetch flag in known composition files.
 *
 * Host-plane `web-fetch-http` is wired separately by init-tender-profile.
 */
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')

const BROKEN_TOOL_WEB = /(# The `web` service and its search provider stay in the host composition; only\r?\n# the model-facing tool is per-session\.)\r?\ntrue\r?\n([ \t]+searchTimeoutMs:)/
const TOOL_WEB_BLOCK = `$1
- id: tool-web
  name: '@deepseek-ai/dsh-tool-web'
  config:
    fetch: true
$2`
const FETCH_OFF = /(- id: tool-web\r?\n  name: '@deepseek-ai\/dsh-tool-web'\r?\n  config:\r?\n    fetch: )false/

function enableInFile(file) {
  if (!existsSync(file)) return false
  const text = readFileSync(file, 'utf8')
  const repaired = text.replace(BROKEN_TOOL_WEB, TOOL_WEB_BLOCK)
  const next = repaired.replace(FETCH_OFF, '$1true')
  if (next === text) return false
  writeFileSync(file, next)
  return true
}

function presetFiles(dshRoot) {
  return ['standard', 'code', 'cordis'].map((id) => (
    join(dshRoot, 'apps/cli/config/agent-presets', id, 'agent.cordis.yml')
  ))
}

const targets = process.argv.slice(2)
const files = targets.length > 0
  ? targets
  : [
      ...presetFiles(process.env.DSH_CHECKOUT || join(root, 'vendor/deepseek-harness')),
      join(root, 'vendor/dsh-router-standard/preset/agent.cordis.yml'),
    ]

let changed = 0
for (const file of files) {
  if (enableInFile(file)) {
    changed += 1
    process.stdout.write(`enabled tool-web fetch in ${file}\n`)
  }
}
process.stdout.write(`desktop web_fetch overlay: ${changed} file(s) updated\n`)
