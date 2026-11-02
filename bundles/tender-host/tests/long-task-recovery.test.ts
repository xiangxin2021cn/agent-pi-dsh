import assert from 'node:assert/strict'
import { resolve } from 'node:path'
import { test } from 'node:test'
import type { BusinessProjectRecord } from '../../../packages/business-projects/index.ts'
import type { LongTaskRun, LongTaskStatus } from '../src/long-task-runtime.ts'
import { discoverLongTaskRecovery } from '../src/long-task-recovery.ts'

function run(sessionId: string, changes: Partial<LongTaskRun> = {}): LongTaskRun {
  return { sessionId, paused: false, currentAttemptId: `attempt:${sessionId}`, attempts: [{ id: `attempt:${sessionId}`, sessionId, status: 'prepared', context: { schemaVersion: 1, rootSessionId: sessionId, fingerprint: 'a'.repeat(64) } }], ...changes } as LongTaskRun
}
function fixture() {
  const cwd = resolve('中文隔离工作区'), project = { module: 'delivery', projectId: 'registered-project' } as BusinessProjectRecord
  const runs = new Map<string, LongTaskRun>([['original-root', run('original-root')]])
  const phases = new Map<string, LongTaskStatus['phase']>(), failures: any[] = []
  const registry = { list: () => [{ path: cwd, sessionIds: [...runs.keys()] }], archivedSessionIds: [] as string[] }
  const calls: Array<{ kind: string; sessionId?: string; cwd?: string; project?: BusinessProjectRecord }> = []
  const callbacks = {
    projectForBoundSession(path: string, sessionId: string) { calls.push({ kind: 'binding', sessionId, cwd: path }); return project },
    listLongTasks(path: string, row: BusinessProjectRecord) { calls.push({ kind: 'runs', cwd: path, project: row }); return [...runs.values()] },
    status(path: string, row: BusinessProjectRecord, sessionId: string): LongTaskStatus {
      calls.push({ kind: 'status', sessionId, cwd: path, project: row })
      const value = runs.get(sessionId)!
      return { phase: phases.get(sessionId) || 'ready', reason: '', run: value, attempt: value.attempts.find(attempt => attempt.id === value.currentAttemptId), cost: 'unknown' }
    },
    hasRecoveryContext(value: LongTaskRun, attempt: LongTaskRun['attempts'][number]) { return !!attempt.context && attempt.context.rootSessionId === value.sessionId },
    reportError(failure: unknown) { failures.push(failure) },
  }
  return { cwd, project, runs, phases, failures, registry, calls, callbacks }
}

test('registered Chinese workspaces discover only their original bound roots without loading or dispatching', () => {
  const f = fixture()
  assert.deepEqual(discoverLongTaskRecovery(f.registry, f.callbacks), [{ cwd: f.cwd, sessionId: 'original-root', project: f.project }])
  assert.deepEqual(f.failures, [])
  assert.equal(f.calls.filter(row => row.kind === 'runs').length, 1)
})

test('archived, unbound, paused, blocked, reviewed and legacy attempts cannot enter automatic recovery', () => {
  const f = fixture()
  for (const id of ['archived', 'unbound', 'paused', 'blocked', 'needs_review', 'done', 'inactive', 'old', 'foreign-context', 'stale']) f.runs.set(id, run(id))
  f.registry.archivedSessionIds.push('archived')
  f.callbacks.projectForBoundSession = (_cwd, id) => id === 'unbound' ? null as any : f.project
  f.runs.get('paused')!.paused = true
  for (const phase of ['blocked', 'needs_review', 'done', 'inactive'] as const) f.phases.set(phase, phase)
  delete f.runs.get('old')!.attempts[0].context
  f.runs.get('foreign-context')!.attempts[0].context!.rootSessionId = 'different-root'
  f.runs.get('stale')!.attempts[0].status = 'stale'
  assert.deepEqual(discoverLongTaskRecovery(f.registry, f.callbacks).map(row => row.sessionId), ['original-root'])
  assert.deepEqual(f.failures, [])
})

test('discovery keeps every eligible root past 32 and deduplicates repeated registry memberships', () => {
  const f = fixture()
  for (let index = 0; index < 40; index++) f.runs.set(`root-${index}`, run(`root-${index}`))
  const workspace = { path: f.cwd, sessionIds: [...f.runs.keys(), 'root-39'] }
  f.registry.list = () => [workspace, workspace]
  const candidates = discoverLongTaskRecovery(f.registry, f.callbacks)
  assert.equal(candidates.length, 41)
  assert.ok(candidates.some(row => row.sessionId === 'root-39'))
  assert.equal(f.calls.filter(row => row.kind === 'runs').length, 1, 'one project ledger read per discovery')
})

test('a foreign project ledger cannot nominate a root outside registered workspace membership', () => {
  const f = fixture()
  f.callbacks.listLongTasks = () => [run('another-project-root')]
  assert.deepEqual(discoverLongTaskRecovery(f.registry, f.callbacks), [])
  assert.equal(f.calls.filter(row => row.kind === 'status').length, 0)
})

test('an empty registry does no domain reads, while missing or relative workspace paths are reported', () => {
  const f = fixture()
  f.registry.list = () => []
  assert.deepEqual(discoverLongTaskRecovery(f.registry, f.callbacks), [])
  assert.equal(f.calls.length, 0)
  f.registry.list = () => [{ path: '', sessionIds: ['original-root'] }, { path: 'relative-path', sessionIds: ['original-root'] }]
  assert.deepEqual(discoverLongTaskRecovery(f.registry, f.callbacks), [])
  assert.equal(f.calls.length, 0)
  assert.equal(f.failures.length, 2)
})

test('a corrupt project reports once and does not hide an independent healthy project', () => {
  const f = fixture(), otherProject = { ...f.project, projectId: 'broken-project' } as BusinessProjectRecord
  f.runs.set('broken-one', run('broken-one')); f.runs.set('broken-two', run('broken-two'))
  f.callbacks.projectForBoundSession = (_cwd, id) => id.startsWith('broken') ? otherProject : f.project
  const list = f.callbacks.listLongTasks
  f.callbacks.listLongTasks = (cwd, project) => { if (project.projectId === otherProject.projectId) throw new Error('Damaged isolated project ledger'); return list(cwd, project) }
  assert.deepEqual(discoverLongTaskRecovery(f.registry, f.callbacks).map(row => row.sessionId), ['original-root'])
  assert.equal(f.failures.length, 1)
  assert.equal(f.failures[0].projectId, 'broken-project')
  assert.match(f.failures[0].error.message, /Damaged/)
})

test('one failed status or mismatched original-session receipt does not block other roots', () => {
  const f = fixture()
  f.runs.set('broken-status', run('broken-status')); f.runs.set('foreign-status', run('foreign-status')); f.runs.set('healthy-last', run('healthy-last'))
  const status = f.callbacks.status
  f.callbacks.status = (cwd, project, id) => {
    if (id === 'broken-status') throw new Error('Unreadable isolated run')
    const value = status(cwd, project, id)
    return id === 'foreign-status' ? { ...value, run: run('other-root') } : value
  }
  assert.deepEqual(discoverLongTaskRecovery(f.registry, f.callbacks).map(row => row.sessionId), ['original-root', 'healthy-last'])
  assert.equal(f.failures.length, 2)
  assert.match(f.failures[1].error.message, /主会话或当前尝试不匹配/)
})

test('registry-wide failures remain visible to the host instead of appearing as no authorized work', () => {
  const f = fixture()
  f.registry.list = () => { throw new Error('Registry unavailable') }
  assert.throws(() => discoverLongTaskRecovery(f.registry, f.callbacks), /Registry unavailable/)
})
