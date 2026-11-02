import assert from 'node:assert/strict'
import { resolve } from 'node:path'
import { test } from 'node:test'
import { createUserMessage } from '../../../vendor/deepseek-harness/packages/llm/llm/src/message.ts'
import { Session, SESSION_FORMAT_VERSION } from '../../../vendor/deepseek-harness/packages/core/session/src/index.ts'
import { inspectLongTaskDispatchReceipt } from '../src/long-task-dispatch.ts'

function fixture() {
  const cwd = resolve('隔离恢复项目'), id = 'original-main'
  const message = createUserMessage({ content: [{ type: 'text', text: '核对既有成果，然后仅完成当前阶段。\n保留人工修正。' }], source: { kind: 'plugin:tender-host', form: 'instructions' } })
  const session = Session.create(id as any, undefined, { version: SESSION_FORMAT_VERSION, id: id as any, createdAt: Date.now(), cwd, isSeeded: false })
  const attempt = { sessionId: id, messageId: message.id, draft: message.content[0].text }
  const snapshot = () => ({ session: session.header, inheritedEventCount: session.inheritedEventCount, events: Array.from({ length: session.seq }, (_, seq) => session.eventAt(seq as any)!) })
  return { cwd, id, message, session, attempt, snapshot }
}

test('durable native inbox and consumed user messages identify the original dispatch without replaying it', () => {
  const f = fixture()
  assert.deepEqual(inspectLongTaskDispatchReceipt(f.cwd, f.id, f.attempt, f.snapshot()), { state: 'unknown' })
  f.session.append('agent/inbox/spliced', { target: 'next-turn', start: 0, inserted: [f.message] })
  assert.deepEqual(inspectLongTaskDispatchReceipt(f.cwd, f.id, f.attempt, f.snapshot()), { state: 'found', messageId: f.message.id })
  f.session.append('turn/start', { turn: 1 })
  f.session.append('agent/inbox/spliced', { target: 'next-turn', start: 0, removedCount: 1, inserted: [] })
  f.session.append('user/message', f.message, { surfaceOp: 'append' })
  const before = f.session.seq
  assert.deepEqual(inspectLongTaskDispatchReceipt(f.cwd, f.id, f.attempt, f.snapshot()), { state: 'found', messageId: f.message.id })
  assert.equal(f.session.seq, before, 'checking a receipt does not enqueue or append any native event')
})

test('a restored JSON snapshot preserves receipt identity independently of event metadata and object key order', () => {
  const f = fixture()
  f.session.append('agent/inbox/spliced', { target: 'next-turn', start: 0, inserted: [f.message] })
  const restored = JSON.parse(JSON.stringify(f.snapshot()))
  const message = restored.events[0].data.inserted[0]
  message.source = { form: message.source.form, kind: message.source.kind }
  restored.events[0].time += 1
  assert.deepEqual(inspectLongTaskDispatchReceipt(f.cwd, f.id, f.attempt, restored), { state: 'found', messageId: f.message.id })
})

test('another session, workspace or subagent cannot confirm an original root dispatch', () => {
  const f = fixture(), snapshot = f.snapshot()
  for (const session of [{ ...snapshot.session, id: 'other' }, { ...snapshot.session, cwd: resolve('其他项目') }, { ...snapshot.session, origin: 'subagent' }]) {
    assert.throws(() => inspectLongTaskDispatchReceipt(f.cwd, f.id, f.attempt, { ...snapshot, session }), /主会话或工作区不匹配/)
  }
  assert.throws(() => inspectLongTaskDispatchReceipt(f.cwd, f.id, { ...f.attempt, sessionId: 'other' }, snapshot), /主会话或工作区不匹配/)
})

test('a matching id with changed draft, role, source or hidden extra content is a conflict, never delivery success', () => {
  const f = fixture()
  const original = JSON.parse(JSON.stringify(f.message))
  const messages = [
    { ...original, role: 'assistant' },
    { ...original, content: [{ type: 'text', text: f.attempt.draft + '追加指令' }] },
    { ...original, content: [...original.content, { type: 'image', imageId: 'hidden-attachment' }] },
    { ...original, content: [{ ...original.content[0], extra: 'unrecorded payload' }] },
    { ...original, source: { kind: 'user', form: 'instructions' } },
    { ...original, source: { kind: 'plugin:tender-host', form: 'context' } },
    { ...original, source: { ...original.source, principal: 'unrecorded-principal' } },
  ]
  for (const message of messages) {
    const snapshot = { ...f.snapshot(), events: [{ seq: 0, type: 'agent/inbox/spliced', data: { inserted: [message] } }] }
    assert.throws(() => inspectLongTaskDispatchReceipt(f.cwd, f.id, f.attempt, snapshot), /内容或来源冲突/)
  }
})

test('a later conflicting occurrence is not hidden by the first matching native receipt', () => {
  const f = fixture()
  const snapshot = { ...f.snapshot(), events: [
    { seq: 0, type: 'agent/inbox/spliced', data: { inserted: [f.message] } },
    { seq: 1, type: 'user/message', data: { ...f.message, content: [{ type: 'text', text: 'Changed after enqueue' }] } },
  ] }
  assert.throws(() => inspectLongTaskDispatchReceipt(f.cwd, f.id, f.attempt, snapshot), /内容或来源冲突/)
})

test('inherited or unrelated messages, unknown event bodies and an absent intent remain unknown', () => {
  const f = fixture()
  const snapshot = { ...f.snapshot(), inheritedEventCount: 1, events: [
    { seq: 0, type: 'user/message', data: f.message },
    { seq: 1, type: 'user/message', data: { ...f.message, id: 'another-message' } },
    { seq: 2, type: 'agent/inbox/spliced', data: null },
    { seq: 3, type: 'assistant/message', data: f.message },
  ] }
  assert.deepEqual(inspectLongTaskDispatchReceipt(f.cwd, f.id, f.attempt, snapshot), { state: 'unknown' })
  assert.deepEqual(inspectLongTaskDispatchReceipt(f.cwd, f.id, { ...f.attempt, messageId: undefined }, snapshot), { state: 'unknown' })
})
