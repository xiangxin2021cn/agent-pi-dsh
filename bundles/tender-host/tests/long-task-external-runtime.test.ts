import assert from 'node:assert/strict'
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { test } from 'node:test'
import { createBusinessProject } from '../../../packages/business-projects/index.ts'
import { projectDir } from '../src/fsutil.ts'
import { bindProjectSession, dispatchFingerprint, loadBoard, saveBoard } from '../src/orchestration.ts'
import { officialStageDir } from '../src/outputs.ts'
import { longTaskStatus, markLongTaskDispatched, markLongTaskDispatchIntent, markLongTaskExternalEffect, pauseLongTask, reconcileLongTask, recordLongTaskExternal, recoverLongTaskExternalAttempt, recordLongTaskUsage, registerLongTaskChild, settleLongTaskAttempt, startLongTask } from '../src/long-task-runtime.ts'

function fixture(t: any) {
  const cwd = mkdtempSync(join(tmpdir(), 'ap-external-runtime-'))
  t.after(() => { assert.equal(dirname(resolve(cwd)), resolve(tmpdir())); assert.match(cwd, /ap-external-runtime-/); rmSync(cwd, { recursive: true, force: true }) })
  const source = join(cwd, 'source.txt'); writeFileSync(source, 'Neutral registered source\n')
  const project = createBusinessProject({ workspaceRootPath: cwd, module: 'delivery', projectId: 'external', name: 'External fixture', rootPath: cwd, createDirectory: false, inputPaths: [source], workflowId: 'delivery-main', workflowSnapshot: { id: 'delivery-main', module: 'delivery', label: 'External fixture', labelZh: '外部子任务接续测试', stages: [{ id: 'first', label: 'First', labelZh: '当前阶段', prompt: 'Only current declared output', skillSlugs: [], consumes: [] }] } })
  bindProjectSession(cwd, project, 'main', 'first')
  const output = join(officialStageDir(cwd, project.projectId, 'first'), 'one.md'); mkdirSync(dirname(output), { recursive: true })
  saveBoard(cwd, { schemaVersion: 2, projectId: project.projectId, module: project.module, currentStageId: 'first', stages: { first: { stageId: 'first', status: 'running', tasks: [{ id: 'one', title: 'Actual output', status: 'queued', markdownPath: output }], updatedAt: new Date().toISOString() } }, updatedAt: new Date().toISOString() })
  const key = dispatchFingerprint(loadBoard(cwd, project.projectId, project.module).stages.first!)
  const start = () => startLongTask(cwd, project, { sessionId: 'main', stageId: 'first', key, draft: 'Only current stage output' })
  const attempt = start().attempt!
  markLongTaskDispatchIntent(cwd, project, { sessionId: 'main', attemptId: attempt.id, key, messageId: 'native-parent-message' })
  markLongTaskDispatched(cwd, project, { sessionId: 'main', attemptId: attempt.id, key, messageId: 'native-parent-message' })
  const record = (childId: string, event: 'subagent/start' | 'subagent/end', at: number, stopReason = 'completed', parentSessionId = 'main') => recordLongTaskExternal(cwd, project, { sessionId: 'main', attemptId: attempt.id, parentSessionId, event: event === 'subagent/start' ? { type: event, info: { id: childId, runId: 'activation-' + childId, provider: 'codex', local: false }, observedAt: at } : { type: event, info: { id: childId, runId: 'activation-' + childId, provider: 'codex', local: false, stopReason }, observedAt: at } })
  const settle = () => settleLongTaskAttempt(cwd, project, { sessionId: 'main', attemptId: attempt.id })
  const reconcile = () => reconcileLongTask(cwd, project, { sessionId: 'main', parentState: 'idle' })
  const status = () => longTaskStatus(cwd, project, 'main')
  const path = join(projectDir(cwd, project.module, project.projectId), 'orchestration', 'long-task-runtime.json')
  return { cwd, project, output, path, attempt, start, record, settle, reconcile, status }
}

test('parallel external children fence idle-parent continuation until each true terminal, with separate unreported usage', t => {
  const f = fixture(t), at = Date.now()
  f.record('a', 'subagent/start', at); f.record('b', 'subagent/start', at + 10)
  recordLongTaskUsage(f.cwd, f.project, { sessionId: 'main', sourceSessionId: 'main', eventId: 'known-parent-step', usage: { inputTokens: 10, outputTokens: 5 }, elapsedMs: 17 })
  f.settle()
  const waiting = f.reconcile()
  assert.equal(waiting.phase, 'waiting'); assert.deepEqual(waiting.external!.pending, ['a', 'b'])
  assert.equal(waiting.external!.unreportedTokens, true)
  assert.equal(waiting.run!.usage.tokens, 15); assert.equal(waiting.run!.usage.unknownTokens, false)
  assert.throws(() => f.start(), /外部子任务/)
  f.record('a', 'subagent/end', at + 50)
  assert.deepEqual(f.reconcile().external!.pending, ['b'])
  f.record('b', 'subagent/end', at + 60)
  const next = f.reconcile()
  assert.equal(next.phase, 'ready'); assert.notEqual(next.attempt!.id, f.attempt.id)
  assert.deepEqual(next.external!.elapsed, [{ id: 'a', elapsedMs: 50 }, { id: 'b', elapsedMs: 50 }])
  assert.equal(next.run!.usage.elapsedMs, 17, 'overlapping external wall time is not summed into model execution time')
  assert.equal(next.run!.usage.rounds, 1); assert.equal(next.run!.limits.maxRounds, 64); assert.equal(next.run!.limits.maxTokens, 500000)
  assert.equal(next.run!.limits.maxCostUsd, undefined)
  assert.notEqual(loadBoard(f.cwd, f.project.projectId, f.project.module).stages.first!.status, 'done')
})

for (const reason of ['error', 'aborted']) test(`a real external ${reason} pauses until explicit continuation, without accepting its draft or resetting receipts`, t => {
  const f = fixture(t), at = Date.now()
  f.record('a', 'subagent/start', at); f.settle(); f.record('a', 'subagent/end', at + 30, reason)
  assert.equal(f.reconcile().phase, 'paused')
  const before = f.status().run!
  pauseLongTask(f.cwd, f.project, 'main', false)
  const next = f.reconcile()
  assert.equal(next.phase, 'ready'); assert.deepEqual(next.external!.failed, ['a']); assert.deepEqual(next.external!.needsReview, [])
  assert.deepEqual(next.run!.usage, before.usage); assert.deepEqual(next.run!.usageReceipts, before.usageReceipts)
  f.record('a', 'subagent/end', at + 100, reason)
  assert.equal(f.status().run!.paused, false, 'duplicate old failure receipts do not undo a deliberate resume')
  assert.equal(f.status().run!.attempts[0]!.externalChildren!.a.stopReason, reason)
  assert.equal(loadBoard(f.cwd, f.project.projectId, f.project.module).stages.first!.tasks[0]!.status, 'queued')
})

test('replayed external catalogs survive restart as pending; parent idle and a generic resume cannot complete them', t => {
  const f = fixture(t), now = Date.now()
  const snapshot = { session: { id: 'main' }, events: [{ type: 'subagent/catalog', seq: 10, time: now, data: { version: 2, mode: 'external', childId: 'oar-child', childCreatedAt: now } }] }
  recoverLongTaskExternalAttempt(f.cwd, f.project, { sessionId: 'main', attemptId: f.attempt.id, parentSessionId: 'main', snapshot })
  f.settle()
  for (let index = 0; index < 3; index++) {
    const state = f.reconcile()
    assert.equal(state.phase, 'waiting'); assert.deepEqual(state.external!.pending, ['oar-child'])
    assert.equal(state.run!.attempts.length, 1); assert.equal(state.run!.usage.unknownTokens, false)
  }
  pauseLongTask(f.cwd, f.project, 'main'); assert.equal(f.reconcile().phase, 'paused')
  pauseLongTask(f.cwd, f.project, 'main', false)
  assert.equal(f.reconcile().phase, 'waiting')
  assert.throws(() => f.start(), /外部子任务/)
})

test('external recovery excludes pre-attempt catalogs and rejects invalid replay boundaries', t => {
  const f = fixture(t), time = Date.parse(f.attempt.createdAt)
  const snapshot = { session: { id: 'main' }, events: [{ type: 'subagent/catalog', seq: 10, time: time - 1, data: { version: 2, mode: 'external', childId: 'previous-attempt-child', childCreatedAt: time - 1 } }] }
  const input = { sessionId: 'main', attemptId: f.attempt.id, parentSessionId: 'main', snapshot }
  const restored = recoverLongTaskExternalAttempt(f.cwd, f.project, input)
  assert.equal(restored.external, undefined)
  const before = readFileSync(f.path, 'utf8')
  for (const fromSeq of [-1, NaN, 0.5]) assert.throws(() => recoverLongTaskExternalAttempt(f.cwd, f.project, { ...input, fromSeq }), /恢复起点无效/)
  assert.equal(readFileSync(f.path, 'utf8'), before)
})

test('a durable untyped native notice remains review-only until actual typed settlement arrives', t => {
  const f = fixture(t), now = Date.now()
  const snapshot = { session: { id: 'main' }, events: [
    { type: 'subagent/catalog', seq: 10, time: now, data: { version: 2, mode: 'external', childId: 'a', childCreatedAt: now } },
    { type: 'agent/inbox/spliced', seq: 11, time: now + 20, data: { inserted: [{ id: 'native-settlement', role: 'user', content: [{ type: 'text', text: 'completed' }], source: { kind: 'subagent-settled', form: 'notice', senderSessionId: 'a' } }] } },
  ] }
  recoverLongTaskExternalAttempt(f.cwd, f.project, { sessionId: 'main', attemptId: f.attempt.id, parentSessionId: 'main', snapshot })
  f.settle(); const review = f.reconcile()
  assert.equal(review.phase, 'needs_review'); assert.deepEqual(review.external!.needsReview, ['a'])
  pauseLongTask(f.cwd, f.project, 'main', false)
  assert.equal(f.reconcile().phase, 'needs_review')
  assert.throws(() => f.start(), /终态尚待核对/)
  f.record('a', 'subagent/end', now + 30)
  assert.equal(f.reconcile().phase, 'ready')
  assert.equal(f.status().run!.attempts[0]!.externalChildren!.a.receiptMessageId, 'native-settlement')
})

test('external receipts belong to the root or a registered native child; malformed or conflicting updates never corrupt the ledger', t => {
  const f = fixture(t), now = Date.now()
  registerLongTaskChild(f.cwd, f.project, { sessionId: 'main', attemptId: f.attempt.id, childSessionId: 'native-child', expectedPaths: [] })
  f.record('official-child', 'subagent/start', now, 'completed', 'native-child')
  const before = readFileSync(f.path, 'utf8')
  assert.throws(() => f.record('foreign', 'subagent/start', now, 'completed', 'unrelated-parent'), /父会话或原生子会话/)
  assert.throws(() => f.record('native-child', 'subagent/start', now), /归属无效/)
  assert.throws(() => f.record('official-child', 'subagent/end', now - 1, 'completed', 'native-child'), /收据不能核验/)
  assert.throws(() => f.record('official-child', 'subagent/end', now + 10, 'made-up-status', 'native-child'), /收据不能核验/)
  assert.equal(readFileSync(f.path, 'utf8'), before)
  assert.equal(f.status().attempt!.externalChildren!['official-child'].parentSessionId, 'native-child')
})

test('stored external identity, ownership, timestamps and terminal state are validated before restoration', t => {
  const f = fixture(t), now = Date.now(); f.record('a', 'subagent/start', now)
  const baseline = JSON.parse(readFileSync(f.path, 'utf8'))
  for (const patch of [
    { id: 'wrong' }, { parentSessionId: 'foreign' }, { tokens: 0 }, { provider: undefined }, { startedAt: 'unknown' },
    { settledAt: now - 1, settlement: 'lifecycle', stopReason: 'completed' },
    { settledAt: now + 1, settlement: 'lifecycle' },
    { settledAt: now + 1, settlement: 'native-notice' },
    { settledAt: now + 1, settlement: 'invented', stopReason: 'completed' },
  ]) {
    const changed = structuredClone(baseline); Object.assign(changed.runs.main.attempts[0].externalChildren.a, patch)
    const content = JSON.stringify(changed); writeFileSync(f.path, content)
    assert.throws(() => f.status(), /账本格式或项目归属无效/)
    assert.equal(readFileSync(f.path, 'utf8'), content, 'malformed records are not silently replaced by an empty ledger')
  }
  writeFileSync(f.path, JSON.stringify(baseline))
})

test('unknown local side effects and user pause keep their priority over external child completion', t => {
  const f = fixture(t), now = Date.now(); f.record('a', 'subagent/start', now); f.settle()
  markLongTaskExternalEffect(f.cwd, f.project, { sessionId: 'main', attemptId: f.attempt.id, unknown: true })
  assert.equal(f.reconcile().phase, 'needs_review'); assert.match(f.reconcile().reason, /外部或工具操作结果未知/)
  pauseLongTask(f.cwd, f.project, 'main'); f.record('a', 'subagent/end', now + 20)
  assert.equal(f.reconcile().phase, 'paused')
  pauseLongTask(f.cwd, f.project, 'main', false)
  assert.equal(f.reconcile().phase, 'needs_review')
})
