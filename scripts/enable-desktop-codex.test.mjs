import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { test } from 'node:test'
import { enableCodexInText } from './enable-desktop-codex.mjs'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')

test('enables only the Codex product tool row and is idempotent', () => {
  const source = `plugins:\n  group:\n    - id: tool-subagent-codex\n      name: '@deepseek-ai/dsh-tool-subagent'\n      disabled: true\n      config:\n        provider: codex\n    - id: tool-subagent-claude-code\n      name: '@deepseek-ai/dsh-tool-subagent'\n      disabled: true\n`
  const once = enableCodexInText(source)
  assert.doesNotMatch(once, /tool-subagent-codex[\s\S]*?disabled: true[\s\S]*?provider: codex/)
  assert.match(once, /tool-subagent-claude-code[\s\S]*?disabled: true/)
  assert.equal(enableCodexInText(once), once)
})

test('tender profile installs the provider and packaging enables the Codex tool', () => {
  const init = readFileSync(join(root, 'scripts/init-tender-profile.mjs'), 'utf8')
  const pack = readFileSync(join(root, 'scripts/pack-win.ps1'), 'utf8')
  const verify = readFileSync(join(root, 'scripts/verify-profile.ps1'), 'utf8')
  const desktopPackage = readFileSync(join(root, 'apps/desktop/package.json'), 'utf8')
  const runtimePayload = readFileSync(join(root, 'scripts/pack-runtime-payload.mjs'), 'utf8')
  assert.match(init, /@deepseek-ai\/dsh-subagent-codex/)
  assert.match(init, /function wireCodexRuntimeDeps/)
  assert.match(init, /node_modules', '\.pnpm'/)
  assert.match(init, /permissionMode: approve-for-me/)
  assert.match(init, /enable-desktop-codex\.mjs/)
  assert.match(pack, /enable-desktop-codex\.mjs/)
  assert.match(verify, /@deepseek-ai\/dsh-subagent-codex/)
  assert.match(verify, /tool-subagent-codex/)
  assert.match(desktopPackage, /codex-auth\.mjs/)
  assert.match(runtimePayload, /'codex-auth\.mjs'/)
})
