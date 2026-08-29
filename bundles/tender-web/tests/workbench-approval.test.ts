import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { test } from 'node:test'
import { clientSource } from './client-source.ts'

const client = clientSource

test('workbench renders explicit approval actions and status', () => {
  assert.match(client, /approve_gate/)
  assert.match(client, /reject_gate/)
  assert.match(client, /stage\.approvalGate\.approveLabelZh/)
  assert.match(client, /用户已确认/)
  assert.match(client, /待用户决策/)
})

test('workbench no longer exposes five-report or API-key overlays', () => {
  assert.doesNotMatch(client, /五份深度稿/)
  assert.doesNotMatch(client, /agent-pi-deepseek-key/)
  assert.doesNotMatch(client, /DeepSeekKeyDialog/)
})
