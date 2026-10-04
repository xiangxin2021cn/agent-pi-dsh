import { createHash } from 'node:crypto'
import { existsSync, readFileSync, renameSync, statSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import type { BusinessProjectRecord } from '../../../packages/business-projects/index.ts'
import { CAPABILITY_FILE_NAMES, ensureDir, projectDir, readJson } from './fsutil.ts'
import { workflowFor, usesTenderControlProfile } from './modules.ts'
import { buildRecoveryDraft, dispatchFingerprint, inspectBoard, loadBoard, markDispatched, projectForBoundSession, stageAvailability, stageCapabilityIds } from './orchestration.ts'
import { officialStageDir } from './outputs.ts'
import { assertTaskSyncComplete, listUserRequirements } from './user-requirements.ts'
import { workspacePaths } from './workspace.ts'

export interface LongTaskLimits { maxRounds: number; maxTokens: number; maxElapsedMs: number; maxNoProgress: number; maxCostUsd?: number }
export interface LongTaskUsage { rounds: number; tokens: number; elapsedMs: number; knownCostUsd: number; unknownTokens: boolean; unknownCost: boolean }
export interface LongTaskAttempt {
  id: string; sessionId: string; stageId: string; key: string; inputFingerprint: string; realityDigest: string; draft: string
  status: 'prepared' | 'dispatching' | 'dispatched' | 'settled' | 'stale'; messageId?: string; createdAt: string; settledAt?: string
  externalEffectsUnknown?: boolean
  pendingToolCalls?: string[]
  children: Record<string, { expectedPaths: string[]; settledAt?: string; fromSeq?: number }>
}
export interface LongTaskSubmission {
  id: string; attemptId: string; childSessionId: string; status: 'received' | 'stale' | 'rejected'
  artifacts: Array<{ path: string; sha256: string }>; reason?: string; receivedAt: string
}
export interface LongTaskRun {
  sessionId: string; stageId: string; paused: boolean; createdAt: string; limits: LongTaskLimits; usage: LongTaskUsage
  fromSeq?: number
  noProgress: number; currentAttemptId: string; attempts: LongTaskAttempt[]; submissions: LongTaskSubmission[]; usageReceipts: string[]
}
interface LongTaskLedger { schemaVersion: 1; projectId: string; module: string; runs: Record<string, LongTaskRun> }
export type LongTaskPhase = 'ready' | 'waiting' | 'paused' | 'needs_review' | 'blocked' | 'done' | 'inactive'
export interface LongTaskStatus { phase: LongTaskPhase; reason: string; run?: LongTaskRun; attempt?: LongTaskAttempt; draft?: string; cost: number | 'unknown' }

const DEFAULT_LIMITS: LongTaskLimits = { maxRounds: 64, maxTokens: 500_000, maxElapsedMs: 7_200_000, maxNoProgress: 3 }
const hash = (value: unknown) => createHash('sha256').update(typeof value === 'string' ? value : JSON.stringify(value)).digest('hex')
const pathOf = (cwd: string, project: BusinessProjectRecord) => join(projectDir(cwd, project.module, project.projectId), 'orchestration', 'long-task-runtime.json')
const load = (cwd: string, project: BusinessProjectRecord): LongTaskLedger => readJson(pathOf(cwd, project), { schemaVersion: 1, projectId: project.projectId, module: project.module, runs: {} })
function save(cwd: string, project: BusinessProjectRecord, ledger: LongTaskLedger) {
  const path = pathOf(cwd, project)
  ensureDir(join(path, '..'))
  const temporary = `${path}.${process.pid}.tmp`
  writeFileSync(temporary, JSON.stringify(ledger, null, 2) + '\n')
  renameSync(temporary, path)
}
function assertBound(cwd: string, project: BusinessProjectRecord, sessionId: string) {
  const bound = projectForBoundSession(cwd, sessionId)
  if (!bound || bound.projectId !== project.projectId || bound.module !== project.module) throw new Error('长期执行只能由本项目绑定的主会话控制。')
}
function fileHash(path: string): string | null {
  if (!existsSync(path) || !statSync(path).isFile() || !statSync(path).size) return null
  return createHash('sha256').update(readFileSync(path)).digest('hex')
}
function artifactPaths(cwd: string, project: BusinessProjectRecord, stageId: string) {
  const slice = loadBoard(cwd, project.projectId, project.module).stages[stageId]
  const stage = workflowFor(project).stages.find(row => row.id === stageId)
  const paths = slice?.tasks.flatMap(task => [task.markdownPath, task.reportPath].filter(Boolean) as string[]) || []
  if (stage?.summaryDeliverable) paths.push(join(officialStageDir(cwd, project.projectId, stageId), stage.summaryDeliverable.fileName))
  if (usesTenderControlProfile(project)) {
    const workspace = workspacePaths(cwd, project.projectId)
    paths.push(...stageCapabilityIds(project, stageId).map(capability => join(workspace.packs, `${CAPABILITY_FILE_NAMES[capability]}.json`)))
  }
  return [...new Set(paths.map(path => resolve(cwd, path)))].sort()
}
/** Inputs are separate from outcomes: writing a report does not make an old child result current. */
export function longTaskInputFingerprint(cwd: string, project: BusinessProjectRecord, stageId: string) {
  const workflow = workflowFor(project)
  const prior = workflow.stages.slice(0, workflow.stages.findIndex(row => row.id === stageId))
  const inputs = project.inputPaths.map(path => resolve(cwd, path))
  for (const path of inputs) {
    if (existsSync(path) && statSync(path).isDirectory()) throw new Error(`长期执行的登记输入不能是目录，请先展开为具体来源文件：${path}`)
  }
  const paths = [...inputs, ...prior.flatMap(stage => artifactPaths(cwd, project, stage.id))]
  const requirements = listUserRequirements(cwd, project).map(row => ({ id: row.id, stageId: row.stageId, text: row.text, status: row.status === 'dismissed' ? 'dismissed' : 'required' }))
  return hash({ stageId, goal: project.projectGoal, outputs: project.terminalDeliverables, workflow: project.workflowSnapshot, requirements, files: [...new Set(paths)].sort().map(path => [path, fileHash(path)]) })
}
function realityDigest(cwd: string, project: BusinessProjectRecord, stageId: string) {
  return hash(artifactPaths(cwd, project, stageId).map(path => {
    const fingerprint = fileHash(path)
    if (!fingerprint || !path.endsWith('.json')) return [path, fingerprint]
    try {
      const value = JSON.parse(readFileSync(path, 'utf8'))
      // Envelope revision/time churn does not add professional facts or resolve a blocker.
      return [path, value.data === undefined ? fingerprint : hash(value.data)]
    } catch { return [path, fingerprint] }
  }))
}
function current(run: LongTaskRun) { return run.attempts.find(row => row.id === run.currentAttemptId)! }
function budgetReason(run: LongTaskRun): string | undefined {
  const { usage, limits } = run
  if (usage.rounds >= limits.maxRounds) return '父子任务总轮次预算已用尽。'
  if (usage.tokens >= limits.maxTokens || usage.unknownTokens) return usage.unknownTokens ? '存在未确定的实际 token 用量，需核对后才能继续派工。' : '父子任务总 token 预算已用尽。'
  if (usage.elapsedMs >= limits.maxElapsedMs) return '父子任务累计执行时间预算已用尽。'
  if (limits.maxCostUsd !== undefined && (usage.unknownCost || usage.knownCostUsd >= limits.maxCostUsd)) return usage.unknownCost ? '费用未知，无法确认金额预算仍有余额。' : '父子任务总费用预算已用尽。'
  if (run.noProgress >= limits.maxNoProgress) return '连续执行未增加实际成果；停止续派，请调整策略或处理阻塞。'
}
function result(run: LongTaskRun | undefined, phase: LongTaskPhase, reason: string): LongTaskStatus {
  return { run, attempt: run && current(run), phase, reason, cost: !run || run.usage.unknownCost ? 'unknown' : run.usage.knownCostUsd }
}
export function listLongTasks(cwd: string, project: BusinessProjectRecord): LongTaskRun[] { return Object.values(load(cwd, project).runs) }
export function longTaskStatus(cwd: string, project: BusinessProjectRecord, sessionId: string): LongTaskStatus {
  const run = load(cwd, project).runs[sessionId]
  if (!run) return result(undefined, 'inactive', '本会话没有显式派发的长期执行尝试。')
  if (run.paused) return result(run, 'paused', '用户暂停保持有效。')
  const reason = budgetReason(run)
  if (reason) return result(run, 'blocked', reason)
  return result(run, current(run).status === 'prepared' ? 'ready' : 'waiting', '等待宿主核对当前尝试与磁盘成果。')
}
function makeAttempt(cwd: string, project: BusinessProjectRecord, run: LongTaskRun, key: string, draft: string): LongTaskAttempt {
  const inputFingerprint = longTaskInputFingerprint(cwd, project, run.stageId)
  return { id: `attempt-${hash([run.sessionId, run.stageId, inputFingerprint, key, run.attempts.length]).slice(0, 24)}`, sessionId: run.sessionId, stageId: run.stageId, key, inputFingerprint, realityDigest: realityDigest(cwd, project, run.stageId), draft, status: 'prepared', createdAt: new Date().toISOString(), children: {} }
}
/** Host calls this only for an explicit user stage dispatch. It does not authorize a later stage. */
export function startLongTask(cwd: string, project: BusinessProjectRecord, input: { sessionId: string; stageId: string; key: string; draft: string; limits?: Partial<LongTaskLimits>; fromSeq?: number }): LongTaskStatus {
  assertBound(cwd, project, input.sessionId)
  assertTaskSyncComplete(cwd, project)
  const board = loadBoard(cwd, project.projectId, project.module)
  const slice = board.stages[input.stageId]
  if (board.currentStageId !== input.stageId || !slice) throw new Error('长期尝试必须绑定当前已明确派发的阶段。')
  const ledger = load(cwd, project)
  let run = ledger.runs[input.sessionId]
  const existing = run && run.stageId === input.stageId ? current(run) : undefined
  const sameAttempt = existing && existing.key === input.key && existing.inputFingerprint === longTaskInputFingerprint(cwd, project, input.stageId) && existing.realityDigest === realityDigest(cwd, project, input.stageId)
  if (!sameAttempt && slice.dispatch?.key !== input.key && dispatchFingerprint(slice) !== input.key) throw new Error('派发指纹已变化，请重新查看当前阶段。')
  const availability = stageAvailability(cwd, project, board)[input.stageId]
  if (!availability?.canPrepare || availability.waitingHuman) throw new Error(availability?.reason || '本阶段等待用户决定，不能自动派发。')
  if (input.limits) {
    for (const [key, value] of Object.entries(input.limits)) if (!Number.isFinite(value) || value! <= 0) throw new Error(`无效执行预算：${key}`)
    if (run) { run.limits = { ...run.limits, ...input.limits }; save(cwd, project, ledger) }
  }
  if (run && run.stageId === input.stageId) {
    const previous = current(run)
    if (previous.key === input.key && previous.inputFingerprint === longTaskInputFingerprint(cwd, project, input.stageId) && previous.status !== 'settled' && previous.status !== 'stale') return longTaskStatus(cwd, project, input.sessionId)
    if (previous.status === 'dispatching' || previous.status === 'dispatched' || previous.externalEffectsUnknown || previous.pendingToolCalls?.length) throw new Error('上一尝试尚未核对结算，不得重复执行可能已有副作用的动作。')
  } else if (run) {
    if (current(run).status === 'dispatching' || current(run).status === 'dispatched' || current(run).externalEffectsUnknown || current(run).pendingToolCalls?.length) throw new Error('上一阶段执行结果尚未核对，不能开始另一长期尝试。')
    run.stageId = input.stageId; run.noProgress = 0
  } else {
    run = { sessionId: input.sessionId, stageId: input.stageId, paused: false, createdAt: new Date().toISOString(), ...(input.fromSeq === undefined ? {} : { fromSeq: input.fromSeq }), limits: { ...DEFAULT_LIMITS }, usage: { rounds: 0, tokens: 0, elapsedMs: 0, knownCostUsd: 0, unknownTokens: false, unknownCost: false }, noProgress: 0, currentAttemptId: '', attempts: [], submissions: [], usageReceipts: [] }
    ledger.runs[input.sessionId] = run
  }
  if (input.limits) {
    run.limits = { ...run.limits, ...input.limits }
  }
  const reason = budgetReason(run)
  if (reason) return result(run, 'blocked', reason)
  const attempt = makeAttempt(cwd, project, run, input.key, input.draft)
  run.attempts.push(attempt); run.currentAttemptId = attempt.id
  save(cwd, project, ledger)
  return { ...result(run, run.paused ? 'paused' : 'ready', '当前阶段的尝试已持久化。'), ...(run.paused ? {} : { draft: attempt.draft }) }
}
export function pauseLongTask(cwd: string, project: BusinessProjectRecord, sessionId: string, paused = true): LongTaskStatus {
  assertBound(cwd, project, sessionId)
  const ledger = load(cwd, project), run = ledger.runs[sessionId]
  if (!run) return result(undefined, 'inactive', '本会话没有长期执行尝试。')
  run.paused = paused; save(cwd, project, ledger)
  return longTaskStatus(cwd, project, sessionId)
}
function findAttempt(ledger: LongTaskLedger, sessionId: string, attemptId: string) {
  const run = ledger.runs[sessionId], attempt = run?.attempts.find(row => row.id === attemptId)
  if (!run || !attempt || run.currentAttemptId !== attemptId) throw new Error('尝试已过期或不属于当前主会话。')
  return { run, attempt }
}
export function markLongTaskDispatched(cwd: string, project: BusinessProjectRecord, input: { sessionId: string; attemptId: string; key: string; messageId: string }) {
  assertBound(cwd, project, input.sessionId)
  const ledger = load(cwd, project), { run, attempt } = findAttempt(ledger, input.sessionId, input.attemptId)
  if (input.key !== attempt.key || !input.messageId || attempt.inputFingerprint !== longTaskInputFingerprint(cwd, project, attempt.stageId)) throw new Error('派发收据的阶段、会话或输入版本不匹配。')
  if (attempt.messageId && attempt.messageId !== input.messageId) throw new Error('同一尝试已经写入另一消息，拒绝重复派发。')
  if (attempt.status === 'settled') return attempt
  if (attempt.status !== 'prepared' && attempt.status !== 'dispatching' && attempt.status !== 'dispatched') throw new Error('过期尝试不能派发。')
  attempt.messageId = input.messageId; attempt.status = 'dispatched'
  save(cwd, project, ledger)
  markDispatched(cwd, project, attempt.stageId, attempt.key)
  return attempt
}
export function markLongTaskDispatchIntent(cwd: string, project: BusinessProjectRecord, input: { sessionId: string; attemptId: string; key: string; messageId: string }) {
  assertBound(cwd, project, input.sessionId)
  const ledger = load(cwd, project), { run, attempt } = findAttempt(ledger, input.sessionId, input.attemptId)
  if (run.paused || budgetReason(run)) throw new Error('执行已暂停或预算门禁阻止派发。')
  if (input.key !== attempt.key || !input.messageId || attempt.inputFingerprint !== longTaskInputFingerprint(cwd, project, attempt.stageId)) throw new Error('派发意图的会话、阶段或输入版本不匹配。')
  if (attempt.status !== 'prepared') throw new Error('同一尝试已记录派发意图，必须先核对原消息。')
  attempt.messageId = input.messageId; attempt.status = 'dispatching'; save(cwd, project, ledger)
  return attempt
}
/** A real turn/end receipt can settle while paused; it never unpauses or accepts the stage. */
export function settleLongTaskAttempt(cwd: string, project: BusinessProjectRecord, input: { sessionId: string; attemptId: string }) {
  assertBound(cwd, project, input.sessionId)
  const ledger = load(cwd, project), run = ledger.runs[input.sessionId]
  const attempt = run?.attempts.find(row => row.id === input.attemptId)
  if (!run || !attempt) throw new Error('结算收据不属于已登记的父尝试。')
  if (attempt.settledAt) return attempt
  if (!['dispatched', 'dispatching', 'stale'].includes(attempt.status) || !attempt.messageId) throw new Error('未派发的尝试不能凭回合结束结算。')
  if (attempt.status !== 'stale') attempt.status = 'settled'
  attempt.settledAt = new Date().toISOString()
  if (attempt.id === run.currentAttemptId) run.noProgress = realityDigest(cwd, project, run.stageId) === attempt.realityDigest ? run.noProgress + 1 : 0
  save(cwd, project, ledger)
  return attempt
}
/** Record BEFORE invoking a non-idempotent external operation; only a trusted host result can clear it. */
export function markLongTaskExternalEffect(cwd: string, project: BusinessProjectRecord, input: { sessionId: string; attemptId: string; unknown: boolean }) {
  const ledger = load(cwd, project), { attempt } = findAttempt(ledger, input.sessionId, input.attemptId)
  attempt.externalEffectsUnknown = input.unknown; save(cwd, project, ledger)
}
export function markLongTaskToolEffect(cwd: string, project: BusinessProjectRecord, input: { sessionId: string; attemptId: string; callId: string; resolved: boolean }) {
  const ledger = load(cwd, project), run = ledger.runs[input.sessionId]
  const attempt = run?.attempts.find(row => row.id === input.attemptId)
  if (!attempt || !input.callId) throw new Error('工具副作用收据缺少父尝试或调用标识。')
  const calls = new Set(attempt.pendingToolCalls || [])
  if (input.resolved) calls.delete(input.callId)
  else calls.add(input.callId)
  attempt.pendingToolCalls = [...calls]; save(cwd, project, ledger)
}
export function registerLongTaskChild(cwd: string, project: BusinessProjectRecord, input: { sessionId: string; attemptId: string; childSessionId: string; expectedPaths: string[]; fromSeq?: number; observed?: boolean }) {
  const ledger = load(cwd, project), { run, attempt } = findAttempt(ledger, input.sessionId, input.attemptId)
  if (!input.observed && (run.paused || budgetReason(run)) && !attempt.children[input.childSessionId]) throw new Error('长期执行已暂停或预算门禁阻止新派工。')
  if (!['dispatching', 'dispatched'].includes(attempt.status) || !input.childSessionId || input.childSessionId === input.sessionId) throw new Error('子提交必须绑定已派发的父尝试。')
  const allowed = artifactPaths(cwd, project, attempt.stageId)
  const paths = [...new Set(input.expectedPaths.map(path => resolve(cwd, path)))].sort()
  if (paths.some(path => !allowed.includes(path))) throw new Error('子任务预期成果不属于当前阶段已登记的输出。')
  const previous = attempt.children[input.childSessionId]
  if (!previous && run.attempts.some(row => row.id !== attempt.id && row.children[input.childSessionId] && !row.children[input.childSessionId]!.settledAt)) throw new Error('同一子会话的旧尝试尚未结算，不能改绑定到新尝试。')
  if (previous?.expectedPaths.length && hash(previous.expectedPaths) !== hash(paths)) throw new Error('同一子会话不能改写已有提交范围。')
  attempt.children[input.childSessionId] = { ...previous, expectedPaths: paths, ...(previous?.fromSeq === undefined && input.fromSeq !== undefined ? { fromSeq: input.fromSeq } : {}) }; save(cwd, project, ledger)
}
export function settleLongTaskChild(cwd: string, project: BusinessProjectRecord, input: { sessionId: string; attemptId: string; childSessionId: string; reason?: string }) {
  const ledger = load(cwd, project), run = ledger.runs[input.sessionId]
  const child = run?.attempts.find(row => row.id === input.attemptId)?.children[input.childSessionId]
  if (!child) throw new Error('子回合结算不属于已登记的父尝试。')
  if (!child.settledAt) {
    child.settledAt = new Date().toISOString()
    if (input.reason && input.reason !== 'completed' && run.currentAttemptId === input.attemptId) run.paused = true
    save(cwd, project, ledger)
  }
  return child
}
/** A durable receipt means received for parent review, never final professional/user acceptance. */
export function submitLongTaskChild(cwd: string, project: BusinessProjectRecord, input: { sessionId: string; attemptId: string; childSessionId: string; submissionId: string; inputFingerprint: string; artifacts: Array<{ path: string; sha256: string }> }): LongTaskSubmission {
  const ledger = load(cwd, project), run = ledger.runs[input.sessionId]
  if (!run || !input.submissionId) throw new Error('子提交缺少已登记父尝试或收据标识。')
  const duplicate = run.submissions.find(row => row.id === input.submissionId)
  if (duplicate) {
    if (duplicate.attemptId !== input.attemptId || duplicate.childSessionId !== input.childSessionId || hash(duplicate.artifacts) !== hash(input.artifacts.map(row => ({ ...row, path: resolve(cwd, row.path) })))) throw new Error('重复收据标识的提交内容不一致。')
    return duplicate
  }
  const attempt = run.attempts.find(row => row.id === input.attemptId)
  const artifacts = input.artifacts.map(row => ({ path: resolve(cwd, row.path), sha256: row.sha256 }))
  const child = attempt?.children[input.childSessionId]
  const stale = !attempt || attempt.id !== run.currentAttemptId || input.inputFingerprint !== attempt.inputFingerprint || attempt.inputFingerprint !== longTaskInputFingerprint(cwd, project, attempt.stageId)
  const invalid = !child?.expectedPaths.length || artifacts.length !== child.expectedPaths.length || child.expectedPaths.some(path => !artifacts.some(row => row.path === path && row.sha256 === fileHash(path)))
  const row: LongTaskSubmission = { id: input.submissionId, attemptId: input.attemptId, childSessionId: input.childSessionId, artifacts, status: stale ? 'stale' : invalid ? 'rejected' : 'received', receivedAt: new Date().toISOString(), ...(stale ? { reason: '旧尝试或旧输入版本，不能推进当前任务。' } : invalid ? { reason: '实际文件、哈希或已登记提交范围不匹配。' } : {}) }
  run.submissions.push(row); save(cwd, project, ledger)
  return row
}
/** Feed only actual DSH/provider usage events, not execution_update/model-reported counters. */
export function recordLongTaskUsage(cwd: string, project: BusinessProjectRecord, input: { sessionId: string; eventId: string; sourceSessionId: string; usage?: { inputTokens: number; outputTokens: number; totalTokens?: number; cacheReadTokens?: number; cacheWriteTokens?: number }; costUsd?: number; elapsedMs?: number }) {
  const ledger = load(cwd, project), run = ledger.runs[input.sessionId]
  if (!run || !input.eventId) throw new Error('实际消耗事件缺少父任务或去重标识。')
  if (input.sourceSessionId !== run.sessionId && !run.attempts.some(row => row.children[input.sourceSessionId])) throw new Error('消耗事件不属于本任务的真实父子会话。')
  const receipt = `${input.sourceSessionId}:${input.eventId}`
  if (run.usageReceipts.includes(receipt)) return run.usage
  const usage = input.usage
  const counts = usage && [usage.inputTokens, usage.outputTokens, usage.cacheReadTokens || 0, usage.cacheWriteTokens || 0]
  if (counts?.some(value => !Number.isFinite(value) || value < 0) || input.costUsd !== undefined && (!Number.isFinite(input.costUsd) || input.costUsd < 0) || input.elapsedMs !== undefined && (!Number.isFinite(input.elapsedMs) || input.elapsedMs < 0)) throw new Error('实际消耗计数无效。')
  const derived = counts?.reduce((sum, value) => sum + value, 0)
  if (usage?.totalTokens !== undefined && (!Number.isFinite(usage.totalTokens) || usage.totalTokens < 0 || usage.totalTokens !== derived)) throw new Error('实际 token 总数与分项不一致。')
  run.usage.rounds += 1
  if (derived === undefined) run.usage.unknownTokens = true
  else run.usage.tokens += derived
  if (input.costUsd === undefined) run.usage.unknownCost = true
  else run.usage.knownCostUsd += input.costUsd
  run.usage.elapsedMs += input.elapsedMs || 0
  run.usageReceipts.push(receipt); save(cwd, project, ledger)
  return run.usage
}
/** Host observations settle attempts. Idle alone does not prove a previously dispatched turn completed. */
export function reconcileLongTask(cwd: string, project: BusinessProjectRecord, input: { sessionId: string; parentState: 'running' | 'idle' | 'unknown'; completedAttemptId?: string; foundMessageId?: string; childrenState?: Record<string, 'running' | 'idle' | 'unknown'> }): LongTaskStatus {
  assertBound(cwd, project, input.sessionId)
  const ledger = load(cwd, project), run = ledger.runs[input.sessionId]
  if (!run) return result(undefined, 'inactive', '本会话没有显式长期尝试。')
  if (run.paused) return result(run, 'paused', '恢复后继续保持用户暂停。')
  const attempt = current(run)
  const board = inspectBoard(cwd, project), slice = board.stages[run.stageId]
  const availability = stageAvailability(cwd, project, board)[run.stageId]
  if (attempt.inputFingerprint !== longTaskInputFingerprint(cwd, project, run.stageId)) {
    attempt.status = 'stale'; save(cwd, project, ledger)
    return result(run, 'needs_review', '输入、前序依据或用户要求已变化，需要按新版本明确恢复。')
  }
  if (board.currentStageId !== run.stageId) return result(run, 'done', '显式派发的阶段已切换；宿主不会跨阶段续派。')
  if (attempt.externalEffectsUnknown || attempt.pendingToolCalls?.length) return result(run, 'needs_review', '外部或工具操作结果未知；只核对已有成果，不重复执行。')
  if (input.foundMessageId && (attempt.status === 'prepared' || attempt.status === 'dispatching')) {
    if (attempt.messageId && attempt.messageId !== input.foundMessageId) return result(run, 'needs_review', '恢复发现的消息与持久派发意图不一致。')
    attempt.messageId = input.foundMessageId; attempt.status = 'dispatched'; save(cwd, project, ledger)
    markDispatched(cwd, project, attempt.stageId, attempt.key)
  }
  if (input.completedAttemptId === attempt.id && attempt.status === 'dispatched') {
    attempt.status = 'settled'; attempt.settledAt = new Date().toISOString()
    run.noProgress = realityDigest(cwd, project, run.stageId) === attempt.realityDigest ? run.noProgress + 1 : 0
    save(cwd, project, ledger)
  }
  if (availability?.waitingHuman || slice?.approval?.decision === 'rejected') return result(run, 'blocked', slice?.blockedReason || '当前成果等待用户明确决定；宿主不替代审批。')
  if (slice?.status === 'done') return result(run, 'done', '当前阶段已核对完成；不自动开启下一阶段。')
  if (!availability?.canPrepare) return result(run, 'blocked', availability?.reason || '当前阶段门禁阻止继续。')
  if (input.parentState === 'running') return result(run, 'waiting', '实际父会话仍在执行，不重复派发。')
  const unsettledChildren = Object.entries(attempt.children).filter(([, row]) => !row.settledAt)
  if (unsettledChildren.some(([id]) => input.childrenState?.[id] === 'running')) return result(run, 'waiting', '已登记子会话仍在执行，不重复派工。')
  if (unsettledChildren.length) return result(run, 'needs_review', '子会话结算尚未核对；空闲或通知本身不代表已经完成。')
  if (input.parentState === 'unknown' || attempt.status === 'dispatching' || attempt.status === 'dispatched') return result(run, 'needs_review', '已派发回合的结算状态未知；恢复时不重复可能已有副作用的执行。')
  const reason = budgetReason(run)
  if (reason) return result(run, 'blocked', reason)
  if (attempt.status === 'stale') return result(run, 'needs_review', '过期尝试需要用户确认新的执行版本。')
  if (attempt.status === 'prepared') return { ...result(run, 'ready', '尚未写入主会话的持久尝试可以派发一次。'), draft: attempt.draft }
  const stage = workflowFor(project).stages.find(row => row.id === run.stageId)!
  const draft = buildRecoveryDraft(project, stage, slice, `${availability.reason || ''}\n宿主只授权本阶段的剩余工作。实际成果齐备后调用 tender_stage complete_stage 核对；不得越过人工决定或自行启动后序阶段。`)
  const next = makeAttempt(cwd, project, run, dispatchFingerprint(slice, `host-attempt:${run.attempts.length}`), draft)
  run.attempts.push(next); run.currentAttemptId = next.id; save(cwd, project, ledger)
  return { ...result(run, 'ready', '已核对当前阶段，只续派最小未完成项。'), draft: next.draft }
}
