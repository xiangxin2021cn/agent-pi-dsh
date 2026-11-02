import assert from 'node:assert/strict'
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'
import { createBusinessProject } from '../../../packages/business-projects/index.ts'
import { projectDir } from '../src/fsutil.ts'
import { bindProjectSession, dispatchFingerprint, loadBoard, saveBoard } from '../src/orchestration.ts'
import { listLongTasks, longTaskStatus, startLongTask } from '../src/long-task-runtime.ts'

function fixture(t: { after(fn: () => void): unknown }) {
  const cwd = mkdtempSync(join(tmpdir(), 'ap-malformed-long-ledger-'))
  t.after(() => rmSync(cwd, { recursive: true, force: true }))
  const project = createBusinessProject({ workspaceRootPath: cwd, module: 'delivery', projectId: 'registered-project', name: 'Isolated ledger validation', rootPath: cwd, createDirectory: false, inputPaths: [], workflowId: 'delivery-main', workflowSnapshot: { id: 'delivery-main', module: 'delivery', label: 'Isolated', labelZh: '隔离账本校验', stages: [{ id: 'first', label: 'First', labelZh: '当前阶段', prompt: 'Only the current authorized stage', skillSlugs: [], consumes: [] }] } })
  bindProjectSession(cwd, project, 'original-root', 'first')
  saveBoard(cwd, { schemaVersion: 2, projectId: project.projectId, module: project.module, currentStageId: 'first', stages: { first: { stageId: 'first', status: 'idle', tasks: [], updatedAt: new Date().toISOString() } }, updatedAt: new Date().toISOString() })
  const path = join(projectDir(cwd, project.module, project.projectId), 'orchestration', 'long-task-runtime.json')
  const key = dispatchFingerprint(loadBoard(cwd, project.projectId, project.module).stages.first!)
  const start = () => startLongTask(cwd, project, { sessionId: 'original-root', stageId: 'first', key, draft: 'Only existing authorized work' })
  return { cwd, project, path, start }
}

test('a genuinely absent long-task ledger is a normal first run and is initialized with the project identity', t => {
  const f = fixture(t)
  assert.equal(existsSync(f.path), false)
  assert.deepEqual(listLongTasks(f.cwd, f.project), [])
  assert.equal(longTaskStatus(f.cwd, f.project, 'original-root').phase, 'inactive')
  assert.equal(f.start().phase, 'ready')
  const ledger = JSON.parse(readFileSync(f.path, 'utf8'))
  assert.equal(ledger.schemaVersion, 1); assert.equal(ledger.projectId, f.project.projectId); assert.equal(ledger.module, f.project.module)
})

test('an existing syntactically damaged ledger is rejected without being overwritten as a fresh run', t => {
  const f = fixture(t)
  f.start()
  const damaged = '{"schemaVersion":1,"runs":'
  writeFileSync(f.path, damaged)
  assert.throws(() => listLongTasks(f.cwd, f.project))
  assert.throws(() => longTaskStatus(f.cwd, f.project, 'original-root'))
  assert.throws(() => f.start())
  assert.equal(readFileSync(f.path, 'utf8'), damaged)
})

for (const change of [
  { label: 'existing but emptied run records', apply: (ledger: any) => { ledger.runs = {} } },
  { label: 'wrong schema version', apply: (ledger: any) => { ledger.schemaVersion = 99; ledger.runs = {} } },
  { label: 'foreign project identity', apply: (ledger: any) => { ledger.projectId = 'another-project'; ledger.runs = {} } },
  { label: 'foreign module identity', apply: (ledger: any) => { ledger.module = 'another-module'; ledger.runs = {} } },
  { label: 'array instead of run records', apply: (ledger: any) => { ledger.runs = [] } },
  { label: 'foreign run owner', apply: (ledger: any) => { ledger.runs['original-root'].sessionId = 'foreign-root' } },
  { label: 'missing current attempt', apply: (ledger: any) => { ledger.runs['original-root'].attempts = [] } },
  { label: 'invalid replay start time', apply: (ledger: any) => { ledger.runs['original-root'].createdAt = 'not-a-timestamp' } },
  { label: 'negative replay boundary', apply: (ledger: any) => { ledger.runs['original-root'].fromSeq = -1 } },
  { label: 'missing dispatch key', apply: (ledger: any) => { ledger.runs['original-root'].attempts[0].key = '' } },
  { label: 'invalid no-progress baseline', apply: (ledger: any) => { ledger.runs['original-root'].attempts[0].realityDigest = 'not-a-file-digest' } },
  { label: 'negative actual usage', apply: (ledger: any) => { ledger.runs['original-root'].usage.tokens = -1 } },
  { label: 'fractional actual model rounds', apply: (ledger: any) => { ledger.runs['original-root'].usage.rounds = 0.5 } },
  { label: 'invalid hard limit', apply: (ledger: any) => { ledger.runs['original-root'].limits.maxRounds = 0 } },
]) test(`an existing ledger with ${change.label} must fail closed before a fresh offer can replace it`, t => {
  const f = fixture(t)
  f.start()
  const ledger = JSON.parse(readFileSync(f.path, 'utf8'))
  change.apply(ledger)
  const damaged = JSON.stringify(ledger)
  writeFileSync(f.path, damaged)
  assert.throws(() => f.start(), 'an existing invalid ledger must not authorize a new attempt')
  assert.equal(readFileSync(f.path, 'utf8'), damaged, 'a failed recovery must preserve the original damaged bytes')
  assert.throws(() => listLongTasks(f.cwd, f.project), 'discovery must surface invalid stored state')
})
