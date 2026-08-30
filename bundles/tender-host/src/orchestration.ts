import { createHash } from 'node:crypto'
import { basename, dirname, extname, isAbsolute, join, relative, resolve, sep } from 'node:path'
import { existsSync, readFileSync, readdirSync, renameSync, statSync } from 'node:fs'
import { listBusinessProjects, type BusinessProjectRecord } from '../../../packages/business-projects/index.ts'
import {
  parseTenderCapabilityEnvelope,
  parseTenderSubmissionAuditData,
  parseTenderSubmissionDocumentsData,
  type TenderCapabilityId,
} from '../../../packages/business-core/src/tender/index.ts'
import { assessEvidence, evidencePolicy, forcePassEvidence, forcePassPricingIntel } from './evidence.ts'
import { CAPABILITY_FILE_NAMES, tenderDir, writeJson, readJson, ensureDir } from './fsutil.ts'
import type { WorkflowStage } from './workflows.ts'
import { listWorkbenchModules, usesTenderControlProfile, workflowFor } from './modules.ts'
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
import { analysisCoverageRejectReason, assessAnalysisCoverage, loadAnalysisCoverage } from './analysis-coverage.ts'
import { loadEvidenceLedger } from './structured-evidence.ts'
import { loadKnowledgeTelemetry } from './knowledge-telemetry.ts'
import { loadWorkSurfacePolicy } from './worksurface-policy.ts'
import {
  acceptedUserRequirementOverride,
  activeUserRequirements,
  bindUserRequirementSession,
  listUserRequirements,
  projectBoundToSession,
  recordUserRequirement as writeUserRequirement,
  updateUserRequirement as writeUserRequirementStatus,
  type UserRequirement,
  type UserRequirementStatus,
} from './user-requirements.ts'
import {
  commitStageHandoff,
  invalidateStageMemory,
  loadStageMemorySnapshot,
  refreshStageMemorySnapshot,
  renderProjectMemoryContext,
  slimStageMemorySnapshot,
} from './stage-memory.ts'
import {
  completeStageExecutions,
  executionForSession,
  latestExecutionForProject,
  renderExecutionContext,
  updateSessionExecution,
  type ExecutionUpdateInput,
  type SessionExecution,
} from './execution-ledger.ts'

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

export function bindProjectSession(
  cwd: string,
  project: BusinessProjectRecord,
  sessionId: string,
  stageId = '',
) {
  return bindUserRequirementSession(cwd, project, sessionId, stageId || loadBoard(cwd, project.projectId, project.module).currentStageId || '')
}

export function projectForBoundSession(cwd: string, sessionId: string): BusinessProjectRecord | null {
  return projectBoundToSession(cwd, sessionId)
}

/** Small disk-backed project baseline injected into every bound parent turn. */
export function projectMemoryContextForSession(cwd: string, sessionId: string): string {
  const project = projectForBoundSession(cwd, sessionId)
  if (!project) return ''
  try {
    const board = loadBoard(cwd, project.projectId, project.module)
    refreshStageMemorySnapshot(cwd, project)
    const memory = renderProjectMemoryContext(
      cwd,
      project,
      board.currentStageId,
      Object.fromEntries(Object.entries(board.stages).map(([stageId, slice]) => [stageId, slice.status])),
    )
    return `${memory}\n\n${renderExecutionContext(executionForSession(cwd, project, sessionId, board.currentStageId))}`
  } catch (error) {
    return `【Agent Pi 项目记忆告警】${error instanceof Error ? error.message : String(error)}。停止沿用聊天摘要，先在专业工作台修复阶段记忆。`
  }
}

function requirementStageId(
  cwd: string,
  project: BusinessProjectRecord,
  requestedStageId = '',
): string {
  const workflow = workflowFor(project.module)
  const board = loadBoard(cwd, project.projectId, project.module)
  const candidate = requestedStageId || board.currentStageId
    || workflow.stages.find((stage) => board.stages[stage.id]?.status !== 'done')?.id
    || workflow.stages.at(-1)?.id
    || ''
  if (!workflow.stages.some((stage) => stage.id === candidate)) {
    throw new Error(`Unknown stage ${candidate}`)
  }
  return candidate
}

export function recordProjectUserRequirement(
  cwd: string,
  project: BusinessProjectRecord,
  input: { sessionId: string; stageId?: string; text: string },
): { requirement: UserRequirement; board: OrchestrationBoard } {
  const stageId = requirementStageId(cwd, project, input.stageId)
  const recorded = writeUserRequirement(cwd, project, { ...input, stageId })
  const board = loadBoard(cwd, project.projectId, project.module)
  if (!recorded.created) return { requirement: recorded.requirement, board }
  try { invalidateStageMemory(cwd, project, stageId, '用户对已冻结阶段提出了新的变更要求。') } catch { /* inspection surfaces corrupt memory */ }
  const previous = board.stages[stageId]
  const now = new Date().toISOString()
  const slice: StageSlice = {
    stageId,
    status: 'running',
    tasks: previous?.tasks ?? [],
    updatedAt: now,
    forcePassedAt: previous?.forcePassedAt,
    approval: previous?.approval,
  }
  board.currentStageId = stageId
  board.stages[stageId] = slice
  board.updatedAt = now
  saveBoard(cwd, board)
  return { requirement: recorded.requirement, board }
}

export function setProjectUserRequirementStatus(
  cwd: string,
  project: BusinessProjectRecord,
  requirementId: string,
  status: UserRequirementStatus,
  options: { note?: string; evidencePaths?: string[] } = {},
): { requirement: UserRequirement; board: OrchestrationBoard } {
  const requirement = writeUserRequirementStatus(cwd, project, requirementId, status, options)
  const board = loadBoard(cwd, project.projectId, project.module)
  const previous = board.stages[requirement.stageId]
  if (previous) {
    const slice: StageSlice = { ...previous, updatedAt: new Date().toISOString() }
    delete slice.dispatch
    if (status === 'active') {
      try { invalidateStageMemory(cwd, project, requirement.stageId, '用户要求继续修改已冻结阶段。') } catch { /* inspection surfaces corrupt memory */ }
      slice.status = 'running'
      delete slice.completedAt
      delete slice.blockedReason
    }
    board.currentStageId = requirement.stageId
    board.stages[requirement.stageId] = slice
    board.updatedAt = slice.updatedAt
    saveBoard(cwd, board)
  }
  return { requirement, board }
}

const DELIVERABLE_MIN_BYTES = 80

const TENDER_STAGE_REQUIRED_CAPABILITIES: Partial<Record<string, TenderCapabilityId[]>> = {
  'tender-document-analysis': ['document_analysis', 'boq_reconciliation'],
  'boq-five-step-pricing': ['boq_five_step_pricing'],
  'planning-and-submission': ['execution_plan', 'schedule_resources', 'construction_resource_schedule', 'cost_cashflow'],
  'submission-compliance-freeze': ['submission_documents', 'bidder_commitments', 'submission_audit'],
}

const PLANNING_REQUIRED_DELIVERABLES = [
  { fileName: '施工策划报告.md', requestedBy: [/施工策划报告(?:\.md)?/i, /construction planning report(?:\.md)?/i] },
  { fileName: 'tender-programme.msp.xml', requestedBy: [/tender[-_ ]programme\.msp\.xml/i, /\bmicrosoft project\b/i, /\bms project\b/i, /\.msp(?:\.xml)?\b/i] },
  { fileName: 'tender-programme.p6.xml', requestedBy: [/tender[-_ ]programme\.p6\.xml/i, /\bprimavera(?:\s+p6)?\b/i, /\bp6\s+(?:programme|program|schedule|xml)\b/i] },
  { fileName: 'S-Curve_Cash_Flow_Chart.html', requestedBy: [/s[-_ ]?curve(?:[-_ ]cash[-_ ]flow[-_ ]chart)?(?:\.html)?/i, /S曲线/i, /现金流曲线/i] },
  { fileName: 'Work_Plan_and_Proposed_Methodology.docx', requestedBy: [/work[-_ ]plan[-_ ]and[-_ ]proposed[-_ ]methodology(?:\.docx)?/i] },
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
    // Warning-only review findings remain visible in the handoff and final
    // human freeze, but do not send DSH back through an already completed
    // stage. Missing, stale and error-level (`not_ready`) packs still block.
    if (entry.readiness === 'not_ready' || entry.stale) {
      return [`${capability}: ${entry.readiness}${entry.stale ? ', stale' : ''}`]
    }
    return []
  })
}

function pathInside(root: string, candidate: string): boolean {
  const rel = relative(resolve(root), resolve(candidate))
  return rel === '' || (rel !== '..' && !rel.startsWith(`..${sep}`) && !isAbsolute(rel))
}

function sameResolvedPath(left: string, right: string): boolean {
  return resolve(left).replace(/\\/g, '/').toLowerCase() === resolve(right).replace(/\\/g, '/').toLowerCase()
}

function declaredSubmissionFile(cwd: string, project: BusinessProjectRecord, filePath: string): string | null {
  // Final-freeze inputs are deliberately narrower than the general output
  // harvester: raw workspace files must never qualify as submission artifacts.
  const roots = [
    resolve(officialProjectDir(cwd, project.projectId)),
    resolve(cwd, 'published'),
  ]
  const candidates = isAbsolute(filePath)
    ? [resolve(filePath)]
    : [resolve(cwd, filePath), ...roots.map((root) => resolve(root, filePath))]
  return [...new Set(candidates)].find((candidate) => (
    roots.some((root) => pathInside(root, candidate)) && deliverableReady(candidate)
  )) ?? null
}

function declaredFormatMatches(path: string, format?: string): boolean {
  if (!format?.trim()) return true
  const aliases: Record<string, string> = {
    'application/pdf': 'pdf',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'docx',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': 'xlsx',
    'application/vnd.openxmlformats-officedocument.presentationml.presentation': 'pptx',
    word: 'docx',
    excel: 'xlsx',
    powerpoint: 'pptx',
  }
  const declared = format.trim().toLowerCase().replace(/^\./, '')
  return extname(path).slice(1).toLowerCase() === (aliases[declared] ?? declared)
}

function fileSha256(path: string): string {
  return createHash('sha256').update(readFileSync(path)).digest('hex')
}

/** Final freeze verifies real disk files instead of trusting model-authored booleans. */
export function submissionFileGaps(cwd: string, project: BusinessProjectRecord): string[] {
  const packsDir = join(tenderDir(cwd, project.projectId), 'packs')
  const gaps: string[] = []
  const readItems = <T extends { items: Array<{ filePath: string; id?: string; title?: string; deliverableId?: string; format?: string; sha256?: string }> }>(
    capability: 'submission_documents' | 'submission_audit',
    parse: (value: unknown) => T,
  ): T['items'] => {
    const path = join(packsDir, `${CAPABILITY_FILE_NAMES[capability]}.json`)
    if (!existsSync(path)) return []
    try {
      const envelope = parseTenderCapabilityEnvelope(JSON.parse(readFileSync(path, 'utf8')))
      return parse(envelope.data).items
    } catch (error) {
      gaps.push(`${capability}: ${error instanceof Error ? error.message : String(error)}`)
      return []
    }
  }

  const documents = readItems('submission_documents', parseTenderSubmissionDocumentsData)
  const documentPaths = new Map<string, string>()
  for (const item of documents) {
    const key = item.deliverableId || item.id || ''
    const label = item.title || key || item.filePath
    const actualPath = declaredSubmissionFile(cwd, project, item.filePath)
    if (!actualPath) {
      gaps.push(`${label}: ${item.filePath}`)
      continue
    }
    if (!declaredFormatMatches(actualPath, item.format)) {
      gaps.push(`${label}: 声明格式 ${item.format} 与文件 ${basename(actualPath)} 不一致`)
    }
    if (key) documentPaths.set(key, actualPath)
  }

  const audits = readItems('submission_audit', parseTenderSubmissionAuditData)
  for (const item of audits) {
    const key = item.deliverableId || item.id || ''
    const label = item.title || key || item.filePath
    const documentPath = key ? documentPaths.get(key) : undefined
    const auditedPath = declaredSubmissionFile(cwd, project, item.filePath)
    if (!documentPath) {
      gaps.push(`${label}: 未在 submission_documents 中登记可核验文件`)
      continue
    }
    if (!auditedPath || !sameResolvedPath(documentPath, auditedPath)) {
      gaps.push(`${label}: submission_audit 路径与 submission_documents 不一致`)
      continue
    }
    if (!declaredFormatMatches(documentPath, item.format)) {
      gaps.push(`${label}: 声明格式 ${item.format} 与文件 ${basename(documentPath)} 不一致`)
    }
    if (item.sha256 && fileSha256(documentPath) !== item.sha256.toLowerCase()) {
      gaps.push(`${label}: SHA256 与磁盘提交文件不一致`)
    }
  }
  return [...new Set(gaps)]
}

function planningDeliverableGaps(cwd: string, project: BusinessProjectRecord, stageId: string): string[] {
  if (stageId !== 'planning-and-submission') return []
  const requested = [...(project.terminalDeliverables ?? [])]
  try {
    const workspace = loadWorkspace(cwd, project.projectId)
    requested.push(
      ...workspace.requirements.map((item) => `${item.title} ${item.text}`),
      ...workspace.deliverables.map((item) => `${item.title} ${item.format ?? ''} ${item.submissionSection ?? ''}`),
    )
  } catch { /* missing workspace is handled by the normal tender capability gates */ }
  const dir = officialStageDir(cwd, project.projectId, stageId)
  return PLANNING_REQUIRED_DELIVERABLES
    .filter((item) => requested.some((text) => item.requestedBy.some((pattern) => pattern.test(text))))
    .map((item) => item.fileName)
    .filter((fileName) => !deliverableReady(join(dir, fileName)))
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

function analysisHardGatesReady(cwd: string, project: BusinessProjectRecord, stageId: string): boolean {
  if (!analysisSuiteApplies(stageId)) return true
  const dir = officialStageDir(cwd, project.projectId, stageId)
  const userOverride = acceptedUserRequirementOverride(cwd, project, stageId)
  let summaryName = '投标分析底稿.md'
  try {
    const stage = workflowFor(project.module).stages.find((item) => item.id === stageId)
    if (stage?.summaryDeliverable?.fileName) summaryName = stage.summaryDeliverable.fileName
  } catch { /* factory name stands */ }
  return (userOverride || (deliverableReady(join(dir, summaryName)) && assessAnalysisSuite(dir).ok))
    && assessBoqInventoryGate(cwd, project.projectId, dir).ready
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
  const userOverride = acceptedUserRequirementOverride(cwd, project, stageId)
  const summaryReady = userOverride || !stage?.summaryDeliverable
    || deliverableReady(join(officialStageDir(cwd, project.projectId, stageId), stage.summaryDeliverable.fileName))
  const workbookReady = userOverride || !pricingWorkbookMissing(cwd, project.projectId, stageId)
  const capabilitiesReady = !usesTenderControlProfile(project.module)
    || tenderCapabilityGaps(cwd, project.projectId, stageId).length === 0
  const planningReady = userOverride || !usesTenderControlProfile(project.module)
    || planningDeliverableGaps(cwd, project, stageId).length === 0
  return summaryReady
    && workbookReady
    && capabilitiesReady
    && planningReady
    && analysisHardGatesReady(cwd, project, stageId)
    && (userOverride || pricingHardGatesReady(cwd, project.projectId, stageId))
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

function backfillCompletedStageMemories(
  cwd: string,
  project: BusinessProjectRecord,
  board: OrchestrationBoard,
): void {
  const workflow = workflowFor(project.module)
  let snapshot = loadStageMemorySnapshot(cwd, project)
  for (const stage of workflow.stages) {
    const slice = board.stages[stage.id]
    if (!slice || slice.status !== 'done' || snapshot.stages[stage.id]) continue
    try {
      commitStageHandoff(cwd, project, stage.id, slice)
      snapshot = loadStageMemorySnapshot(cwd, project)
    } catch (error) {
      slice.status = 'blocked'
      slice.blockedReason = `阶段记忆包未生成：${error instanceof Error ? error.message : String(error)}`
      board.currentStageId = stage.id
      return
    }
  }
}

function reconcileBoardWithStageMemory(
  project: BusinessProjectRecord,
  board: OrchestrationBoard,
  snapshot: ReturnType<typeof refreshStageMemorySnapshot>,
): void {
  const workflow = workflowFor(project.module)
  let firstInvalidIndex = Number.POSITIVE_INFINITY
  for (const [index, stage] of workflow.stages.entries()) {
    const memory = snapshot.stages[stage.id]
    const slice = board.stages[stage.id]
    if (!slice || !memory || memory.status !== 'stale') continue
    firstInvalidIndex = Math.min(firstInvalidIndex, index)
    board.stages[stage.id] = {
      ...slice,
      status: 'blocked',
      updatedAt: new Date().toISOString(),
      completedAt: undefined,
      approval: undefined,
      dispatch: undefined,
      blockedReason: memory.staleReason || '阶段记忆已失效，需要按当前基线重新收阶段。',
    }
  }
  if (Number.isFinite(firstInvalidIndex)) board.currentStageId = workflow.stages[firstInvalidIndex]?.id
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
  if (usesTenderControlProfile(project.module)) {
    try { assessEvidence(cwd, project.projectId) } catch { /* ignore */ }
  }
  syncProjectOutputs(cwd, project.projectId, project.module, next.currentStageId)
  backfillCompletedStageMemories(cwd, project, next)
  try {
    reconcileBoardWithStageMemory(project, next, refreshStageMemorySnapshot(cwd, project))
  } catch (error) {
    const stageId = next.currentStageId
    const slice = stageId ? next.stages[stageId] : undefined
    if (slice) {
      slice.status = 'blocked'
      slice.blockedReason = `阶段记忆读取失败：${error instanceof Error ? error.message : String(error)}`
    }
  }
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
  const evidence = usesTenderControlProfile(project.module)
    ? evidencePolicy(cwd, project.projectId)
    : null
  const outputs = listOfficialOutputs(cwd, project.projectId, project.module)
  let memory
  try { memory = slimStageMemorySnapshot(refreshStageMemorySnapshot(cwd, project)) } catch { memory = null }
  let citationAudit: CitationAudit | null = null
  try { citationAudit = loadCitationAudit(cwd, project.projectId, project.module) } catch { /* stale ledger */ }
  const restores = listSetupRestores(cwd, project.projectId)
  const userRequirements = listUserRequirements(cwd, project)
  const workSurface = usesTenderControlProfile(project.module)
    ? (() => {
        const coverageLedger = loadAnalysisCoverage(cwd, project.projectId)
        const coverage = assessAnalysisCoverage(coverageLedger)
        const evidenceLedger = loadEvidenceLedger(cwd, project.projectId)
        const telemetry = loadKnowledgeTelemetry(cwd, project.projectId)
        const policy = loadWorkSurfacePolicy()
        return {
          mode: policy.mode,
          defaultNavigator: policy.defaultNavigator,
          policyReason: policy.reason,
          pageIndex: {
            ready: restores.filter((restore) => restore.pageIndex?.state === 'ready').length,
            fallback: restores.filter((restore) => restore.pageIndex && restore.pageIndex.state !== 'ready' && restore.pageIndex.state !== 'not-eligible').length,
            notEligible: restores.filter((restore) => restore.pageIndex?.state === 'not-eligible').length,
          },
          coverage,
          evidence: {
            claimCount: evidenceLedger.claims.length,
            surfaces: [...new Set(evidenceLedger.claims.map((claim) => claim.surface))],
          },
          telemetry: { eventCount: telemetry.events.length, last: telemetry.events.at(-1) ?? null },
        }
      })()
    : null
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
    userRequirements,
    workSurface,
    execution: latestExecutionForProject(cwd, project, board.currentStageId),
    memory,
    outputs,
    restores,
  }
}

export function updateProjectExecution(
  cwd: string,
  project: BusinessProjectRecord,
  input: ExecutionUpdateInput,
): SessionExecution {
  return updateSessionExecution(cwd, project, input)
}

export function projectExecutionForSession(
  cwd: string,
  project: BusinessProjectRecord,
  sessionId: string,
): SessionExecution | null {
  const stageId = loadBoard(cwd, project.projectId, project.module).currentStageId
  return executionForSession(cwd, project, sessionId, stageId || undefined)
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
  const workflow = workflowFor(project.module)
  const projectGoal = project.projectGoal || workflow.projectGoal
  const terminalDeliverables = project.terminalDeliverables?.length
    ? project.terminalDeliverables
    : workflow.terminalDeliverables
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
    const index = workflow.stages.findIndex((item) => item.id === stage.id)
    const prior = workflow.stages.slice(0, Math.max(0, index)).filter((item) => item.id !== workflow.setupStageId)
    if (prior.length > 0) {
      priorBlock = `\n前序阶段成果读取路径（硬性约定，不要凭猜索目录）:\n${prior.map((item) => `- ${item.labelZh}: Agent Pi Outputs/${project.projectId}/${officialStageFolder(item.id)}/`).join('\n')}\n- 结构化中间数据（机器读）: .agent-pi/business/${project.module}/${project.projectId}/orchestration/reports/\n`
    }
  } catch { /* unknown module: draft still usable without the prior-stage map */ }
  return `【阶段切换 — 请在本项目主会话继续】

项目: ${project.name} (${project.projectId})
${projectGoal ? `项目总目标: ${projectGoal}\n` : ''}${terminalDeliverables?.length ? `终态交付（当前阶段只贡献其中一部分，不得把微批次当成总目标）:\n${terminalDeliverables.map((item) => `- ${item}`).join('\n')}\n` : ''}
新阶段: ${stage.labelZh} (\`${stage.id}\`)
阶段要求: ${stage.prompt}

${registered}
${bindingBlock}${priorBlock}
规则:
- 这是同一条主对话的阶段推进，不是新会话；项目记忆与上文继续有效。不要重述写作合同或再贴 [skill:…] 全文。
- 本阶段技能在工人 brief：${skillNames}。
- 引用：规范/合同/方法事实句尾只标 [kb:slug:chunkId] 或 [src:路径#L起-L止]；令牌是标注，不是原文。
- 第一步调用 tender_stage status（projectId=${project.projectId}）读取未完成任务。
- DSH 是唯一执行主线；工作台只提供事实、轻门禁和交接。execution_update 仅用于可选遥测，不得据此另起规划器、自动续跑或覆盖项目总目标。
- 客户可读成果写入 ${stageOutDir}；同册/同名多格式是一份任务，不要再拆成一文件一工人。
- 并行用 dsh 原生 subagent / workflow；tender_stage 只准备 brief，不派生子智能体。
- ${liveWorkerLimitLineZh()}
- 只使用已登记资料和用户在本对话明确添加的数据源；项目特征缺口禁止臆造。${returnRule}${reviewRule}${summaryRule}${approvalRule}${suiteRule}${workbookRule}
- 本阶段全部交付完成后调用 tender_stage complete_stage（projectId=${project.projectId}, stageId=${stage.id}）。

请按阶段要求推进。
${extra}`
}

function requirementDigest(rows: UserRequirement[]): string {
  return createHash('sha256')
    .update(rows.map((row) => `${row.id}:${row.status}:${row.updatedAt}`).join('|'))
    .digest('hex')
    .slice(0, 16)
}

function userRequirementContext(
  cwd: string,
  project: BusinessProjectRecord,
  stageId: string,
): string {
  const rows = listUserRequirements(cwd, project, stageId)
    .filter((row) => row.status !== 'dismissed')
    .slice(0, 8)
  if (rows.length === 0) return ''
  const lines = rows.map((row) => {
    const status = row.status === 'active' ? '待落实'
      : row.status === 'implemented' ? '已落实'
        : '用户已采纳为验收口径'
    return `- [${row.id}] ${status}: ${row.text}`
  })
  const accepted = rows.some((row) => row.status === 'accepted')
  return `

【用户要求账本 — 优先级高于默认工作台写法】
${lines.join('\n')}
- 只修改受这些要求影响的现有成果；不得重扫已解析文件、重派已完成工人或重写无关章节。
- 用户要求可以替代文件名、篇幅、章节和视图等软门禁；实际 BOQ、结构化能力包、精确来源和引用完整性仍不可臆造或跳过。
${accepted ? '- 用户已明确采用上述要求作为本阶段验收口径；旧的文件名/篇幅/视图门禁不再触发返工，只核对不可豁免的真实性门禁。' : '- 每项落实后调用 tender_stage action=satisfy_requirement，并传 requirementId、note 和实际修改的 evidencePaths。'}
`
}

function withUserRequirementContext(
  cwd: string,
  project: BusinessProjectRecord,
  stageId: string,
  draft: string,
): string {
  const context = userRequirementContext(cwd, project, stageId)
  if (!context || draft.includes('【用户要求账本 — 优先级高于默认工作台写法】')) return draft
  return `${context}${draft}`
}

function buildUserRequirementDraft(
  cwd: string,
  project: BusinessProjectRecord,
  stage: WorkflowStage,
  rows: UserRequirement[],
): string {
  const outputFolder = officialStageFolder(stage.id)
  return `【用户最新要求 — 请在本项目主会话优先处理】

项目: ${project.name} (${project.projectId})
阶段: ${stage.labelZh} (\`${stage.id}\`)
待落实要求: ${rows.length} 条

${userRequirementContext(cwd, project, stage.id)}
执行顺序:
1. 先调用 tender_stage status 读取当前阶段和用户要求；用户最新要求优先于默认报告写法和旧的软门禁。
2. 先检查 Agent Pi Outputs/${project.projectId}/${outputFolder}/ 已有成果，只做影响分析和定点修改；禁止重做已完成解析、组价或评审。
3. 保留不可豁免的真实性底线：实际 BOQ 行与 sheet+cell、能力包结构、精确来源、引用完整性和明确标注的资料缺口。
4. 每项完成后调用 tender_stage action=satisfy_requirement，传 requirementId、note、evidencePaths。仍与默认软门禁冲突时停下，由用户在工作台选择「采用为验收口径」，不要自行 force_pass。

不要重复阶段总任务；只落实上面的用户增量要求。`
}

function buildAcceptedRequirementCloseoutDraft(
  cwd: string,
  project: BusinessProjectRecord,
  stage: WorkflowStage,
  rows: UserRequirement[],
): string {
  const closeout = stage.approvalGate
    ? `本阶段另有独立人工决策门。只核对任务、实际 BOQ、能力包、证据和引用等不可豁免门禁；核对完成后停止，等待用户在工作台点击「${stage.approvalGate.approveLabelZh}」${stage.approvalGate.rejectLabelZh ? `或「${stage.approvalGate.rejectLabelZh}」` : ''}，不得代替用户审批。`
    : '调用 tender_stage complete_stage 尝试收口一次；若仍有不可豁免门禁，只报告并定点补齐该硬缺口，不得恢复旧文件名、篇幅、章节、视图或重做整阶段。'
  return `【用户验收口径已确认 — 只做硬门禁收口】

项目: ${project.name} (${project.projectId})
阶段: ${stage.labelZh} (\`${stage.id}\`)
已采纳要求: ${rows.length} 条

${userRequirementContext(cwd, project, stage.id)}
执行顺序:
1. 调用 tender_stage status 读取当前任务、能力包、实际 BOQ、证据和引用状态，不重新扫描已经完成的源文件或成果。
2. 用户已采用这些要求作为本阶段验收口径；旧的文件名、篇幅、章节、报告数量和视图门禁不得再次触发返工。
3. ${closeout}

这不是新的阶段总任务，也不代表人工投标/冻结决策；只做一次不可豁免门禁收口。`
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
  const workflow = workflowFor(project.module)
  const projectGoal = project.projectGoal || workflow.projectGoal
  const terminalDeliverables = project.terminalDeliverables?.length
    ? project.terminalDeliverables
    : workflow.terminalDeliverables
  const contract = [
    projectGoal ? `项目总目标: ${projectGoal}` : '',
    terminalDeliverables?.length
      ? `终态交付（只用于保持方向，不得扩展为重跑整阶段）:\n${terminalDeliverables.map((item) => `- ${item}`).join('\n')}`
      : '',
    `阶段要求: ${stage.prompt}`,
  ].filter(Boolean).join('\n')
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
${contract}

盘面：本阶段已落地 ${doneCount}/${slice.tasks.length} 份成果。已完成的不要再读 JSON、不要再派工人、不要重解析源文件，也不要再展开写作合同或 [skill:…] 全文。

未递交 / 未完成（只处理这些）：
${pendingBlock}

阶段要求只约束上列未完成项，不得据此重跑整阶段。对上面每一条：有 childSessionId 且成果未落地 → 续跑该工人让它写回 markdownPath；没有 session 或续不上 → 按阶段要求重新下派这一条。工人正常完工回推照常处理。用户改正式文件直接改 Official Outputs，不要复活已完工工人。
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
  if (usesTenderControlProfile(project.module)) {
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
  const existingBoard = inspectBoard(cwd, project)

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
    const policy = usesTenderControlProfile(project.module) ? evidencePolicy(cwd, project.projectId) : null
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
    : previous.filter((task) => !task.sourcePath).map(inspectTask)

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
  if (usesTenderControlProfile(project.module)) assessEvidence(cwd, project.projectId)
  syncProjectOutputs(cwd, project.projectId, project.module, stageId)
  let extra = ''
  if (usesTenderControlProfile(project.module) && stageId === 'boq-five-step-pricing') {
    seedEnterpriseProductivityMemo(cwd, project.projectId)
    extra = enterpriseProductivityDraftNote(cwd, project.projectId)
  }
  return {
    state: { schemaVersion: 1, projectId: project.projectId, module: project.module, ...slice },
    draft: withUserRequirementContext(cwd, project, stageId, draftForSlice(project, stage, slice, extra)),
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
  if (usesTenderControlProfile(project.module)) {
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
  commitStageHandoff(cwd, project, setupStageId, slice)
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
  const board = inspectBoard(cwd, project)
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
  const board = inspectBoard(cwd, project)
  const stageIndex = workflow.stages.findIndex((item) => item.id === stageId)
  const unfinishedPrior = workflow.stages
    .slice(0, Math.max(0, stageIndex))
    .find((item) => board.stages[item.id]?.status !== 'done')
  if (unfinishedPrior) {
    throw new Error(`请先完成前序阶段「${unfinishedPrior.labelZh}」（${unfinishedPrior.id}）。`)
  }
  const activeRequirements = activeUserRequirements(cwd, project, stageId)
  if (activeRequirements.length > 0) {
    throw new Error(`用户最新要求尚未落实：${activeRequirements.slice(0, 3).map((item) => item.text).join('；')}。先按用户要求修改现有成果；不要为旧门禁重复生成。完成后调用 tender_stage satisfy_requirement。`)
  }
  const implementedRequirements = listUserRequirements(cwd, project, stageId)
    .filter((item) => item.status === 'implemented')
  if (implementedRequirements.length > 0) {
    throw new Error(`用户最新要求已落实但尚待用户验收：${implementedRequirements.slice(0, 3).map((item) => item.text).join('；')}。请在工作台选择「采用为验收口径」「继续修改」或「不属于本项目」，不得按旧门禁自动收阶段。`)
  }
  const userOverride = acceptedUserRequirementOverride(cwd, project, stageId)
  const previous = board.stages[stageId] ? inspectSlice(board.stages[stageId]) : undefined
  const pending = (previous?.tasks ?? []).filter((task) => task.status !== 'done')
  if (pending.length > 0) {
    const sample = pending.slice(0, 3).map((task) => `${task.id}(${task.status})`).join(', ')
    throw new Error(`还有 ${pending.length} 个任务未完成：${sample}。请先交付这些任务，或先 reset 该阶段。`)
  }
  if (stage.summaryDeliverable && !userOverride) {
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
  if (usesTenderControlProfile(project.module)) {
    const capabilityGaps = tenderCapabilityGaps(cwd, project.projectId, stageId)
    if (capabilityGaps.length > 0) {
      throw new Error(`阶段能力包未就绪：${capabilityGaps.join('；')}。请先 tender_capability replace/validate，并处理 stale 依赖。`)
    }
  }
  const planningGaps = usesTenderControlProfile(project.module) && !userOverride
    ? planningDeliverableGaps(cwd, project, stageId)
    : []
  if (planningGaps.length > 0) {
    throw new Error(`施工策划阶段缺硬性交付：${planningGaps.join('、')}（应位于 Agent Pi Outputs/${project.projectId}/${officialStageFolder(stageId)}/）。`)
  }
  if (analysisSuiteApplies(stageId)) {
    const analysisDir = officialStageDir(cwd, project.projectId, stageId)
    const suite = assessAnalysisSuite(analysisDir)
    if (!userOverride && !suite.ok) throw new Error(analysisSuiteRejectReason(suite))
    const inventory = assessBoqInventoryGate(cwd, project.projectId, analysisDir)
    if (!inventory.ready) throw new Error(boqInventoryRejectReason(inventory))
    // PageIndex is a navigation aid. Its unread-node ledger remains visible in
    // status, but per-source task completion, the structured bottom paper and
    // BOQ source/cell traceability are the actual completion gates.
  }
  const workbookGap = pricingWorkbookMissing(cwd, project.projectId, stageId)
  if (workbookGap && !userOverride) throw new Error(workbookGap)
  if (pricingLocalIntelApplies(stageId) && !userOverride) {
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
  commitStageHandoff(cwd, project, stageId, slice)
  const nextBoard = putSlice(cwd, project, slice)
  completeStageExecutions(cwd, project, stageId)
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
  const board = inspectBoard(cwd, project)
  const stageIndex = workflow.stages.findIndex((item) => item.id === stageId)
  const unfinishedPrior = workflow.stages
    .slice(0, Math.max(0, stageIndex))
    .find((item) => board.stages[item.id]?.status !== 'done')
  if (unfinishedPrior) {
    throw new Error(`请先完成前序阶段「${unfinishedPrior.labelZh}」（${unfinishedPrior.id}）。`)
  }
  const activeRequirements = activeUserRequirements(cwd, project, stageId)
  if (activeRequirements.length > 0) {
    throw new Error(`用户最新要求尚未落实，不能提交人工决策：${activeRequirements.slice(0, 3).map((item) => item.text).join('；')}`)
  }
  const implementedRequirements = listUserRequirements(cwd, project, stageId)
    .filter((item) => item.status === 'implemented')
  if (implementedRequirements.length > 0) {
    throw new Error(`用户最新要求已落实但尚待用户验收，不能提交人工决策：${implementedRequirements.slice(0, 3).map((item) => item.text).join('；')}`)
  }
  const userOverride = acceptedUserRequirementOverride(cwd, project, stageId)
  const previous = board.stages[stageId] ? inspectSlice(board.stages[stageId]) : undefined
  const pending = (previous?.tasks ?? []).filter((task) => task.status !== 'done')
  if (pending.length > 0) {
    throw new Error(`阶段仍有 ${pending.length} 个任务未完成，不能提交人工决策。`)
  }
  if (stage.summaryDeliverable && !userOverride) {
    const summaryPath = join(officialStageDir(cwd, project.projectId, stageId), stage.summaryDeliverable.fileName)
    if (!existsSync(summaryPath) || !deliverableReady(summaryPath)) {
      throw new Error(`请先完成《${stage.summaryDeliverable.fileName}》再提交人工决策。`)
    }
  }
  if (usesTenderControlProfile(project.module)) {
    const capabilityGaps = tenderCapabilityGaps(cwd, project.projectId, stageId)
    if (capabilityGaps.length > 0) {
      throw new Error(`人工决策前能力包未就绪：${capabilityGaps.join('；')}。`)
    }
    if (stageId === 'submission-compliance-freeze') {
      const fileGaps = submissionFileGaps(cwd, project)
      if (fileGaps.length > 0) {
        throw new Error(`最终冻结前仍有 ${fileGaps.length} 个能力包声明文件不在磁盘或为空：${fileGaps.slice(0, 5).join('；')}。`)
      }
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
  if (approved) {
    commitStageHandoff(cwd, project, stageId, slice)
    completeStageExecutions(cwd, project, stageId)
  }
  else invalidateStageMemory(cwd, project, stageId, note || '用户撤回或拒绝了阶段冻结决策。')
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

/** Release an unconfirmed draft offer so an explicit user retry can run immediately. */
export function releaseDispatchOffer(
  cwd: string,
  project: BusinessProjectRecord,
  stageId: string,
  key: string,
): { state: StageState; board: OrchestrationBoard; released: boolean } {
  const board = loadBoard(cwd, project.projectId, project.module)
  const previous = board.stages[stageId]
  if (!previous) throw new Error(`Stage ${stageId} has no orchestration slice`)
  if (!key || previous.dispatch?.key !== key || previous.dispatch.dispatchedAt) {
    return {
      state: { schemaVersion: 1, projectId: project.projectId, module: project.module, ...previous },
      board,
      released: false,
    }
  }
  const slice: StageSlice = { ...previous, updatedAt: new Date().toISOString() }
  delete slice.dispatch
  const nextBoard = putSlice(cwd, project, slice)
  return {
    state: { schemaVersion: 1, projectId: project.projectId, module: project.module, ...slice },
    board: nextBoard,
    released: true,
  }
}

export function resetOrchestration(
  cwd: string,
  project: BusinessProjectRecord,
  stageId: string,
): { state: StageState; board: OrchestrationBoard } {
  invalidateStageMemory(cwd, project, stageId, '用户重置了阶段编排，原冻结基线不再有效。')
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
  userRequirements: { active: number; implemented: number; accepted: number }
  userRequirementOverride: boolean
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
  const softOverride = reality.userRequirementOverride
  return missing > 0
    || reality.userRequirements.active > 0
    || reality.userRequirements.implemented > 0
    || Boolean(!softOverride && reality.summary && !reality.summary.exists && reality.stageStatus !== 'idle')
    || Boolean(!softOverride && reality.suite && !reality.suite.ok && reality.stageStatus !== 'idle')
    || Boolean(reality.boqInventory && !reality.boqInventory.ok && reality.stageStatus !== 'idle')
    || Boolean(!softOverride && reality.workbook && !reality.workbook.exists && reality.stageStatus !== 'idle')
    || Boolean(!softOverride && reality.localIntel && !reality.localIntel.ready && reality.stageStatus !== 'idle')
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
  if (usesTenderControlProfile(project.module)) {
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
  const requirements = listUserRequirements(cwd, project, stage.id)
  const userRequirements = {
    active: requirements.filter((row) => row.status === 'active').length,
    implemented: requirements.filter((row) => row.status === 'implemented').length,
    accepted: requirements.filter((row) => row.status === 'accepted').length,
  }
  const userRequirementOverride = userRequirements.accepted > 0
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
    userRequirements,
    userRequirementOverride,
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

export type ExecutionAlignment = 'aligned' | 'missing' | 'drifted' | 'stale' | 'waiting-human'

export interface ExecutionControlState {
  generatedAt: string
  execution: SessionExecution | null
  realityDigest: string
  alignment: ExecutionAlignment
  differences: string[]
}

function digestStageReality(reality: StageReality | undefined): string {
  if (!reality) return createHash('sha256').update('no-current-stage').digest('hex').slice(0, 20)
  return createHash('sha256').update(JSON.stringify({
    stageId: reality.stageId,
    stageStatus: reality.stageStatus,
    tasks: reality.tasks,
    artifacts: reality.artifacts,
    summary: reality.summary,
    suite: reality.suite && { ok: reality.suite.ok, shortGaps: reality.suite.shortGaps },
    boqInventory: reality.boqInventory,
    workbook: reality.workbook,
    localIntel: reality.localIntel && { ready: reality.localIntel.ready, waived: reality.localIntel.waived, shortGaps: reality.localIntel.shortGaps },
    citations: reality.citations,
    evidence: reality.evidence,
    userRequirements: reality.userRequirements,
    needsQc: reality.needsQc,
  })).digest('hex').slice(0, 20)
}

export function executionControlState(
  cwd: string,
  project: BusinessProjectRecord,
  sessionId = '',
  knownReality?: ProjectReality,
): ExecutionControlState {
  const reality = knownReality ?? projectReality(cwd, project)
  const board = loadBoard(cwd, project.projectId, project.module)
  const current = reality.stages.find((stage) => stage.stageId === board.currentStageId)
    ?? reality.stages.find((stage) => stage.stageStatus === 'running' || stage.stageStatus === 'blocked')
    ?? reality.stages[0]
  const execution = sessionId
    ? executionForSession(cwd, project, sessionId, current?.stageId)
    : latestExecutionForProject(cwd, project, current?.stageId)
  const realityDigest = digestStageReality(current)
  if (!execution) {
    return {
      generatedAt: new Date().toISOString(),
      execution: null,
      realityDigest,
      alignment: 'missing',
      differences: ['主智能体尚未回写执行计划；控制面板目前只能核验磁盘事实。'],
    }
  }

  const differences: string[] = []
  let alignment: ExecutionAlignment = 'aligned'
  if (current && execution.stageId !== current.stageId) {
    differences.push(`执行账本仍在「${execution.stageId}」，系统当前阶段是「${current.stageId}」。`)
    alignment = 'drifted'
  }
  if (execution.observedRealityDigest && execution.observedRealityDigest !== realityDigest) {
    differences.push('磁盘事实自本轮计划后已变化，需要主智能体读取差异并更新计划。')
    alignment = 'drifted'
  }
  const heartbeatAge = Date.now() - Date.parse(execution.heartbeatAt)
  if (Number.isFinite(heartbeatAge) && heartbeatAge > 10 * 60_000
    && (execution.status === 'planning' || execution.status === 'working' || execution.status === 'waiting')) {
    differences.push(`主智能体执行心跳已超过 ${Math.floor(heartbeatAge / 60_000)} 分钟。`)
    alignment = 'stale'
  }
  const planDone = execution.plan.length > 0 && execution.plan.every((item) => item.status === 'done')
  if (current?.needsQc && (execution.status === 'completed' || planDone)) {
    differences.push('主智能体声明本批已完成，但系统事实门禁仍有缺口。')
    alignment = 'drifted'
  }
  if (current?.stageStatus === 'done' && execution.status !== 'completed') {
    differences.push('系统阶段已经冻结完成，但执行账本尚未收口。')
    alignment = 'drifted'
  }
  if (execution.blocker.type === 'human') {
    differences.push(`等待人工处理：${execution.blocker.reason || execution.blocker.needed || '未说明具体决策。'}`)
    alignment = 'waiting-human'
  }
  return { generatedAt: new Date().toISOString(), execution, realityDigest, alignment, differences }
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
    ? `\n- 阶段总报告：${reality.summary.exists ? `《${reality.summary.fileName}》已就位` : reality.userRequirementOverride ? `旧制式《${reality.summary.fileName}》已由用户验收口径替代` : `缺《${reality.summary.fileName}》—— 收阶段前必须补齐`}`
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
  const requirementBlock = reality.userRequirements.active || reality.userRequirements.implemented || reality.userRequirements.accepted
    ? `\n- 用户要求：${reality.userRequirements.active} 条待落实，${reality.userRequirements.implemented} 条已落实，${reality.userRequirements.accepted} 条已成为验收口径${reality.userRequirementOverride ? '（旧软门禁不再触发返工）' : ''}`
    : ''
  return [
    `盘面对账（服务端已核验，勿重复扫描）：`,
    `- 阶段链：${chain}`,
    `- 本阶段「${reality.stageLabel}」任务：${reality.tasks.done}/${reality.tasks.total} done${reality.tasks.error > 0 ? `，${reality.tasks.error} 个 error` : ''}${unfinishedBlock}${artifactBlock}${summaryBlock}${suiteBlock}${workbookBlock}${intelBlock}`,
    `- 引用核验：共 ${reality.citations.total} 个令牌，${reality.citations.orphans} 个孤儿`,
    `- 本次已同步 ${published} 件客户成果${requirementBlock}${evidenceBlock}${quietBlock}`,
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
  const summaryOutline = !reality.userRequirementOverride && stage.summaryDeliverable && reality.summary && !reality.summary.exists
    ? `\n阶段总报告《${stage.summaryDeliverable.fileName}》大纲（写入 Agent Pi Outputs/${project.projectId}/${reality.outputFolder}/）：\n${stage.summaryDeliverable.outlineZh.map((line) => `- ${line}`).join('\n')}\n`
    : ''
  const suiteOutline = !reality.userRequirementOverride && reality.suite && !reality.suite.ok
    ? `\n投标分析底稿未齐（专题视图按需派生；禁止重扫已完成源文件）：\n${ANALYSIS_SUITE.map((item) => {
      const row = reality.suite!.files.find((file) => file.fileName === item.fileName)
      const mark = !row || !row.exists ? '缺' : !row.ok ? `未达标${row.missingTerms.length ? `（${row.missingTerms.join('、')}）` : ''}` : '已齐'
      return `- 《${item.fileName}》${mark}\n${item.outlineZh.map((line) => `  - ${line}`).join('\n')}`
    }).join('\n')}\n`
    : ''
  const workbookOutline = !reality.userRequirementOverride && reality.workbook && !reality.workbook.exists
    ? `\n公式测算表《${reality.workbook.fileName}》仍缺：调用 tender_pricing_workbook generate，写入 Agent Pi Outputs/${project.projectId}/${reality.outputFolder}/。\n`
    : ''
  const intelOutline = !reality.userRequirementOverride && reality.localIntel && !reality.localIntel.ready
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
2. ${reality.userRequirementOverride ? '用户已采用新验收口径：不要再补旧文件名、篇幅、章节或视图，只核实用户要求的证据路径和不可豁免真实性门禁。' : '阶段总控与分析底稿：若上面显示缺失/过短/缺章，基于已有解析成果补齐，不要重扫源文件；专题视图不再是数量硬门。BOQ 组价阶段还须 tender_pricing_workbook generate 写出《BOQ 组价测算.xlsx》，并补齐当地供应商尽调与询价单。'}
3. 评审纪律稽核：只复核高风险、实质变更和抽样成果，最多 1 轮修订；仍有分歧交用户裁决。
4. 裁决完成后收口：${reality.userRequirementOverride ? '用户要求已成为验收口径，确认清单、能力包、真实 BOQ/来源与引用完整性后' : '清单全部 done、孤儿为 0、阶段总控与分析底稿就位、组价阶段公式测算表及当地尽调就位时'}调用 tender_stage complete_stage（projectId=${project.projectId}, stageId=${stage.id}）；人工决策阶段必须停下等待工作台确认。
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

function buildExecutionAlignmentDraft(
  project: BusinessProjectRecord,
  stage: WorkflowStage,
  control: ExecutionControlState,
): string {
  const execution = control.execution
  if (!execution) return buildStageDraft(project, stage)
  const pendingPlan = execution.plan
    .filter((item) => item.status !== 'done')
    .slice(0, 12)
    .map((item) => `- ${item.id} [${item.status}] ${item.title}`)
    .join('\n') || '- 无未完成计划项'
  const assignments = execution.assignments
    .filter((item) => item.status !== 'done')
    .slice(0, 8)
    .map((item) => `- ${item.id} [${item.status}] ${item.title}${item.expectedOutput ? ` → ${item.expectedOutput}` : ''}`)
    .join('\n') || '- 无运行中的子任务'
  const differences = control.differences.map((item) => `- ${item}`).join('\n') || '- 执行声明与系统事实暂未发现冲突'
  return `【执行账本对齐 — 请在本项目主会话继续】

项目: ${project.name} (${project.projectId})
阶段: ${stage.labelZh} (${stage.id})
执行 run: ${execution.runId} / revision ${execution.revision} / ${execution.status}
目标: ${execution.objective || '未登记'}
当前批次: ${execution.currentBatch || '未登记'}
下一动作: ${execution.nextAction || '未登记'}
系统事实版本: ${control.realityDigest}

未完成计划:
${pendingPlan}

子任务:
${assignments}

执行态与事实态差异:
${differences}

本轮要求:
1. 先调用 tender_stage action=status 读取最新事实版本和用户要求；不要重新扫描已完成成果。
2. 项目总目标、阶段交接稿和磁盘成果是执行依据；上面的执行账本只作可选进度提示。仅处理明确差异，禁止无差别重发整阶段。
3. execution_update 仅在稀疏进度展示确有帮助时更新一次；无需心跳，不得据此自动恢复、重新规划或覆盖阶段边界。
4. 若阻塞需要用户决策，把 blockerType 设为 human 并停止；证据、工具或模型阻塞分别使用 evidence / tool / model。
5. 事实硬门禁全部满足后调用 tender_stage complete_stage；未满足时只补差异。

阶段边界：${stage.prompt}
不要注入完整历史或重发整阶段合同；精确门禁与未完成任务从 tender_stage status 读取。`
}

export function resumeUnfinished(
  cwd: string,
  project: BusinessProjectRecord,
  selectedKnowledgeSlugs: string[] = [],
  options: { sessionId?: string } = {},
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
  const pendingUserRequirements = listUserRequirements(cwd, project)
    .filter((row) => row.status === 'active')
  if (pendingUserRequirements.length > 0) {
    const latest = pendingUserRequirements[0]!
    const target = workflow.stages.find((stage) => stage.id === latest.stageId)
      ?? workflow.stages.find((stage) => stage.id !== setupStageId)
      ?? workflow.stages[0]!
    const stageRequirements = pendingUserRequirements.filter((row) => row.stageId === target.id)
    const previous = board.stages[target.id]
    const slice: StageSlice = {
      stageId: target.id,
      status: 'running',
      tasks: previous?.tasks ?? [],
      updatedAt: new Date().toISOString(),
      forcePassedAt: previous?.forcePassedAt,
      approval: previous?.approval,
      dispatch: previous?.dispatch,
    }
    const key = dispatchFingerprint(slice, `user-requirements:${requirementDigest(stageRequirements)}`)
    const record = slice.dispatch
    if (record && record.key === key) {
      const offeredRecently = Date.parse(record.offeredAt) > Date.now() - DISPATCH_OFFER_TTL_MS
      if (record.dispatchedAt || offeredRecently) {
        return {
          state: { schemaVersion: 1, projectId: project.projectId, module: project.module, ...slice },
          board,
          stageId: target.id,
          alreadyDispatched: true,
          message: `用户最新要求已写入主对话，等待定点修改；不要按旧门禁重复生成。`,
        }
      }
    }
    slice.dispatch = { key, offeredAt: new Date().toISOString() }
    const nextBoard = putSlice(cwd, project, slice)
    return {
      state: { schemaVersion: 1, projectId: project.projectId, module: project.module, ...slice },
      draft: buildUserRequirementDraft(cwd, project, target, stageRequirements),
      board: nextBoard,
      stageId: target.id,
      dispatch: { stageId: target.id, key },
      message: `已把 ${stageRequirements.length} 条用户最新要求作为最高优先级送回主对话；只做受影响成果的增量修改。`,
    }
  }
  const implementedUserRequirements = listUserRequirements(cwd, project)
    .filter((row) => row.status === 'implemented' && board.stages[row.stageId]?.status !== 'done')
  if (implementedUserRequirements.length > 0) {
    const latest = implementedUserRequirements[0]!
    const stage = workflow.stages.find((item) => item.id === latest.stageId)
    const message = `「${stage?.labelZh ?? latest.stageId}」的用户要求已落实，等待用户在工作台选择「采用为验收口径」「继续修改」或「不属于本项目」；不得按旧门禁自动重发整阶段。`
    return {
      board,
      stageId: latest.stageId,
      blocked: message,
      message,
    }
  }
  const acceptedUserRequirements = listUserRequirements(cwd, project)
    .filter((row) => row.status === 'accepted' && board.stages[row.stageId]?.status !== 'done')
  if (acceptedUserRequirements.length > 0) {
    const latest = acceptedUserRequirements[0]!
    const target = workflow.stages.find((stage) => stage.id === latest.stageId)
    if (target) {
      const stageRequirements = acceptedUserRequirements.filter((row) => row.stageId === target.id)
      const previous = board.stages[target.id]
      const slice: StageSlice = {
        stageId: target.id,
        status: previous?.status ?? 'running',
        tasks: previous?.tasks ?? [],
        updatedAt: new Date().toISOString(),
        forcePassedAt: previous?.forcePassedAt,
        approval: previous?.approval,
        dispatch: previous?.dispatch,
      }
      const key = dispatchFingerprint(slice, `accepted-requirements:${requirementDigest(stageRequirements)}`)
      const record = slice.dispatch
      if (record && record.key === key) {
        const offeredRecently = Date.parse(record.offeredAt) > Date.now() - DISPATCH_OFFER_TTL_MS
        if (record.dispatchedAt || offeredRecently) {
          return {
            state: { schemaVersion: 1, projectId: project.projectId, module: project.module, ...slice },
            board,
            stageId: target.id,
            alreadyDispatched: true,
            message: '用户验收口径的硬门禁收口已写入主对话；等待状态变化，不重发整阶段。',
          }
        }
      }
      slice.dispatch = { key, offeredAt: new Date().toISOString() }
      const nextBoard = putSlice(cwd, project, slice)
      return {
        state: { schemaVersion: 1, projectId: project.projectId, module: project.module, ...slice },
        draft: buildAcceptedRequirementCloseoutDraft(cwd, project, target, stageRequirements),
        board: nextBoard,
        stageId: target.id,
        dispatch: { stageId: target.id, key },
        message: '已按用户验收口径准备一次硬门禁收口；不会恢复旧软门禁或重发整阶段。',
      }
    }
  }
  const target = workflow.stages.find((stage) => {
    if (stage.id === setupStageId) return false
    const slice = board.stages[stage.id]
    if (!slice) return true
    if ((analysisSuiteApplies(stage.id) || boqInventoryApplies(stage.id)) && !analysisHardGatesReady(cwd, project, stage.id)) return true
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
  const observedControl = options.sessionId
    ? executionControlState(cwd, project, options.sessionId)
    : null
  // A session may carry telemetry from the stage it just completed. Never let
  // that old objective, plan or blocker govern the next stage.
  const control = observedControl?.execution?.stageId === target.id
    ? observedControl
    : null
  if (control?.execution?.blocker.type === 'human') {
    const message = `主智能体执行账本正在等待人工处理：${control.execution.blocker.reason || control.execution.blocker.needed || '未说明具体决策。'}`
    return { board, stageId: target.id, blocked: message, message }
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
  // Execution telemetry changes frequently and must not create a fresh stage
  // dispatch. Only disk reality / gate changes may change the fingerprint.
  const key = dispatchFingerprint(slice, extraKey)
  const stageDraft = patchSuiteOnly && suite
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
                ? `${prepared.draft}\n\n${renderPricingIntelBlock(intelGate.intel, officialStageFolder(target.id))}`
                : prepared.draft
  const draft = stageDraft
  const contextualDraft = withUserRequirementContext(cwd, project, target.id, draft)
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
    draft: contextualDraft,
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
