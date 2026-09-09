import assert from 'node:assert/strict'
import { test } from 'node:test'
import { taskProcessSummary } from '../src/client/task-process.js'

test('process language follows human input and ignores tool or plugin text', () => {
  const snapshot = { running: true, chat: { legacy: { nodes: [
    { kind: 'user', source: { kind: 'user' }, content: [{ type: 'text', text: '请核对施工方案' }] },
    { kind: 'user', source: { kind: 'plugin' }, content: [{ type: 'text', text: 'Internal English information' }] },
  ], runningCalls: [{ name: 'read' }] } } }
  assert.deepEqual(taskProcessSummary(snapshot), { language: 'zh', text: '正在阅读任务资料' })
  snapshot.chat.legacy.nodes[0].content[0].text = 'Review the execution plan'
  assert.deepEqual(taskProcessSummary(snapshot), { language: 'en', text: 'Reading task materials' })
})

test('generic activity never fabricates completion or a specific task result', () => {
  const snapshot = { running: true, chat: { legacy: { nodes: [], runningCalls: [{ name: 'pwsh', argsRaw: '{"command":"echo done"}' }] } } }
  assert.equal(taskProcessSummary(snapshot).text, '正在处理本次任务')
  snapshot.running = false
  assert.equal(taskProcessSummary(snapshot).text, '')
})
