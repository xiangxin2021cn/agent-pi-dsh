import { createHash } from 'node:crypto'
import { join } from 'node:path'
import type { BusinessProjectRecord } from '../../../packages/business-projects/index.ts'
import { projectDir, readJson, writeJson } from './fsutil.ts'

export type ExecutionStatus = 'planning' | 'working' | 'waiting' | 'blocked' | 'completed' | 'failed'
export type ExecutionPlanStatus = 'pending' | 'in_progress' | 'done' | 'blocked'
export type ExecutionAssignmentStatus = 'queued' | 'running' | 'done' | 'failed'
export type ExecutionBlockerType = 'none' | 'human' | 'evidence' | 'tool' | 'model'

export interface ExecutionPlanItem {
  id: string
  title: string
  status: ExecutionPlanStatus
  artifactPaths?: string[]
}

export interface ExecutionAssignment {
  id: string
  title: string
  status: ExecutionAssignmentStatus
  childSessionId?: string
  expectedOutput?: string
}

export interface ExecutionBlocker {
  type: ExecutionBlockerType
  reason?: string
  needed?: string
}

export interface SessionExecution {
  sessionId: string
  runId: string
  projectId: string
  module: string
  stageId: string
  revision: number
  status: ExecutionStatus
  objective: string
  currentBatch: string
  plan: ExecutionPlanItem[]
  assignments: ExecutionAssignment[]
  blocker: ExecutionBlocker
  nextAction: string
  summary?: string
  observedRealityDigest?: string
  contentDigest: string
  createdAt: string
  updatedAt: string
  heartbeatAt: string
}

export interface ExecutionLedger {
  schemaVersion: 1
  projectId: string
  module: string
  sessions: Record<string, SessionExecution>
  updatedAt: string
}

export interface ExecutionUpdateInput {
  sessionId: string
  runId?: string
  stageId: string
  status?: string
  objective?: string
  currentBatch?: string
  planItems?: unknown[]
  assignments?: unknown[]
  blockerType?: string
  blockerReason?: string
  blockerNeeded?: string
  nextAction?: string
  summary?: string
  observedRealityDigest?: string
}

const EXECUTION_STATUSES = new Set<ExecutionStatus>(['planning', 'working', 'waiting', 'blocked', 'completed', 'failed'])
const PLAN_STATUSES = new Set<ExecutionPlanStatus>(['pending', 'in_progress', 'done', 'blocked'])
const ASSIGNMENT_STATUSES = new Set<ExecutionAssignmentStatus>(['queued', 'running', 'done', 'failed'])
const BLOCKER_TYPES = new Set<ExecutionBlockerType>(['none', 'human', 'evidence', 'tool', 'model'])

function ledgerPath(cwd: string, project: Pick<BusinessProjectRecord, 'module' | 'projectId'>): string {
  return join(projectDir(cwd, project.module, project.projectId), 'orchestration', 'execution-ledger.json')
}

function textOf(value: unknown, max = 2_000): string {
  return String(value ?? '').replace(/\r\n/g, '\n').trim().slice(0, max)
}

function stringList(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) return undefined
  const rows = value.map((item) => textOf(item, 1_000)).filter(Boolean).slice(0, 40)
  return rows.length ? rows : undefined
}

function recordOf(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' ? value as Record<string, unknown> : {}
}

function normalizePlan(value: unknown): ExecutionPlanItem[] {
  if (!Array.isArray(value)) return []
  return value.slice(0, 40).flatMap((item, index) => {
    const row = recordOf(item)
    const title = textOf(row.title ?? row.text, 1_000)
    if (!title) return []
    const rawStatus = textOf(row.status, 40) as ExecutionPlanStatus
    return [{
      id: textOf(row.id, 120) || `plan-${index + 1}`,
      title,
      status: PLAN_STATUSES.has(rawStatus) ? rawStatus : 'pending',
      artifactPaths: stringList(row.artifactPaths),
    }]
  })
}

function normalizeAssignments(value: unknown): ExecutionAssignment[] {
  if (!Array.isArray(value)) return []
  return value.slice(0, 24).flatMap((item, index) => {
    const row = recordOf(item)
    const title = textOf(row.title ?? row.task, 1_000)
    if (!title) return []
    const rawStatus = textOf(row.status, 40) as ExecutionAssignmentStatus
    return [{
      id: textOf(row.id, 120) || `assignment-${index + 1}`,
      title,
      status: ASSIGNMENT_STATUSES.has(rawStatus) ? rawStatus : 'queued',
      childSessionId: textOf(row.childSessionId, 200) || undefined,
      expectedOutput: textOf(row.expectedOutput, 1_000) || undefined,
    }]
  })
}

function digestOf(value: unknown): string {
  return createHash('sha256').update(JSON.stringify(value)).digest('hex').slice(0, 20)
}

function emptyLedger(project: Pick<BusinessProjectRecord, 'module' | 'projectId'>): ExecutionLedger {
  return {
    schemaVersion: 1,
    projectId: project.projectId,
    module: project.module,
    sessions: {},
    updatedAt: new Date().toISOString(),
  }
}

export function loadExecutionLedger(
  cwd: string,
  project: Pick<BusinessProjectRecord, 'module' | 'projectId'>,
): ExecutionLedger {
  const fallback = emptyLedger(project)
  const raw = readJson<Partial<ExecutionLedger>>(ledgerPath(cwd, project), fallback)
  return {
    schemaVersion: 1,
    projectId: project.projectId,
    module: project.module,
    sessions: raw.sessions && typeof raw.sessions === 'object' ? raw.sessions : {},
    updatedAt: textOf(raw.updatedAt, 100) || fallback.updatedAt,
  }
}

function saveExecutionLedger(cwd: string, project: BusinessProjectRecord, ledger: ExecutionLedger): void {
  ledger.updatedAt = new Date().toISOString()
  writeJson(ledgerPath(cwd, project), ledger)
}

export function executionForSession(
  cwd: string,
  project: Pick<BusinessProjectRecord, 'module' | 'projectId'>,
  sessionId: string,
  stageId?: string,
): SessionExecution | null {
  const row = loadExecutionLedger(cwd, project).sessions[textOf(sessionId, 300)] ?? null
  return row && (!stageId || row.stageId === stageId) ? row : null
}

export function latestExecutionForProject(
  cwd: string,
  project: Pick<BusinessProjectRecord, 'module' | 'projectId'>,
  stageId?: string,
): SessionExecution | null {
  return Object.values(loadExecutionLedger(cwd, project).sessions)
    .filter((row) => !stageId || row.stageId === stageId)
    .sort((left, right) => Date.parse(right.heartbeatAt) - Date.parse(left.heartbeatAt))[0] ?? null
}

export function updateSessionExecution(
  cwd: string,
  project: BusinessProjectRecord,
  input: ExecutionUpdateInput,
): SessionExecution {
  const sessionId = textOf(input.sessionId, 300)
  const stageId = textOf(input.stageId, 160)
  if (!sessionId) throw new Error('执行账本需要明确的主会话。')
  if (!stageId) throw new Error('执行账本需要明确的项目阶段。')

  const ledger = loadExecutionLedger(cwd, project)
  const previous = ledger.sessions[sessionId]
  const previousInStage = previous?.stageId === stageId ? previous : undefined
  const now = new Date().toISOString()
  const rawStatus = textOf(input.status, 40) as ExecutionStatus
  const rawBlockerType = textOf(input.blockerType, 40) as ExecutionBlockerType
  const content = {
    runId: textOf(input.runId, 200) || previousInStage?.runId || `run-${digestOf(`${sessionId}\n${stageId}\n${now}`)}`,
    stageId,
    status: EXECUTION_STATUSES.has(rawStatus) ? rawStatus : (previousInStage?.status ?? 'working'),
    objective: textOf(input.objective, 2_000) || previousInStage?.objective || '',
    currentBatch: textOf(input.currentBatch, 1_000) || previousInStage?.currentBatch || '',
    plan: input.planItems === undefined ? (previousInStage?.plan ?? []) : normalizePlan(input.planItems),
    assignments: input.assignments === undefined ? (previousInStage?.assignments ?? []) : normalizeAssignments(input.assignments),
    blocker: {
      type: BLOCKER_TYPES.has(rawBlockerType) ? rawBlockerType : (previousInStage?.blocker.type ?? 'none'),
      reason: input.blockerReason === undefined ? previousInStage?.blocker.reason : (textOf(input.blockerReason, 2_000) || undefined),
      needed: input.blockerNeeded === undefined ? previousInStage?.blocker.needed : (textOf(input.blockerNeeded, 2_000) || undefined),
    },
    nextAction: input.nextAction === undefined ? (previousInStage?.nextAction ?? '') : textOf(input.nextAction, 2_000),
    summary: input.summary === undefined ? previousInStage?.summary : (textOf(input.summary, 3_000) || undefined),
    observedRealityDigest: input.observedRealityDigest === undefined
      ? previousInStage?.observedRealityDigest
      : (textOf(input.observedRealityDigest, 200) || undefined),
  }
  if (content.status === 'blocked' && content.blocker.type === 'none') content.blocker.type = 'model'
  const contentDigest = digestOf(content)
  const row: SessionExecution = {
    sessionId,
    projectId: project.projectId,
    module: project.module,
    ...content,
    revision: previousInStage ? previousInStage.revision + (previousInStage.contentDigest === contentDigest ? 0 : 1) : 1,
    contentDigest,
    createdAt: previousInStage?.createdAt || now,
    updatedAt: previousInStage?.contentDigest === contentDigest ? (previousInStage.updatedAt || now) : now,
    heartbeatAt: now,
  }
  ledger.sessions[sessionId] = row
  saveExecutionLedger(cwd, project, ledger)
  return row
}

export function completeStageExecutions(
  cwd: string,
  project: BusinessProjectRecord,
  stageId: string,
): void {
  const ledger = loadExecutionLedger(cwd, project)
  const now = new Date().toISOString()
  let changed = false
  for (const row of Object.values(ledger.sessions)) {
    if (row.stageId !== stageId || row.status === 'completed') continue
    row.status = 'completed'
    row.blocker = { type: 'none' }
    row.nextAction = '阶段已完成，等待下一阶段启动。'
    row.summary = row.summary || '系统已确认本阶段完成。'
    row.revision += 1
    row.contentDigest = digestOf({
      runId: row.runId,
      stageId: row.stageId,
      status: row.status,
      objective: row.objective,
      currentBatch: row.currentBatch,
      plan: row.plan,
      assignments: row.assignments,
      blocker: row.blocker,
      nextAction: row.nextAction,
      summary: row.summary,
      observedRealityDigest: row.observedRealityDigest,
    })
    row.updatedAt = now
    row.heartbeatAt = now
    changed = true
  }
  if (changed) saveExecutionLedger(cwd, project, ledger)
}

export function renderExecutionContext(row: SessionExecution | null): string {
  if (!row) return ''
  const plan = row.plan.slice(0, 12).map((item) => `${item.id}:${item.status}:${item.title}`).join('；') || '未登记'
  const assignments = row.assignments.slice(0, 8).map((item) => `${item.id}:${item.status}:${item.title}`).join('；') || '无'
  const blocker = row.blocker.type === 'none'
    ? '无'
    : `${row.blocker.type}:${row.blocker.reason || '未说明'}${row.blocker.needed ? `；需要：${row.blocker.needed}` : ''}`
  return [
    '【Agent Pi 主智能体执行账本 — 由本会话回写】',
    `run=${row.runId} revision=${row.revision} stage=${row.stageId} status=${row.status}`,
    `目标：${row.objective || '未登记'}`,
    `当前批次：${row.currentBatch || '未登记'}`,
    `计划：${plan}`,
    `子任务：${assignments}`,
    `阻塞：${blocker}`,
    `下一动作：${row.nextAction || '未登记'}`,
    `最近更新：${row.heartbeatAt}`,
    '本账本仅用于可选的稀疏进度展示，不是第二规划器，也不会触发自动恢复。阶段交接稿、项目总目标与磁盘成果是执行依据；无需心跳，不要重扫已完成成果。',
  ].join('\n')
}
