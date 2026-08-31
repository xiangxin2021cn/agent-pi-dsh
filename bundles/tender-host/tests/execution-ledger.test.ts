import assert from 'node:assert/strict'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'
import type { BusinessProjectRecord } from '../../../packages/business-projects/index.ts'
import {
  executionForSession,
  latestExecutionForProject,
  loadExecutionLedger,
  renderExecutionContext,
  updateSessionExecution,
} from '../src/execution-ledger.ts'

function project(cwd: string): BusinessProjectRecord {
  return {
    schemaVersion: 1,
    projectId: 'road-bid',
    module: 'tender',
    name: 'Road bid',
    rootPath: cwd,
    workflowId: 'tender-main',
    inputPaths: [],
    createdAt: '2026-08-30T00:00:00.000Z',
    updatedAt: '2026-08-30T00:00:00.000Z',
  }
}

test('missing execution telemetry injects no mandatory planning instructions', () => {
  assert.equal(renderExecutionContext(null), '')
})

test('execution ledger persists one bounded live plan per parent session', () => {
  const cwd = mkdtempSync(join(tmpdir(), 'ap-execution-ledger-'))
  const record = project(cwd)
  const first = updateSessionExecution(cwd, record, {
    sessionId: 'session-1',
    runId: 'run-1',
    stageId: 'tender-document-analysis',
    status: 'working',
    objective: '完成招标分析与 BOQ 全量提取',
    currentBatch: '补齐剩余 BOQ 行',
    planItems: [
      { id: 'parse', title: '解析源文件', status: 'done', artifactPaths: ['Official Outputs/source.md'] },
      { id: 'boq', title: '提取 BOQ', status: 'in_progress' },
    ],
    assignments: [
      { id: 'worker-1', title: '核验 BOQ 行', status: 'running', childSessionId: 'child-1', expectedOutput: 'boq-reconciliation.json' },
    ],
    blockerType: 'none',
    nextAction: '等待子任务回推后核验覆盖率',
    observedRealityDigest: 'facts-1',
  })

  assert.equal(first.revision, 1)
  assert.equal(first.plan.length, 2)
  assert.equal(executionForSession(cwd, record, 'session-1')?.assignments[0]?.childSessionId, 'child-1')
  assert.equal(loadExecutionLedger(cwd, record).sessions['session-1']?.currentBatch, '补齐剩余 BOQ 行')
  assert.equal(latestExecutionForProject(cwd, record)?.sessionId, 'session-1')
  assert.match(renderExecutionContext(first), /执行账本/)
  assert.match(renderExecutionContext(first), /补齐剩余 BOQ 行/)
})

test('heartbeats keep the revision stable while meaningful execution changes advance it', () => {
  const cwd = mkdtempSync(join(tmpdir(), 'ap-execution-revision-'))
  const record = project(cwd)
  const input = {
    sessionId: 'session-1',
    runId: 'run-1',
    stageId: 'tender-document-analysis',
    status: 'working',
    objective: '完成分析',
    currentBatch: '第一批',
    planItems: [{ id: 'one', title: '第一项', status: 'in_progress' }],
    blockerType: 'none',
    nextAction: '继续第一项',
  }
  const first = updateSessionExecution(cwd, record, input)
  const heartbeat = updateSessionExecution(cwd, record, input)
  assert.equal(heartbeat.revision, first.revision)

  const changed = updateSessionExecution(cwd, record, { ...input, currentBatch: '第二批', nextAction: '继续第二项' })
  assert.equal(changed.revision, first.revision + 1)
})

test('human blocker remains explicit instead of being treated as an automatic retry', () => {
  const cwd = mkdtempSync(join(tmpdir(), 'ap-execution-human-'))
  const record = project(cwd)
  const blocked = updateSessionExecution(cwd, record, {
    sessionId: 'session-1',
    stageId: 'bid-risk-decision',
    status: 'blocked',
    blockerType: 'human',
    blockerReason: '等待投标/不投标确认',
    blockerNeeded: '用户点击批准或拒绝',
    nextAction: '停止自动推进',
  })
  assert.equal(blocked.blocker.type, 'human')
  assert.match(renderExecutionContext(blocked), /等待投标\/不投标确认/)
})

test('switching stages starts a clean execution run and never inherits the old blocker or plan', () => {
  const cwd = mkdtempSync(join(tmpdir(), 'ap-execution-stage-isolation-'))
  const record = project(cwd)
  const old = updateSessionExecution(cwd, record, {
    sessionId: 'session-1',
    runId: 'analysis-run',
    stageId: 'tender-document-analysis',
    status: 'blocked',
    objective: '反复扫描全部招标文件',
    currentBatch: '旧批次',
    planItems: [{ id: 'scan', title: '重扫全部文件', status: 'blocked' }],
    blockerType: 'human',
    blockerReason: '旧阶段等待确认',
    nextAction: '重扫',
    summary: '旧阶段摘要',
    observedRealityDigest: 'old-reality',
  })

  const next = updateSessionExecution(cwd, record, {
    sessionId: 'session-1',
    stageId: 'pricing-basis-freeze',
    status: 'working',
  })

  assert.notEqual(next.runId, old.runId)
  assert.equal(next.revision, 1)
  assert.equal(next.objective, '')
  assert.equal(next.currentBatch, '')
  assert.deepEqual(next.plan, [])
  assert.deepEqual(next.assignments, [])
  assert.equal(next.blocker.type, 'none')
  assert.equal(next.blocker.reason, undefined)
  assert.equal(next.blocker.needed, undefined)
  assert.equal(next.nextAction, '')
  assert.equal(next.summary, undefined)
  assert.equal(next.observedRealityDigest, undefined)
  assert.equal(executionForSession(cwd, record, 'session-1', 'tender-document-analysis'), null)
  assert.equal(executionForSession(cwd, record, 'session-1', 'pricing-basis-freeze')?.runId, next.runId)
  assert.equal(latestExecutionForProject(cwd, record, 'tender-document-analysis'), null)
})
