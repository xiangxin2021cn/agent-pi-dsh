import assert from 'node:assert/strict'
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'
import type { BusinessProjectRecord } from '../../../packages/business-projects/index.ts'
import {
  completeStage,
  decideApprovalStage,
  resumeUnfinished,
  saveBoard,
} from '../src/orchestration.ts'
import { officialStageDir } from '../src/outputs.ts'
import { WORKFLOWS } from '../src/workflows.ts'
import { initTenderWorkspace } from '../src/workspace.ts'

function project(cwd: string): BusinessProjectRecord {
  return {
    schemaVersion: 1,
    projectId: 'approval-bid',
    module: 'tender',
    name: 'Approval bid',
    rootPath: cwd,
    workflowId: 'tender-main',
    inputPaths: [join(cwd, 'tender.md')],
    createdAt: '2026-08-29T00:00:00.000Z',
    updatedAt: '2026-08-29T00:00:00.000Z',
  }
}

function setup(cwd: string, record: BusinessProjectRecord): void {
  writeFileSync(record.inputPaths[0]!, '# tender')
  initTenderWorkspace(cwd, record.projectId, { id: record.projectId, title: record.name, status: 'active' })
  saveBoard(cwd, {
    schemaVersion: 2,
    projectId: record.projectId,
    module: record.module,
    currentStageId: 'project-setup',
    stages: {
      'project-setup': {
        stageId: 'project-setup',
        status: 'done',
        tasks: [],
        updatedAt: '2026-08-29T00:00:00.000Z',
        completedAt: '2026-08-29T00:00:00.000Z',
      },
    },
    updatedAt: '2026-08-29T00:00:00.000Z',
  })
}

function writeDecisionMemo(cwd: string, projectId: string): void {
  const dir = officialStageDir(cwd, projectId, 'bid-risk-decision')
  mkdirSync(dir, { recursive: true })
  writeFileSync(
    join(dir, '投标决策与重大风险评估.md'),
    '# 投标决策与重大风险评估\n\n' + '资格、评分、合同、保函、风险、缺口和投标条件。'.repeat(30),
  )
}

test('tender workflow is seven stages with three explicit user gates', () => {
  assert.deepEqual(WORKFLOWS.tender.stages.map((stage) => stage.id), [
    'project-setup',
    'bid-risk-decision',
    'tender-document-analysis',
    'pricing-basis-freeze',
    'boq-five-step-pricing',
    'planning-and-submission',
    'submission-compliance-freeze',
  ])
  assert.deepEqual(
    WORKFLOWS.tender.stages.filter((stage) => stage.approvalGate).map((stage) => stage.id),
    ['bid-risk-decision', 'pricing-basis-freeze', 'submission-compliance-freeze'],
  )
})

test('model completion stops at the bid decision until the user approves', () => {
  const cwd = mkdtempSync(join(tmpdir(), 'ap-approval-'))
  const record = project(cwd)
  setup(cwd, record)
  writeDecisionMemo(cwd, record.projectId)

  assert.throws(
    () => completeStage(cwd, record, 'bid-risk-decision'),
    /等待用户人工决策/,
  )
  const waiting = resumeUnfinished(cwd, record)
  assert.equal(waiting.stageId, 'bid-risk-decision')
  assert.match(waiting.blocked ?? '', /工作台.*确认投标/)

  const decided = decideApprovalStage(cwd, record, 'bid-risk-decision', 'approved')
  assert.equal(decided.state.status, 'done')
  assert.equal(decided.state.approval?.decision, 'approved')
  assert.equal(resumeUnfinished(cwd, record).stageId, 'tender-document-analysis')
})

test('rejecting the bid decision persists a blocked stop state', () => {
  const cwd = mkdtempSync(join(tmpdir(), 'ap-reject-'))
  const record = project(cwd)
  setup(cwd, record)
  writeDecisionMemo(cwd, record.projectId)

  const rejected = decideApprovalStage(cwd, record, 'bid-risk-decision', 'rejected', '商业风险不可接受')
  assert.equal(rejected.state.status, 'blocked')
  assert.equal(rejected.state.approval?.decision, 'rejected')
  assert.match(resumeUnfinished(cwd, record).blocked ?? '', /商业风险不可接受/)
})
