import assert from 'node:assert/strict'
import { test } from 'node:test'
import { createHash } from 'node:crypto'
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createTaskStore, emptyTask, markChangedDeliverables, qualityInputFingerprint, reviseTask } from '../task.ts'
import { auditTask } from '../quality.ts'

function fixture(t: any) {
  const home = mkdtempSync(join(tmpdir(), 'agent-pi-task-v2-'))
  t.after(() => rmSync(home, { recursive: true, force: true }))
  return { home, store: createTaskStore(home), path: (id: string) => join(home, 'agent-pi', 'professional-tasks', `${createHash('sha256').update(id).digest('hex')}.json`) }
}
const file = { id: 'report', title: 'Decision report', path: 'report.md', requirementIds: [], evidenceIds: [], stepIds: [], status: 'reviewed' as const, signature: 'not_required' as const,
  checks: [{ kind: 'file' as const, status: 'passed' as const, detail: 'Read actual bytes', fingerprint: 'original' }, { kind: 'professional' as const, status: 'passed' as const, detail: 'Reviewed source facts' }, { kind: 'writing' as const, status: 'passed' as const, detail: 'Reviewed actual text' }] }

test('schema 1 migration backs up exact bytes and preserves goal without inventing confirmation', t => {
  const { home, store, path } = fixture(t), state: any = emptyTask('legacy')
  state.schemaVersion = 1; state.revision = 7; state.brief.objective = 'Review this project'; state.deliverables = [file]
  for (const key of ['briefProvenance', 'findings', 'quality', 'recentChanges', 'operationReceipts', 'acceptedHistory']) delete state[key]
  const bytes = `${JSON.stringify(state)}\n`
  mkdirSync(join(home, 'agent-pi', 'professional-tasks'), { recursive: true }); writeFileSync(path('legacy'), bytes)
  const migrated = store.read('legacy')
  assert.equal(migrated.schemaVersion, 2); assert.equal(migrated.revision, 7)
  assert.equal(migrated.briefProvenance.objective.origin, 'legacy'); assert.equal(migrated.briefProvenance.objective.status, 'provisional')
  assert.equal(readFileSync(`${path('legacy')}.schema-1.bak`, 'utf8'), bytes)
  assert.deepEqual(store.read('legacy'), migrated)
})

test('historical schema 2 omissions get presentation defaults on restart without changing authority or disk bytes', t => {
  const { home, store, path } = fixture(t), state: any = emptyTask('omitted-fields')
  state.revision = 30
  state.brief.objective = '用户的原始目标'
  state.plan = [{ id: 'old-plan', title: '原计划', status: 'done' }]
  state.deliverables = [{ id: 'old-report', path: '原报告.md', status: 'reviewed', signature: 'pending' }]
  const bytes = JSON.stringify(state)
  mkdirSync(join(home, 'agent-pi', 'professional-tasks'), { recursive: true })
  writeFileSync(path(state.sessionId), bytes)
  const loaded = store.read(state.sessionId)
  assert.equal(loaded.revision, 30)
  assert.equal(loaded.brief.objective, '用户的原始目标')
  assert.equal(loaded.plan[0].status, 'done')
  assert.deepEqual(loaded.plan[0].gaps, [])
  assert.deepEqual(loaded.plan[0].supplements, [])
  assert.equal(loaded.deliverables[0].title, '原报告.md')
  assert.equal(loaded.deliverables[0].status, 'reviewed')
  assert.equal(loaded.deliverables[0].signature, 'pending')
  assert.deepEqual(loaded.deliverables[0].checks, [])
  assert.ok(auditTask(loaded).issues.some(row => row.code === 'check_pending'))
  assert.deepEqual(createTaskStore(home).read(state.sessionId), loaded)
  assert.equal(readFileSync(path(state.sessionId), 'utf8'), bytes, 'read-only compatibility does not rewrite a user snapshot')
})

test('historical defaults never repair invalid values or invent proof for claimed acceptance', t => {
  const { home, store, path } = fixture(t)
  mkdirSync(join(home, 'agent-pi', 'professional-tasks'), { recursive: true })
  const invalid: any = emptyTask('invalid-defaults')
  invalid.plan = [{ id: 'plan', title: 'Plan', status: 'done', gaps: false }]
  writeFileSync(path(invalid.sessionId), JSON.stringify(invalid))
  assert.throws(() => store.read(invalid.sessionId), /Invalid plan collections/)
  invalid.plan = []
  invalid.deliverables = [{ id: 'file', path: 'file.md', status: 'reviewed', signature: 'pending', checks: false }]
  writeFileSync(path(invalid.sessionId), JSON.stringify(invalid))
  assert.throws(() => store.read(invalid.sessionId), /Checks need/)
  delete invalid.deliverables[0].checks
  invalid.deliverables[0].status = 'accepted'
  writeFileSync(path(invalid.sessionId), JSON.stringify(invalid))
  assert.throws(() => store.read(invalid.sessionId), /Unresolved checks cannot be accepted/)
})

test('legacy depth import is idempotent and keeps a competing old goal for review', t => {
  const { store } = fixture(t), initial = store.read('task')
  store.update('task', { brief: { ...initial.brief, objective: 'Current goal' } }, 0, 'user')
  const legacy = { sessionId: 'task', revision: 9, enabled: true, brief: { purpose: 'Old goal', depth: 'Review source' } as any, criteria: [], checks: [] }
  const task = store.importLegacyQuality('task', legacy)
  assert.equal(task.brief.objective, 'Current goal'); assert.equal(task.quality.brief.purpose, 'Current goal')
  assert.equal(task.migration?.depthPurposeConflict, 'Old goal'); assert.equal(task.quality.brief.acceptance, '')
  assert.deepEqual(store.importLegacyQuality('task', legacy), task)
})

test('agent updates cannot impersonate user choices, native answers or host binding', () => {
  const task = emptyTask('identity')
  assert.throws(() => reviseTask(task, { quality: { ...task.quality, enabled: true } }, 0, 'agent'), /用户/)
  assert.throws(() => reviseTask(task, { briefProvenance: { objective: { origin: 'user', status: 'explicit', updatedRevision: 1 } } }, 0, 'agent'), /宿主/)
  assert.throws(() => reviseTask(task, { binding: { projectId: 'p', moduleId: 'review' } }, 0, 'agent'), /宿主/)
  assert.throws(() => reviseTask(task, { questions: [{ id: 'q', question: 'Choose scope', provider: 'codex', answer: 'All', answerSource: 'native' }] }, 0, 'agent'), /输入适配器/)
  const trusted = reviseTask(task, { questions: [{ id: 'q', question: 'Choose scope', provider: 'codex', answer: 'All', answerSource: 'native' }], binding: { projectId: 'p', moduleId: 'review' } }, 0, 'host')
  assert.equal(trusted.questions[0].answer, 'All')
  assert.throws(() => reviseTask(trusted, { questions: [{ ...trusted.questions[0], answer: 'Other' }] }, 1, 'user'), /输入适配器/)
  assert.throws(() => reviseTask(trusted, { questions: [] }, 1, 'agent'), /输入适配器/)
})

test('audience edits preserve extracted facts and calculations while invalidating report writing', () => {
  const task = emptyTask('scope'); task.brief.objective = 'Decision'; task.deliverables = [structuredClone(file)]
  task.plan = [{ id: 'calc', title: 'Calculate', capabilityIds: [], dependsOn: [], evidenceIds: [], requirementIds: [], status: 'done', gaps: [], supplements: [] }, { id: 'write', title: 'Write report', capabilityIds: [], dependsOn: ['calc'], evidenceIds: [], requirementIds: [], status: 'done', gaps: [], supplements: [], briefDependencies: ['audience'] }]
  const next = reviseTask(task, { brief: { ...task.brief, audience: 'Project manager' } }, 0, 'user')
  assert.deepEqual(next.plan.map(row => row.status), ['done', 'needs_review'])
  assert.equal(next.deliverables[0].status, 'stale'); assert.deepEqual(next.deliverables[0].checks.map(row => row.kind), ['file'])
  assert.ok(next.recentChanges[0].affectedRefs.includes('plan:write'))
})

test('status questions and a new diligence restriction preserve completed work and checks', () => {
  const task = emptyTask('status'); task.deliverables = [structuredClone(file)]
  const request = reviseTask(task, { latestRequest: 'What is the status?' }, 0, 'user')
  const restricted = reviseTask(request, { brief: { ...request.brief, webDiligence: 'forbidden' } }, 1, 'user')
  assert.equal(restricted.deliverables[0].status, 'reviewed'); assert.deepEqual(restricted.deliverables[0].checks, file.checks)
})

test('quality criteria changes invalidate only the relevant check and toggle keeps check history', () => {
  const task = emptyTask('checks')
  task.quality = { ...task.quality, enabled: true, needsAssessment: false, criteria: [{ id: 'a', title: 'A', kind: 'contains', path: 'a.md', expected: 'A' }, { id: 'b', title: 'B', kind: 'file', path: 'b.md' }], checks: [{ id: 'a', status: 'passed', detail: 'Read A' }, { id: 'b', status: 'passed', detail: 'Read B' }] }
  const next = reviseTask(task, { quality: { ...task.quality, criteria: [{ ...task.quality.criteria[0], expected: 'Changed' }, task.quality.criteria[1]] } }, 0, 'user')
  assert.equal(next.quality.checks[0].stale, true); assert.equal(next.quality.checks[1].status, 'passed')
  const disabled = reviseTask(next, { quality: { ...next.quality, enabled: false } }, 1, 'user')
  assert.deepEqual(disabled.quality.checks, next.quality.checks)
})

test('agent can commit assessed depth criteria without another synthetic user turn', () => {
  const task = emptyTask('assessed'); task.quality.enabled = true
  const next = reviseTask(task, { brief: { ...task.brief, objective: 'Review actual source' }, quality: { ...task.quality, needsAssessment: false, criteria: [{ id: 'facts', title: 'Facts trace to source', kind: 'review' }] } }, 0, 'agent')
  assert.equal(next.quality.needsAssessment, false)
  assert.notEqual(qualityInputFingerprint(task, next.quality.criteria[0]), qualityInputFingerprint(next, next.quality.criteria[0]))
})

test('changed actual bytes revoke current readiness and retain the accepted version', () => {
  const task = emptyTask('accepted'); task.deliverables = [{ ...structuredClone(file), status: 'accepted' }]
  const patch = markChangedDeliverables(task, { 'report.md': 'replacement' })
  assert.deepEqual(patch.changedPaths, ['report.md']); assert.equal(patch.deliverables[0].status, 'stale')
  const next = reviseTask(task, { deliverables: patch.deliverables, quality: patch.quality }, 0, 'host')
  assert.equal(next.acceptedHistory[0].deliverable.status, 'accepted'); assert.equal(next.acceptedHistory[0].deliverable.checks[0].fingerprint, 'original')
  assert.ok(auditTask(next).issues.some(row => row.code === 'deliverable_stale'))
})

test('reusing an accepted ID cannot transfer human acceptance or a signature to another artifact', () => {
  const task = emptyTask('signed'); task.deliverables = [{ ...structuredClone(file), status: 'accepted', signature: 'signed' }]
  const next = reviseTask(task, { deliverables: [{ ...task.deliverables[0], path: 'replacement.md' }] }, 0, 'agent')
  assert.equal(next.deliverables[0].status, 'stale'); assert.equal(next.deliverables[0].signature, 'pending')
  assert.equal(next.acceptedHistory[0].deliverable.path, 'report.md'); assert.equal(next.acceptedHistory[0].deliverable.signature, 'signed')
  assert.throws(() => reviseTask(next, { deliverables: [{ ...next.deliverables[0], status: 'accepted' }] }, 1, 'agent'), /客户验收/)
})

test('raw operation replay prevents regenerated derived fields and rejects reused IDs', t => {
  const { store } = fixture(t), initial = store.read('operation'), payload = { objective: 'Review actual sources' }
  const first = store.update('operation', { brief: { ...initial.brief, objective: payload.objective } }, 0, 'host', { operationId: 'message:1', operationPayload: payload })
  const replay = store.update('operation', { brief: { ...first.brief }, latestRequest: 'Derived later' }, 99, 'host', { operationId: 'message:1', operationPayload: payload })
  assert.deepEqual(replay, first); assert.deepEqual(store.replay('operation', 'message:1', payload, 'host'), first)
  assert.throws(() => store.replay('operation', 'message:1', { objective: 'Different' }, 'host'), /不同内容/)
})

test('pending project requirement blocks review and acceptance until paired ledger commit', () => {
  const task = emptyTask('project'); task.brief.objective = 'Decision'; task.needsAssessment = false; task.deliverables = [structuredClone(file)]
  const pending = reviseTask(task, { binding: { projectId: 'p', moduleId: 'custom' }, pendingProjectSync: { id: 'm1', text: 'New phase requirement', createdAt: new Date().toISOString() } }, 0, 'host')
  assert.ok(auditTask(pending).issues.some(row => row.code === 'project_sync_pending'))
  assert.throws(() => reviseTask(pending, { deliverables: [{ ...pending.deliverables[0], status: 'accepted' }] }, 1, 'user'), /同步/)
  const synchronized = reviseTask(pending, { pendingProjectSync: undefined }, 1, 'host')
  assert.equal(auditTask(synchronized).readyForCustomerReview, true)
})

test('activity cursor detects pruned history and stale saves cannot resurrect expired operations', t => {
  const { store } = fixture(t)
  for (let index = 0; index < 102; index++) store.update('activity', { latestRequest: `Status ${index}` }, index, 'user', { operationId: `message:${index}` })
  assert.equal(store.activity('activity', 1).reset, true); assert.equal(store.activity('activity', 101).changes.length, 1)
  assert.throws(() => store.update('activity', { latestRequest: 'Status 0' }, 0, 'user', { operationId: 'message:0' }), /最新版本/)
})

test('a live competing store writer cannot partially replace a task', t => {
  const { store, home, path } = fixture(t)
  mkdirSync(join(home, 'agent-pi', 'professional-tasks'), { recursive: true }); writeFileSync(`${path('locked')}.lock`, JSON.stringify({ pid: process.pid }))
  assert.throws(() => store.update('locked', { latestRequest: 'New task' }, 0, 'user'), /正在更新/)
  assert.equal(store.read('locked').revision, 0)
})
