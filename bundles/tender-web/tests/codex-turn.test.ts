import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'
import { buildCodexTurnDelegation, codexCanRun } from '../src/codex-turn.ts'

const client = readFileSync(join(dirname(fileURLToPath(import.meta.url)), '../lib/client.js'), 'utf8')

test('builds a foreground one-shot delegation without changing the task', () => {
  const task = '修复 C:\\work\\app.ts，并运行测试。'
  const prompt = buildCodexTurnDelegation(task)
  assert.match(prompt, /subagent_codex/)
  assert.match(prompt, /run_in_background=false/)
  assert.match(prompt, /等待 Codex 完成/)
  assert.match(prompt, /核验实际结果/)
  assert.ok(prompt.endsWith(task))
  assert.match(client, /【Codex 执行模式】/)
  assert.match(client, /必须立即调用 subagent_codex/)
  assert.match(client, /等待 Codex 完成，核验实际结果后再向用户汇报/)
})

test('requires an available logged-in runtime', () => {
  assert.equal(codexCanRun({ available: true, state: 'logged-in' }), true)
  assert.equal(codexCanRun({ available: true, state: 'logged-out' }), false)
  assert.equal(codexCanRun({ available: false, state: 'unavailable' }), false)
})
