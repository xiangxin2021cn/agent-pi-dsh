import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { test } from 'node:test'

const client = readFileSync(join(dirname(fileURLToPath(import.meta.url)), '../lib/client.js'), 'utf8')

test('desktop settings expose ChatGPT login without treating Codex as a model provider', () => {
  assert.match(client, /function CodexSettingsSection/)
  assert.match(client, /codexAuthStatus/)
  assert.match(client, /codexAuthLogin/)
  assert.match(client, /codexAuthLogout/)
  assert.match(client, /id: 'agent-pi-codex'/)
  assert.match(client, /subagent_codex/)
  assert.match(client, /模型信息暂不可用/)
  assert.match(client, /供应商返回/)
  assert.match(client, /官方参数/)
  assert.match(client, /估算参数/)
  assert.match(client, /Codex 执行/)
  assert.match(client, /run_in_background=false/)
  assert.match(client, /codexAuthStatus\(\)/)
  assert.match(client, /setCodexTurnArmed/)
  assert.match(client, /clearCodexTurnAfterSubmit/)
  assert.doesNotMatch(client, /if \(typeof window\.agentPiDesktop\?\.codexAuthStatus === 'function'\)/)
  assert.doesNotMatch(client, /id: 'codex'/)
  assert.doesNotMatch(client, /OPENAI_API_KEY/)
})
