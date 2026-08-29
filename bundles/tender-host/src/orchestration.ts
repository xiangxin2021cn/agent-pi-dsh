import { createHash } from 'node:crypto'
import { basename, dirname, join, resolve } from 'node:path'
import { existsSync, readFileSync, readdirSync, renameSync, statSync } from 'node:fs'
import { listBusinessProjects, type BusinessProjectRecord } from '../../../packages/business-projects/index.ts'
import type { TenderCapabilityId } from '../../../packages/business-core/src/tender/index.ts'
import { assessEvidence, evidencePolicy, forcePassEvidence, forcePassPricingIntel } from './evidence.ts'
import { tenderDir, writeJson, readJson, ensureDir } from './fsutil.ts'
import type { WorkflowStage } from './workflows.ts'
import { listWorkbenchModules, workflowFor } from './modules.ts'
import { capabilityStatus, loadWorkspace, registerProjectSources } from './workspace.ts'
import { listOfficialOutputs, officialDestForHarvest, officialProjectDir, officialStageDir, officialStageFolder, syncProjectOutputs, syncWorkbenchOutputs } from './outputs.ts'
import { knowledgeStatus, resolveBindingFiles, type BindingFile } from './knowledge.ts'
import { kbDisplayName, listKbEntries } from './kb.ts'
import { auditProjectCitations, loadCitationAudit, type CitationAudit } from './citations.ts'
import { BOQ_PRICING_WORKBOOK_FILE, pricingWorkbookMissing } from './pricing-workbook.ts'
import { enterpriseProductivityDraftNote, seedEnterpriseProductivityMemo } from './productivity-source.ts'
import { KB_PACK_KIND } from './kb-pack.ts'
import { SETUP_RESTORE_KIND, findSetupRestore, listSetupRestores } from './setup-restore.ts'
import { liveWorkerLimitLineZh } from './concurrency.ts'
import { capabilitySchemaHint, PRICING_LOCAL_INTEL_CHECK, PRICING_WEB_RATE_CHECK, SA_LABOUR_WAGE_CHECK } from './capability-schema.ts'
import { SA_LABOUR_WAGE_DRAFT_ZH } from './sa-labour.ts'
import {
  buildPricingIntelDraft,
  buildPricingWaiverDraft,
  evaluatePricingIntelGate,
  pricingIntelGateRejectReason,
  pricingLocalIntelApplies,
  renderPricingIntelBlock,
  PRICING_LOCAL_INTEL_DRAFT_ZH,
} from './pricing-local-intel.ts'
import {
  ANALYSIS_SUITE,
  ANALYSIS_SUITE_STAGE_ID,
  analysisSuiteApplies,
  analysisSuiteRejectReason,
  assessAnalysisSuite,
  renderAnalysisSuiteBlock,
  type AnalysisSuiteStatus,
} from './analysis-suite.ts'
import {
  assessBoqInventoryGate,
  boqInventoryApplies,
  boqInventoryRejectReason,
  renderBoqInventoryBlock,
  type BoqInventoryGate,
} from './boq-inventory-gate.ts'

export interface StageTask {
  id: string
  title: string
  sourcePath?: string
  status: 'queued' | 'running' | 'done' | 'error'
  briefPath?: string
  reportPath?: string
  markdownPath?: string
  childSessionId?: string
  error?: string
}

/**
 * Dispatch bookkeeping for one stage: `key` fingerprints the slice state the draft
 * was built from; `offeredAt` soft-locks concurrent windows; `dispatchedAt` records
 * a confirmed write into the parent session. A stage is re-dispatchable only after
 * its fingerprint changes (real progress or reset).
 */
export interface StageDispatch {
  key: string
  offeredAt: string
  dispatchedAt?: string
}

export interface StageApproval {
  decision: 'approved' | 'rejected'
  decidedAt: string
  note?: string
}

export interface StageSlice {
  stageId: string
  status: 'idle' | 'running' | 'blocked' | 'done'
  tasks: StageTask[]
  updatedAt: string
  forcePassedAt?: string
  completedAt?: string
  blockedReason?: string
  dispatch?: StageDispatch
  approval?: StageApproval
}

/** Legacy single-stage file shape, still returned by loadStageState for tools. */
export interface StageState extends StageSlice {
  schemaVersion: 1
  projectId: string
  module: string
}

export interface OrchestrationBoard {
  schemaVersion: 2
  projectId: string
  module: string
  currentStageId?: string
  stages: Record<string, StageSlice>
  updatedAt: string
}

export function orchestrationDir(cwd: string, projectId: string): string {
  return join(tenderDir(cwd, projectId), 'orchestration')
}

export function stageStatePath(cwd: string, projectId: string): string {
  return join(orchestrationDir(cwd, projectId), 'stage-state.json')
}

function emptyBoard(projectId: string, module: string): OrchestrationBoard {
  return {
    schemaVersion: 2,
    projectId,
    module,
    stages: {},
    updatedAt: new Date().toISOString(),
  }
}

function asSlice(value: Partial<StageSlice> & { stageId: string }): StageSlice {
  return {
    stageId: value.stageId,
    status: value.status === 'running' || value.status === 'blocked' || value.status === 'done' ? value.status : 'idle',
    tasks: Array.isArray(value.tasks) ? value.tasks : [],
    updatedAt: value.updatedAt ?? new Date().toISOString(),
    forcePassedAt: value.forcePassedAt,
    completedAt: value.completedAt,
    blockedReason: value.blockedReason,
    dispatch: value.dispatch,
    approval: value.approval,
  }
}

/** Fingerprint of the observable slice state a stage draft is built from. */
export function dispatchFingerprint(slice: StageSlice, extra = ''): string {
  return [
    slice.stageId,
    slice.status,
    slice.blockedReason ?? '',
    slice.forcePassedAt ?? '',
    slice.tasks.map((task) => `${task.id}:${task.status}`).join(','),
    extra,
  ].join('|')
}

/** Milliseconds a fingerprint offer soft-locks re-dispatch across windows/ticks. */
const DISPATCH_OFFER_TTL_MS = 90_000

export function loadBoard(cwd: string, projectId: string, module = 'tender'): OrchestrationBoard {
  const path = stageStatePath(cwd, projectId)
  if (!existsSync(path)) return emptyBoard(projectId, module)
  const raw = readJson<Record<string, unknown>>(path, {})
  if (raw && raw.schemaVersion === 2 && raw.stages && typeof raw.stages === 'object') {
    const stages: Record<string, StageSlice> = {}
    for (const [id, slice] of Object.entries(raw.stages as Record<string, StageSlice>)) {
      stages[id] = asSlice({ ...slice, stageId: slice.stageId || id })
    }
    return {
      schemaVersion: 2,
      projectId: String(raw.projectId || projectId),
      module: String(raw.module || module),
      currentStageId: typeof raw.currentStageId === 'string' ? raw.currentStageId : undefined,
      stages,
      updatedAt: String(raw.updatedAt || new Date().toISOString()),
    }
  }
  if (raw && raw.stageId) {
    const slice = asSlice({
      stageId: String(raw.stageId),
      status: raw.status as StageSlice['status'],
      tasks: raw.tasks as StageTask[],
      updatedAt: String(raw.updatedAt || ''),
      forcePassedAt: typeof raw.forcePassedAt === 'string' ? raw.forcePassedAt : undefined,
    })
    return {
      schemaVersion: 2,
      projectId: String(raw.projectId || projectId),
      module: String(raw.module || module),
      currentStageId: slice.stageId,
      stages: { [slice.stageId]: slice },
      updatedAt: slice.updatedAt,
    }
  }
  return emptyBoard(projectId, module)
}

export function saveBoard(cwd: string, board: OrchestrationBoard): void {
  writeJson(stageStatePath(cwd, board.projectId), board)
}

export function loadStageState(cwd: string, projectId: string): StageState | null {
  const board = loadBoard(cwd, projectId)
  const stageId = board.currentStageId
  if (!stageId) return null
  const slice = board.stages[stageId]
  if (!slice) return null
  return {
    schemaVersion: 1,
    projectId: board.projectId,
    module: board.module,
    ...slice,
  }
}

export function saveStageState(cwd: string, state: StageState): void {
  const board = loadBoard(cwd, state.projectId, state.module)
  board.currentStageId = state.stageId
  board.module = state.module
  board.stages[state.stageId] = asSlice(state)
  board.updatedAt = state.updatedAt
  saveBoard(cwd, board)
}

const DELIVERABLE_MIN_BYTES = 80

const TENDER_STAGE_REQUIRED_CAPABILITIES: Partial<Record<string, TenderCapabilityId[]>> = {
  'tender-document-analysis': ['document_analysis', 'boq_reconciliation'],
  'boq-five-step-pricing': ['boq_five_step_pricing'],
  'planning-and-submission': ['execution_plan', 'schedule_resources', 'construction_resource_schedule', 'cost_cashflow'],
  'submission-compliance-freeze': ['submission_documents', 'bidder_commitments'],
}

const PLANNING_REQUIRED_DELIVERABLES = [
  '施工策划报告.md',
  'tender-programme.msp.xml',
  'tender-programme.p6.xml',
  'S-Curve_Cash_Flow_Chart.html',
  'Work_Plan_and_Proposed_Methodology.docx',
]

function fileExists(path?: string): boolean {
  return Boolean(path && existsSync(path))
}

function deliverableReady(path?: string): boolean {
  if (!fileExists(path)) return false
  try {
    return statSync(path!).size > DELIVERABLE_MIN_BYTES
  } catch {
    return false
  }
}

function tenderCapabilityGaps(cwd: string, projectId: string, stageId: string): string[] {
  const required = TENDER_STAGE_REQUIRED_CAPABILITIES[stageId] ?? []
  if (required.length === 0) return []
  const index = capabilityStatus(cwd, projectId).index
  return required.flatMap((capability) => {
    const entry = index.capabilities.find((item) => item.capability === capability)
    if (!entry) return [`${capability}: missing`]
    if (entry.readiness !== 'ready' || entry.stale) {
      return [`${capability}: ${entry.readiness}${entry.stale ? ', stale' : ''}`]
    }
    return []
  })
}

function planningDeliverableGaps(cwd: string, projectId: string, stageId: string): string[] {
  if (stageId !== 'planning-and-submission') return []
  const dir = officialStageDir(cwd, projectId, stageId)
  return PLANNING_REQUIRED_DELIVERABLES.filter((fileName) => !deliverableReady(join(dir, fileName)))
}

/**
 * Reconcile one task against disk. Already-done tasks are trusted: do not re-read
 * their JSON ledgers after a parent crash/restart. Unfinished tasks still accept
 * a newly written Official Output or report (normal completion, or a worker that
 * wrote files but never updated the board).
 */
function inspectTask(task: StageTask): StageTask {
  if (task.status === 'done') {
    if (task.markdownPath && !existsSync(task.markdownPath)) {
      return { ...task, status: 'error', error: '客户成果缺失' }
    }
    return task
  }
  if (deliverableReady(task.markdownPath)) {
    return { ...task, status: 'done', error: undefined }
  }
  if (task.reportPath && existsSync(task.reportPath)) {
    try {
      const raw = readFileSync(task.reportPath, 'utf8')
      const report = JSON.parse(raw) as { error?: unknown; status?: string }
      if (report.error) {
        return { ...task, status: 'error', error: String(report.error) }
      }
      if (report.status === 'error' || report.status === 'failed') {
        return { ...task, status: 'error', error: task.error }
      }
      return { ...task, status: 'done', error: undefined }
    } catch {
      return { ...task, status: 'error', error: '报告 JSON 无法解析' }
    }
  }
  return task
}

function sliceStatusFromTasks(slice: StageSlice, gatesReady = true): StageSlice['status'] {
  if (slice.status === 'blocked' && slice.tasks.length === 0) return 'blocked'
  if (slice.tasks.length === 0) {
    return slice.status === 'done' || slice.completedAt ? 'done' : 'idle'
  }
  if (slice.tasks.every((task) => task.status === 'done')) {
    return gatesReady && (slice.status === 'done' || Boolean(slice.completedAt)) ? 'done' : 'running'
  }
  if (slice.tasks.some((task) => task.status === 'running')) return 'running'
  if (slice.tasks.some((task) => task.status === 'error')) return slice.status === 'blocked' ? 'blocked' : 'idle'
  return slice.status === 'blocked' ? 'blocked' : 'idle'
}

function inspectSlice(slice: StageSlice, gatesReady = true): StageSlice {
  const tasks = slice.tasks.map(inspectTask)
  const next: StageSlice = { ...slice, tasks, updatedAt: new Date().toISOString() }
  const status = sliceStatusFromTasks(next, gatesReady)
  next.status = status
  if (status !== 'done') next.completedAt = undefined
  if (status !== 'blocked') next.blockedReason = undefined
  return next
}

function analysisHardGatesReady(cwd: string, projectId: string, stageId: string): boolean {
  if (!analysisSuiteApplies(stageId)) return true
  const dir = officialStageDir(cwd, projectId, stageId)
  let summaryName = '投标分析底稿.md'
  try {
    const stage = workflowFor('tender').stages.find((item) => item.id === stageId)
    if (stage?.summaryDeliverable?.fileName) summaryName = stage.summaryDeliverable.fileName
  } catch { /* factory name stands */ }
  return deliverableReady(join(dir, summaryName))
    && assessAnalysisSuite(dir).ok
    && assessBoqInventoryGate(cwd, projectId, dir).ready
}

function pricingIntelGateFor(cwd: string, projectId: string, stageId: string) {
  if (!pricingLocalIntelApplies(stageId)) return undefined
  let waived = false
  try {
    waived = evidencePolicy(cwd, projectId).pricingIntelWaived
  } catch { /* ledger missing: treat as not waived */ }
  return evaluatePricingIntelGate(officialStageDir(cwd, projectId, stageId), waived)
}

function pricingHardGatesReady(cwd: string, projectId: string, stageId: string): boolean {
  const gate = pricingIntelGateFor(cwd, projectId, stageId)
  return !gate || gate.ready
}

function stageHardGatesReady(cwd: string, project: BusinessProjectRecord, stageId: string): boolean {
  const stage = workflowFor(project.module).stages.find((item) => item.id === stageId)
  const summaryReady = !stage?.summaryDeliverable
    || deliverableReady(join(officialStageDir(cwd, project.projectId, stageId), stage.summaryDeliverable.fileName))
  const workbookReady = !pricingWorkbookMissing(cwd, project.projectId, stageId)
  const capabilitiesReady = project.module !== 'tender'
    || tenderCapabilityGaps(cwd, project.projectId, stageId).length === 0
  const planningReady = project.module !== 'tender'
    || planningDeliverableGaps(cwd, project.projectId, stageId).length === 0
  return summaryReady
    && workbookReady
    && capabilitiesReady
    && planningReady
    && analysisHardGatesReady(cwd, project.projectId, stageId)
    && pricingHardGatesReady(cwd, project.projectId, stageId)
}

/** Pending-only view for the parent model. Completed JSON ledgers stay off this payload. */
export function slimStageStatus(board: OrchestrationBoard) {
  const slimCurrent = (slice: StageSlice) => {
    const pending = pendingTasks(slice)
    return {
      stageId: slice.stageId,
      status: slice.status,
      done: slice.tasks.length - pending.length,
      total: slice.tasks.length,
      doneIds: slice.tasks.filter((task) => task.status === 'done').map((task) => task.id).slice(0, 40),
      pending: pending.map((task) => ({
        id: task.id,
        title: task.title,
        status: task.status,
        markdownPath: task.markdownPath,
        hasMarkdown: fileExists(task.markdownPath),
        hasReport: fileExists(task.reportPath),
        childSessionId: task.childSessionId,
        error: task.error,
      })),
    }
  }
  const current = board.currentStageId ? board.stages[board.currentStageId] : undefined
  return {
    projectId: board.projectId,
    currentStageId: board.currentStageId,
    current: current ? slimCurrent(current) : null,
    stages: Object.fromEntries(Object.entries(board.stages).map(([id, slice]) => [id, {
      stageId: slice.stageId,
      status: slice.status,
      done: slice.tasks.filter((task) => task.status === 'done').length,
      total: slice.tasks.length,
    }])),
  }
}

function attachSetupRestorePaths(
  cwd: string,
  project: BusinessProjectRecord,
  slice: StageSlice,
): StageSlice {
  const setupId = workflowFor(project.module).setupStageId
  if (!setupId || slice.stageId !== setupId) return slice
  return {
    ...slice,
    tasks: slice.tasks.map((task) => {
      if (!task.sourcePath) return task
      const restore = findSetupRestore(cwd, project.projectId, task.sourcePath)
      if (!restore) return task
      return {
        ...task,
        markdownPath: restore.manuscriptPath,
        reportPath: restore.packPath,
      }
    }),
  }
}

/**
 * When the user saves Official Outputs Markdown, stamp the paired
 * orchestration report so later stages see the revision. Structured
 * analysis sections are marked stale; pack-like `units` are rebuilt
 * from the new text.
 */
export function syncOrchestrationReportFromMarkdown(
  cwd: string,
  markdownPath: string,
  text: string,
): { reportPath: string; projectId: string } | null {
  const resolved = resolve(markdownPath)
  const hash = createHash('sha256').update(text, 'utf8').digest('hex')
  const now = new Date().toISOString()
  for (const project of listBusinessProjects(cwd)) {
    const board = loadBoard(cwd, project.projectId, project.module)
    for (const slice of Object.values(board.stages)) {
      for (const task of slice.tasks) {
        if (!task.reportPath || !task.markdownPath) continue
        if (resolve(task.markdownPath).replace(/\\/g, '/').toLowerCase() !== resolved.replace(/\\/g, '/').toLowerCase()) {
          continue
        }
        let report: Record<string, unknown> = {}
        if (existsSync(task.reportPath)) {
          try {
            report = JSON.parse(readFileSync(task.reportPath, 'utf8')) as Record<string, unknown>
          } catch {
            report = {}
          }
        }
        // setup/ pack.json is rebuilt by syncPackSidecarFromMarkdown; do not
        // treat its `manuscript` filename field as analysis body text.
        if (
          report.kind === KB_PACK_KIND
          || report.role === SETUP_RESTORE_KIND
          || basename(task.reportPath).toLowerCase() === 'pack.json'
        ) {
          continue
        }
        report.markdownPath = task.markdownPath
        report.markdownHash = hash
        report.markdownRevisedAt = now
        if (typeof report.markdown === 'string') report.markdown = text
        if (typeof report.body === 'string') report.body = text
        if (typeof report.manuscript === 'string') report.manuscript = text
        if (Array.isArray(report.sections)) report.staleStructured = true
        writeJson(task.reportPath, report)
        return { reportPath: task.reportPath, projectId: project.projectId }
      }
    }
  }
  return null
}

export function inspectBoard(cwd: string, project: BusinessProjectRecord): OrchestrationBoard {
  const board = loadBoard(cwd, project.projectId, project.module)
  const next: OrchestrationBoard = {
    ...board,
    stages: { ...board.stages },
    updatedAt: new Date().toISOString(),
  }
  for (const [id, slice] of Object.entries(next.stages)) {
    next.stages[id] = attachSetupRestorePaths(
      cwd,
      project,
      inspectSlice(slice, stageHardGatesReady(cwd, project, id)),
    )
  }
  if (project.module === 'tender') {
    try { assessEvidence(cwd, project.projectId) } catch { /* ignore */ }
  }
  syncProjectOutputs(cwd, project.projectId, project.module, next.currentStageId)
  saveBoard(cwd, next)
  return next
}

export function workbenchSnapshot(cwd: string, module?: string) {
  syncWorkbenchOutputs(cwd)
  const projects = listBusinessProjects(cwd, module)
  const inspected = projects.map((project) => {
    try { inspectBoard(cwd, project) } catch { /* keep listing even if one project is stale */ }
    return projectSnapshot(cwd, project)
  })
  const catalog = listWorkbenchModules()
  return {
    cwd,
    knowledge: knowledgeStatus(),
    modules: catalog.modules.map(({ workflow: _workflow, ...info }) => info),
    moduleErrors: catalog.errors,
    workflows: module ? [workflowFor(module)] : catalog.modules.map((item) => item.workflow),
    projects: inspected,
    inspectedAt: new Date().toISOString(),
  }
}

export function projectSnapshot(cwd: string, project: BusinessProjectRecord) {
  // Orchestration state lives in the workspace (`<cwd>/.agent-pi`); project.rootPath
  // is the material/deliverable folder named in stage drafts, never a state root.
  const board = loadBoard(cwd, project.projectId, project.module)
  const current = board.currentStageId ? board.stages[board.currentStageId] : undefined
  const evidence = project.module === 'tender'
    ? evidencePolicy(cwd, project.projectId)
    : null
  const outputs = listOfficialOutputs(cwd, project.projectId, project.module)
  let citationAudit: CitationAudit | null = null
  try { citationAudit = loadCitationAudit(cwd, project.projectId, project.module) } catch { /* stale ledger */ }
  return {
    project,
    workflow: workflowFor(project.module),
    stage: current
      ? {
          schemaVersion: 1 as const,
          projectId: project.projectId,
          module: project.module,
          ...current,
        }
      : null,
    stages: board.stages,
    currentStageId: board.currentStageId,
    evidence,
    citationAudit,
    outputs,
    restores: listSetupRestores(cwd, project.projectId),
  }
}

/** Resolved bindings for one stage; empty when the module/profile declares none. */
export function stageBindings(project: BusinessProjectRecord, stageId: string): BindingFile[] {
  let area: BindingFile['area'] | undefined
  let pack: string[] | undefined
  try {
    const workflow = workflowFor(project.module)
    area = workflow.bindingAreaByStage?.[stageId]
    pack = workflow.kbPack?.[area ?? 'analysis']
  } catch {
    return []
  }
  if (!area) return []
  if (pack) {
    const catalog = new Map(listKbEntries().map((entry) => [entry.slug, entry]))
    return pack.flatMap((slug) => {
      const entry = catalog.get(slug)
      if (!entry) return []
      return [{
        area,
        key: slug,
        role: 'kb',
        title: kbDisplayName(entry),
        path: '',
        exists: true,
        slug,
      }]
    })
  }
  try {
    return resolveBindingFiles().files.filter((file) => file.area === area && file.exists)
  } catch {
    return []
  }
}

function registeredSourcesBlock(paths: string[]): string {
  if (paths.length === 0) {
    return '用户明确登记的输入资料: 暂无；开始分析前请由用户明确添加资料。'
  }
  if (paths.length <= 4) {
    return `用户明确登记的输入资料（${paths.length} 份，完整路径见 tender_stage status）:\n${paths.map((path) => `- ${basename(path)}`).join('\n')}`
  }
  return `用户明确登记的输入资料：共 ${paths.length} 份。完整清单用 tender_stage status 查看，不要把路径列表贴进对话。`
}

function bindingLines(rows: BindingFile[]): string {
  return rows.map((row) => {
    const name = row.title ?? row.key
    if (row.slug) return `- [${row.role}] ${name} · kb_search slug=${row.slug}`
    return `- [${row.role}] ${name}`
  }).join('\n')
}

export function buildStageDraft(project: BusinessProjectRecord, stage: WorkflowStage, extra = ''): string {
  const skillNames = stage.skillSlugs.length > 0 ? stage.skillSlugs.join('、') : '（无）'
  const registered = registeredSourcesBlock(project.inputPaths)
  const bindings = stageBindings(project, stage.id)
  const bindingBlock = bindings.length > 0
    ? `\n方法标准与范文模板（动笔前 kb_search / read；只借结构与写法，项目事实以本项目资料为准）:\n${bindingLines(bindings)}\n`
    : ''
  const returnRule = `\n- 回推：分析写手/组价工人写完必须 report「DONE 文件名 md行数=N」；评审必须 report ACCEPT_AND_PROCEED 或 REVISE_AND_RETRY。只在子对话发言不算回推。派出后不要结束本轮空等 DONE；回传或用户新指令到达后立刻继续。`
  const reviewRule = stage.reviewSkillSlugs && stage.reviewSkillSlugs.length > 0
    ? stage.reviewPolicy === 'all'
      ? `\n- 评审：每份成果写完后派评审子智能体（${stage.reviewSkillSlugs.join('、')}）。REVISE_AND_RETRY 按清单修订，最多 2 轮；未通过不得 complete_stage。`
      : `\n- 风险审查：不要逐文件机械复审。只审阶段总控成果、合同/价格/工期/资格等高风险结论、发生实质变更的成果，并对其余成果抽样。使用 ${stage.reviewSkillSlugs.join('、')}；REVISE_AND_RETRY 只修影响决策的缺口，最多 1 轮，仍有分歧交用户裁决。`
    : ''
  const stageFolder = officialStageFolder(stage.id)
  const stageOutDir = `Agent Pi Outputs/${project.projectId}/${stageFolder}/`
  const summaryRule = stage.summaryDeliverable
    ? `\n- 收阶段硬性交付《${stage.summaryDeliverable.fileName}》（放 ${stageOutDir}）：${stage.summaryDeliverable.outlineZh.join('；')}。该文件缺失时 complete_stage 会被拒绝。`
    : ''
  const approvalRule = stage.approvalGate
    ? `\n- 人工决策门：完成《${stage.summaryDeliverable?.fileName ?? stage.labelZh}》后停止。不要调用 complete_stage 代替用户决策；等待用户在工作台处理「${stage.approvalGate.approveLabelZh}」${stage.approvalGate.rejectLabelZh ? `或「${stage.approvalGate.rejectLabelZh}」` : ''}。`
    : ''
  const suiteRule = analysisSuiteApplies(stage.id)
    ? `\n- 唯一分析底稿必须写入 ${stageOutDir}：${ANALYSIS_SUITE.map((item) => `《${item.fileName}》`).join('、')}。覆盖规定章节和来源索引；专题报告只在用户明确需要时从底稿派生，不再作为收阶段数量门。已完成的源文件解析稿不要重做。\n- 必须从每份已登记的实际工程量清单抽出全部可识别清单行，tender_capability replace boq_reconciliation（packs/boq-reconciliation.json）。每行带清单号、单位、数量、sheet+cell；PC Sum / Provisional Sum / percentage 等传递项也要登记。系统会反查 BOQ 解析稿中的显式清单号，局部样本不得过关；没有清单或覆盖不全不得 complete_stage。`
    : ''
  const workbookRule = stage.id === 'boq-five-step-pricing'
    ? `\n- 总报告之后必须再交付公式测算表《${BOQ_PRICING_WORKBOOK_FILE}》（同一目录）。调用 tender_pricing_workbook generate；表头 RATE、分块合计、PRICE 必须是公式。缺此文件时 complete_stage 会被拒绝。可用 univer_import 打开给用户改数，未经用户明确要求不要 merge worktree。\n- 组价 pack 先 tender_capability action=schema（capability=boq_five_step_pricing）。顶层只有 currency / pricingStatus / itemBuildUps / assumptions，外加可选 pricingStandard / vatTreatment / indirectCostPolicy / resourceSummary。rateBasis、planningBasis、sources 都不是顶层字段。\n- 燃油/工资/机械/水泥/骨料/沥青/分包必须 web_search 或 web_fetch 核现行市场价，写入 itemBuildUps[].costComponents[].rateBasis.webEvidence（url + accessedAt）。这与 webDiligenceAuthorized 无关；后者只挡合同/规范/地质等项目特征。\n- ${SA_LABOUR_WAGE_DRAFT_ZH}\n- ${PRICING_LOCAL_INTEL_DRAFT_ZH}`
    : ''
  let priorBlock = ''
  try {
    const workflow = workflowFor(project.module)
    const index = workflow.stages.findIndex((item) => item.id === stage.id)
    const prior = workflow.stages.slice(0, Math.max(0, index)).filter((item) => item.id !== workflow.setupStageId)
    if (prior.length > 0) {
      priorBlock = `\n前序阶段成果读取路径（硬性约定，不要凭猜索目录）:\n${prior.map((item) => `- ${item.labelZh}: Agent Pi Outputs/${project.projectId}/${officialStageFolder(item.id)}/`).join('\n')}\n- 结构化中间数据（机器读）: .agent-pi/business/${project.module}/${project.projectId}/orchestration/reports/\n`
    }
  } catch { /* unknown module: draft still usable without the prior-stage map */ }
  return `【阶段切换 — 请在本项目主会话继续】

项目: ${project.name} (${project.projectId})
新阶段: ${stage.labelZh} (\`${stage.id}\`)
阶段要求: ${stage.prompt}

${registered}
${bindingBlock}${priorBlock}
规则:
- 这是同一条主对话的阶段推进，不是新会话；项目记忆与上文继续有效。不要重述写作合同或再贴 [skill:…] 全文。
- 本阶段技能在工人 brief：${skillNames}。
- 引用：规范/合同/方法事实句尾只标 [kb:slug:chunkId] 或 [src:路径#L起-L止]；令牌是标注，不是原文。
- 第一步调用 tender_stage status（projectId=${project.projectId}）读取未完成任务。
- 客户可读成果写入 ${stageOutDir}；同册/同名多格式是一份任务，不要再拆成一文件一工人。
- 并行用 dsh 原生 subagent / workflow；tender_stage 只准备 brief，不派生子智能体。
- ${liveWorkerLimitLineZh()}
- 只使用已登记资料和用户在本对话明确添加的数据源；项目特征缺口禁止臆造。${returnRule}${reviewRule}${summaryRule}${approvalRule}${suiteRule}${workbookRule}
- 本阶段全部交付完成后调用 tender_stage complete_stage（projectId=${project.projectId}, stageId=${stage.id}）。

请按阶段要求推进。
${extra}`
}

function pendingTasks(slice: StageSlice): StageTask[] {
  return slice.tasks.filter((task) => task.status !== 'done')
}

/**
 * After a parent crash/restart, tell the model only about workers that never
 * delivered. Completed tasks stay off the prompt — do not re-scan their JSON.
 */
export function buildRecoveryDraft(
  project: BusinessProjectRecord,
  stage: WorkflowStage,
  slice: StageSlice,
  extra = '',
): string {
  const pending = pendingTasks(slice)
  const doneCount = slice.tasks.length - pending.length
  const pendingBlock = pending.length === 0
    ? '- （无）'
    : pending.slice(0, 24).map((task) => {
      const loc = task.markdownPath ? ` → ${task.markdownPath}` : ''
      const session = task.childSessionId ? ` session=${task.childSessionId}` : ''
      return `- ${task.id} ${task.title} (${task.status})${loc}${session}`
    }).join('\n') + (pending.length > 24 ? `\n- …其余 ${pending.length - 24} 条见 tender_stage status` : '')
  return `【恢复未递交成果 — 请在本项目主会话继续】

项目: ${project.name} (${project.projectId})
阶段: ${stage.labelZh} (\`${stage.id}\`)

盘面：本阶段已落地 ${doneCount}/${slice.tasks.length} 份成果。已完成的不要再读 JSON、不要再派工人、不要重解析源文件，也不要再展开写作合同或 [skill:…] 全文。

未递交 / 未完成（只处理这些）：
${pendingBlock}

对上面每一条：有 childSessionId 且成果未落地 → 续跑该工人让它写回 markdownPath；没有 session 或续不上 → 按阶段要求重新下派这一条。工人正常完工回推照常处理。用户改正式文件直接改 Official Outputs，不要复活已完工工人。
${extra}`
}

function draftForSlice(
  project: BusinessProjectRecord,
  stage: WorkflowStage,
  slice: StageSlice,
  extra = '',
): string {
  const pending = pendingTasks(slice)
  const doneCount = slice.tasks.length - pending.length
  if (doneCount > 0 && pending.length > 0) return buildRecoveryDraft(project, stage, slice, extra)
  return buildStageDraft(project, stage, extra)
}

/**
 * Human-facing deliverable base name derived from the source file name: extension
 * stripped, deduplicated with " (n)" suffixes within one stage.
 * @param raw Source file name or task title.
 * @param used Lowercased stems already taken in this stage (mutated).
 * @returns Unique display stem for the deliverable Markdown.
 */
function deliverableStem(raw: string, used: Set<string>): string {
  const stripped = raw.replace(/\.[A-Za-z0-9]{1,8}$/, '').trim()
  const stem = stripped.length > 0 ? stripped : raw.trim()
  let candidate = stem
  let counter = 2
  while (used.has(candidate.toLowerCase())) {
    candidate = `${stem} (${counter})`
    counter += 1
  }
  used.add(candidate.toLowerCase())
  return candidate
}

/**
 * Migrate a stage's deliverables to the source-name convention and sweep loose
 * customer Markdown from the project's official root into the stage folder.
 * Renames `<taskId>.md` (and `-partN` variants) to `<source name>.md`, updating
 * the task record and its brief so status inspection keeps working.
 * @returns Counts of renamed task deliverables and swept root files.
 */
export function alignDeliverableNames(
  cwd: string,
  project: BusinessProjectRecord,
  stageId: string,
): { renamed: number; moved: number } {
  const board = loadBoard(cwd, project.projectId, project.module)
  const slice = board.stages[stageId]
  let renamed = 0
  let moved = 0
  if (slice) {
    const usedStems = new Set<string>()
    let changed = false
    for (const task of slice.tasks) {
      if (!task.markdownPath) continue
      const title = task.title || (task.sourcePath ? basename(task.sourcePath) : task.id)
      const stem = deliverableStem(title, usedStems)
      const dir = dirname(task.markdownPath)
      const desired = join(dir, `${stem}.md`)
      if (resolve(desired).toLowerCase() === resolve(task.markdownPath).toLowerCase()) continue
      const oldPath = task.markdownPath
      const oldStem = basename(oldPath).replace(/\.md$/i, '')
      if (existsSync(oldPath) && !existsSync(desired)) {
        renameSync(oldPath, desired)
        renamed += 1
      }
      if (existsSync(dir)) {
        for (const entry of readdirSync(dir)) {
          const lower = entry.toLowerCase()
          if (lower.startsWith(`${oldStem.toLowerCase()}-part`) && lower.endsWith('.md')) {
            const target = join(dir, stem + entry.slice(oldStem.length))
            if (!existsSync(target)) {
              renameSync(join(dir, entry), target)
              renamed += 1
            }
          }
        }
      }
      task.markdownPath = desired
      changed = true
      if (task.briefPath && existsSync(task.briefPath)) {
        const brief = readJson<Record<string, unknown>>(task.briefPath, {})
        brief.markdownPath = desired
        writeJson(task.briefPath, brief)
      }
    }
    if (changed) putSlice(cwd, project, { ...slice, updatedAt: new Date().toISOString() })
  }
  const rootDir = officialProjectDir(cwd, project.projectId)
  if (existsSync(rootDir)) {
    for (const entry of readdirSync(rootDir, { withFileTypes: true })) {
      if (!entry.isFile() || !/\.md$/i.test(entry.name)) continue
      // Same routing as the harvester so e.g. 项目特征 lands in document-analysis
      // even when a later stage triggers the sweep.
      const target = officialDestForHarvest(cwd, project.projectId, entry.name, stageId)
      ensureDir(dirname(target))
      if (!existsSync(target)) {
        renameSync(join(rootDir, entry.name), target)
        moved += 1
      }
    }
  }
  return { renamed, moved }
}

/**
 * Pack registered files so one worker covers a book/volume or the same stem
 * (pdf + docx). Unrelated names in the same folder stay separate.
 */
export function sourcePackIdentity(filePath: string): { key: string; title: string } {
  const dir = resolve(dirname(filePath)).replace(/\\/g, '/').toLowerCase()
  const base = basename(filePath)
  const bookVol = base.match(/book\s*(\d+)\s+of\s+volume\s*(\d+)/i)
  if (bookVol) {
    return { key: `${dir}|book${bookVol[1]}-vol${bookVol[2]}`, title: `Book ${bookVol[1]} of Volume ${bookVol[2]}` }
  }
  const volume = base.match(/\b(?:volume|vol\.?)\s*(\d+)\b/i)
  if (volume) {
    return { key: `${dir}|vol${volume[1]}`, title: `Volume ${volume[1]}` }
  }
  const ce = base.match(/第\s*([0-9]+)\s*册/) || base.match(/分册\s*([A-Za-z0-9]+)/)
  if (ce) {
    return { key: `${dir}|ce${ce[1]}`, title: `第${ce[1]}册` }
  }
  const stem = base.replace(/\.[A-Za-z0-9]{1,8}$/, '').replace(/\s*\(\d+\)$/, '').trim()
  return { key: `${dir}|stem:${stem.toLowerCase()}`, title: stem || base }
}

function packTaskId(title: string, used: Set<string>): string {
  const base = `pack-${title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40) || 'src'}`
  let id = base
  let n = 2
  while (used.has(id)) {
    id = `${base}-${n}`
    n += 1
  }
  used.add(id)
  return id
}

function keptPackStatus(members: Array<StageTask | undefined>): Pick<StageTask, 'status' | 'error' | 'childSessionId'> {
  const kept = members.filter((task): task is StageTask => Boolean(task))
  if (kept.some((task) => task.status === 'error')) {
    const first = kept.find((task) => task.status === 'error')
    return { status: 'error', error: first?.error, childSessionId: first?.childSessionId }
  }
  if (kept.length > 0 && kept.every((task) => task.status === 'done')) {
    return { status: 'done', childSessionId: kept[0]?.childSessionId }
  }
  const running = kept.find((task) => task.status === 'running')
  if (running) return { status: 'running', childSessionId: running.childSessionId }
  return { status: 'queued', childSessionId: kept[0]?.childSessionId }
}

function listSourceTasks(
  cwd: string,
  project: BusinessProjectRecord,
  stage: WorkflowStage,
  briefsDir: string,
  previous: StageTask[] = [],
  selectedKnowledgeSlugs: string[] = [],
): StageTask[] {
  const priorByPath = new Map(previous.filter((task) => task.sourcePath).map((task) => [resolve(task.sourcePath!), task]))
  const priorById = new Map(previous.map((task) => [task.id, task]))
  const tasks: StageTask[] = []
  const bindings = stageBindings(project, stage.id)
  const briefBindings: Record<string, unknown> = {}
  if (bindings.length > 0) {
    briefBindings.knowledgeBindings = bindings.map(({ area: _area, ...rest }) => rest)
    const method = bindings.find((file) => file.role === 'method_and_depth_standard')
    if (method) briefBindings.methodStandard = { title: method.title, path: method.path }
  }
  if (stage.reviewSkillSlugs && stage.reviewSkillSlugs.length > 0) {
    briefBindings.review = {
      skillSlugs: stage.reviewSkillSlugs,
      verdicts: ['ACCEPT_AND_PROCEED', 'REVISE_AND_RETRY'],
      policy: stage.reviewPolicy ?? 'all',
      maxRounds: stage.reviewPolicy === 'risk-based' ? 1 : 2,
      returnChannel: '裁决必须用 report 工具把 ACCEPT_AND_PROCEED 或 REVISE_AND_RETRY 全文推回主对话；只在本子会话里发言，主对话不会自动承接。写手同样必须 report「DONE 文件名 md行数=N」。',
    }
  }
  briefBindings.citationRule = '规范/合同/方法事实句只给出处令牌：[kb:slug:chunkId] 或 [src:路径#L起-L止]。令牌是标注，不是原文；禁止粘贴大段证据。给不出令牌的写成缺口。'
  if (project.module === 'tender') {
    briefBindings.evidencePolicy = evidencePolicy(cwd, project.projectId)
  }
  const selectedSlugs = [...new Set(selectedKnowledgeSlugs.map((slug) => String(slug).trim()).filter(Boolean))]
  if (selectedSlugs.length > 0) {
    briefBindings.selectedKnowledgeSlugs = selectedSlugs
    briefBindings.selectedKnowledgeRule = '这些 slug 是用户为本任务勾选的知识范围。先 kb_search({ slugs }) / kb_find_clause / kb_find_table，再 kb_read_chunk；事实句用 [kb:slug:chunkId]，不得把未勾选条目当作本任务依据。'
  }
  if (stage.id === 'boq-five-step-pricing') {
    briefBindings.packSchema = capabilitySchemaHint('boq_five_step_pricing')
    briefBindings.webRateCheck = PRICING_WEB_RATE_CHECK
    briefBindings.saLabourWageCheck = SA_LABOUR_WAGE_CHECK
    briefBindings.localIntelCheck = PRICING_LOCAL_INTEL_CHECK
  }
  const usedStems = new Set<string>()
  const usedIds = new Set<string>()
  const groups = new Map<string, { title: string; paths: string[]; extras: Record<string, unknown>[] }>()
  const take = (path: string, extra: Record<string, unknown> = {}) => {
    const identity = sourcePackIdentity(path)
    const group = groups.get(identity.key) ?? { title: identity.title, paths: [], extras: [] }
    group.paths.push(path)
    group.extras.push(extra)
    groups.set(identity.key, group)
  }
  try {
    const workspace = loadWorkspace(cwd, project.projectId)
    for (const doc of workspace.documents.filter((item) => item.status === 'active')) {
      take(doc.path, { documentId: doc.id })
    }
  } catch {
    for (const inputPath of project.inputPaths) take(inputPath)
  }
  for (const group of groups.values()) {
    const id = packTaskId(group.title, usedIds)
    const sourcePath = group.paths[0]!
    const restore = findSetupRestore(cwd, project.projectId, sourcePath)
    const readPath = restore?.manuscriptPath && existsSync(restore.manuscriptPath)
      ? restore.manuscriptPath
      : sourcePath
    const briefPath = join(briefsDir, `${id}.json`)
    const reportPath = join(orchestrationDir(cwd, project.projectId), 'reports', `${id}.json`)
    const markdownPath = join(
      officialStageDir(cwd, project.projectId, stage.id),
      `${deliverableStem(group.title || basename(sourcePath) || id, usedStems)}.md`,
    )
    ensureDir(dirname(markdownPath))
    writeJson(briefPath, {
      taskId: id,
      sourcePath: readPath,
      sourcePaths: group.paths,
      originalSourcePath: sourcePath,
      restoredManuscript: restore?.manuscriptPath,
      packPath: restore?.packPath,
      pack: group.paths.length > 1 ? 'book-or-stem' : 'single',
      stageId: stage.id,
      objective: stage.prompt,
      reportPath,
      markdownPath,
      ...briefBindings,
      ...Object.assign({}, ...group.extras),
    })
    const priorHits = [
      priorById.get(id),
      ...group.paths.map((path) => priorByPath.get(resolve(path))),
    ]
    const kept = keptPackStatus(priorHits)
    tasks.push(inspectTask({
      id,
      title: group.title,
      sourcePath,
      status: kept.status,
      briefPath,
      reportPath,
      markdownPath,
      error: kept.error,
      childSessionId: kept.childSessionId,
    }))
  }
  return tasks
}

function putSlice(cwd: string, project: BusinessProjectRecord, slice: StageSlice): OrchestrationBoard {
  const board = loadBoard(cwd, project.projectId, project.module)
  board.currentStageId = slice.stageId
  board.module = project.module
  board.stages[slice.stageId] = slice
  board.updatedAt = slice.updatedAt
  saveBoard(cwd, board)
  return board
}

export function prepareStage(
  cwd: string,
  project: BusinessProjectRecord,
  stageId: string,
  selectedKnowledgeSlugs: string[] = [],
): { state: StageState; draft: string; blocked?: string; board: OrchestrationBoard; dispatch?: { stageId: string; key: string } } {
  const workflow = workflowFor(project.module)
  const stage = workflow.stages.find((item) => item.id === stageId)
  if (!stage) throw new Error(`Unknown stage ${stageId}`)
  const existingBoard = loadBoard(cwd, project.projectId, project.module)

  const stageIndex = workflow.stages.findIndex((item) => item.id === stageId)
  const unfinishedPrior = workflow.stages
    .slice(0, Math.max(0, stageIndex))
    .find((item) => existingBoard.stages[item.id]?.status !== 'done')
  if (unfinishedPrior) {
    const blocked = unfinishedPrior.id === workflow.setupStageId
      ? '请先完成「项目资料登记」并确认资料齐套。'
      : `请先完成前序阶段「${unfinishedPrior.labelZh}」（${unfinishedPrior.id}）。`
    const slice: StageSlice = {
      stageId,
      status: 'blocked',
      tasks: [],
      updatedAt: new Date().toISOString(),
      blockedReason: blocked,
    }
    const board = putSlice(cwd, project, slice)
    return {
      state: { schemaVersion: 1, projectId: project.projectId, module: project.module, ...slice },
      draft: buildStageDraft(project, stage, blocked),
      blocked,
      board,
    }
  }

  const setupStageId = workflow.setupStageId
  if (setupStageId && stageId !== setupStageId) {
    const policy = project.module === 'tender' ? evidencePolicy(cwd, project.projectId) : null
    if (policy && policy.blocking && stageId !== 'bid-risk-decision' && stageId !== 'tender-document-analysis') {
      const blocked = `项目特征证据门禁仍阻塞（${policy.ledger.blockingGapCount} 个缺口）。请补传资料或强制放行。`
      const slice: StageSlice = {
        stageId,
        status: 'blocked',
        tasks: [],
        updatedAt: new Date().toISOString(),
        blockedReason: blocked,
      }
      const board = putSlice(cwd, project, slice)
      return {
        state: { schemaVersion: 1, projectId: project.projectId, module: project.module, ...slice },
        draft: buildStageDraft(project, stage, blocked),
        blocked,
        board,
      }
    }
  }

  const briefsDir = join(orchestrationDir(cwd, project.projectId), 'briefs')
  ensureDir(briefsDir)
  const previous = existingBoard.stages[stageId]?.tasks ?? []
  // Any module may declare listsSources (user-built domains included); the
  // workspace registry is shared, so per-file briefs work beyond tender.
  const tasks = stage.listsSources
    ? listSourceTasks(cwd, project, stage, briefsDir, previous, selectedKnowledgeSlugs)
    : previous.map(inspectTask)

  const previousSlice = existingBoard.stages[stageId]
  const slice = inspectSlice({
    stageId,
    status: 'idle',
    tasks,
    updatedAt: new Date().toISOString(),
    forcePassedAt: previousSlice?.forcePassedAt,
    completedAt: previousSlice?.completedAt,
    dispatch: previousSlice?.dispatch,
  }, stageHardGatesReady(cwd, project, stageId))
  const board = putSlice(cwd, project, slice)
  if (project.module === 'tender') assessEvidence(cwd, project.projectId)
  syncProjectOutputs(cwd, project.projectId, project.module, stageId)
  let extra = ''
  if (project.module === 'tender' && stageId === 'boq-five-step-pricing') {
    seedEnterpriseProductivityMemo(cwd, project.projectId)
    extra = enterpriseProductivityDraftNote(cwd, project.projectId)
  }
  return {
    state: { schemaVersion: 1, projectId: project.projectId, module: project.module, ...slice },
    draft: draftForSlice(project, stage, slice, extra),
    board,
    dispatch: { stageId, key: dispatchFingerprint(slice) },
  }
}

/**
 * After a late Phase-1 restore, rewrite already-issued source briefs so
 * analysis reads the manuscript instead of the original PDF. Leaves stage
 * status and currentStageId alone.
 */
export function refreshSourceBriefsAfterRestore(cwd: string, project: BusinessProjectRecord): void {
  const workflow = workflowFor(project.module)
  const board = loadBoard(cwd, project.projectId, project.module)
  const setupId = workflow.setupStageId
  if (setupId && board.stages[setupId]?.status !== 'done') return
  const briefsDir = join(orchestrationDir(cwd, project.projectId), 'briefs')
  ensureDir(briefsDir)
  let changed = false
  for (const stage of workflow.stages) {
    if (!stage.listsSources) continue
    const previous = board.stages[stage.id]
    if (!previous || previous.tasks.length === 0) continue
    board.stages[stage.id] = inspectSlice({
      ...previous,
      tasks: listSourceTasks(cwd, project, stage, briefsDir, previous.tasks),
    }, stageHardGatesReady(cwd, project, stage.id))
    changed = true
  }
  if (!changed) return
  board.updatedAt = new Date().toISOString()
  saveBoard(cwd, board)
}

export function completeSetup(
  cwd: string,
  project: BusinessProjectRecord,
  selectedKnowledgeSlugs: string[] = [],
): {
  state: StageState
  board: OrchestrationBoard
  blocked?: string
  draft?: string
  nextStageId?: string
  dispatch?: { stageId: string; key: string }
} {
  const workflow = workflowFor(project.module)
  const setupStageId = workflow.setupStageId
  if (!setupStageId) {
    throw new Error(`模块 ${project.module} 没有资料登记步骤；直接 prepare 第一阶段（${workflow.stages[0]?.id}）。`)
  }
  if (project.inputPaths.length === 0) {
    const slice: StageSlice = {
      stageId: setupStageId,
      status: 'blocked',
      tasks: [],
      updatedAt: new Date().toISOString(),
      blockedReason: '尚未登记资料。请先添加招标文件。',
    }
    const board = putSlice(cwd, project, slice)
    return {
      state: { schemaVersion: 1, projectId: project.projectId, module: project.module, ...slice },
      board,
      blocked: slice.blockedReason,
    }
  }
  if (project.module === 'tender') {
    registerProjectSources(cwd, project.projectId, { title: project.name, inputPaths: project.inputPaths })
  }
  const now = new Date().toISOString()
  const slice: StageSlice = {
    stageId: setupStageId,
    status: 'done',
    tasks: project.inputPaths.map((inputPath, index) => {
      const restore = findSetupRestore(cwd, project.projectId, inputPath)
      return {
        id: `file-${index + 1}`,
        title: basename(inputPath),
        sourcePath: inputPath,
        markdownPath: restore?.manuscriptPath,
        reportPath: restore?.packPath,
        status: 'done' as const,
      }
    }),
    updatedAt: now,
    completedAt: now,
  }
  putSlice(cwd, project, slice)
  const next = workflow.stages.find((item) => item.id !== setupStageId)
  if (next) {
    const prepared = prepareStage(cwd, project, next.id, selectedKnowledgeSlugs)
    return {
      state: prepared.state,
      board: prepared.board,
      blocked: prepared.blocked,
      draft: prepared.blocked ? undefined : prepared.draft,
      nextStageId: next.id,
      dispatch: prepared.blocked ? undefined : prepared.dispatch,
    }
  }
  const board = loadBoard(cwd, project.projectId, project.module)
  return {
    state: { schemaVersion: 1, projectId: project.projectId, module: project.module, ...slice },
    board,
  }
}

/**
 * Explicit terminal signal for a stage: the model (or the user through the UI) declares
 * every deliverable of the stage finished. Rejected while checklist tasks remain
 * unfinished so per-file evidence cannot be skipped. This is the only completion path
 * for stages without a source checklist (e.g. planning-and-submission).
 */
export function completeStage(
  cwd: string,
  project: BusinessProjectRecord,
  stageId: string,
): { state: StageState; board: OrchestrationBoard } {
  const workflow = workflowFor(project.module)
  const stage = workflow.stages.find((item) => item.id === stageId)
  if (!stage) throw new Error(`Unknown stage ${stageId}`)
  const board = loadBoard(cwd, project.projectId, project.module)
  const stageIndex = workflow.stages.findIndex((item) => item.id === stageId)
  const unfinishedPrior = workflow.stages
    .slice(0, Math.max(0, stageIndex))
    .find((item) => board.stages[item.id]?.status !== 'done')
  if (unfinishedPrior) {
    throw new Error(`请先完成前序阶段「${unfinishedPrior.labelZh}」（${unfinishedPrior.id}）。`)
  }
  const previous = board.stages[stageId] ? inspectSlice(board.stages[stageId]) : undefined
  const pending = (previous?.tasks ?? []).filter((task) => task.status !== 'done')
  if (pending.length > 0) {
    const sample = pending.slice(0, 3).map((task) => `${task.id}(${task.status})`).join(', ')
    throw new Error(`还有 ${pending.length} 个任务未完成：${sample}。请先交付这些任务，或先 reset 该阶段。`)
  }
  if (stage.summaryDeliverable) {
    const summaryPath = join(officialStageDir(cwd, project.projectId, stageId), stage.summaryDeliverable.fileName)
    if (!existsSync(summaryPath)) {
      throw new Error(`缺阶段总报告《${stage.summaryDeliverable.fileName}》（应位于 Agent Pi Outputs/${project.projectId}/${officialStageFolder(stageId)}/）。请先汇总编制总报告，覆盖：${stage.summaryDeliverable.outlineZh.join('；')}。`)
    }
    if (!deliverableReady(summaryPath)) {
      throw new Error(`阶段总报告《${stage.summaryDeliverable.fileName}》内容过短，不能作为收阶段成果。请补齐：${stage.summaryDeliverable.outlineZh.join('；')}。`)
    }
  }
  if (stage.approvalGate) {
    throw new Error(`阶段「${stage.labelZh}」等待用户人工决策。请停止自动推进，由用户在工作台点击「${stage.approvalGate.approveLabelZh}」${stage.approvalGate.rejectLabelZh ? `或「${stage.approvalGate.rejectLabelZh}」` : ''}。`)
  }
  if (project.module === 'tender') {
    const capabilityGaps = tenderCapabilityGaps(cwd, project.projectId, stageId)
    if (capabilityGaps.length > 0) {
      throw new Error(`阶段能力包未就绪：${capabilityGaps.join('；')}。请先 tender_capability replace/validate，并处理 stale 依赖。`)
    }
  }
  const planningGaps = project.module === 'tender'
    ? planningDeliverableGaps(cwd, project.projectId, stageId)
    : []
  if (planningGaps.length > 0) {
    throw new Error(`施工策划阶段缺硬性交付：${planningGaps.join('、')}（应位于 Agent Pi Outputs/${project.projectId}/${officialStageFolder(stageId)}/）。`)
  }
  if (analysisSuiteApplies(stageId)) {
    const analysisDir = officialStageDir(cwd, project.projectId, stageId)
    const suite = assessAnalysisSuite(analysisDir)
    if (!suite.ok) throw new Error(analysisSuiteRejectReason(suite))
    const inventory = assessBoqInventoryGate(cwd, project.projectId, analysisDir)
    if (!inventory.ready) throw new Error(boqInventoryRejectReason(inventory))
  }
  const workbookGap = pricingWorkbookMissing(cwd, project.projectId, stageId)
  if (workbookGap) throw new Error(workbookGap)
  if (pricingLocalIntelApplies(stageId)) {
    const gate = pricingIntelGateFor(cwd, project.projectId, stageId)
    if (gate && !gate.ready) throw new Error(pricingIntelGateRejectReason(gate))
  }
  const now = new Date().toISOString()
  const slice: StageSlice = {
    stageId,
    status: 'done',
    tasks: previous?.tasks ?? [],
    updatedAt: now,
    forcePassedAt: previous?.forcePassedAt,
    completedAt: now,
    dispatch: previous?.dispatch,
  }
  const nextBoard = putSlice(cwd, project, slice)
  syncProjectOutputs(cwd, project.projectId, project.module, stageId)
  return {
    state: { schemaVersion: 1, projectId: project.projectId, module: project.module, ...slice },
    board: nextBoard,
  }
}

/**
 * Persist a decision made through the workbench UI. Approval stages cannot be
 * completed by the model through tender_stage complete_stage.
 */
export function decideApprovalStage(
  cwd: string,
  project: BusinessProjectRecord,
  stageId: string,
  decision: 'approved' | 'rejected',
  note = '',
): { state: StageState; board: OrchestrationBoard } {
  const workflow = workflowFor(project.module)
  const stage = workflow.stages.find((item) => item.id === stageId)
  if (!stage) throw new Error(`Unknown stage ${stageId}`)
  if (!stage.approvalGate) throw new Error(`阶段「${stage.labelZh}」不是人工决策门。`)
  const board = loadBoard(cwd, project.projectId, project.module)
  const stageIndex = workflow.stages.findIndex((item) => item.id === stageId)
  const unfinishedPrior = workflow.stages
    .slice(0, Math.max(0, stageIndex))
    .find((item) => board.stages[item.id]?.status !== 'done')
  if (unfinishedPrior) {
    throw new Error(`请先完成前序阶段「${unfinishedPrior.labelZh}」（${unfinishedPrior.id}）。`)
  }
  const previous = board.stages[stageId] ? inspectSlice(board.stages[stageId]) : undefined
  const pending = (previous?.tasks ?? []).filter((task) => task.status !== 'done')
  if (pending.length > 0) {
    throw new Error(`阶段仍有 ${pending.length} 个任务未完成，不能提交人工决策。`)
  }
  if (stage.summaryDeliverable) {
    const summaryPath = join(officialStageDir(cwd, project.projectId, stageId), stage.summaryDeliverable.fileName)
    if (!existsSync(summaryPath) || !deliverableReady(summaryPath)) {
      throw new Error(`请先完成《${stage.summaryDeliverable.fileName}》再提交人工决策。`)
    }
  }
  if (project.module === 'tender') {
    const capabilityGaps = tenderCapabilityGaps(cwd, project.projectId, stageId)
    if (capabilityGaps.length > 0) {
      throw new Error(`人工决策前能力包未就绪：${capabilityGaps.join('；')}。`)
    }
    if (stageId === 'submission-compliance-freeze') {
      const citationAudit = auditProjectCitations(cwd, project)
      if (citationAudit.orphans.length > 0) {
        throw new Error(`最终冻结前仍有 ${citationAudit.orphans.length} 个孤儿引用，请先修复并重新质检。`)
      }
    }
  }
  const now = new Date().toISOString()
  const approved = decision === 'approved'
  const slice: StageSlice = {
    stageId,
    status: approved ? 'done' : 'blocked',
    tasks: previous?.tasks ?? [],
    updatedAt: now,
    completedAt: approved ? now : undefined,
    blockedReason: approved ? undefined : (note || '用户决定暂停本项目，不进入下一阶段。'),
    dispatch: previous?.dispatch,
    approval: {
      decision,
      decidedAt: now,
      note: note || undefined,
    },
  }
  const nextBoard = putSlice(cwd, project, slice)
  syncProjectOutputs(cwd, project.projectId, project.module, stageId)
  return {
    state: { schemaVersion: 1, projectId: project.projectId, module: project.module, ...slice },
    board: nextBoard,
  }
}

/**
 * Confirm that a previously offered stage draft was written into the parent session.
 * Records `dispatchedAt` under the offered fingerprint so resume stops re-offering
 * the same draft until the slice state actually changes.
 */
export function markDispatched(
  cwd: string,
  project: BusinessProjectRecord,
  stageId: string,
  key: string,
): { state: StageState; board: OrchestrationBoard } {
  const board = loadBoard(cwd, project.projectId, project.module)
  const previous = board.stages[stageId]
  if (!previous) throw new Error(`Stage ${stageId} has no orchestration slice`)
  const now = new Date().toISOString()
  const slice: StageSlice = {
    ...previous,
    updatedAt: now,
    dispatch: { key, offeredAt: previous.dispatch?.key === key ? previous.dispatch.offeredAt : now, dispatchedAt: now },
  }
  const nextBoard = putSlice(cwd, project, slice)
  return {
    state: { schemaVersion: 1, projectId: project.projectId, module: project.module, ...slice },
    board: nextBoard,
  }
}

export function resetOrchestration(
  cwd: string,
  project: BusinessProjectRecord,
  stageId: string,
): { state: StageState; board: OrchestrationBoard } {
  const slice: StageSlice = {
    stageId,
    status: 'idle',
    tasks: [],
    updatedAt: new Date().toISOString(),
  }
  const board = putSlice(cwd, project, slice)
  return {
    state: { schemaVersion: 1, projectId: project.projectId, module: project.module, ...slice },
    board,
  }
}

/** Disk-verified facts about one stage: what actually exists vs what the checklist claims. */
export interface StageReality {
  stageId: string
  stageLabel: string
  stageStatus: string
  chain: Array<{ id: string; label: string; status: string }>
  tasks: {
    total: number
    done: number
    error: number
    unfinished: Array<{ id: string; title: string; status: string }>
  }
  /** Tasks marked done whose declared deliverable paths are missing on disk. */
  artifacts: { missingMarkdown: string[]; missingReport: string[] }
  /** Mandatory stage synthesis document, when the stage declares one. */
  summary?: { fileName: string; exists: boolean }
  /** Five analysis-suite memos on `tender-document-analysis`. */
  suite?: {
    ok: boolean
    shortGaps: string
    files: Array<{ fileName: string; exists: boolean; ok: boolean; chars: number; missingTerms: string[] }>
  }
  /** Real BOQ line items extracted into `boq_reconciliation` on analysis. */
  boqInventory?: {
    ok: boolean
    itemCount: number
    touchedCount: number
    shortGaps: string
  }
  /** Formula unit-cost workbook required on the BOQ pricing stage. */
  workbook?: { fileName: string; exists: boolean }
  /** Site-bound supplier / productivity pack on the BOQ pricing stage. */
  localIntel?: {
    ok: boolean
    ready: boolean
    waived: boolean
    shortGaps: string
    files: Array<{ fileName: string; exists: boolean; ok: boolean }>
  }
  citations: { total: number; orphans: number }
  evidence?: { blocking: boolean; gapCount: number; waived: boolean }
  /** Official Outputs subfolder for this stage (`planning`, `boq-pricing`, …). */
  outputFolder: string
  /**
   * Disk/checklist discrepancies that still need organize. Commercial leftover
   * work (unpriced rates, RFI, submission_audit) is not a QC gap.
   */
  needsQc: boolean
  /** Newest mtime among this project's official outputs. */
  lastOutputAt?: string
  quietMinutes?: number
}

/** True when organize still has a disk/checklist discrepancy to adjudicate. */
export function stageNeedsQc(reality: Omit<StageReality, 'needsQc'>): boolean {
  const missing = reality.artifacts.missingMarkdown.length + reality.artifacts.missingReport.length
  const unfinished = reality.tasks.total - reality.tasks.done
  return missing > 0
    || Boolean(reality.summary && !reality.summary.exists && reality.stageStatus !== 'idle')
    || Boolean(reality.suite && !reality.suite.ok && reality.stageStatus !== 'idle')
    || Boolean(reality.boqInventory && !reality.boqInventory.ok && reality.stageStatus !== 'idle')
    || Boolean(reality.workbook && !reality.workbook.exists && reality.stageStatus !== 'idle')
    || Boolean(reality.localIntel && !reality.localIntel.ready && reality.stageStatus !== 'idle')
    || Boolean(reality.evidence?.blocking)
    || reality.citations.orphans > 0
    || reality.tasks.error > 0
    || (reality.stageStatus === 'done' && unfinished > 0)
}

function newestOutputMtime(dir: string, depth = 0): number {
  if (depth > 5 || !existsSync(dir)) return 0
  let newest = 0
  let entries: string[]
  try {
    entries = readdirSync(dir)
  } catch { /* unreadable dir: contributes nothing */ return 0 }
  for (const entry of entries) {
    const path = join(dir, entry)
    try {
      const stat = statSync(path)
      if (stat.isDirectory()) newest = Math.max(newest, newestOutputMtime(path, depth + 1))
      else newest = Math.max(newest, stat.mtimeMs)
    } catch { /* transient fs race: skip entry */ }
  }
  return newest
}

/**
 * Reconcile a stage's checklist against the disk: task states, declared deliverable
 * paths, citation audit, and the evidence gate. Pure read — mutates nothing.
 * @param board Board already refreshed by inspectBoard (task states re-derived).
 * @param citationAudit Result of the citation audit run in the same operation.
 * @returns Disk-verified stage facts for control decisions and the organize draft.
 */
export function collectStageReality(
  cwd: string,
  project: BusinessProjectRecord,
  stageId: string,
  board: OrchestrationBoard,
  citationAudit: CitationAudit,
): StageReality {
  const workflow = workflowFor(project.module)
  const stage = workflow.stages.find((item) => item.id === stageId) ?? workflow.stages[0]!
  const slice = board.stages[stage.id]
  const tasks = slice?.tasks ?? []
  const unfinished = tasks.filter((task) => task.status !== 'done')
  const missingMarkdown: string[] = []
  const missingReport: string[] = []
  for (const task of tasks) {
    if (task.status !== 'done') continue
    if (task.markdownPath && !existsSync(task.markdownPath)) missingMarkdown.push(task.id)
    // Official Output is the product. A missing JSON ledger is not a recovery
    // reason when the customer Markdown is already on disk.
    if (task.reportPath && !existsSync(task.reportPath) && !(task.markdownPath && existsSync(task.markdownPath))) {
      missingReport.push(task.id)
    }
  }
  let evidence: StageReality['evidence']
  if (project.module === 'tender') {
    try {
      const policy = evidencePolicy(cwd, project.projectId)
      evidence = { blocking: policy.blocking, gapCount: policy.gaps.length, waived: policy.gateWaived }
    } catch { /* evidence ledger unreadable: omit from reality */ }
  }
  let summary: StageReality['summary']
  if (stage.summaryDeliverable) {
    const summaryPath = join(officialStageDir(cwd, project.projectId, stage.id), stage.summaryDeliverable.fileName)
    summary = { fileName: stage.summaryDeliverable.fileName, exists: existsSync(summaryPath) }
  }
  let suite: StageReality['suite']
  let boqInventory: StageReality['boqInventory']
  if (analysisSuiteApplies(stage.id)) {
    const analysisDir = officialStageDir(cwd, project.projectId, stage.id)
    const assessed = assessAnalysisSuite(analysisDir)
    suite = {
      ok: assessed.ok,
      shortGaps: assessed.shortGaps,
      files: assessed.files.map((file) => ({
        fileName: file.fileName,
        exists: file.exists,
        ok: file.ok,
        chars: file.chars,
        missingTerms: file.missingTerms,
      })),
    }
    const inventory = assessBoqInventoryGate(cwd, project.projectId, analysisDir)
    boqInventory = {
      ok: inventory.ready,
      itemCount: inventory.itemCount,
      touchedCount: inventory.touchedCount,
      shortGaps: inventory.shortGaps,
    }
  }
  let workbook: StageReality['workbook']
  let localIntel: StageReality['localIntel']
  if (stage.id === 'boq-five-step-pricing') {
    workbook = {
      fileName: BOQ_PRICING_WORKBOOK_FILE,
      exists: !pricingWorkbookMissing(cwd, project.projectId, stage.id),
    }
    const gate = pricingIntelGateFor(cwd, project.projectId, stage.id)!
    localIntel = {
      ok: gate.intel.ok,
      ready: gate.ready,
      waived: gate.waived,
      shortGaps: gate.shortGaps,
      files: [...gate.intel.files, ...gate.intel.rfqs, gate.waiver].map((file) => ({
        fileName: file.fileName,
        exists: file.exists,
        ok: file.ok,
      })),
    }
  }
  const newest = newestOutputMtime(officialProjectDir(cwd, project.projectId))
  const outputFolder = officialStageFolder(stage.id)
  const facts = {
    stageId: stage.id,
    stageLabel: stage.labelZh,
    stageStatus: slice?.status ?? 'idle',
    chain: workflow.stages.map((item) => ({
      id: item.id,
      label: item.labelZh,
      status: board.stages[item.id]?.status ?? 'idle',
    })),
    tasks: {
      total: tasks.length,
      done: tasks.filter((task) => task.status === 'done').length,
      error: tasks.filter((task) => task.status === 'error').length,
      unfinished: unfinished.map((task) => ({ id: task.id, title: task.title, status: task.status })),
    },
    artifacts: { missingMarkdown, missingReport },
    summary,
    suite,
    boqInventory,
    workbook,
    localIntel,
    citations: { total: citationAudit.totalCitations, orphans: citationAudit.orphans.length },
    evidence,
    outputFolder,
    lastOutputAt: newest > 0 ? new Date(newest).toISOString() : undefined,
    quietMinutes: newest > 0 ? Math.max(0, Math.round((Date.now() - newest) / 60000)) : undefined,
  }
  return { ...facts, needsQc: stageNeedsQc(facts) }
}

/** Full-project health check: one StageReality per workflow stage, oldest first. */
export interface ProjectReality {
  generatedAt: string
  stages: StageReality[]
}

/**
 * Reconcile every stage of the project against the disk in one pass. Shares a
 * single citation audit and board inspection across stages.
 * @returns Per-stage disk-verified facts for the workbench check panel.
 */
export function projectReality(cwd: string, project: BusinessProjectRecord): ProjectReality {
  const citationAudit = auditProjectCitations(cwd, project)
  const board = inspectBoard(cwd, project)
  const workflow = workflowFor(project.module)
  return {
    generatedAt: new Date().toISOString(),
    stages: workflow.stages.map((stage) => collectStageReality(cwd, project, stage.id, board, citationAudit)),
  }
}

function renderRealityBlock(reality: StageReality, published: number): string {
  const chain = reality.chain.map((item) => `${item.label}(${item.status})`).join(' → ')
  const unfinishedBlock = reality.tasks.unfinished.length > 0
    ? `\n- 未完成任务：${reality.tasks.unfinished.slice(0, 10).map((task) => `${task.id}(${task.status})`).join('、')}${reality.tasks.unfinished.length > 10 ? ` …共 ${reality.tasks.unfinished.length} 个` : ''}`
    : ''
  const artifactIssues: string[] = []
  if (reality.artifacts.missingMarkdown.length > 0) artifactIssues.push(`已标 done 但缺客户 MD：${reality.artifacts.missingMarkdown.join('、')}`)
  if (reality.artifacts.missingReport.length > 0) artifactIssues.push(`已标 done 但缺结构化 JSON：${reality.artifacts.missingReport.join('、')}`)
  const artifactBlock = artifactIssues.length > 0 ? `\n- 产物缺失：${artifactIssues.join('；')}` : ''
  const summaryBlock = reality.summary
    ? `\n- 阶段总报告：${reality.summary.exists ? `《${reality.summary.fileName}》已就位` : `缺《${reality.summary.fileName}》—— 收阶段前必须补齐`}`
    : ''
  const suiteBlock = reality.suite
    ? `\n- 投标分析底稿：${reality.suite.ok ? '已就位' : reality.suite.shortGaps}`
    : ''
  const workbookBlock = reality.workbook
    ? `\n- 公式测算表：${reality.workbook.exists ? `《${reality.workbook.fileName}》已就位` : `缺《${reality.workbook.fileName}》—— 总报告之后必须 tender_pricing_workbook generate`}`
    : ''
  const intelBlock = reality.localIntel
    ? `\n- 当地供应商尽调/工效/询价单：${
      reality.localIntel.ok
        ? '已齐'
        : reality.localIntel.ready
          ? '已强制放行（策划依据为网络询价+工效推导）'
          : reality.localIntel.shortGaps
    }`
    : ''
  const evidenceBlock = reality.evidence
    ? `\n- 证据门禁：${reality.evidence.blocking ? `阻塞中（${reality.evidence.gapCount} 缺口）` : (reality.evidence.waived ? '已强制放行（缺口保持标注）' : '通过')}`
    : ''
  const quietBlock = reality.lastOutputAt
    ? `\n- 最近产出：${reality.lastOutputAt.slice(11, 19)} UTC（已静默约 ${reality.quietMinutes} 分钟）`
    : ''
  return [
    `盘面对账（服务端已核验，勿重复扫描）：`,
    `- 阶段链：${chain}`,
    `- 本阶段「${reality.stageLabel}」任务：${reality.tasks.done}/${reality.tasks.total} done${reality.tasks.error > 0 ? `，${reality.tasks.error} 个 error` : ''}${unfinishedBlock}${artifactBlock}${summaryBlock}${suiteBlock}${workbookBlock}${intelBlock}`,
    `- 引用核验：共 ${reality.citations.total} 个令牌，${reality.citations.orphans} 个孤儿`,
    `- 本次已同步 ${published} 件客户成果${evidenceBlock}${quietBlock}`,
  ].join('\n')
}

function buildOrganizeDraft(input: {
  project: BusinessProjectRecord
  stage: WorkflowStage
  reality: StageReality
  published: number
  aligned: { renamed: number; moved: number }
  citationAudit: CitationAudit
  closed: boolean
}): string {
  const { project, stage, reality, published, aligned, citationAudit, closed } = input
  const orphanBlock = citationAudit.orphans.length > 0
    ? `\n孤儿引用清单（逐条修复后重跑质检）：\n${citationAudit.orphans.slice(0, 12).map((orphan) => `- ${orphan.file}:${orphan.line} ${orphan.token} — ${orphan.reason}`).join('\n')}${citationAudit.orphans.length > 12 ? `\n- …其余 ${citationAudit.orphans.length - 12} 条见 orchestration/citation-audit.json` : ''}`
    : ''
  const reviewSkills = [
    ...(stage.reviewSkillSlugs ?? []),
    ...stage.skillSlugs.filter((slug) => slug.includes('formal-writing')),
  ]
  const skillLines = [...new Set(reviewSkills)].map((slug) => `[skill:${slug}]`).join('\n')
  const summaryOutline = stage.summaryDeliverable && reality.summary && !reality.summary.exists
    ? `\n阶段总报告《${stage.summaryDeliverable.fileName}》大纲（写入 Agent Pi Outputs/${project.projectId}/${reality.outputFolder}/）：\n${stage.summaryDeliverable.outlineZh.map((line) => `- ${line}`).join('\n')}\n`
    : ''
  const suiteOutline = reality.suite && !reality.suite.ok
    ? `\n投标分析底稿未齐（专题视图按需派生；禁止重扫已完成源文件）：\n${ANALYSIS_SUITE.map((item) => {
      const row = reality.suite!.files.find((file) => file.fileName === item.fileName)
      const mark = !row || !row.exists ? '缺' : !row.ok ? `未达标${row.missingTerms.length ? `（${row.missingTerms.join('、')}）` : ''}` : '已齐'
      return `- 《${item.fileName}》${mark}\n${item.outlineZh.map((line) => `  - ${line}`).join('\n')}`
    }).join('\n')}\n`
    : ''
  const workbookOutline = reality.workbook && !reality.workbook.exists
    ? `\n公式测算表《${reality.workbook.fileName}》仍缺：调用 tender_pricing_workbook generate，写入 Agent Pi Outputs/${project.projectId}/${reality.outputFolder}/。\n`
    : ''
  const intelOutline = reality.localIntel && !reality.localIntel.ready
    ? `\n当地供应商尽调 / 工效尽调 / 询价单未齐：${reality.localIntel.shortGaps}。写入 Agent Pi Outputs/${project.projectId}/${reality.outputFolder}/。先 anysearch_capabilities，再 anysearch_batch_search（zone=intl）。询价回不齐时 tender_evidence waive_pricing，再写《组价依据说明.md》。\n`
    : ''
  const alignBlock = aligned.renamed + aligned.moved > 0
    ? `\n本次整理动作：已把 ${aligned.renamed} 份成果改名为源文件名，归位 ${aligned.moved} 份散落文件到阶段目录。\n`
    : ''
  const header = `项目: ${project.name} (${project.projectId})
阶段: ${reality.stageLabel} (\`${stage.id}\`)
成果目录: Agent Pi Outputs/${project.projectId}/${reality.outputFolder}/`

  if (closed) {
    return `【阶段已收口 — 盘面复核】

${header}

${renderRealityBlock(reality, published)}${orphanBlock}${alignBlock}
本阶段已经 complete_stage，工作台状态为「已完成」。不要再次调用 complete_stage，不要把阶段改回进行中。

下列事项是「投标可提交」商务门禁，不是本阶段未完成：未询价费率、开工日期/日历/生产率待确认、标前 RFI、现金流商务层处理、submission_audit 保持 not_ready。简报必须写成两栏——阶段：已收口（写出成果目录）；投标可提交：未就绪或就绪（只列商务待办）。禁止写成「阶段没做完」或「请再点成果质检」。

你的职责：
1. 只处理上面盘面对账列出的产物、孤儿、阶段总控和分析底稿差异；没有列出的不要重扫已完成源文件。
2. 盘面无差异时明确告诉用户：控制面板「已完成」是对的，无需再质检。
3. 向用户输出「阶段实况简报」两栏，三行以内。
禁止由主会话代写子任务成果；禁止对已通过评审的成果重复评审。`
  }

  return `【成果质检并整理 — 请在本项目主会话继续】

${skillLines}

${header}

${renderRealityBlock(reality, published)}${orphanBlock}
${summaryOutline}${suiteOutline}${workbookOutline}${intelOutline}${alignBlock}
你的职责是掌控与裁决，不是机械重扫：
1. 差异逐项裁决：上面列出的每一条缺失/未完成/孤儿，判断是补做、返工还是纠正任务状态，并当场执行；补齐或删除错误成果后调用 tender_stage status 重新核对，需清空任务时使用 reset。缺产物的任务不得保持 done。没有列出的差异不要自行发明，不要重新解析已完成的源文件。
2. 阶段总控与分析底稿：若上面显示缺失/过短/缺章，基于已有解析成果补齐，不要重扫源文件；专题视图不再是数量硬门。BOQ 组价阶段还须 tender_pricing_workbook generate 写出《BOQ 组价测算.xlsx》，并补齐当地供应商尽调与询价单。
3. 评审纪律稽核：只复核高风险、实质变更和抽样成果，最多 1 轮修订；仍有分歧交用户裁决。
4. 裁决完成后收口：清单全部 done、孤儿为 0、阶段总控与分析底稿就位、组价阶段公式测算表及当地尽调就位时调用 tender_stage complete_stage（projectId=${project.projectId}, stageId=${stage.id}）；人工决策阶段必须停下等待工作台确认。
5. 最后向用户输出「阶段实况简报」两栏（三行以内）：阶段（已完成什么）/ 投标可提交（商务待办，不挡阶段收口）。询价、开工确认、submission_audit not_ready 不得写成「本阶段未完成」。若系统此前处于空闲等待，请明确说出当前在等谁做什么。
禁止由主会话代写子任务成果；禁止对已通过评审的成果重复评审。`
}

export function organizeDeliverables(
  cwd: string,
  project: BusinessProjectRecord,
  stageId: string,
): {
  published: number
  board: OrchestrationBoard
  draft: string
  citationAudit: CitationAudit
  reality: StageReality
  aligned: { renamed: number; moved: number }
  closed: boolean
  needsQc: boolean
  message: string
} {
  const aligned = alignDeliverableNames(cwd, project, stageId)
  const published = syncProjectOutputs(cwd, project.projectId, project.module, stageId).published
  const citationAudit = auditProjectCitations(cwd, project)
  const board = inspectBoard(cwd, project)
  const workflow = workflowFor(project.module)
  const stage = workflow.stages.find((item) => item.id === stageId) ?? workflow.stages[0]!
  const reality = collectStageReality(cwd, project, stageId, board, citationAudit)
  const closed = reality.stageStatus === 'done' && !reality.needsQc
  const draft = buildOrganizeDraft({ project, stage, reality, published, aligned, citationAudit, closed })
  const message = closed
    ? `「${reality.stageLabel}」已收口，盘面无差异。成果在 Agent Pi Outputs/${project.projectId}/${reality.outputFolder}/。询价、开工确认、submission_audit 未通过不回退本阶段。`
    : `已同步 ${published} 件成果，盘面仍有差异，请在主会话裁决。`
  return { published, board, citationAudit, reality, aligned, draft, closed, needsQc: reality.needsQc, message }
}

export interface ResumeResult {
  state?: StageState
  /** Stage draft to write into the parent session; absent when blocked, deduped, or done. */
  draft?: string
  board: OrchestrationBoard
  stageId?: string
  message: string
  /** Set when the whole workflow is finished — callers should stop auto-resume. */
  done?: boolean
  /** Set when the same draft was already offered/dispatched and state has not changed. */
  alreadyDispatched?: boolean
  blocked?: string
  /** Present only when `draft` is present; echo back via mark_dispatched after the send. */
  dispatch?: { stageId: string; key: string }
}

function analysisSuiteFor(cwd: string, projectId: string): AnalysisSuiteStatus {
  return assessAnalysisSuite(officialStageDir(cwd, projectId, ANALYSIS_SUITE_STAGE_ID))
}

function analysisBoqFor(cwd: string, projectId: string): BoqInventoryGate {
  return assessBoqInventoryGate(cwd, projectId, officialStageDir(cwd, projectId, ANALYSIS_SUITE_STAGE_ID))
}

function buildAnalysisBoqDraft(
  project: BusinessProjectRecord,
  stage: WorkflowStage,
  inventory: BoqInventoryGate,
): string {
  const folder = officialStageFolder(stage.id)
  return `【补齐实际工程量清单 — 请在本项目主会话继续】

[skill:tender-boq-reconciliation]

项目: ${project.name} (${project.projectId})
阶段: ${stage.labelZh} (\`${stage.id}\`)
成果目录: Agent Pi Outputs/${project.projectId}/${folder}/

${renderBoqInventoryBlock(inventory)}

投标分析底稿可以先写完，但没有摸到本标实际清单行就不得 complete_stage。不要重扫已完成的源文件解析稿。

规则:
- 打开已登记的 BOQ / Bill of Quantities / Pricing Schedule / 工程量文件，按 sheet+cell 抽出真实行。
- tender_capability replace boq_reconciliation，覆盖源表全部可识别清单行，带清单号、描述、单位、数量、sheet+cell。来源 documentId 必须是该 BOQ 文件；PC Sum / Provisional Sum / percentage 等传递项也要登记，但后续不做五步直接费组价。
- 禁止示范行、占位行、从规范 PDF 或总报告编造清单。
- 《投标分析底稿.md》的 BOQ 章节必须点名 pack 里的代表性清单号（如 C1.1）。
- 系统会反查 BOQ 解析稿中的显式清单号；没有清单或只做局部样本的项目绝对不能过解析关，特征门 / force_pass 不能放行。

请只补这份清单 pack 和点名清单号。`
}

function buildAnalysisSuiteDraft(
  project: BusinessProjectRecord,
  stage: WorkflowStage,
  suite: AnalysisSuiteStatus,
): string {
  const folder = officialStageFolder(stage.id)
  const outlines = ANALYSIS_SUITE.map((item) => {
    const row = suite.files.find((file) => file.fileName === item.fileName)
    const mark = !row || !row.exists ? '缺' : !row.ok ? `未达标${row.missingTerms.length ? `（缺 ${row.missingTerms.join('、')}）` : ''}` : '已齐'
    return `- 《${item.fileName}》${mark}\n${item.outlineZh.map((line) => `  - ${line}`).join('\n')}`
  }).join('\n')
  return `【补齐投标分析底稿 — 请在本项目主会话继续】

[skill:tender-document-parsing]

项目: ${project.name} (${project.projectId})
阶段: ${stage.labelZh} (\`${stage.id}\`)
成果目录: Agent Pi Outputs/${project.projectId}/${folder}/

${renderAnalysisSuiteBlock(suite, folder)}

源文件解析稿已经落地的，禁止重读 PDF / 重派工人 / 重写逐文件 MD。只根据已有解析稿、项目特征和登记资料补下面未齐的唯一底稿：

${outlines}

规则:
- 覆盖规定章节与来源索引；数字、日期、罚则带来源令牌。不要为字数重复铺陈。
- 只借结构与写法，禁止抄上一单合同号、金额、里程或罚款。
- 缺原文标缺口，禁止用模型记忆填空。
- 同时抽出实际工程量清单全部可识别行并 replace boq_reconciliation；PC / 暂定 / 百分比传递项也登记，《投标分析底稿.md》点名代表性清单号。没有清单或覆盖不全不得 complete_stage。
- 《投标分析底稿.md》与清单 pack 摸到真实行后，调用 tender_stage complete_stage（projectId=${project.projectId}, stageId=${stage.id}）。

请只补列出的缺口。`
}

export function resumeUnfinished(
  cwd: string,
  project: BusinessProjectRecord,
  selectedKnowledgeSlugs: string[] = [],
): ResumeResult {
  const board = inspectBoard(cwd, project)
  const workflow = workflowFor(project.module)
  const setupStageId = workflow.setupStageId
  if (setupStageId && board.stages[setupStageId]?.status !== 'done') {
    return {
      board,
      blocked: '请先完成「项目资料登记」并确认资料齐套。',
      message: '请先完成「项目资料登记」并确认资料齐套。',
    }
  }
  const target = workflow.stages.find((stage) => {
    if (stage.id === setupStageId) return false
    const slice = board.stages[stage.id]
    if (!slice) return true
    if ((analysisSuiteApplies(stage.id) || boqInventoryApplies(stage.id)) && !analysisHardGatesReady(cwd, project.projectId, stage.id)) return true
    if (pricingLocalIntelApplies(stage.id) && !pricingHardGatesReady(cwd, project.projectId, stage.id)) return true
    return slice.status !== 'done'
  })
  if (!target) {
    return { board, message: '没有未完成阶段，流程已全部完成。', done: true }
  }
  if (target.approvalGate) {
    const current = board.stages[target.id]
    const summaryPath = target.summaryDeliverable
      ? join(officialStageDir(cwd, project.projectId, target.id), target.summaryDeliverable.fileName)
      : ''
    const summaryReady = Boolean(summaryPath && existsSync(summaryPath) && deliverableReady(summaryPath))
    if (current?.approval?.decision === 'rejected' || summaryReady) {
      const message = current?.approval?.decision === 'rejected'
        ? (current.blockedReason || `用户已拒绝「${target.labelZh}」，流程保持暂停。`)
        : `${target.approvalGate.promptZh} 请在工作台点击「${target.approvalGate.approveLabelZh}」${target.approvalGate.rejectLabelZh ? `或「${target.approvalGate.rejectLabelZh}」` : ''}。`
      return {
        board,
        stageId: target.id,
        blocked: message,
        message,
      }
    }
  }
  const prepared = prepareStage(cwd, project, target.id, selectedKnowledgeSlugs)
  if (prepared.blocked) {
    return {
      state: prepared.state,
      board: prepared.board,
      stageId: target.id,
      blocked: prepared.blocked,
      message: prepared.blocked,
    }
  }
  const slice = prepared.board.stages[target.id]!
  const suite = analysisSuiteApplies(target.id) ? analysisSuiteFor(cwd, project.projectId) : undefined
  const boqGate = boqInventoryApplies(target.id) ? analysisBoqFor(cwd, project.projectId) : undefined
  const intelGate = pricingIntelGateFor(cwd, project.projectId, target.id)
  const intel = intelGate?.intel
  const allTasksDone = slice.tasks.length > 0 && slice.tasks.every((task) => task.status === 'done')
  const suiteHasProgress = Boolean(suite && suite.files.some((file) => file.exists))
  const intelHasProgress = Boolean(intel && (intel.files.some((file) => file.exists) || intel.rfqs.length > 0))
  const patchSuiteOnly = Boolean(suite && !suite.ok && (allTasksDone || suiteHasProgress))
  const patchBoqOnly = Boolean(boqGate && !boqGate.ready && suite?.ok && (allTasksDone || suiteHasProgress))
  const patchWaiverOnly = Boolean(intelGate && !intelGate.ready && intelGate.waived && allTasksDone)
  const patchIntelOnly = Boolean(intelGate && !intelGate.ready && !intelGate.waived && (allTasksDone || intelHasProgress))
  const extraKey = suite
    ? `${suite.ok ? 'suite-ok' : `suite:${suite.digest}`}|${boqGate ? (boqGate.ready ? 'boq-ok' : `boq:${boqGate.digest}`) : 'boq-na'}`
    : intelGate
      ? (intelGate.ready ? (intelGate.intel.ok ? 'intel-ok' : 'intel-waived') : `intel:${intelGate.digest}`)
      : ''
  const key = dispatchFingerprint(slice, extraKey)
  const draft = patchSuiteOnly && suite
    ? buildAnalysisSuiteDraft(project, target, suite)
    : patchBoqOnly && boqGate
      ? buildAnalysisBoqDraft(project, target, boqGate)
      : patchWaiverOnly && intelGate
        ? buildPricingWaiverDraft(project.projectId, intelGate)
        : patchIntelOnly && intel
          ? buildPricingIntelDraft(project.projectId, intel)
          : suite && !suite.ok
            ? `${prepared.draft}\n\n${renderAnalysisSuiteBlock(suite, officialStageFolder(target.id))}`
            : boqGate && !boqGate.ready
              ? `${prepared.draft}\n\n${renderBoqInventoryBlock(boqGate)}`
              : intelGate && !intelGate.ready
                ? `${prepared.draft}\n\n${renderPricingIntelBlock(intel, officialStageFolder(target.id))}`
                : prepared.draft
  const waitingMessage = suite && !suite.ok
    ? `「${target.labelZh}」投标分析底稿未齐：${suite.shortGaps}。阶段稿已写入，只补底稿缺口，不要重扫已完成源文件。`
    : boqGate && !boqGate.ready
      ? `「${target.labelZh}」未摸到实际工程量清单：${boqGate.shortGaps}。阶段稿已写入，只抽本标 BOQ 真实行，不要重扫已完成源文件。`
      : intelGate && !intelGate.ready
        ? (intelGate.waived
          ? `「${target.labelZh}」已强制放行尽调包，但《组价依据说明.md》未齐：${intelGate.shortGaps}。阶段稿已写入，不要重做已完成章节组价。`
          : `「${target.labelZh}」当地供应商尽调 / 工效尽调 / 询价单未齐：${intelGate.shortGaps}。阶段稿已写入，等待补齐这些文件，不要重做已完成章节组价。`)
        : `「${target.labelZh}」的阶段稿已写入主对话，等待执行完成或状态变化后再接续。`
  const record = slice.dispatch
  if (record && record.key === key) {
    const offeredRecently = Date.parse(record.offeredAt) > Date.now() - DISPATCH_OFFER_TTL_MS
    if (record.dispatchedAt || offeredRecently) {
      return {
        state: prepared.state,
        board: prepared.board,
        stageId: target.id,
        alreadyDispatched: true,
        message: waitingMessage,
      }
    }
  }
  slice.dispatch = { key, offeredAt: new Date().toISOString() }
  const boardWithOffer = putSlice(cwd, project, slice)
  return {
    state: prepared.state,
    draft,
    board: boardWithOffer,
    stageId: target.id,
    dispatch: { stageId: target.id, key },
    message: patchSuiteOnly
      ? `已准备「${target.labelZh}」投标分析底稿补齐稿：${suite?.shortGaps}。写入主对话后只补缺口，不要重扫源文件。`
      : patchBoqOnly
        ? `已准备「${target.labelZh}」实际工程量清单补齐稿：${boqGate?.shortGaps}。写入主对话后只抽本标 BOQ 真实行，不要重扫源文件。`
        : patchWaiverOnly
          ? `已准备「${target.labelZh}」强制放行说明稿：${intelGate?.shortGaps}。写入主对话后只写《组价依据说明.md》，不要重做章节组价。`
          : patchIntelOnly
            ? `已准备「${target.labelZh}」当地供应商尽调 / 工效尽调 / 询价单补齐稿：${intel?.shortGaps}。写入主对话后只补缺口，不要重做章节组价。`
            : `已准备「${target.labelZh}」阶段稿，写入当前主对话后由 dsh 原生 subagent / workflow 继续。`,
  }
}

export function markForcePass(cwd: string, projectId: string, stageId?: string): StageState {
  forcePassEvidence(cwd, projectId)
  const board = loadBoard(cwd, projectId)
  const id = stageId || board.currentStageId || 'tender-document-analysis'
  if (pricingLocalIntelApplies(id)) forcePassPricingIntel(cwd, projectId)
  const previous = board.stages[id]
  const slice: StageSlice = {
    stageId: id,
    status: previous?.status === 'blocked' ? 'idle' : (previous?.status ?? 'idle'),
    tasks: previous?.tasks ?? [],
    updatedAt: new Date().toISOString(),
    forcePassedAt: new Date().toISOString(),
    completedAt: previous?.completedAt,
  }
  board.currentStageId = id
  board.stages[id] = slice
  board.updatedAt = slice.updatedAt
  saveBoard(cwd, board)
  return {
    schemaVersion: 1,
    projectId,
    module: board.module || 'tender',
    ...slice,
  }
}
