import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { test } from 'node:test'
import { createBusinessProject, updateBusinessProjectInputs } from '../../../packages/business-projects/index.ts'
import { bindProjectSession, dispatchFingerprint, loadBoard, saveBoard } from '../src/orchestration.ts'
import { officialStageDir } from '../src/outputs.ts'
import {
  listLongTasks, longTaskInputFingerprint, longTaskStatus, markLongTaskDispatched, markLongTaskDispatchIntent, markLongTaskExternalEffect,
  pauseLongTask, reconcileLongTask, recordLongTaskUsage, registerLongTaskChild, settleLongTaskAttempt,
  settleLongTaskChild, startLongTask, submitLongTaskChild,
} from '../src/long-task-runtime.ts'

function fixture(t: { after(fn: () => void): unknown }, approval = false) {
  const cwd = mkdtempSync(join(tmpdir(), 'ap-long-task-'))
  t.after(() => rmSync(cwd, { recursive: true, force: true }))
  const source = join(cwd, 'source.txt'); writeFileSync(source, 'Original user source\n'.repeat(10))
  const project = createBusinessProject({ workspaceRootPath: cwd, module: 'delivery', projectId: 'long', name: 'Long delivery', rootPath: cwd, createDirectory: false, workflowId: 'delivery-main', inputPaths: [source], workflowSnapshot: {
    id: 'delivery-main', module: 'delivery', label: 'Test delivery', labelZh: '测试交付', stages: [
      { id: 'first', label: 'First', labelZh: '当前阶段', prompt: 'Complete only current declared outputs.', skillSlugs: [], consumes: [], ...(approval ? { summaryDeliverable: { fileName: 'one.md', outlineZh: ['Facts'] }, approvalGate: { promptZh: '确认当前成果', approveLabelZh: '确认冻结' } } : {}) },
      { id: 'later', label: 'Later', labelZh: '后序阶段', prompt: 'Later work', skillSlugs: [], consumes: [{ kind: 'handoff', stageId: 'first' }] },
    ],
  } })
  bindProjectSession(cwd, project, 'main', 'first')
  const paths = ['one', 'two'].map(name => join(officialStageDir(cwd, project.projectId, 'first'), `${name}.md`))
  mkdirSync(dirname(paths[0]!), { recursive: true })
  saveBoard(cwd, { schemaVersion: 2, projectId: project.projectId, module: project.module, currentStageId: 'first', stages: { first: { stageId: 'first', status: 'running', tasks: paths.map((path, index) => ({ id: `task-${index + 1}`, title: `Output ${index + 1}`, status: 'queued', markdownPath: path, sourcePath: source })), updatedAt: new Date().toISOString() } }, updatedAt: new Date().toISOString() })
  const key = dispatchFingerprint(loadBoard(cwd, project.projectId).stages.first!)
  const start = (limits = {}) => startLongTask(cwd, project, { sessionId: 'main', stageId: 'first', key, draft: 'Only current stage outputs', limits })
  const dispatch = () => {
    const attempt = start().attempt!
    markLongTaskDispatchIntent(cwd, project, { sessionId: 'main', attemptId: attempt.id, key: attempt.key, messageId: `message-${attempt.id}` })
    markLongTaskDispatched(cwd, project, { sessionId: 'main', attemptId: attempt.id, key: attempt.key, messageId: `message-${attempt.id}` })
    return attempt
  }
  const write = (index: number) => writeFileSync(paths[index]!, '# Actual output\n\n' + 'Facts checked against registered source, with evidence and remaining issues.\n'.repeat(6))
  const sha = (index: number) => createHash('sha256').update(readFileSync(paths[index]!)).digest('hex')
  const reconcile = (extra = {}) => reconcileLongTask(cwd, project, { sessionId: 'main', parentState: 'idle', ...extra })
  return { cwd, source, project, paths, key, start, dispatch, write, sha, reconcile }
}

test('prepared attempt survives multiple restarts with a single dispatch identity', t => {
  const f = fixture(t), first = f.start()
  for (let index = 0; index < 5; index++) {
    const restored = f.reconcile()
    assert.equal(restored.phase, 'ready')
    assert.equal(restored.attempt?.id, first.attempt!.id)
    assert.equal(listLongTasks(f.cwd, f.project)[0]!.attempts.length, 1)
  }
  assert.equal(f.start().attempt!.id, first.attempt!.id)
  assert.equal(longTaskStatus(f.cwd, f.project, 'unbound').phase, 'inactive')
})

test('crash between dispatch intent and receipt never blindly sends again', t => {
  const f = fixture(t), attempt = f.start().attempt!
  markLongTaskDispatchIntent(f.cwd, f.project, { sessionId: 'main', attemptId: attempt.id, key: attempt.key, messageId: 'native-message' })
  assert.equal(f.reconcile().phase, 'needs_review')
  assert.equal(f.reconcile({ foundMessageId: 'different-message' }).phase, 'needs_review')
  const recovered = f.reconcile({ parentState: 'running', foundMessageId: 'native-message' })
  assert.equal(recovered.phase, 'waiting')
  assert.equal(recovered.attempt!.messageId, 'native-message')
  assert.equal(recovered.attempt!.status, 'dispatched')
  assert.equal(f.reconcile().phase, 'needs_review')
  assert.throws(() => markLongTaskDispatchIntent(f.cwd, f.project, { sessionId: 'main', attemptId: attempt.id, key: attempt.key, messageId: 'again' }), /核对|意图/)
  assert.equal(listLongTasks(f.cwd, f.project)[0]!.attempts.length, 1)
})

test('a written but unregistered output is recovered without asking to write it again', t => {
  const f = fixture(t), attempt = f.dispatch()
  f.write(0)
  assert.equal(loadBoard(f.cwd, f.project.projectId).stages.first!.tasks[0]!.status, 'queued')
  settleLongTaskAttempt(f.cwd, f.project, { sessionId: 'main', attemptId: attempt.id })
  const recovered = f.reconcile()
  assert.equal(loadBoard(f.cwd, f.project.projectId).stages.first!.tasks[0]!.status, 'done')
  assert.equal(recovered.phase, 'ready')
  assert.doesNotMatch(recovered.draft!, /- task-1 /)
  assert.match(recovered.draft!, /- task-2 /)
  assert.equal(recovered.run!.noProgress, 0)
  assert.equal(f.reconcile().attempt!.id, recovered.attempt!.id)
  assert.equal(listLongTasks(f.cwd, f.project)[0]!.attempts.length, 2)
})

test('unknown external effects and user pause survive restarts and real settlement', t => {
  const f = fixture(t), attempt = f.dispatch()
  markLongTaskExternalEffect(f.cwd, f.project, { sessionId: 'main', attemptId: attempt.id, unknown: true })
  f.write(0)
  assert.equal(f.reconcile().phase, 'needs_review')
  pauseLongTask(f.cwd, f.project, 'main')
  settleLongTaskAttempt(f.cwd, f.project, { sessionId: 'main', attemptId: attempt.id })
  for (let index = 0; index < 3; index++) assert.equal(f.reconcile().phase, 'paused')
  pauseLongTask(f.cwd, f.project, 'main', false)
  assert.equal(f.reconcile().phase, 'needs_review')
  markLongTaskExternalEffect(f.cwd, f.project, { sessionId: 'main', attemptId: attempt.id, unknown: false })
  assert.equal(f.reconcile().phase, 'ready')
})

test('changed inputs block old attempts; a stage change never authorizes the next stage', t => {
  const f = fixture(t), attempt = f.dispatch()
  writeFileSync(f.source, 'New user source version')
  assert.equal(f.reconcile().phase, 'needs_review')
  assert.equal(f.reconcile().attempt!.status, 'stale')
  assert.throws(() => markLongTaskDispatched(f.cwd, f.project, { sessionId: 'main', attemptId: attempt.id, key: attempt.key, messageId: 'old-message' }), /版本/)
  const other = fixture(t), otherAttempt = other.dispatch()
  settleLongTaskAttempt(other.cwd, other.project, { sessionId: 'main', attemptId: otherAttempt.id })
  const board = loadBoard(other.cwd, other.project.projectId); board.currentStageId = 'later'; saveBoard(other.cwd, board)
  assert.equal(other.reconcile().phase, 'done')
  assert.equal(other.reconcile().draft, undefined)
  assert.equal(listLongTasks(other.cwd, other.project)[0]!.attempts.length, 1)
})

test('registered directories cannot create attempts; expanded files dispatch and detect byte changes', t => {
  const f = fixture(t), directory = join(f.cwd, 'registered-sources')
  mkdirSync(directory)
  const source = join(directory, 'source.txt'); writeFileSync(source, 'Original nested source')
  const input = { sessionId: 'main', stageId: 'first', key: f.key, draft: 'Only current stage outputs' }
  const directoryProject = updateBusinessProjectInputs(f.cwd, f.project.module, f.project.projectId, [directory])
  assert.throws(() => longTaskInputFingerprint(f.cwd, directoryProject, 'first'), /目录.*展开为具体来源文件/)
  assert.throws(() => startLongTask(f.cwd, directoryProject, input), /目录.*展开为具体来源文件/)
  assert.deepEqual(listLongTasks(f.cwd, directoryProject), [])
  const project = updateBusinessProjectInputs(f.cwd, f.project.module, f.project.projectId, [source])
  const attempt = startLongTask(f.cwd, project, input).attempt!
  const receipt = { sessionId: 'main', attemptId: attempt.id, key: attempt.key, messageId: 'expanded-file-message' }
  markLongTaskDispatchIntent(f.cwd, project, receipt)
  assert.equal(markLongTaskDispatched(f.cwd, project, receipt).status, 'dispatched')
  writeFileSync(source, 'Changed nested source')
  assert.notEqual(longTaskInputFingerprint(f.cwd, project, 'first'), attempt.inputFingerprint)
  assert.equal(reconcileLongTask(f.cwd, project, { sessionId: 'main', parentState: 'idle' }).attempt!.status, 'stale')
})

test('real files and settled model turn cannot replace user approval', t => {
  const f = fixture(t, true), attempt = f.dispatch()
  f.write(0); f.write(1)
  settleLongTaskAttempt(f.cwd, f.project, { sessionId: 'main', attemptId: attempt.id })
  const checked = f.reconcile()
  assert.equal(checked.phase, 'blocked')
  assert.match(checked.reason, /决定|审批/)
  assert.equal(checked.draft, undefined)
  assert.equal(loadBoard(f.cwd, f.project.projectId).stages.first!.approval, undefined)
  assert.equal(checked.run!.attempts.length, 1)
})

test('child submissions are durable, idempotent, version bound, and only received for review', t => {
  const f = fixture(t), attempt = f.dispatch()
  registerLongTaskChild(f.cwd, f.project, { sessionId: 'main', attemptId: attempt.id, childSessionId: 'child', expectedPaths: [] })
  assert.equal(submitLongTaskChild(f.cwd, f.project, { sessionId: 'main', attemptId: attempt.id, childSessionId: 'child', submissionId: 'empty', inputFingerprint: attempt.inputFingerprint, artifacts: [] }).status, 'rejected')
  registerLongTaskChild(f.cwd, f.project, { sessionId: 'main', attemptId: attempt.id, childSessionId: 'child', expectedPaths: [f.paths[0]!] })
  f.write(0)
  const input = { sessionId: 'main', attemptId: attempt.id, childSessionId: 'child', submissionId: 'receipt', inputFingerprint: attempt.inputFingerprint, artifacts: [{ path: f.paths[0]!, sha256: f.sha(0) }] }
  const received = submitLongTaskChild(f.cwd, f.project, input)
  assert.equal(received.status, 'received')
  assert.deepEqual(submitLongTaskChild(f.cwd, f.project, input), received)
  assert.throws(() => submitLongTaskChild(f.cwd, f.project, { ...input, artifacts: [{ path: f.paths[0]!, sha256: 'forged' }] }), /不一致/)
  assert.equal(loadBoard(f.cwd, f.project.projectId).stages.first!.status, 'running')
  assert.equal(loadBoard(f.cwd, f.project.projectId).stages.first!.tasks[0]!.status, 'queued')
  settleLongTaskChild(f.cwd, f.project, { sessionId: 'main', attemptId: attempt.id, childSessionId: 'child' })
  settleLongTaskAttempt(f.cwd, f.project, { sessionId: 'main', attemptId: attempt.id })
  const next = f.reconcile(); assert.notEqual(next.attempt!.id, attempt.id)
  assert.equal(submitLongTaskChild(f.cwd, f.project, { ...input, submissionId: 'old-late' }).status, 'stale')
  assert.equal(listLongTasks(f.cwd, f.project)[0]!.submissions.length, 3)
})

test('parent and children share actual usage limits; duplicate events do not spend twice', t => {
  const f = fixture(t); f.start({ maxTokens: 100 }); const attempt = f.dispatch()
  registerLongTaskChild(f.cwd, f.project, { sessionId: 'main', attemptId: attempt.id, childSessionId: 'child', expectedPaths: [] })
  const parent = { sessionId: 'main', sourceSessionId: 'main', eventId: '1', usage: { inputTokens: 20, outputTokens: 10, cacheReadTokens: 30, totalTokens: 60 }, elapsedMs: 200 }
  recordLongTaskUsage(f.cwd, f.project, parent)
  recordLongTaskUsage(f.cwd, f.project, parent)
  recordLongTaskUsage(f.cwd, f.project, { sessionId: 'main', sourceSessionId: 'child', eventId: '1', usage: { inputTokens: 40, outputTokens: 10 }, costUsd: 0.2, elapsedMs: 300 })
  const status = longTaskStatus(f.cwd, f.project, 'main')
  assert.equal(status.phase, 'blocked'); assert.match(status.reason, /token/)
  assert.equal(status.run!.usage.rounds, 2); assert.equal(status.run!.usage.tokens, 110)
  assert.equal(status.run!.usage.elapsedMs, 500); assert.equal(status.cost, 'unknown')
  assert.throws(() => registerLongTaskChild(f.cwd, f.project, { sessionId: 'main', attemptId: attempt.id, childSessionId: 'extra-child', expectedPaths: [] }), /预算/)
  assert.throws(() => recordLongTaskUsage(f.cwd, f.project, { ...parent, sourceSessionId: 'foreign', eventId: '2' }), /父子/)
})

test('missing actual usage, unknown cost, total round and elapsed budgets block dispatch', t => {
  const unknown = fixture(t); unknown.start()
  recordLongTaskUsage(unknown.cwd, unknown.project, { sessionId: 'main', sourceSessionId: 'main', eventId: 'unknown' })
  assert.match(longTaskStatus(unknown.cwd, unknown.project, 'main').reason, /未确定/)
  const cost = fixture(t); cost.start({ maxCostUsd: 1 })
  recordLongTaskUsage(cost.cwd, cost.project, { sessionId: 'main', sourceSessionId: 'main', eventId: 'cost', usage: { inputTokens: 1, outputTokens: 1 } })
  assert.match(longTaskStatus(cost.cwd, cost.project, 'main').reason, /费用未知/)
  const rounds = fixture(t); rounds.start({ maxRounds: 1 })
  recordLongTaskUsage(rounds.cwd, rounds.project, { sessionId: 'main', sourceSessionId: 'main', eventId: 'round', usage: { inputTokens: 1, outputTokens: 1 }, costUsd: 0 })
  assert.match(longTaskStatus(rounds.cwd, rounds.project, 'main').reason, /轮次/)
  const time = fixture(t); time.start({ maxElapsedMs: 100 })
  recordLongTaskUsage(time.cwd, time.project, { sessionId: 'main', sourceSessionId: 'main', eventId: 'time', usage: { inputTokens: 1, outputTokens: 1 }, elapsedMs: 101 })
  assert.match(longTaskStatus(time.cwd, time.project, 'main').reason, /时间/)
})

test('no-progress counts real settled attempts once, not polling or telemetry', t => {
  const f = fixture(t); f.start({ maxNoProgress: 2 })
  const first = f.dispatch()
  settleLongTaskAttempt(f.cwd, f.project, { sessionId: 'main', attemptId: first.id })
  settleLongTaskAttempt(f.cwd, f.project, { sessionId: 'main', attemptId: first.id })
  const next = f.reconcile(); assert.equal(next.run!.noProgress, 1)
  for (let index = 0; index < 3; index++) assert.equal(f.reconcile().run!.noProgress, 1)
  const attempt = next.attempt!
  markLongTaskDispatchIntent(f.cwd, f.project, { sessionId: 'main', attemptId: attempt.id, key: attempt.key, messageId: 'second' })
  markLongTaskDispatched(f.cwd, f.project, { sessionId: 'main', attemptId: attempt.id, key: attempt.key, messageId: 'second' })
  settleLongTaskAttempt(f.cwd, f.project, { sessionId: 'main', attemptId: attempt.id })
  const stopped = f.reconcile()
  assert.equal(stopped.phase, 'blocked'); assert.match(stopped.reason, /实际成果/)
  assert.equal(stopped.run!.attempts.length, 2)
})

test('an idle parent cannot duplicate still-running or unconfirmed child work', t => {
  const f = fixture(t), attempt = f.dispatch()
  registerLongTaskChild(f.cwd, f.project, { sessionId: 'main', attemptId: attempt.id, childSessionId: 'child', expectedPaths: [] })
  settleLongTaskAttempt(f.cwd, f.project, { sessionId: 'main', attemptId: attempt.id })
  assert.equal(f.reconcile({ childrenState: { child: 'running' } }).phase, 'waiting')
  assert.equal(f.reconcile({ childrenState: { child: 'idle' } }).phase, 'needs_review')
  settleLongTaskChild(f.cwd, f.project, { sessionId: 'main', attemptId: attempt.id, childSessionId: 'child' })
  assert.equal(f.reconcile().phase, 'ready')
})

test('scope and dispatch fingerprints cannot be forged; foreign output and inconsistent counters are rejected', t => {
  const f = fixture(t), attempt = f.dispatch()
  assert.throws(() => pauseLongTask(f.cwd, f.project, 'child'), /主会话/)
  assert.throws(() => markLongTaskDispatched(f.cwd, f.project, { sessionId: 'main', attemptId: attempt.id, key: 'wrong-key', messageId: 'forged' }), /指纹|版本|不匹配/)
  assert.throws(() => registerLongTaskChild(f.cwd, f.project, { sessionId: 'main', attemptId: attempt.id, childSessionId: 'child', expectedPaths: [f.source] }), /输出/)
  assert.throws(() => recordLongTaskUsage(f.cwd, f.project, { sessionId: 'main', sourceSessionId: 'main', eventId: 'bad', usage: { inputTokens: 10, outputTokens: 1, totalTokens: 99 } }), /不一致/)
  assert.throws(() => recordLongTaskUsage(f.cwd, f.project, { sessionId: 'main', sourceSessionId: 'main', eventId: 'bad2', costUsd: -1 }), /无效/)
  assert.equal(listLongTasks(f.cwd, f.project)[0]!.usage.rounds, 0)
})

test('explicit stage changes preserve the parent task budget and late child consumption', t => {
  const f = fixture(t), attempt = f.dispatch()
  registerLongTaskChild(f.cwd, f.project, { sessionId: 'main', attemptId: attempt.id, childSessionId: 'old-child', expectedPaths: [] })
  settleLongTaskChild(f.cwd, f.project, { sessionId: 'main', attemptId: attempt.id, childSessionId: 'old-child' })
  recordLongTaskUsage(f.cwd, f.project, { sessionId: 'main', sourceSessionId: 'main', eventId: 'first-stage', usage: { inputTokens: 10, outputTokens: 10 }, costUsd: 0.1 })
  f.write(0); f.write(1)
  settleLongTaskAttempt(f.cwd, f.project, { sessionId: 'main', attemptId: attempt.id }); f.reconcile()
  // Explicit stage dispatch is independent from automatic reconciliation.
  const board = loadBoard(f.cwd, f.project.projectId)
  board.stages.first!.status = 'done'; board.stages.first!.completedAt = new Date().toISOString()
  board.currentStageId = 'later'; board.stages.later = { stageId: 'later', status: 'idle', tasks: [], updatedAt: new Date().toISOString() }
  // The ready closeout preview was never dispatched and may be superseded by the user.
  saveBoard(f.cwd, board)
  const next = startLongTask(f.cwd, f.project, { sessionId: 'main', stageId: 'later', key: dispatchFingerprint(board.stages.later), draft: 'Later stage explicit instruction' })
  assert.equal(next.phase, 'ready'); assert.equal(next.run!.usage.tokens, 20)
  recordLongTaskUsage(f.cwd, f.project, { sessionId: 'main', sourceSessionId: 'old-child', eventId: 'late-usage', usage: { inputTokens: 5, outputTokens: 5 }, costUsd: 0.02 })
  assert.equal(longTaskStatus(f.cwd, f.project, 'main').run!.usage.tokens, 30)
  assert.equal(longTaskStatus(f.cwd, f.project, 'main').run!.attempts[0]!.id, attempt.id)
})

test('rewriting a report envelope timestamp is not professional progress', t => {
  const f = fixture(t)
  const report = join(dirname(f.paths[0]!), 'facts.json')
  const board = loadBoard(f.cwd, f.project.projectId)
  board.stages.first!.tasks[0]!.reportPath = report; saveBoard(f.cwd, board)
  writeFileSync(report, JSON.stringify({ revision: 1, updatedAt: 'old', data: { fact: 'Unchanged fact' } }))
  const attempt = f.dispatch()
  writeFileSync(report, JSON.stringify({ revision: 2, updatedAt: 'new', data: { fact: 'Unchanged fact' } }))
  settleLongTaskAttempt(f.cwd, f.project, { sessionId: 'main', attemptId: attempt.id })
  assert.equal(longTaskStatus(f.cwd, f.project, 'main').run!.noProgress, 1)
})

test('an explicit budget increase preserves usage and the same unsubmitted attempt', t => {
  const f = fixture(t), started = f.start({ maxTokens: 5 })
  recordLongTaskUsage(f.cwd, f.project, { sessionId: 'main', sourceSessionId: 'main', eventId: 'known', usage: { inputTokens: 5, outputTokens: 5 }, costUsd: 0 })
  assert.equal(longTaskStatus(f.cwd, f.project, 'main').phase, 'blocked')
  const increased = f.start({ maxTokens: 100 })
  assert.equal(increased.phase, 'ready'); assert.equal(increased.attempt!.id, started.attempt!.id)
  assert.equal(increased.run!.usage.tokens, 10); assert.equal(increased.run!.limits.maxTokens, 100)
})
