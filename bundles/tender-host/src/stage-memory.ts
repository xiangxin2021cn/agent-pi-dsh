import { createHash } from 'node:crypto'
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs'
import { basename, join, relative, resolve } from 'node:path'
import { listBusinessProjects, type BusinessProjectRecord } from '../../../packages/business-projects/index.ts'
import type { TenderCapabilityId } from '../../../packages/business-core/src/tender/index.ts'
import { CAPABILITY_FILE_NAMES, projectDir, writeNewJsonAtomic } from './fsutil.ts'
import { workflowFor } from './modules.ts'
import { officialStageDir } from './outputs.ts'
import { listUserRequirements } from './user-requirements.ts'
import { capabilityStatus, workspacePaths } from './workspace.ts'
import type { StageConsume } from './workflows.ts'

export type StageMemoryStatus = 'current' | 'stale'

export interface StageMemoryArtifact {
  path: string
  relativePath: string
  role: 'summary' | 'official-output' | 'registered-source'
  sha256: string
  bytes: number
  mtimeMs: number
}

export interface StageMemoryCapability {
  capability: TenderCapabilityId
  revision: number
  readiness: 'not_ready' | 'needs_review' | 'ready'
  issueCount: number
  stale: boolean
  packPath: string
  sha256: string
  bytes: number
  mtimeMs: number
}

export interface StageMemoryInput {
  kind: StageConsume['kind']
  ref: string
  required: boolean
  status: 'current' | 'stale' | 'missing'
  revision?: number
  digest?: string
  path?: string
}

export interface StageHandoff {
  schemaVersion: 1
  projectId: string
  module: string
  stageId: string
  revision: number
  createdAt: string
  basisDigest: string
  digest: string
  inputs: StageMemoryInput[]
  outputs: StageMemoryArtifact[]
  capabilities: StageMemoryCapability[]
  approval?: { decision: 'approved' | 'rejected'; decidedAt: string; note?: string }
  acceptedRequirements: Array<{ id: string; text: string; status: string; evidencePaths: string[] }>
  contextCapsule: string
}

interface StageMemoryInvalidation {
  schemaVersion: 1
  projectId: string
  module: string
  stageId: string
  handoffDigest: string
  invalidatedAt: string
  reason: string
  sourceStageId: string
}

export interface StageMemoryEntry {
  stageId: string
  status: StageMemoryStatus
  revision: number
  digest: string
  path: string
  createdAt: string
  staleReason?: string
  invalidatedAt?: string
  sourceStageId?: string
  handoff: StageHandoff
}

export interface StageMemorySnapshot {
  schemaVersion: 1
  projectId: string
  module: string
  stages: Record<string, StageMemoryEntry>
}

interface CompletionSlice {
  stageId: string
  status: string
  tasks: Array<{ sourcePath?: string; markdownPath?: string; reportPath?: string }>
  completedAt?: string
  approval?: { decision: 'approved' | 'rejected'; decidedAt: string; note?: string }
}

const HANDOFF_FILE = /^v(\d{6})-([a-f0-9]{16})\.json$/
const INVALIDATION_FILE = /^invalidate-.+\.json$/
const CAPSULE_MAX_CHARS = 8_000

function sha256(value: string | Buffer): string {
  return createHash('sha256').update(value).digest('hex')
}

function stableJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(',')}]`
  if (value && typeof value === 'object') {
    return `{${Object.entries(value as Record<string, unknown>)
      .filter(([, item]) => item !== undefined)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, item]) => `${JSON.stringify(key)}:${stableJson(item)}`)
      .join(',')}}`
  }
  return JSON.stringify(value)
}

function memoryRoot(cwd: string, project: BusinessProjectRecord): string {
  return join(projectDir(cwd, project.module, project.projectId), 'orchestration', 'handoffs')
}

export function stageHandoffDir(cwd: string, project: BusinessProjectRecord, stageId: string): string {
  return join(memoryRoot(cwd, project), stageId)
}

function invalidationDir(cwd: string, project: BusinessProjectRecord): string {
  return join(memoryRoot(cwd, project), '_invalidations')
}

function readJsonFile<T>(path: string): T | null {
  try {
    return JSON.parse(readFileSync(path, 'utf8')) as T
  } catch {
    return null
  }
}

function stageFiles(cwd: string, project: BusinessProjectRecord, stageId: string): string[] {
  const dir = stageHandoffDir(cwd, project, stageId)
  if (!existsSync(dir)) return []
  return readdirSync(dir)
    .filter((name) => HANDOFF_FILE.test(name))
    .sort()
    .map((name) => join(dir, name))
}

export function validateStageHandoff(value: unknown): StageHandoff {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Stage handoff must be an object')
  const row = value as StageHandoff
  if (row.schemaVersion !== 1) throw new Error('Stage handoff schemaVersion must be 1')
  if (!row.projectId || !row.module || !row.stageId) throw new Error('Stage handoff identity is incomplete')
  if (!Number.isInteger(row.revision) || row.revision < 1) throw new Error('Stage handoff revision must be positive')
  if (!Array.isArray(row.inputs) || !Array.isArray(row.outputs) || !Array.isArray(row.capabilities)) {
    throw new Error('Stage handoff inputs/outputs/capabilities must be arrays')
  }
  if (!Array.isArray(row.acceptedRequirements)) throw new Error('Stage handoff acceptedRequirements must be an array')
  for (const input of row.inputs) {
    if ((input.kind !== 'handoff' && input.kind !== 'capability') || !input.ref) throw new Error('Stage handoff input is invalid')
    if (input.status !== 'current' && input.status !== 'stale' && input.status !== 'missing') throw new Error('Stage handoff input status is invalid')
  }
  for (const output of row.outputs) {
    if (!output.path || !output.relativePath || !/^[a-f0-9]{64}$/.test(output.sha256) || output.bytes < 0) {
      throw new Error('Stage handoff output artifact is invalid')
    }
  }
  for (const capability of row.capabilities) {
    if (!capability.capability || !capability.packPath || !/^[a-f0-9]{64}$/.test(capability.sha256) || capability.bytes < 0) {
      throw new Error('Stage handoff capability artifact is invalid')
    }
  }
  if (row.approval && row.approval.decision !== 'approved' && row.approval.decision !== 'rejected') {
    throw new Error('Stage handoff approval is invalid')
  }
  if (!row.contextCapsule || row.contextCapsule.length > CAPSULE_MAX_CHARS) {
    throw new Error(`Stage handoff contextCapsule must contain 1-${CAPSULE_MAX_CHARS} characters`)
  }
  const expectedBasis = sha256(stableJson({
    projectId: row.projectId,
    module: row.module,
    stageId: row.stageId,
    inputs: row.inputs,
    outputs: row.outputs,
    capabilities: row.capabilities,
    approval: row.approval,
    acceptedRequirements: row.acceptedRequirements,
    contextCapsule: row.contextCapsule,
  }))
  if (row.basisDigest !== expectedBasis) throw new Error('Stage handoff basisDigest mismatch')
  const expected = sha256(stableJson({ ...row, digest: undefined }))
  if (row.digest !== expected) throw new Error('Stage handoff digest mismatch')
  return row
}

export function loadStageMemorySnapshot(cwd: string, project: BusinessProjectRecord): StageMemorySnapshot {
  const workflow = workflowFor(project.module)
  const stages: Record<string, StageMemoryEntry> = {}
  for (const stage of workflow.stages) {
    const files = stageFiles(cwd, project, stage.id)
    const latestPath = files.at(-1)
    if (!latestPath) continue
    const handoff = validateStageHandoff(readJsonFile<StageHandoff>(latestPath))
    stages[stage.id] = {
      stageId: stage.id,
      status: 'current',
      revision: handoff.revision,
      digest: handoff.digest,
      path: latestPath,
      createdAt: handoff.createdAt,
      handoff,
    }
  }
  const dir = invalidationDir(cwd, project)
  if (existsSync(dir)) {
    for (const name of readdirSync(dir).filter((item) => INVALIDATION_FILE.test(item)).sort()) {
      const event = readJsonFile<StageMemoryInvalidation>(join(dir, name))
      if (!event || event.projectId !== project.projectId || event.module !== project.module) continue
      const current = stages[event.stageId]
      if (!current || current.digest !== event.handoffDigest) continue
      current.status = 'stale'
      current.staleReason = event.reason
      current.invalidatedAt = event.invalidatedAt
      current.sourceStageId = event.sourceStageId
    }
  }
  return { schemaVersion: 1, projectId: project.projectId, module: project.module, stages }
}

function walkFiles(dir: string): string[] {
  if (!existsSync(dir)) return []
  const out: string[] = []
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.name.startsWith('.') || entry.name.startsWith('~') || entry.name.endsWith('.tmp')) continue
    const path = join(dir, entry.name)
    if (entry.isDirectory()) out.push(...walkFiles(path))
    else out.push(path)
  }
  return out
}

function artifact(cwd: string, path: string, role: StageMemoryArtifact['role']): StageMemoryArtifact | null {
  if (!existsSync(path)) return null
  const stats = statSync(path)
  if (!stats.isFile()) return null
  return {
    path: resolve(path),
    relativePath: relative(resolve(cwd), resolve(path)).replace(/\\/g, '/'),
    role,
    sha256: sha256(readFileSync(path)),
    bytes: stats.size,
    mtimeMs: stats.mtimeMs,
  }
}

function collectArtifacts(
  cwd: string,
  project: BusinessProjectRecord,
  stageId: string,
  slice: CompletionSlice,
): StageMemoryArtifact[] {
  const stage = workflowFor(project.module).stages.find((item) => item.id === stageId)
  const summaryName = stage?.summaryDeliverable?.fileName
  const seen = new Set<string>()
  const out: StageMemoryArtifact[] = []
  const add = (path: string, role: StageMemoryArtifact['role']) => {
    const key = resolve(path).replace(/\\/g, '/').toLowerCase()
    if (seen.has(key)) return
    const row = artifact(cwd, path, role)
    if (!row) return
    seen.add(key)
    out.push(row)
  }
  for (const path of walkFiles(officialStageDir(cwd, project.projectId, stageId))) {
    add(path, summaryName && basename(path) === summaryName ? 'summary' : 'official-output')
  }
  if (stageId === workflowFor(project.module).setupStageId) {
    for (const path of project.inputPaths) add(path, 'registered-source')
  }
  for (const task of slice.tasks) {
    if (task.markdownPath) add(task.markdownPath, summaryName && basename(task.markdownPath) === summaryName ? 'summary' : 'official-output')
  }
  return out.sort((left, right) => left.relativePath.localeCompare(right.relativePath))
}

function capabilityIdsForStage(stageId: string, consumes: StageConsume[]): TenderCapabilityId[] {
  const produced: Partial<Record<string, TenderCapabilityId[]>> = {
    'tender-document-analysis': ['document_analysis', 'boq_reconciliation'],
    'boq-five-step-pricing': ['boq_five_step_pricing'],
    'planning-and-submission': ['execution_plan', 'schedule_resources', 'cost_cashflow'],
    'submission-compliance-freeze': ['submission_documents', 'bidder_commitments', 'submission_audit'],
  }
  return [...new Set([
    ...(produced[stageId] ?? []),
    ...consumes.filter((item): item is Extract<StageConsume, { kind: 'capability' }> => item.kind === 'capability')
      .map((item) => item.capability),
  ])]
}

function collectCapabilities(cwd: string, project: BusinessProjectRecord, ids: TenderCapabilityId[]): StageMemoryCapability[] {
  if (ids.length === 0) return []
  let status
  try {
    status = capabilityStatus(cwd, project.projectId)
  } catch {
    return []
  }
  const paths = workspacePaths(cwd, project.projectId)
  return ids.flatMap((capability) => {
    const row = status.index.capabilities.find((item) => item.capability === capability)
    if (!row || row.revision < 1) return []
    const packPath = join(paths.packs, `${CAPABILITY_FILE_NAMES[capability]}.json`)
    if (!existsSync(packPath)) return []
    const stats = statSync(packPath)
    if (!stats.isFile()) return []
    return [{
      capability,
      revision: row.revision,
      readiness: row.readiness,
      issueCount: row.issueCount,
      stale: row.stale,
      packPath,
      sha256: sha256(readFileSync(packPath)),
      bytes: stats.size,
      mtimeMs: stats.mtimeMs,
    }]
  })
}

function resolveInputs(
  cwd: string,
  project: BusinessProjectRecord,
  consumes: StageConsume[],
  snapshot: StageMemorySnapshot,
): StageMemoryInput[] {
  let capabilityIndex: ReturnType<typeof capabilityStatus>['index'] | null = null
  return consumes.map((consume) => {
    const required = consume.required !== false
    if (consume.kind === 'handoff') {
      const row = snapshot.stages[consume.stageId]
      return {
        kind: consume.kind,
        ref: consume.stageId,
        required,
        status: row?.status ?? 'missing',
        revision: row?.revision,
        digest: row?.digest,
        path: row?.path,
      }
    }
    if (!capabilityIndex) {
      try { capabilityIndex = capabilityStatus(cwd, project.projectId).index } catch { capabilityIndex = null }
    }
    const row = capabilityIndex?.capabilities.find((item) => item.capability === consume.capability)
    const packPath = join(workspacePaths(cwd, project.projectId).packs, `${CAPABILITY_FILE_NAMES[consume.capability]}.json`)
    return {
      kind: consume.kind,
      ref: consume.capability,
      required,
      status: !row || row.revision < 1 || !existsSync(packPath) ? 'missing' : row.stale ? 'stale' : 'current',
      revision: row?.revision,
      path: packPath,
    }
  })
}

function compactMarkdown(markdown: string): string {
  const sections: string[] = []
  let current: string[] = []
  const flush = () => {
    if (current.length > 0) sections.push(current.slice(0, 6).join('\n'))
    current = []
  }
  for (const raw of markdown.replace(/\r\n/g, '\n').split('\n')) {
    const line = raw.trim()
    if (!line) continue
    if (/^#{1,6}\s/.test(line)) {
      flush()
      current.push(line)
      continue
    }
    if (current.length < 6 && (/^[-*+]\s/.test(line) || /^\d+[.)]\s/.test(line) || line.includes('|'))) current.push(line)
    else if (current.length === 1) current.push(line)
  }
  flush()
  const joined = sections.join('\n').slice(0, CAPSULE_MAX_CHARS)
  return joined || '本阶段正式成果、能力包与用户决策已冻结；按记忆包路径读取精确内容。'
}

function buildCapsule(stageLabel: string, outputs: StageMemoryArtifact[], capabilities: StageMemoryCapability[], slice: CompletionSlice): string {
  const summary = outputs.find((item) => item.role === 'summary')
  const lines = [
    `阶段：${stageLabel}`,
    `状态：${slice.approval?.decision === 'approved' ? '用户已确认并冻结' : '阶段已收口'}`,
    `正式成果：${outputs.filter((item) => item.role !== 'registered-source').length} 份`,
    capabilities.length > 0
      ? `能力包：${capabilities.map((item) => `${item.capability}@${item.revision}/${item.readiness}${item.stale ? '/stale' : ''}`).join('；')}`
      : '能力包：无本阶段结构化能力包',
    summary ? `权威总控：${summary.relativePath} · sha256=${summary.sha256.slice(0, 16)}` : '权威总控：以记忆包成果清单为准',
  ]
  if (summary) lines.push('', compactMarkdown(readFileSync(summary.path, 'utf8')))
  return lines.join('\n').slice(0, CAPSULE_MAX_CHARS)
}

export function commitStageHandoff(
  cwd: string,
  project: BusinessProjectRecord,
  stageId: string,
  slice: CompletionSlice,
): StageMemoryEntry {
  const workflow = workflowFor(project.module)
  const stage = workflow.stages.find((item) => item.id === stageId)
  if (!stage) throw new Error(`Unknown stage ${stageId}`)
  const snapshot = loadStageMemorySnapshot(cwd, project)
  const inputs = resolveInputs(cwd, project, stage.consumes ?? [], snapshot)
  const unavailable = inputs.filter((item) => item.required && item.status !== 'current')
  if (unavailable.length > 0) {
    throw new Error(`阶段记忆输入未就绪：${unavailable.map((item) => `${item.kind}:${item.ref}=${item.status}`).join('；')}`)
  }
  const outputs = collectArtifacts(cwd, project, stageId, slice)
  const capabilities = collectCapabilities(cwd, project, capabilityIdsForStage(stageId, stage.consumes ?? []))
  const acceptedRequirements = listUserRequirements(cwd, project, stageId)
    .filter((item) => item.status === 'accepted' || item.status === 'implemented')
    .map((item) => ({ id: item.id, text: item.text, status: item.status, evidencePaths: item.evidencePaths ?? [] }))
  const contextCapsule = buildCapsule(stage.labelZh, outputs, capabilities, slice)
  const basis = {
    projectId: project.projectId,
    module: project.module,
    stageId,
    inputs,
    outputs,
    capabilities,
    approval: slice.approval,
    acceptedRequirements,
    contextCapsule,
  }
  const basisDigest = sha256(stableJson(basis))
  const latest = snapshot.stages[stageId]
  if (latest?.status === 'current' && latest.handoff.basisDigest === basisDigest) return latest
  const revision = (latest?.revision ?? 0) + 1
  const base = {
    schemaVersion: 1 as const,
    ...basis,
    revision,
    createdAt: new Date().toISOString(),
    basisDigest,
  }
  const handoff: StageHandoff = { ...base, digest: sha256(stableJson({ ...base, digest: undefined })) }
  validateStageHandoff(handoff)
  const name = `v${String(revision).padStart(6, '0')}-${handoff.digest.slice(0, 16)}.json`
  const path = join(stageHandoffDir(cwd, project, stageId), name)
  writeNewJsonAtomic(path, handoff)
  return { stageId, status: 'current', revision, digest: handoff.digest, path, createdAt: handoff.createdAt, handoff }
}

function samePath(left: string, right: string): boolean {
  return resolve(left).replace(/\\/g, '/').toLowerCase() === resolve(right).replace(/\\/g, '/').toLowerCase()
}

function artifactChanged(row: StageMemoryArtifact): boolean {
  if (!existsSync(row.path)) return true
  const stats = statSync(row.path)
  if (!stats.isFile()) return true
  if (stats.size === row.bytes && stats.mtimeMs === row.mtimeMs) return false
  return sha256(readFileSync(row.path)) !== row.sha256
}

function capabilityChanged(cwd: string, project: BusinessProjectRecord, row: StageMemoryCapability): boolean {
  try {
    const current = capabilityStatus(cwd, project.projectId, row.capability).index.capabilities
      .find((item) => item.capability === row.capability)
    if (!current
      || current.revision !== row.revision
      || current.readiness !== row.readiness
      || current.stale !== row.stale) return true
    if (!existsSync(row.packPath)) return true
    const stats = statSync(row.packPath)
    if (!stats.isFile()) return true
    if (stats.size === row.bytes && stats.mtimeMs === row.mtimeMs) return false
    return sha256(readFileSync(row.packPath)) !== row.sha256
  } catch {
    return true
  }
}

export function downstreamStageIds(project: BusinessProjectRecord, sourceStageId: string): string[] {
  const workflow = workflowFor(project.module)
  const affected = new Set<string>([sourceStageId])
  let changed = true
  while (changed) {
    changed = false
    for (const stage of workflow.stages) {
      if (affected.has(stage.id)) continue
      if (stage.consumes?.some((consume) => consume.kind === 'handoff' && affected.has(consume.stageId))) {
        affected.add(stage.id)
        changed = true
      }
    }
  }
  return workflow.stages.map((stage) => stage.id).filter((stageId) => affected.has(stageId))
}

function writeInvalidation(
  cwd: string,
  project: BusinessProjectRecord,
  entry: StageMemoryEntry,
  sourceStageId: string,
  reason: string,
): void {
  if (entry.status === 'stale') return
  const event: StageMemoryInvalidation = {
    schemaVersion: 1,
    projectId: project.projectId,
    module: project.module,
    stageId: entry.stageId,
    handoffDigest: entry.digest,
    invalidatedAt: new Date().toISOString(),
    reason,
    sourceStageId,
  }
  const digest = sha256(stableJson(event)).slice(0, 16)
  const name = `invalidate-${Date.now()}-${event.stageId}-${digest}.json`
  writeNewJsonAtomic(join(invalidationDir(cwd, project), name), event)
}

function invalidateStages(
  cwd: string,
  project: BusinessProjectRecord,
  sourceStageId: string,
  reason: string,
): StageMemorySnapshot {
  const snapshot = loadStageMemorySnapshot(cwd, project)
  for (const stageId of downstreamStageIds(project, sourceStageId)) {
    const entry = snapshot.stages[stageId]
    if (entry?.status === 'current') writeInvalidation(cwd, project, entry, sourceStageId, reason)
  }
  return loadStageMemorySnapshot(cwd, project)
}

export function refreshStageMemorySnapshot(cwd: string, project: BusinessProjectRecord): StageMemorySnapshot {
  let snapshot = loadStageMemorySnapshot(cwd, project)
  const workflow = workflowFor(project.module)
  for (const stage of workflow.stages) {
    const entry = snapshot.stages[stage.id]
    if (!entry || entry.status === 'stale') continue
    const artifactDrift = entry.handoff.outputs.find(artifactChanged)
    const capabilityDrift = entry.handoff.capabilities.find((item) => capabilityChanged(cwd, project, item))
    const inputDrift = entry.handoff.inputs.find((input) => {
      if (input.kind !== 'handoff') return false
      const upstream = snapshot.stages[input.ref]
      return !upstream || upstream.status !== 'current' || upstream.digest !== input.digest
    })
    if (artifactDrift) {
      snapshot = invalidateStages(cwd, project, stage.id, `正式成果已变更：${artifactDrift.relativePath}`)
    } else if (capabilityDrift) {
      snapshot = invalidateStages(cwd, project, stage.id, `能力包基线已变更：${capabilityDrift.capability}`)
    } else if (inputDrift) {
      snapshot = invalidateStages(cwd, project, stage.id, `前序阶段记忆已变更：${inputDrift.ref}`)
    }
  }
  return snapshot
}

export function memoryImpactForPath(cwd: string, project: BusinessProjectRecord, path: string) {
  const snapshot = loadStageMemorySnapshot(cwd, project)
  const source = Object.values(snapshot.stages).find((entry) => (
    entry.status === 'current' && entry.handoff.outputs.some((item) => samePath(item.path, path))
  ))
  if (!source) return { affected: false, stageIds: [], stageLabels: [], requiresReapproval: false }
  const workflow = workflowFor(project.module)
  const stageIds = downstreamStageIds(project, source.stageId)
  const requiresReapproval = stageIds.some((stageId) => workflow.stages.find((item) => item.id === stageId)?.approvalGate)
  return {
    affected: true,
    sourceStageId: source.stageId,
    sourceStageLabel: workflow.stages.find((item) => item.id === source.stageId)?.labelZh ?? source.stageId,
    stageIds,
    stageLabels: stageIds.map((stageId) => workflow.stages.find((item) => item.id === stageId)?.labelZh ?? stageId),
    requiresReapproval,
  }
}

export function invalidateStageMemoryForPath(cwd: string, project: BusinessProjectRecord, path: string) {
  const impact = memoryImpactForPath(cwd, project, path)
  if (!impact.affected || !impact.sourceStageId) return impact
  invalidateStages(cwd, project, impact.sourceStageId, `用户修改了冻结成果：${relative(resolve(cwd), resolve(path)).replace(/\\/g, '/')}`)
  return impact
}

export function invalidateStageMemory(
  cwd: string,
  project: BusinessProjectRecord,
  stageId: string,
  reason: string,
): StageMemorySnapshot {
  return invalidateStages(cwd, project, stageId, reason)
}

export function workspaceMemoryImpactForPath(cwd: string, path: string) {
  const projectImpacts: Array<ReturnType<typeof memoryImpactForPath> & { projectId: string; module: string; projectName: string }> = []
  for (const project of listBusinessProjects(cwd)) {
    const impact = memoryImpactForPath(cwd, project, path)
    if (impact.affected) projectImpacts.push({
      ...impact,
      projectId: project.projectId,
      module: project.module,
      projectName: project.name,
    })
  }
  const first = projectImpacts[0]
  if (!first) return { affected: false, stageIds: [], stageLabels: [], requiresReapproval: false, projectImpacts: [] }
  return {
    ...first,
    projectIds: projectImpacts.map((item) => item.projectId),
    stageIds: [...new Set(projectImpacts.flatMap((item) => item.stageIds))],
    stageLabels: [...new Set(projectImpacts.flatMap((item) => item.stageLabels ?? []))],
    requiresReapproval: projectImpacts.some((item) => item.requiresReapproval),
    projectImpacts,
  }
}

export function invalidateWorkspaceStageMemoryForPath(cwd: string, path: string) {
  const impact = workspaceMemoryImpactForPath(cwd, path)
  if (!impact.affected) return impact
  for (const project of listBusinessProjects(cwd)) {
    const projectImpact = memoryImpactForPath(cwd, project, path)
    if (projectImpact.affected && projectImpact.sourceStageId) {
      invalidateStages(cwd, project, projectImpact.sourceStageId, `用户修改了冻结成果：${relative(resolve(cwd), resolve(path)).replace(/\\/g, '/')}`)
    }
  }
  return impact
}

export function slimStageMemorySnapshot(snapshot: StageMemorySnapshot) {
  return {
    schemaVersion: snapshot.schemaVersion,
    projectId: snapshot.projectId,
    module: snapshot.module,
    stages: Object.fromEntries(Object.entries(snapshot.stages).map(([stageId, entry]) => [stageId, {
      stageId,
      status: entry.status,
      revision: entry.revision,
      digest: entry.digest,
      path: entry.path,
      createdAt: entry.createdAt,
      staleReason: entry.staleReason,
      invalidatedAt: entry.invalidatedAt,
      sourceStageId: entry.sourceStageId,
      inputs: entry.handoff.inputs,
      outputCount: entry.handoff.outputs.length,
      capabilityCount: entry.handoff.capabilities.length,
    }])),
  }
}

export function renderProjectMemoryContext(
  cwd: string,
  project: BusinessProjectRecord,
  currentStageId: string | undefined,
  stageStatuses: Record<string, string>,
): string {
  const snapshot = loadStageMemorySnapshot(cwd, project)
  const workflow = workflowFor(project.module)
  const current = workflow.stages.find((stage) => stage.id === currentStageId)
  const projectGoal = project.projectGoal || workflow.projectGoal
  const terminalDeliverables = project.terminalDeliverables?.length
    ? project.terminalDeliverables
    : workflow.terminalDeliverables
  const consumed = current?.consumes
    ?.filter((item): item is Extract<StageConsume, { kind: 'handoff' }> => item.kind === 'handoff')
    .map((item) => snapshot.stages[item.stageId])
    .filter((item): item is StageMemoryEntry => Boolean(item)) ?? []
  const lines = [
    '【Agent Pi 项目状态胶囊 — 磁盘记忆为准】',
    `项目：${project.name} (${project.projectId})`,
    ...(projectGoal ? [`项目总目标：${projectGoal}`] : []),
    ...(terminalDeliverables?.length ? ['终态交付：', ...terminalDeliverables.map((item) => `- ${item}`)] : []),
    `当前阶段：${current?.labelZh ?? currentStageId ?? '尚未开始'}`,
    `盘面：${workflow.stages.map((stage) => `${stage.labelZh}=${stageStatuses[stage.id] ?? '未开始'}`).join('；')}`,
    '规则：项目总目标和终态交付高于当前微批次；聊天压缩摘要不是业务基线；精确事实按下列 handoff 路径和 sha256 回读。项目事实不得写入全局知识库。',
  ]
  for (const entry of consumed.slice(-4)) {
    lines.push('', `前序基线 ${entry.stageId}@${entry.revision} [${entry.status}] ${entry.path}`, entry.handoff.contextCapsule.slice(0, 1_800))
  }
  const active = Object.values(snapshot.stages).filter((entry) => entry.status === 'stale')
  if (active.length > 0) lines.push('', `失效记忆：${active.map((entry) => `${entry.stageId}(${entry.staleReason})`).join('；')}`)
  return lines.join('\n').slice(0, 12_000)
}
