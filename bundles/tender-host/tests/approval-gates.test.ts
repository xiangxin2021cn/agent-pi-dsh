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
import { saveUserModule, workflowToModuleFile } from '../src/modules.ts'
import { capabilityStatus, initTenderWorkspace, workspacePaths } from '../src/workspace.ts'

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

test('final submission freeze requires the structured submission audit to be ready', () => {
  const cwd = mkdtempSync(join(tmpdir(), 'ap-final-freeze-'))
  const moduleRoot = mkdtempSync(join(tmpdir(), 'ap-final-module-'))
  const previousRoot = process.env.AGENT_PI_MODULES_ROOT
  process.env.AGENT_PI_MODULES_ROOT = moduleRoot
  try {
    saveUserModule(workflowToModuleFile(WORKFLOWS.tender!, 'tender-proven', '已验证投标范式'))
    const record = { ...project(cwd), module: 'tender-proven', workflowId: 'tender-proven-main' }
    setup(cwd, record)
    const now = '2026-08-30T00:00:00.000Z'
    const stages = Object.fromEntries(WORKFLOWS.tender.stages.map((stage) => [stage.id, {
      stageId: stage.id,
      status: stage.id === 'submission-compliance-freeze' ? 'running' : 'done',
      tasks: [],
      updatedAt: now,
      completedAt: stage.id === 'submission-compliance-freeze' ? undefined : now,
    }])) as Parameters<typeof saveBoard>[1]['stages']
    saveBoard(cwd, {
      schemaVersion: 2,
      projectId: record.projectId,
      module: record.module,
      currentStageId: 'submission-compliance-freeze',
      stages,
      updatedAt: now,
    })

    const outputDir = officialStageDir(cwd, record.projectId, 'submission-compliance-freeze')
    mkdirSync(outputDir, { recursive: true })
    writeFileSync(
      join(outputDir, '投标提交合规与冻结记录.md'),
      '# 投标提交合规与冻结记录\n\n' + '资格、签字、价格、技术、介质、截止时间与 maker-checker 核对记录。'.repeat(20),
    )

    const index = capabilityStatus(cwd, record.projectId).index
    for (const entry of index.capabilities) {
      if (entry.capability === 'submission_documents' || entry.capability === 'bidder_commitments') {
        entry.readiness = 'ready'
        entry.stale = false
      }
    }
    writeFileSync(workspacePaths(cwd, record.projectId).index, `${JSON.stringify(index, null, 2)}\n`)

    assert.throws(
      () => decideApprovalStage(cwd, record, 'submission-compliance-freeze', 'approved'),
      /submission_audit: not_ready/,
    )
  } finally {
    if (previousRoot === undefined) delete process.env.AGENT_PI_MODULES_ROOT
    else process.env.AGENT_PI_MODULES_ROOT = previousRoot
  }
})
