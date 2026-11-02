import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { test } from 'node:test'
import { retireCodexInText, main } from './enable-desktop-codex.mjs'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')

test('retires only the legacy Codex tool row and is idempotent', () => {
  const source = `plugins:\n  group:\n    - id: tool-subagent-codex\n      name: '@deepseek-ai/dsh-tool-subagent'\n      disabled: true\n      config:\n        provider: codex\n    - id: tool-subagent-claude-code\n      name: '@deepseek-ai/dsh-tool-subagent'\n      disabled: true\n`
  const once = retireCodexInText(source)
  assert.doesNotMatch(once, /tool-subagent-codex|dsh-tender-host\/codex-/)
  assert.match(once, /tool-subagent-claude-code[\s\S]*?disabled: true/)
  assert.equal(retireCodexInText(once), once)
})

test('a product provider inside an insert retires without removing unrelated settings', () => {
  const source = `- insert:\n    - id: agent-pi-subagent-codex\n      name: dsh-tender-host/codex-provider\n    - id: custom-plugin\n      name: user-plugin\n- id: subagent-codex\n  config:\n    permissionMode: approve-for-me\n`
  const once = retireCodexInText(source)
  assert.doesNotMatch(once, /subagent-codex|codex-provider|approve-for-me/)
  assert.match(once, /custom-plugin[\s\S]*user-plugin/)
  assert.equal(retireCodexInText(once), once)
  const unrelated = '- id: tool-subagent-codex\n  name: user-custom-tool\n'
  assert.equal(retireCodexInText(unrelated), unrelated)
})

test('malformed legacy YAML fails closed and standalone migration requires explicit files', () => {
  assert.throws(() => retireCodexInText('- id: subagent-codex\n  config: [unterminated'), /invalid/)
  assert.throws(() => main([]), /Usage/)
})

test('mainline provider defaults and host registration do not load custom Codex bridges or its extra CLI dependency', () => {
  const init = readFileSync(join(root, 'scripts/init-tender-profile.mjs'), 'utf8')
  const pack = readFileSync(join(root, 'scripts/pack-win.ps1'), 'utf8')
  const overlays = readFileSync(join(root, 'scripts/apply-runtime-overlays.mjs'), 'utf8')
  const verify = readFileSync(join(root, 'scripts/verify-profile.ps1'), 'utf8')
  const hostPackage = JSON.parse(readFileSync(join(root, 'bundles/tender-host/package.json'), 'utf8'))
  const lock = JSON.parse(readFileSync(join(root, 'bundles/tender-host/package-lock.json'), 'utf8'))
  const host = readFileSync(join(root, 'bundles/tender-host/src/index.ts'), 'utf8')
  assert.match(init, /@deepseek-ai\/dsh-experimental-subagent-oar/)
  assert.match(init, /@deepseek-ai\/dsh-experimental-tool-subagent-oar/)
  assert.doesNotMatch(init, /wireCodexRuntimeDeps|name: dsh-tender-host\/codex-/)
  assert.match(init, /enable-desktop-codex\.mjs/)
  assert.match(pack, /apply-runtime-overlays\.mjs/)
  assert.match(overlays, /enable-desktop-codex\.mjs/)
  assert.match(verify, /@deepseek-ai\/dsh-experimental-subagent-oar/)
  assert.equal(hostPackage.dependencies['@openai/codex'], undefined)
  assert.equal(hostPackage.exports['./codex-provider'], undefined)
  assert.equal(hostPackage.exports['./codex-tool'], undefined)
  assert.ok(Object.keys(lock.packages).every(path => !path.startsWith('node_modules/@openai/codex')))
  assert.doesNotMatch(host, /attachCodexToolBridge|codex-tool-bridge/)
})
