import assert from 'node:assert/strict'
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'
import { createBusinessProject, type BusinessProjectRecord } from '../../../packages/business-projects/index.ts'
import type { TenderCapabilityId, TenderCapabilityIndex } from '../../../packages/business-core/src/tender/index.ts'
import {
  completeStage,
  inspectBoard,
  markDispatched,
  prepareStage,
  projectForBoundSession,
  recordProjectUserRequirement,
  releaseDispatchOffer,
  resumeUnfinished,
  saveBoard,
  setProjectUserRequirementStatus,
  stageNeedsQc,
  executionControlState,
  updateProjectExecution,
  type OrchestrationBoard,
} from '../src/orchestration.ts'
import { listUserRequirements } from '../src/user-requirements.ts'
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

test('an unconfirmed prompt offer can be released and retried immediately', () => {
  const cwd = mkdtempSync(join(tmpdir(), 'ap-stage-release-'))
  const record = project(cwd, 'delivery')

  const first = resumeUnfinished(cwd, record)
  assert.ok(first.draft)
  assert.ok(first.dispatch)
  const locked = resumeUnfinished(cwd, record)
  assert.equal(locked.alreadyDispatched, true)

  const released = releaseDispatchOffer(cwd, record, first.dispatch!.stageId, first.dispatch!.key)
  assert.equal(released.released, true)
  const retried = resumeUnfinished(cwd, record)
  assert.ok(retried.draft)
  assert.deepEqual(retried.dispatch, first.dispatch)
})

test('main-agent execution updates turn resume into a delta alignment draft', () => {
  const cwd = mkdtempSync(join(tmpdir(), 'ap-execution-alignment-'))
  const record = createBusinessProject({
    workspaceRootPath: cwd,
    projectId: 'road-bid',
    module: 'delivery',
    name: 'Road bid',
    rootPath: cwd,
    workflowId: 'delivery-main',
    createDirectory: false,
  })
  const first = resumeUnfinished(cwd, record, [], { sessionId: 'session-1' })
  assert.ok(first.draft)
  assert.match(first.draft ?? '', /execution_update/)
  assert.ok(first.dispatch)
  markDispatched(cwd, record, first.dispatch!.stageId, first.dispatch!.key)

  const controlBefore = executionControlState(cwd, record, 'session-1')
  assert.equal(controlBefore.alignment, 'missing')
  updateProjectExecution(cwd, record, {
    sessionId: 'session-1',
    runId: 'run-1',
    stageId: first.stageId!,
    status: 'working',
    objective: '交付当前阶段',
    currentBatch: '第一批成果',
    planItems: [{ id: 'draft', title: '完成阶段成果', status: 'in_progress' }],
    blockerType: 'none',
    nextAction: '继续编制第一批成果',
    observedRealityDigest: controlBefore.realityDigest,
  })

  const aligned = resumeUnfinished(cwd, record, [], { sessionId: 'session-1' })
  assert.match(aligned.draft ?? '', /【执行账本对齐/)
  assert.match(aligned.draft ?? '', /第一批成果/)
  assert.match(aligned.draft ?? '', /系统事实版本/)
  assert.doesNotMatch(aligned.draft ?? '', /主智能体尚未回写执行计划/)
})

test('main-chat requirements persist, reopen the stage once, and resume with a delta-only draft', () => {
  const cwd = mkdtempSync(join(tmpdir(), 'ap-user-requirement-'))
  const record = createBusinessProject({
    workspaceRootPath: cwd,
    projectId: 'road-bid',
    module: 'delivery',
    name: 'Road bid',
    rootPath: cwd,
    workflowId: 'delivery-main',
    createDirectory: false,
  })
  const initial = resumeUnfinished(cwd, record)
  assert.ok(initial.dispatch)

  const text = '只修改重大风险结论和澄清清单，不要重做已完成的招标文件解析。'
  const first = recordProjectUserRequirement(cwd, record, { sessionId: 'session-1', text })
  assert.equal(first.requirement.status, 'active')
  assert.equal(projectForBoundSession(cwd, 'session-1')?.projectId, record.projectId)
  assert.throws(() => completeStage(cwd, record, first.requirement.stageId), /用户最新要求尚未落实/)

  const requirementResume = resumeUnfinished(cwd, record)
  assert.match(requirementResume.draft ?? '', /【用户最新要求/)
  assert.match(requirementResume.draft ?? '', /只做影响分析和定点修改/)
  assert.match(requirementResume.draft ?? '', /禁止重做已完成解析、组价或评审/)
  assert.match(requirementResume.draft ?? '', new RegExp(first.requirement.id))
  assert.ok(requirementResume.dispatch)
  markDispatched(cwd, record, requirementResume.dispatch!.stageId, requirementResume.dispatch!.key)

  const duplicate = recordProjectUserRequirement(cwd, record, { sessionId: 'session-1', text })
  assert.equal(duplicate.requirement.id, first.requirement.id)
  assert.equal(listUserRequirements(cwd, record).length, 1)
  assert.equal(resumeUnfinished(cwd, record).alreadyDispatched, true)

  setProjectUserRequirementStatus(cwd, record, first.requirement.id, 'implemented', {
    note: '已定点修改风险结论。',
    evidencePaths: ['Agent Pi Outputs/road-bid/risk/重大风险结论.md'],
  })
  const waitingForUser = resumeUnfinished(cwd, record)
  assert.equal(waitingForUser.draft, undefined)
  assert.match(waitingForUser.blocked ?? '', /已落实.*等待用户.*采用为验收口径.*继续修改/s)
  assert.throws(
    () => completeStage(cwd, record, first.requirement.stageId),
    /已落实但尚待用户验收/,
  )

  const accepted = setProjectUserRequirementStatus(cwd, record, first.requirement.id, 'accepted')
  assert.equal(accepted.requirement.status, 'accepted')
  assert.deepEqual(accepted.requirement.evidencePaths, ['Agent Pi Outputs/road-bid/risk/重大风险结论.md'])

  const closeout = resumeUnfinished(cwd, record)
  assert.match(closeout.draft ?? '', /【用户验收口径已确认 — 只做硬门禁收口】/)
  assert.match(closeout.draft ?? '', /旧的文件名、篇幅、章节、报告数量和视图门禁不得再次触发返工/)
  assert.match(closeout.draft ?? '', /不是新的阶段总任务/)
  assert.doesNotMatch(closeout.draft ?? '', /【阶段切换/)
  assert.ok(closeout.dispatch)
  markDispatched(cwd, record, closeout.dispatch!.stageId, closeout.dispatch!.key)
  assert.equal(resumeUnfinished(cwd, record).alreadyDispatched, true)

  const repeatedByUser = recordProjectUserRequirement(cwd, record, { sessionId: 'session-1', text })
  assert.equal(repeatedByUser.requirement.id, first.requirement.id)
  assert.equal(repeatedByUser.requirement.status, 'active')
  assert.equal(repeatedByUser.requirement.evidencePaths, undefined)
  assert.equal(listUserRequirements(cwd, record).length, 1)
  assert.match(resumeUnfinished(cwd, record).draft ?? '', /【用户最新要求/)
})

test('an accepted baseline never substitutes for a separate human approval gate', () => {
  const cwd = mkdtempSync(join(tmpdir(), 'ap-user-approval-'))
  const record = project(cwd)
  initializeTender(cwd)
  boardWithDoneStages(cwd, record, ['project-setup'])
  const added = recordProjectUserRequirement(cwd, record, {
    sessionId: 'session-approval',
    stageId: 'bid-risk-decision',
    text: '风险结论采用一页决策表，不再生成旧版长报告。',
  })
  setProjectUserRequirementStatus(cwd, record, added.requirement.id, 'implemented')
  setProjectUserRequirementStatus(cwd, record, added.requirement.id, 'accepted')

  const closeout = resumeUnfinished(cwd, record)
  assert.match(closeout.draft ?? '', /独立人工决策门/)
  assert.match(closeout.draft ?? '', /确认投标，继续/)
  assert.match(closeout.draft ?? '', /不得代替用户审批/)
  assert.doesNotMatch(closeout.draft ?? '', /调用 tender_stage complete_stage/)
})

test('an accepted baseline cannot bypass a missing structured capability pack', () => {
  const cwd = mkdtempSync(join(tmpdir(), 'ap-user-capability-'))
  const record = project(cwd)
  initializeTender(cwd)
  boardWithDoneStages(cwd, record, [
    'project-setup',
    'bid-risk-decision',
    'tender-document-analysis',
    'pricing-basis-freeze',
    'boq-five-step-pricing',
  ])
  const added = recordProjectUserRequirement(cwd, record, {
    sessionId: 'session-capability',
    stageId: 'planning-and-submission',
    text: '采用现有施工方案结构，不再生成旧版固定文件名。',
  })
  setProjectUserRequirementStatus(cwd, record, added.requirement.id, 'implemented')
  setProjectUserRequirementStatus(cwd, record, added.requirement.id, 'accepted')

  assert.throws(
    () => completeStage(cwd, record, 'planning-and-submission'),
    /能力包.*execution_plan.*not_ready/,
  )
})

test('an accepted user baseline replaces only soft presentation gates', () => {
  const base = {
    stageId: 'tender-document-analysis', stageLabel: '招标文件分析', stageStatus: 'running',
    chain: [], tasks: { total: 0, done: 0, error: 0, unfinished: [] },
    artifacts: { missingMarkdown: [], missingReport: [] },
    summary: { fileName: '投标分析底稿.md', exists: false, bytes: 0 },
    suite: { ok: false, files: [], shortGaps: '旧专题视图未齐' },
    boqInventory: { ok: true, required: true, shortGaps: '' },
    citations: { total: 0, orphans: 0 },
    userRequirements: { active: 0, implemented: 0, accepted: 1 },
    userRequirementOverride: true,
    outputFolder: 'analysis',
  }
  assert.equal(stageNeedsQc(base as never), false)
  assert.equal(stageNeedsQc({
    ...base,
    userRequirements: { active: 0, implemented: 1, accepted: 0 },
    userRequirementOverride: false,
  } as never), true)
  assert.equal(stageNeedsQc({
    ...base,
    boqInventory: { ok: false, required: true, shortGaps: '缺实际 BOQ 行与 sheet+cell 来源' },
  } as never), true)
  assert.equal(stageNeedsQc({
    ...base,
    evidence: { blocking: true, gapCount: 1, waived: false },
  } as never), true)
  assert.equal(stageNeedsQc({
    ...base,
    citations: { total: 1, orphans: 1 },
  } as never), true)
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
