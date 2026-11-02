import assert from 'node:assert/strict'
import { resolve } from 'node:path'
import { test } from 'node:test'
import { Session, SESSION_FORMAT_VERSION } from '../../../vendor/deepseek-harness/packages/core/session/src/index.ts'
import { createSettlementMessage } from '../../../vendor/deepseek-harness/packages/subagent/subagent/src/continuation-messages.ts'
import { createActivationObserver } from '../../../vendor/deepseek-harness/packages/subagent/subagent/src/lifecycle.ts'
import { foldLongTaskExternal, recoverLongTaskExternal, longTaskExternalFence } from '../src/long-task-external.ts'
import type { LongTaskExternalChildren } from '../src/long-task-external.ts'

function fixture() {
  const id = 'original-parent', childId = 'official-codex-child'
  const session = Session.create(id as any, undefined, { version: SESSION_FORMAT_VERSION, id: id as any, createdAt: Date.now(), cwd: resolve('隔离测试/中文工作区'), isSeeded: false })
  const snapshot = () => ({ session: session.header, inheritedEventCount: session.inheritedEventCount, events: Array.from({ length: session.seq }, (_, seq) => session.eventAt(seq as any)!) })
  const catalog = () => session.append('subagent/catalog' as any, { version: 2, mode: 'external', childId, childCreatedAt: Date.now(), label: '隔离官方编写任务' } as any)
  const notice = () => createSettlementMessage(childId as any, { output: [{ type: 'text', text: 'Only a neutral test result.' }], stopReason: 'completed' }, false)
  return { id, childId, session, snapshot, catalog, notice }
}

test('real native lifecycle payload pairs runId and child id under the exact host-scoped parent', () => {
  const parent = { id: 'original-parent' }, childId = 'official-codex-child'
  let children: LongTaskExternalChildren = {}, now = 100
  const observer = createActivationObserver(((type: any, info: any, scopedParent: any) => {
    assert.equal(scopedParent, parent)
    assert.equal('parentSessionId' in info, false, 'native payload does not contain a parent address')
    children = foldLongTaskExternal(children, scopedParent.id, { type, info, observedAt: now })
  }) as any, 'codex-official', childId as any, parent as any)
  observer.start()
  assert.equal(children[childId].provider, 'codex-official')
  assert.ok(children[childId].runId)
  assert.deepEqual(longTaskExternalFence(children, 150), { pending: [childId], unreportedTokens: true, elapsed: [{ id: childId, elapsedMs: 50 }] })
  now = 180
  observer.settle({ output: [], stopReason: 'error' })
  assert.equal(children[childId].stopReason, 'error', 'settlement is not artifact acceptance')
  assert.equal(children[childId].settlement, 'lifecycle')
  assert.deepEqual(longTaskExternalFence(children, 900), { pending: [], unreportedTokens: true, elapsed: [{ id: childId, elapsedMs: 80 }] })
})

test('duplicate lifecycle events stay idempotent while run, provider, parent and terminal conflicts reject', () => {
  const info = { id: 'external', runId: 'activation-1', provider: 'codex', local: false }
  const started = foldLongTaskExternal(undefined, 'parent', { type: 'subagent/start', info, observedAt: 100 })
  assert.deepEqual(foldLongTaskExternal(started, 'parent', { type: 'subagent/start', info, observedAt: 150 }), started)
  const ended = foldLongTaskExternal(started, 'parent', { type: 'subagent/end', info: { ...info, stopReason: 'aborted' }, observedAt: 200 })
  assert.deepEqual(foldLongTaskExternal(ended, 'parent', { type: 'subagent/end', info: { ...info, stopReason: 'aborted' }, observedAt: 500 }), ended)
  assert.equal(started.external.settledAt, undefined, 'folding does not mutate the stored input')
  for (const changed of [{ ...info, runId: 'activation-2' }, { ...info, provider: 'claude-code' }]) assert.throws(() => foldLongTaskExternal(started, 'parent', { type: 'subagent/start', info: changed, observedAt: 200 }), /激活标识或提供方冲突/)
  assert.throws(() => foldLongTaskExternal(started, 'foreign-parent', { type: 'subagent/start', info, observedAt: 200 }), /原父会话归属冲突/)
  assert.throws(() => foldLongTaskExternal(ended, 'parent', { type: 'subagent/end', info: { ...info, stopReason: 'completed' }, observedAt: 200 }), /终态收据冲突/)
})

test('local native children stay with their existing Session accounting and are excluded from this fence', () => {
  const children = {}
  assert.equal(foldLongTaskExternal(children, 'parent', { type: 'subagent/start', info: { id: 'native-child', runId: 'local-activation', provider: 'dsh', local: true }, observedAt: 100 }), children)
  assert.deepEqual(longTaskExternalFence(children, 200), { pending: [], unreportedTokens: false, elapsed: [] })
})

test('restored original parent catalog without a terminal receipt fences an external child even after a parent turn ends', () => {
  const f = fixture()
  f.catalog()
  f.session.append('turn/start', { turn: 1 })
  f.session.append('turn/end', { turn: 1, reason: { kind: 'completed' } })
  const raw = JSON.parse(JSON.stringify(f.snapshot()))
  const restored = Session.fromRestore(f.id as any, raw.events, raw.session, raw.inheritedEventCount, 'detached')
  const snapshot = { session: restored.header, inheritedEventCount: restored.inheritedEventCount, events: Array.from({ length: restored.seq }, (_, seq) => restored.eventAt(seq as any)!) }
  const children = recoverLongTaskExternal(undefined, f.id, snapshot)
  assert.equal(children[f.childId].provider, undefined, 'catalog does not claim a provider or activation identity it never stored')
  assert.equal(children[f.childId].runId, undefined)
  assert.deepEqual(longTaskExternalFence(children, Date.now()).pending, [f.childId])
  assert.equal(children[f.childId].settledAt, undefined)
})

test('real native queued notice proves native settlement after restart before the notice is consumed', () => {
  const f = fixture()
  f.catalog()
  const message = f.notice()
  f.session.append('agent/inbox/spliced', { target: 'next-turn', start: 0, inserted: [message] })
  const snapshot = JSON.parse(JSON.stringify(f.snapshot()))
  const children = recoverLongTaskExternal(undefined, f.id, snapshot)
  const child = children[f.childId]
  assert.equal(child.settlement, 'native-notice')
  assert.equal(child.receiptMessageId, message.id)
  assert.equal(child.stopReason, undefined, 'free prose is not a typed stop reason')
  assert.equal(child.tokens, 'unreported', 'unknown CLI tokens are never recorded as zero')
  assert.deepEqual(longTaskExternalFence(children, Date.now()).pending, [])
  assert.equal(longTaskExternalFence(children, Date.now()).unreportedTokens, true)
})

test('queued and consumed occurrences of one native notice do not restart or extend a settled interval', () => {
  const f = fixture()
  f.catalog()
  const message = f.notice()
  f.session.append('agent/inbox/spliced', { target: 'next-turn', start: 0, inserted: [message] })
  const first = recoverLongTaskExternal(undefined, f.id, f.snapshot())
  f.session.append('turn/start', { turn: 1 })
  f.session.append('agent/inbox/spliced', { target: 'next-turn', start: 0, removedCount: 1, inserted: [] })
  f.session.append('user/message', message, { surfaceOp: 'append' })
  f.session.append('turn/end', { turn: 1, reason: { kind: 'completed' } })
  assert.deepEqual(recoverLongTaskExternal(first, f.id, f.snapshot()), first)
  assert.deepEqual(recoverLongTaskExternal(undefined, f.id, f.snapshot()), first)
})

test('durable notice followed by live end enriches stop reason without double counting an external interval', () => {
  const f = fixture()
  f.catalog()
  f.session.append('agent/inbox/spliced', { target: 'next-turn', start: 0, inserted: [f.notice()] })
  const recovered = recoverLongTaskExternal(undefined, f.id, f.snapshot())
  const end = foldLongTaskExternal(recovered, f.id, { type: 'subagent/end', info: { id: f.childId, runId: 'real-activation', provider: 'codex', local: false, stopReason: 'completed' }, observedAt: Date.now() + 100 })
  assert.equal(end[f.childId].settledAt, recovered[f.childId].settledAt)
  assert.equal(end[f.childId].stopReason, 'completed')
  assert.equal(end[f.childId].settlement, 'lifecycle')
  assert.equal(end[f.childId].tokens, 'unreported')
})

test('foreign, malformed and ordinary user notices cannot clear an owned child fence', () => {
  const f = fixture()
  f.catalog()
  const message = f.notice(), base = f.snapshot()
  for (const changed of [
    { ...message, source: { ...message.source, senderSessionId: 'unowned-child' } },
    { ...message, source: { ...message.source, form: 'instructions' } },
    { ...message, source: { kind: 'user', form: 'notice' } },
    { ...message, role: 'assistant' },
  ]) {
    const children = recoverLongTaskExternal(undefined, f.id, { ...base, events: [...base.events, { type: 'user/message', seq: base.events.length, time: Date.now(), data: changed }] })
    assert.deepEqual(longTaskExternalFence(children, Date.now()).pending, [f.childId])
  }
  assert.throws(() => recoverLongTaskExternal(undefined, 'another-parent', base), /原父会话日志/)
  const unowned = recoverLongTaskExternal(undefined, f.id, { ...base, events: [{ type: 'user/message', seq: 0, time: Date.now(), data: message }] })
  assert.deepEqual(unowned, {})
})

test('inherited and pre-attempt catalogs or notices do not become a new attempt child', () => {
  const f = fixture()
  f.catalog()
  f.session.append('agent/inbox/spliced', { target: 'next-turn', start: 0, inserted: [f.notice()] })
  const snapshot = f.snapshot()
  assert.deepEqual(recoverLongTaskExternal(undefined, f.id, snapshot, snapshot.events.length), {})
  assert.deepEqual(recoverLongTaskExternal(undefined, f.id, { ...snapshot, inheritedEventCount: snapshot.events.length }), {})
  const onlyNotice = recoverLongTaskExternal(undefined, f.id, snapshot, 1)
  assert.deepEqual(onlyNotice, {}, 'a later notice cannot claim an old catalog for a fresh attempt')
})

test('missing start timestamps remain unknown and concurrent worker wall intervals are reported separately', () => {
  const info = { id: 'external-a', runId: 'activation-a', provider: 'codex', local: false }
  const ended = foldLongTaskExternal(undefined, 'parent', { type: 'subagent/end', info: { ...info, stopReason: 'aborted' }, observedAt: 200 })
  assert.deepEqual(longTaskExternalFence(ended, 500).elapsed, [{ id: 'external-a' }])
  const a = foldLongTaskExternal(undefined, 'parent', { type: 'subagent/start', info, observedAt: 100 })
  const both = foldLongTaskExternal(a, 'parent', { type: 'subagent/start', info: { ...info, id: 'external-b', runId: 'activation-b' }, observedAt: 150 })
  assert.deepEqual(longTaskExternalFence(both, 300).elapsed, [{ id: 'external-a', elapsedMs: 200 }, { id: 'external-b', elapsedMs: 150 }])
  assert.throws(() => longTaskExternalFence(both, NaN), /观察时间无效/)
})
