import assert from 'node:assert/strict'
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'
import type { BusinessProjectRecord } from '../../../packages/business-projects/index.ts'
import type { TenderCapabilityId, TenderCapabilityIndex } from '../../../packages/business-core/src/tender/index.ts'
import {
  completeStage,
  inspectBoard,
  prepareStage,
  saveBoard,
  type OrchestrationBoard,
} from '../src/orchestration.ts'
import { CAPABILITY_FILE_NAMES } from '../src/fsutil.ts'
import { officialStageDir } from '../src/outputs.ts'
import { initTenderWorkspace, registerProjectSources, workspacePaths } from '../src/workspace.ts'

function project(cwd: string, module = 'tender', inputPaths: string[] = []): BusinessProjectRecord {
  return {
    schemaVersion: 1,
    projectId: 'road-bid',
    module,
    name: 'Road bid',
    rootPath: cwd,
    workflowId: module === 'tender' ? 'tender-main' : 'delivery-main',
    inputPaths,
    createdAt: '2026-08-27T00:00:00.000Z',
    updatedAt: '2026-08-27T00:00:00.000Z',
  }
}

function boardWithDoneStages(cwd: string, projectRecord: BusinessProjectRecord, doneStageIds: string[]): OrchestrationBoard {
  const stages = Object.fromEntries(doneStageIds.map((stageId) => [stageId, {
    stageId,
    status: 'done' as const,
    tasks: [],
    updatedAt: '2026-08-27T00:00:00.000Z',
    completedAt: '2026-08-27T00:00:00.000Z',
  }]))
  const board: OrchestrationBoard = {
    schemaVersion: 2,
    projectId: projectRecord.projectId,
    module: projectRecord.module,
    currentStageId: doneStageIds.at(-1),
    stages,
    updatedAt: '2026-08-27T00:00:00.000Z',
  }
  saveBoard(cwd, board)
  return board
}

function initializeTender(cwd: string): void {
  initTenderWorkspace(cwd, 'road-bid', { id: 'road-bid', title: 'Road bid', status: 'active' })
}

function writeReadyCapabilities(cwd: string, capabilities: TenderCapabilityId[]): void {
  const paths = workspacePaths(cwd, 'road-bid')
  const index = JSON.parse(readFileSync(paths.index, 'utf8')) as TenderCapabilityIndex
  const now = '2026-08-27T00:00:00.000Z'
  for (const capability of capabilities) {
    const entry = index.capabilities.find((item) => item.capability === capability)
    assert.ok(entry)
    Object.assign(entry, { revision: 1, readiness: 'ready', issueCount: 0, stale: false, updatedAt: now })
    mkdirSync(paths.packs, { recursive: true })
    writeFileSync(join(paths.packs, `${CAPABILITY_FILE_NAMES[capability]}.json`), `${JSON.stringify({
      schemaVersion: 1,
      capability,
      projectId: 'road-bid',
      revision: 1,
      coreRevision: index.coreRevision,
      upstream: [],
      updatedAt: now,
      data: {},
    }, null, 2)}\n`)
  }
  writeFileSync(paths.index, `${JSON.stringify(index, null, 2)}\n`)
}

test('prepare and complete reject a stage whose predecessor is unfinished', () => {
  const cwd = mkdtempSync(join(tmpdir(), 'ap-stage-order-'))
  const record = project(cwd)
  initializeTender(cwd)
  boardWithDoneStages(cwd, record, ['project-setup'])

  const prepared = prepareStage(cwd, record, 'planning-and-submission')
  assert.match(prepared.blocked ?? '', /前序阶段.*投标决策与重大风险/)
  assert.throws(
    () => completeStage(cwd, record, 'planning-and-submission'),
    /前序阶段.*投标决策与重大风险/,
  )
})

test('disk delivery does not implicitly complete a stage', () => {
  const cwd = mkdtempSync(join(tmpdir(), 'ap-stage-explicit-'))
  const record = project(cwd, 'delivery')
  const markdownPath = join(cwd, 'Agent Pi Outputs', 'road-bid', 'delivery', 'control.md')
  mkdirSync(join(markdownPath, '..'), { recursive: true })
  writeFileSync(markdownPath, '# Control\n' + 'verified delivery '.repeat(20))
  saveBoard(cwd, {
    schemaVersion: 2,
    projectId: record.projectId,
    module: record.module,
    currentStageId: 'delivery-controls',
    updatedAt: '2026-08-27T00:00:00.000Z',
    stages: {
      'delivery-controls': {
        stageId: 'delivery-controls',
        status: 'running',
        tasks: [{ id: 'control', title: 'Control', status: 'queued', markdownPath }],
        updatedAt: '2026-08-27T00:00:00.000Z',
      },
    },
  })

  const inspected = inspectBoard(cwd, record)
  assert.equal(inspected.stages['delivery-controls']?.tasks[0]?.status, 'done')
  assert.equal(inspected.stages['delivery-controls']?.status, 'running')
  assert.equal(inspected.stages['delivery-controls']?.completedAt, undefined)
})

test('analysis summary must contain substantive content', () => {
  const cwd = mkdtempSync(join(tmpdir(), 'ap-stage-summary-'))
  const record = project(cwd)
  initializeTender(cwd)
  boardWithDoneStages(cwd, record, ['project-setup', 'bid-risk-decision'])
  const dir = officialStageDir(cwd, record.projectId, 'tender-document-analysis')
  mkdirSync(dir, { recursive: true })
  writeFileSync(join(dir, '投标分析底稿.md'), '# 投标分析底稿\n太短。')

  assert.throws(
    () => completeStage(cwd, record, 'tender-document-analysis'),
    /投标分析底稿.*内容过短/,
  )
})

test('planning completion requires ready capability packs before output checks', () => {
  const cwd = mkdtempSync(join(tmpdir(), 'ap-stage-capabilities-'))
  const record = project(cwd)
  initializeTender(cwd)
  boardWithDoneStages(cwd, record, ['project-setup', 'bid-risk-decision', 'tender-document-analysis', 'pricing-basis-freeze', 'boq-five-step-pricing'])
  const dir = officialStageDir(cwd, record.projectId, 'planning-and-submission')
  mkdirSync(dir, { recursive: true })
  writeFileSync(join(dir, '施工与技术方案总控.md'), '# 施工与技术方案总控\n' + '施工、进度、资源、成本、现金流和技术响应。'.repeat(20))

  assert.throws(
    () => completeStage(cwd, record, 'planning-and-submission'),
    /能力包.*execution_plan.*not_ready/,
  )
})

test('planning completion requires every skill-declared hard output', () => {
  const cwd = mkdtempSync(join(tmpdir(), 'ap-stage-outputs-'))
  const record = project(cwd)
  initializeTender(cwd)
  boardWithDoneStages(cwd, record, ['project-setup', 'bid-risk-decision', 'tender-document-analysis', 'pricing-basis-freeze', 'boq-five-step-pricing'])
  writeReadyCapabilities(cwd, ['execution_plan', 'schedule_resources', 'construction_resource_schedule', 'cost_cashflow'])
  const dir = officialStageDir(cwd, record.projectId, 'planning-and-submission')
  mkdirSync(dir, { recursive: true })
  writeFileSync(join(dir, '施工与技术方案总控.md'), '# 施工与技术方案总控\n' + '施工、进度、资源、成本、现金流和技术响应。'.repeat(20))

  assert.throws(
    () => completeStage(cwd, record, 'planning-and-submission'),
    /施工策划报告\.md.*tender-programme\.msp\.xml.*tender-programme\.p6\.xml/s,
  )

  for (const fileName of [
    '施工与技术方案总控.md',
    '施工策划报告.md',
    'tender-programme.msp.xml',
    'tender-programme.p6.xml',
    'S-Curve_Cash_Flow_Chart.html',
    'Work_Plan_and_Proposed_Methodology.docx',
  ]) {
    writeFileSync(join(dir, fileName), `${fileName}\n${'verified '.repeat(20)}`)
  }

  const completed = completeStage(cwd, record, 'planning-and-submission')
  assert.equal(completed.state.status, 'done')
})

test('selected knowledge slugs are written into source worker briefs', () => {
  const cwd = mkdtempSync(join(tmpdir(), 'ap-stage-kb-'))
  const sourcePath = join(cwd, 'Volume 1 tender.md')
  writeFileSync(sourcePath, '# Tender\nregistered source')
  const record = project(cwd, 'tender', [sourcePath])
  initializeTender(cwd)
  registerProjectSources(cwd, record.projectId, { title: record.name, inputPaths: record.inputPaths })
  boardWithDoneStages(cwd, record, ['project-setup', 'bid-risk-decision'])

  const prepared = prepareStage(cwd, record, 'tender-document-analysis', ['project-spec', 'pricing-rules'])
  const briefPath = prepared.state.tasks[0]?.briefPath
  assert.ok(briefPath)
  const brief = JSON.parse(readFileSync(briefPath, 'utf8')) as { selectedKnowledgeSlugs?: string[]; selectedKnowledgeRule?: string }
  assert.deepEqual(brief.selectedKnowledgeSlugs, ['project-spec', 'pricing-rules'])
  assert.match(brief.selectedKnowledgeRule ?? '', /kb_search.*kb_read_chunk/)
})
