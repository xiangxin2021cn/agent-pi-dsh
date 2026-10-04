import { createHash, randomUUID } from 'node:crypto'
import { closeSync, existsSync, mkdirSync, openSync, readFileSync, renameSync, unlinkSync, writeFileSync } from 'node:fs'
import { basename, join } from 'node:path'
import type { ProfessionalTask, TaskBrief, Evidence, TaskQuality, QualityCriterion } from './types.ts'
import { verificationCurrent } from './verification.ts'

export type TaskActor = 'user' | 'agent' | 'host'
export type TaskPatch = Partial<Omit<ProfessionalTask, 'sessionId' | 'schemaVersion' | 'revision'>>
export type TaskUpdateOptions = { operationId?: string; operationPayload?: unknown; summary?: string }

export function emptyQuality(): TaskQuality {
  return { enabled: false, brief: { purpose: '', depth: '', evidence: '', format: '', acceptance: '' }, criteria: [], checks: [], checkedRevision: null, reviewNotes: '', needsAssessment: true }
}

export function emptyTask(sessionId: string): ProfessionalTask {
  return { schemaVersion: 2, sessionId, revision: 0, needsAssessment: true, latestRequest: '',
    brief: { objective: '', scope: '', audience: '', formats: [], language: '', deadline: '', profession: 'general', webDiligence: 'allowed',
      basis: { country: '', location: '', employer: '', procurement: '', funding: '', contract: '', measurement: '', standards: [], precedence: [] } },
    questions: [], evidence: [], requirements: [], coverage: [], plan: [], deliverables: [], assessment: '', updatedAt: '',
    briefProvenance: {}, findings: [], quality: emptyQuality(), recentChanges: [], operationReceipts: [], acceptedHistory: [], directives: [] }
}

function equal(left: unknown, right: unknown): boolean { return JSON.stringify(left) === JSON.stringify(right) }
function digest(value: unknown): string { return createHash('sha256').update(JSON.stringify(value)).digest('hex') }
export function taskOperationDigest(payload: unknown, actor: TaskActor = 'agent'): string { return digest({ payload, actor }) }

/** A check depends on its real inputs, rather than the task's concurrency revision. */
export function qualityInputFingerprint(task: ProfessionalTask, criterion: QualityCriterion): string {
  const keys = criterion.briefDependencies || (criterion.kind === 'review' ? ['objective', 'scope', 'basis', 'profession', 'audience', 'language', 'deadline'] : [])
  return digest({ criterion, brief: Object.fromEntries(keys.map(key => [key, task.brief[key as keyof TaskBrief]])),
    evidence: (criterion.evidenceIds || []).map(id => task.evidence.find(row => row.id === id)),
    requirements: (criterion.requirementIds || []).map(id => task.requirements.find(row => row.id === id)),
    template: criterion.kind === 'review' ? task.quality.template : undefined,
    qualityBrief: criterion.kind === 'review' ? task.quality.brief : undefined })
}

/** Existing snapshots remain recoverable; migrated fields are not asserted as human-confirmed. */
export function migrateTask(value: unknown): ProfessionalTask {
  const old = value as ProfessionalTask
  if (!old || ![1, 2].includes(old.schemaVersion)) throw new Error('Unsupported professional task schema')
  const task = { ...emptyTask(old.sessionId), ...structuredClone(old), schemaVersion: 2 } as ProfessionalTask
  // Historical model-written snapshots omitted presentation/collection defaults.
  // Only absent fields are supplied; invalid values and approval claims still fail validation.
  if (Array.isArray(task.plan)) task.plan = task.plan.map(row => {
    if (row.capabilityIds === undefined) row.capabilityIds = []
    if (row.dependsOn === undefined) row.dependsOn = []
    if (row.evidenceIds === undefined) row.evidenceIds = []
    if (row.requirementIds === undefined) row.requirementIds = []
    if (row.gaps === undefined) row.gaps = []
    if (row.supplements === undefined) row.supplements = []
    return row
  })
  if (Array.isArray(task.deliverables)) task.deliverables = task.deliverables.map(row => {
    if (row.title === undefined) row.title = typeof row.path === 'string' ? basename(row.path) : ''
    if (row.checks === undefined) row.checks = []
    if (row.requirementIds === undefined) row.requirementIds = []
    if (row.evidenceIds === undefined) row.evidenceIds = []
    if (row.stepIds === undefined) row.stepIds = []
    return row
  })
  if (old.schemaVersion === 1) {
    task.migration = { ...task.migration, schema1: true }
    task.briefProvenance = {}
    for (const [key, field] of Object.entries(task.brief)) if (field && (!Array.isArray(field) || field.length)) task.briefProvenance[key] = { origin: 'legacy', status: 'provisional', updatedRevision: task.revision }
  }
  return task
}

function unique(rows: Array<{ id: string }>, field: string) {
  const ids = new Set<string>()
  for (const row of rows) {
    if (!row.id?.trim() || ids.has(row.id)) throw new Error(`${field}: missing or duplicate id`)
    ids.add(row.id)
  }
  return ids
}

export function validateEvidence(evidence: Evidence): void {
  if (!['source', 'web', 'derived', 'assumption'].includes(evidence.kind) || !['verified', 'unverified', 'conflict'].includes(evidence.status)) throw new Error('Invalid evidence kind or status')
  if (!evidence.title?.trim() || !evidence.value?.trim()) throw new Error('Evidence needs a title and value')
  if (evidence.sourcePath !== undefined && !evidence.sourcePath.trim()) throw new Error('Source evidence needs a nonempty path')
  if (evidence.sourceHash !== undefined && !/^[a-f0-9]{64}$/i.test(evidence.sourceHash)) throw new Error('Source evidence needs a valid SHA-256')
  if (evidence.kind === 'assumption' && evidence.status === 'verified') throw new Error('An assumption cannot be a verified fact')
  if (evidence.kind === 'derived' && !evidence.basis?.trim()) throw new Error('A derivation needs its calculation basis')
  if (evidence.status !== 'verified') return
  if (evidence.applicable !== true) throw new Error('Verified evidence must be applicable to this task')
  if (evidence.kind === 'source' && !evidence.locator?.trim()) throw new Error('Verified source evidence needs a locator')
  if (evidence.kind === 'web') {
    let url: URL
    try { url = new URL(evidence.url || '') } catch { throw new Error('Web evidence needs a valid source URL') }
    if (!['https:', 'http:'].includes(url.protocol) || !evidence.accessedAt || !Number.isFinite(Date.parse(evidence.accessedAt)) || !evidence.region?.trim() || !evidence.effectiveDate?.trim()) throw new Error('Verified web evidence needs URL, access date, region and effective date')
  }
}

export function validateTask(task: ProfessionalTask): void {
  if (task.schemaVersion !== 2 || !task.sessionId || !Number.isInteger(task.revision) || task.revision < 0) throw new Error('Invalid task identity')
  if (!['general', 'tender', 'drawing', 'quantity', 'method', 'research', 'report', 'spreadsheet'].includes(task.brief.profession)) throw new Error('Unknown profession')
  if (!['ask', 'allowed', 'forbidden'].includes(task.brief.webDiligence)) throw new Error('Invalid diligence policy')
  for (const key of ['objective', 'scope', 'audience', 'language', 'deadline'] as const) if (typeof task.brief[key] !== 'string') throw new Error(`Invalid brief ${key}`)
  if (!Array.isArray(task.brief.formats) || task.brief.formats.some(value => typeof value !== 'string')) throw new Error('Invalid formats')
  const evidenceIds = unique(task.evidence, 'evidence')
  const requirements = unique(task.requirements, 'requirements')
  unique(task.coverage, 'coverage'); unique(task.questions, 'questions'); unique(task.deliverables, 'deliverables'); unique(task.findings, 'findings')
  unique(task.directives, 'directives')
  for (const row of task.directives) if (!row.key?.trim() || !row.text?.trim() || !row.messageId?.trim() || !['request', 'constraint', 'correction', 'scope', 'decision', 'revocation'].includes(row.kind) || !['active', 'superseded', 'revoked'].includes(row.status) || !['user', 'native'].includes(row.source) || !Number.isInteger(row.updatedRevision) || row.supersedes?.some(id => !task.directives.some(value => value.id === id))) throw new Error('Invalid durable user directive')
  const reference = (ids: string[], known: Set<string>, field: string) => {
    if (!Array.isArray(ids) || ids.some(id => !known.has(id))) throw new Error(`${field}: unknown reference`)
  }
  for (const question of task.questions) {
    if (!question.question?.trim() || (question.status && !['pending', 'open', 'continued', 'answered', 'expired', 'cancelled'].includes(question.status))) throw new Error('Invalid task question')
    if (question.decisionScope && (!question.provider || !question.decisionScope.cwd || !question.decisionScope.projectId || !question.decisionScope.moduleId || !question.decisionScope.stageId || !/^[a-f0-9]{64}$/i.test(question.decisionScope.fingerprint) || !question.decisionScope.approveLabel)) throw new Error('Invalid native stage decision scope')
  }
  for (const evidence of task.evidence) { validateEvidence(evidence); reference(evidence.dependsOn || [], evidenceIds, 'evidence dependencies') }
  const visiting = new Set<string>(), visited = new Set<string>()
  const visit = (id: string) => {
    if (visiting.has(id)) throw new Error('Circular evidence dependency')
    if (visited.has(id)) return
    visiting.add(id)
    for (const dependency of task.evidence.find(row => row.id === id)?.dependsOn || []) visit(dependency)
    visiting.delete(id); visited.add(id)
  }
  for (const id of evidenceIds) visit(id)
  for (const standard of task.brief.basis.standards) reference([standard.evidenceId], evidenceIds, 'standard evidence')
  for (const row of task.requirements) {
    reference(row.evidenceIds, evidenceIds, 'requirement evidence')
    if (!row.title?.trim() || !['condition', 'score', 'returnable', 'acceptance'].includes(row.kind) || typeof row.mandatory !== 'boolean') throw new Error('Invalid requirement')
  }
  for (const row of task.coverage) if (!row.title?.trim() || !row.locator?.trim() || !row.version?.trim() || !['page', 'table', 'drawing', 'attachment', 'file'].includes(row.kind) || !['parsed', 'unreadable', 'missing', 'superseded'].includes(row.status) || (row.review && !['pending', 'reviewed'].includes(row.review))) throw new Error('Invalid source coverage')
  const steps = new Set<string>()
  for (const step of task.plan) {
    if (!step.id || steps.has(step.id) || !step.title?.trim()) throw new Error('Invalid plan step')
    for (const rows of [step.capabilityIds, step.gaps, step.supplements]) if (!Array.isArray(rows) || rows.some(value => typeof value !== 'string')) throw new Error('Invalid plan collections')
    reference(step.dependsOn, steps, 'plan dependencies must precede consumer')
    reference(step.evidenceIds, evidenceIds, 'plan evidence'); reference(step.requirementIds, requirements, 'plan requirements')
    if (!['pending', 'working', 'done', 'blocked', 'needs_review'].includes(step.status)) throw new Error('Invalid plan status')
    steps.add(step.id)
  }
  for (const row of task.deliverables) {
    reference(row.requirementIds, requirements, 'deliverable requirements'); reference(row.evidenceIds, evidenceIds, 'deliverable evidence'); reference(row.stepIds, steps, 'deliverable steps')
    if (typeof row.title !== 'string' || !row.title.trim() || !row.path || !['draft', 'reviewed', 'accepted', 'stale'].includes(row.status)) throw new Error('Invalid deliverable')
    if (!['not_required', 'pending', 'signed'].includes(row.signature)) throw new Error('Invalid signature status')
    if (!Array.isArray(row.checks) || row.checks.some(check => !['passed', 'failed', 'review'].includes(check.status) || !check.detail?.trim())) throw new Error('Checks need status and actual evidence')
    const verification = row.verification
    if (verification && (!verification.ruleVersion?.trim() || verification.artifactSha256 !== null && !/^[a-f0-9]{64}$/i.test(verification.artifactSha256) || !/^[a-f0-9]{64}$/i.test(verification.inputFingerprint) || !Number.isInteger(verification.taskRevision) || !verification.checkedAt || !['passed', 'review', 'failed', 'stale'].includes(verification.status) || !Array.isArray(verification.unresolved) || verification.unresolved.some(value => typeof value !== 'string') || !Array.isArray(verification.checks) || !verification.sourceHashes || Object.values(verification.sourceHashes).some(value => value !== null && !/^[a-f0-9]{64}$/i.test(value)))) throw new Error('Invalid artifact verification')
    if (row.status === 'accepted' && (row.checks.some(check => check.status !== 'passed') || ['file', 'professional', 'writing'].some(kind => !row.checks.some(check => check.kind === kind && check.status === 'passed')))) throw new Error('Unresolved checks cannot be accepted')
  }
  for (const row of task.findings) {
    if (!row.title?.trim() || !row.summary?.trim() || !row.goalImpact?.trim() || !['open', 'resolved', 'superseded'].includes(row.status)) throw new Error('Findings need a summary, goal impact and status')
    if (!Number.isInteger(row.createdRevision) || !Number.isInteger(row.updatedRevision)) throw new Error('Findings need task revisions')
    reference(row.evidenceIds, evidenceIds, 'finding evidence')
    reference(row.requirementIds || [], requirements, 'finding requirements'); reference(row.stepIds || [], steps, 'finding steps')
    if (row.actions?.some(action => !action.label?.trim())) throw new Error('Finding actions need a label')
  }
  for (const row of Object.values(task.briefProvenance)) {
    if (!['user', 'source', 'inference', 'legacy'].includes(row.origin) || !['explicit', 'provisional', 'confirmed', 'conflict'].includes(row.status) || !Number.isInteger(row.updatedRevision)) throw new Error('Invalid task understanding provenance')
    reference(row.evidenceIds || [], evidenceIds, 'understanding evidence')
    if (row.origin === 'inference' && row.status === 'confirmed') throw new Error('A system inference needs human confirmation')
  }
  const quality = task.quality
  if (!quality || typeof quality.enabled !== 'boolean' || typeof quality.needsAssessment !== 'boolean') throw new Error('Invalid quality policy')
  for (const key of ['purpose', 'depth', 'evidence', 'format', 'acceptance'] as const) if (typeof quality.brief[key] !== 'string') throw new Error('Invalid quality brief')
  const criterionIds = unique(quality.criteria, 'quality criteria')
  if (quality.criteria.length > 20) throw new Error('Too many quality criteria')
  for (const criterion of quality.criteria) {
    if (!criterion.title?.trim() || !['file', 'contains', 'json', 'review'].includes(criterion.kind)) throw new Error('Invalid quality criterion')
    if (criterion.kind !== 'review' && !criterion.path?.trim()) throw new Error('File criteria need a path')
    if (criterion.kind === 'contains' && !criterion.expected?.trim()) throw new Error('Contains criteria need expected text')
    reference(criterion.evidenceIds || [], evidenceIds, 'criterion evidence'); reference(criterion.requirementIds || [], requirements, 'criterion requirements')
  }
  unique(quality.checks, 'quality checks')
  for (const check of quality.checks) if (!criterionIds.has(check.id) || !['passed', 'failed', 'review'].includes(check.status) || !check.detail?.trim()) throw new Error('Invalid quality check')
  if (task.binding && (!task.binding.projectId?.trim() || !task.binding.moduleId?.trim())) throw new Error('Invalid workbench binding')
  if (task.pendingProjectSync && (!task.binding || !task.pendingProjectSync.id || !task.pendingProjectSync.text?.trim())) throw new Error('Invalid pending project requirement')
  if (!Array.isArray(task.recentChanges) || !Array.isArray(task.operationReceipts) || !Array.isArray(task.acceptedHistory)) throw new Error('Invalid task history')
}

export function reviseTask(current: ProfessionalTask, input: TaskPatch, revision: number, actor: TaskActor, options: TaskUpdateOptions = {}): ProfessionalTask {
  if (current.revision !== revision) throw new Error('任务已更新，请读取最新版本后重试。')
  for (const field of ['recentChanges', 'operationReceipts', 'acceptedHistory', 'migration'] as const) if (field in input) throw new Error('任务历史由宿主维护。')
  if (actor !== 'host' && ((!equal(input.binding ?? current.binding, current.binding)) || ('pendingProjectSync' in input && !equal(input.pendingProjectSync, current.pendingProjectSync)))) throw new Error('工作台绑定和同步状态由宿主维护。')
  const next = structuredClone({ ...current, ...input, sessionId: current.sessionId, schemaVersion: 2, revision: revision + 1, updatedAt: new Date().toISOString() }) as ProfessionalTask
  if (actor === 'agent' && next.brief.webDiligence !== current.brief.webDiligence) throw new Error('网络尽调授权只能由用户修改。')
  if (actor === 'agent' && (next.latestMessageId !== current.latestMessageId || next.latestRequest !== current.latestRequest)) throw new Error('实际用户请求由宿主输入适配器登记。')
  if (actor === 'agent' && !equal(next.directives, current.directives)) throw new Error('持久约束和撤销只能依据真实用户输入由宿主登记。')
  if (actor !== 'host' && next.deliverables.some(row => !equal(row.verification, current.deliverables.find(old => old.id === row.id)?.verification))) throw new Error('成果审核凭据由宿主实际文件检查登记。')
  if (actor === 'agent' && (next.quality.enabled !== current.quality.enabled || !equal(next.quality.template, current.quality.template))) throw new Error('专业深度和模板只能由用户修改。')
  if (actor === 'agent' && Object.entries(next.briefProvenance).some(([key, row]) => (row.origin === 'user' || row.status === 'confirmed') && !equal(row, current.briefProvenance[key]))) throw new Error('用户要求与确认来源由宿主登记。')
  if (actor !== 'host' && (next.questions.some(row => row.provider && !equal(row, current.questions.find(old => old.id === row.id))) || current.questions.some(row => row.provider && !equal(row, next.questions.find(value => value.id === row.id))) || (actor === 'agent' && next.questions.some(row => row.answerSource && !equal(row, current.questions.find(old => old.id === row.id)))))) throw new Error('原生问答的回答由用户输入适配器登记。')
  if (actor === 'agent' && next.deliverables.some(row => row.status === 'accepted' && current.deliverables.find(old => old.id === row.id)?.status !== 'accepted')) throw new Error('客户验收只能由用户记录。')
  if (actor === 'agent' && next.deliverables.some(row => row.signature === 'signed' && current.deliverables.find(old => old.id === row.id)?.signature !== 'signed')) throw new Error('签署授权只能由用户确认。')
  const newAcceptance = next.deliverables.some(row => row.status === 'accepted' && current.deliverables.find(old => old.id === row.id)?.status !== 'accepted')
  if (newAcceptance && (next.pendingProjectSync || (next.quality.enabled && (next.quality.needsAssessment || !next.quality.criteria.length || next.quality.criteria.some(criterion => !next.quality.checks.some(check => check.id === criterion.id && check.status === 'passed' && !check.stale)))))) throw new Error('专业检查或工作台要求同步尚未完成，不能记录验收。')
  if (next.deliverables.some(row => row.status === 'accepted' && current.deliverables.find(old => old.id === row.id)?.status !== 'accepted' && !verificationCurrent(next, row).ready)) throw new Error('当前成果、输入与规则尚无通过的宿主审核凭据，不能验收。')
  const changedBrief = Object.keys(next.brief).filter(key => !equal(next.brief[key as keyof TaskBrief], current.brief[key as keyof TaskBrief])) as Array<keyof TaskBrief>
  for (const key of changedBrief) {
    if (!input.briefProvenance?.[key] || equal(input.briefProvenance[key], current.briefProvenance[key])) next.briefProvenance[key] = { origin: actor === 'agent' ? 'inference' : 'user', status: actor === 'agent' ? 'provisional' : 'explicit', updatedRevision: next.revision, ...(next.latestMessageId ? { messageId: next.latestMessageId } : {}) }
    else next.briefProvenance[key].updatedRevision = next.revision
  }
  if (next.brief.objective) next.quality.brief.purpose = next.brief.objective
  const changedEvidence = new Set(next.evidence.filter(row => JSON.stringify(row) !== JSON.stringify(current.evidence.find(old => old.id === row.id))).map(row => row.id))
  for (const old of current.evidence) if (!next.evidence.some(row => row.id === old.id)) changedEvidence.add(old.id)
  let expanded = true
  while (expanded) {
    expanded = false
    for (const row of next.evidence) if (!changedEvidence.has(row.id) && row.dependsOn?.some(id => changedEvidence.has(id))) { changedEvidence.add(row.id); row.status = 'unverified'; expanded = true }
  }
  const briefChanged = changedBrief.length > 0
  const semanticBriefChanged = changedBrief.some(key => ['objective', 'scope', 'profession', 'basis', 'deadline'].includes(key))
  const presentationChanged = changedBrief.some(key => ['audience', 'formats', 'language'].includes(key))
  const requirementsChanged = !equal(next.requirements, current.requirements)
  const changedRequirements = new Set([...current.requirements, ...next.requirements].filter(row => JSON.stringify(next.requirements.find(value => value.id === row.id)) !== JSON.stringify(current.requirements.find(value => value.id === row.id))).map(row => row.id))
  const coverageChanged = JSON.stringify(next.coverage) !== JSON.stringify(current.coverage)
  const changedSteps = new Set<string>()
  for (const step of next.plan) {
    const briefAffected = step.briefDependencies ? step.briefDependencies.some(key => changedBrief.includes(key)) : semanticBriefChanged
    if (current.plan.some(old => old.id === step.id) && (briefAffected || step.requirementIds.some(id => changedRequirements.has(id)) || step.evidenceIds.some(id => changedEvidence.has(id)) || step.dependsOn.some(id => changedSteps.has(id)))) {
      changedSteps.add(step.id)
      if ((step.status === 'done' || step.status === 'working') && !(actor === 'host' && input.plan && step.id.startsWith('workbench:'))) step.status = 'needs_review'
    }
  }
  const affectedRefs = [...changedSteps].map(id => `plan:${id}`)
  for (const row of next.deliverables) {
    const old = current.deliverables.find(value => value.id === row.id)
    if (row.verification && !verificationCurrent(next, row).current) { row.verification.status = 'stale'; row.status = 'stale'; if (row.signature === 'signed') row.signature = 'pending' }
    const acceptedInputsChanged = old && (old.status === 'accepted' || old.signature === 'signed') && (row.path !== old.path || !equal(row.evidenceIds, old.evidenceIds) || !equal(row.requirementIds, old.requirementIds) || !equal(row.stepIds, old.stepIds) || row.checks.find(check => check.kind === 'file')?.fingerprint !== old.checks.find(check => check.kind === 'file')?.fingerprint)
    const briefAffected = row.briefDependencies ? row.briefDependencies.some(key => changedBrief.includes(key)) : semanticBriefChanged || presentationChanged
    const inputsChanged = row.requirementIds.some(id => changedRequirements.has(id)) || row.evidenceIds.some(id => changedEvidence.has(id)) || row.stepIds.some(id => changedSteps.has(id))
    if (old && (briefAffected || inputsChanged || acceptedInputsChanged)) {
      row.status = 'stale'
      if (!acceptedInputsChanged) row.checks = !semanticBriefChanged && !inputsChanged ? row.checks.filter(check => !['professional', 'writing', 'format'].includes(check.kind)) : []
      if (old.signature === 'signed') row.signature = 'pending'
      affectedRefs.push(`deliverable:${row.id}`)
    }
  }
  for (const finding of next.findings) {
    const old = current.findings.find(row => row.id === finding.id)
    const findingChanged = !equal(finding, old)
    finding.createdRevision = old?.createdRevision ?? next.revision
    finding.updatedRevision = equal(finding, old) ? old!.updatedRevision : next.revision
    if (finding.status === 'open' && finding.evidenceIds.some(id => changedEvidence.has(id)) && old && !findingChanged) {
      finding.status = 'superseded'; finding.updatedRevision = next.revision; affectedRefs.push(`finding:${finding.id}`)
    }
  }
  next.quality.checks = next.quality.checks.filter(check => next.quality.criteria.some(criterion => criterion.id === check.id))
  for (const check of next.quality.checks) {
    const old = current.quality.checks.find(row => row.id === check.id)
    const before = current.quality.criteria.find(row => row.id === check.id), after = next.quality.criteria.find(row => row.id === check.id)!
    if (old && before && equal(check, old) && qualityInputFingerprint(current, before) !== qualityInputFingerprint(next, after)) {
      check.stale = true; check.status = 'review'; check.detail = '相关要求或依据已变更，需复核。'; affectedRefs.push(`check:${check.id}`)
    } else if (!old || !equal(check, old)) { check.inputFingerprint = qualityInputFingerprint(next, after); check.checkedAt ||= next.updatedAt }
  }
  if ((semanticBriefChanged || presentationChanged || requirementsChanged || !equal(next.quality.brief, current.quality.brief) || !equal(next.quality.criteria, current.quality.criteria) || !equal(next.quality.template, current.quality.template)) && !(actor === 'agent' && input.quality?.needsAssessment === false)) next.quality.needsAssessment = true
  if ((actor === 'user' && (briefChanged || !equal(next.questions, current.questions))) || requirementsChanged || coverageChanged) next.needsAssessment = true
  next.acceptedHistory = structuredClone(current.acceptedHistory)
  for (const row of current.deliverables.filter(row => row.status === 'accepted' || row.signature === 'signed')) {
    if (!equal(row, next.deliverables.find(value => value.id === row.id)) && !next.acceptedHistory.some(entry => entry.revision === current.revision && equal(entry.deliverable, row))) next.acceptedHistory.push({ revision: current.revision, at: current.updatedAt || next.updatedAt, deliverable: structuredClone(row) })
  }
  for (const row of next.deliverables.filter(row => row.status === 'accepted' || row.signature === 'signed')) {
    const old = current.deliverables.find(value => value.id === row.id)
    if ((row.status === 'accepted' && old?.status !== 'accepted') || (row.signature === 'signed' && old?.signature !== 'signed')) next.acceptedHistory.push({ revision: next.revision, at: next.updatedAt, deliverable: structuredClone(row) })
  }
  const changedRefs = Object.keys(input).filter(key => !equal(current[key as keyof ProfessionalTask], next[key as keyof ProfessionalTask]))
  next.recentChanges = [...current.recentChanges, { sequence: next.revision, revision: next.revision, at: next.updatedAt, source: actor, summary: options.summary || (affectedRefs.length ? '任务理解或依据已更新，相关内容待复核。' : '任务记录已更新。'), changedRefs, affectedRefs, ...(options.operationId ? { operationId: options.operationId } : {}) }].slice(-100)
  validateTask(next)
  return next
}

/** Host adapters supply hashes obtained through the active executor's authorized filesystem. */
export function markChangedDeliverables(task: ProfessionalTask, fingerprints: Record<string, string | null>) {
  const deliverables = structuredClone(task.deliverables), quality = structuredClone(task.quality), changedPaths: string[] = []
  const normalize = (path: string) => path.replace(/\\/g, '/').toLowerCase()
  const lookup = (path: string) => Object.entries(fingerprints).find(([key]) => normalize(key) === normalize(path))
  for (const row of deliverables) {
    const actual = lookup(row.path), recorded = row.checks.find(check => check.kind === 'file')?.fingerprint
    if (actual && recorded && actual[1] !== recorded) { row.status = 'stale'; row.checks = []; if (row.verification) row.verification.status = 'stale'; changedPaths.push(row.path) }
    const checkedHashes = { ...fingerprints }
    if (row.verification) for (const [path, expected] of [[row.path, row.verification.artifactSha256], ...Object.entries(row.verification.sourceHashes)] as Array<[string, string | null]>) if (!lookup(path)) checkedHashes[path] = expected
    if (row.verification && row.verification.status !== 'stale' && !verificationCurrent(task, row, checkedHashes).current) { row.status = 'stale'; row.verification.status = 'stale'; row.checks = []; if (!changedPaths.includes(row.path)) changedPaths.push(row.path) }
  }
  for (const check of quality.checks) {
    const actual = check.path && lookup(check.path)
    if (actual && check.sha256 && actual[1] !== check.sha256) {
      const detail = actual[1] ? '实际文件已变更，需按当前内容重新检查。' : '已检查的文件不存在，需重新检查。'
      if (!check.stale || check.status !== 'review' || check.detail !== detail) { check.stale = true; check.status = 'review'; check.detail = detail; if (!changedPaths.includes(check.path!)) changedPaths.push(check.path!) }
    }
  }
  return { deliverables, quality, changedPaths }
}

export function createTaskStore(home: string) {
  const root = join(home, 'agent-pi', 'professional-tasks')
  const pathFor = (id: string) => join(root, `${createHash('sha256').update(id).digest('hex')}.json`)
  function atomicWrite(id: string, state: ProfessionalTask) {
    mkdirSync(root, { recursive: true })
    const path = pathFor(id), temporary = `${path}.${randomUUID()}.tmp`
    try { writeFileSync(temporary, `${JSON.stringify(state, null, 2)}\n`, { flag: 'wx', mode: 0o600 }); renameSync(temporary, path) }
    finally { if (existsSync(temporary)) unlinkSync(temporary) }
  }
  function locked<T>(id: string, action: () => T): T {
    mkdirSync(root, { recursive: true })
    const path = `${pathFor(id)}.lock`
    let descriptor: number
    try { descriptor = openSync(path, 'wx', 0o600) } catch (error: any) {
      if (error.code !== 'EEXIST') throw error
      let owner: { pid?: number } = {}
      try { owner = JSON.parse(readFileSync(path, 'utf8')) } catch {}
      let alive = true
      if (Number.isInteger(owner.pid) && owner.pid! > 0) try { process.kill(owner.pid!, 0) } catch (failure: any) { alive = failure.code !== 'ESRCH' }
      if (alive) throw new Error('任务正在更新，请读取最新版本后重试。')
      unlinkSync(path); descriptor = openSync(path, 'wx', 0o600)
    }
    try { writeFileSync(descriptor, JSON.stringify({ pid: process.pid })); return action() } finally { closeSync(descriptor); unlinkSync(path) }
  }
  function load(id: string, saveMigration: boolean): ProfessionalTask {
    if (!existsSync(pathFor(id))) return emptyTask(id)
    const text = readFileSync(pathFor(id), 'utf8'), raw = JSON.parse(text)
    if (raw.sessionId !== id) throw new Error('Task does not belong to this session')
    const state = migrateTask(raw)
    validateTask(state)
    if (raw.schemaVersion === 1 && saveMigration) {
      const backup = `${pathFor(id)}.schema-1.bak`
      if (!existsSync(backup)) writeFileSync(backup, text, { flag: 'wx', mode: 0o600 })
      atomicWrite(id, state)
    }
    return state
  }
  return {
    read(id: string): ProfessionalTask {
      if (!existsSync(pathFor(id))) return emptyTask(id)
      const raw = JSON.parse(readFileSync(pathFor(id), 'utf8'))
      return raw.schemaVersion === 1 ? locked(id, () => load(id, true)) : load(id, false)
    },
    update(id: string, input: TaskPatch, revision: number, actor: TaskActor, options: TaskUpdateOptions = {}) {
      return locked(id, () => {
        const current = load(id, true)
        const operationDigest = options.operationPayload === undefined ? taskOperationDigest({ input, revision }, actor) : taskOperationDigest(options.operationPayload, actor)
        if (options.operationId) {
          const receipt = current.operationReceipts.find(row => row.id === options.operationId)
          if (receipt) { if (receipt.digest !== operationDigest) throw new Error('同一操作编号不能提交不同内容。'); return current }
        }
        const state = reviseTask(current, input, revision, actor, options)
        if (options.operationId) state.operationReceipts = [...state.operationReceipts, { id: options.operationId, digest: operationDigest, revision: state.revision }].slice(-100)
        atomicWrite(id, state)
        return state
      })
    },
    replay(id: string, operationId: string, payload: unknown, actor: TaskActor = 'agent') {
      const task = this.read(id), receipt = task.operationReceipts.find(row => row.id === operationId)
      if (!receipt) return undefined
      if (receipt.digest !== taskOperationDigest(payload, actor)) throw new Error('同一操作编号不能提交不同内容。')
      return task
    },
    importLegacyQuality(id: string, legacy: Partial<TaskQuality> & { sessionId?: string; revision?: number }): ProfessionalTask {
      return locked(id, () => {
        const current = load(id, true)
        if (current.migration?.depth) return current
        if (legacy.sessionId && legacy.sessionId !== id) throw new Error('Depth state does not belong to this session')
        const untouched = equal(current.quality, emptyQuality()) || (!current.quality.enabled && !current.quality.criteria.length && !current.quality.brief.depth)
        const quality = untouched ? { ...emptyQuality(), ...structuredClone(legacy), brief: { ...emptyQuality().brief, ...legacy.brief } } : current.quality
        delete (quality as any).sessionId; delete (quality as any).revision
        const conflict = legacy.brief?.purpose && current.brief.objective && legacy.brief.purpose !== current.brief.objective ? legacy.brief.purpose : undefined
        const brief = current.brief.objective || !legacy.brief?.purpose ? current.brief : { ...current.brief, objective: legacy.brief.purpose }
        const next = reviseTask(current, { quality, brief }, current.revision, 'host', { summary: '已将专业深度记录归入本次任务。' })
        if (!current.brief.objective && next.brief.objective) next.briefProvenance.objective = { origin: 'legacy', status: 'provisional', updatedRevision: next.revision }
        next.migration = { ...current.migration, depth: true, ...(conflict ? { depthPurposeConflict: conflict } : {}) }
        atomicWrite(id, next)
        return next
      })
    },
    activity(id: string, cursor = 0) {
      const task = this.read(id), first = task.recentChanges[0]?.sequence ?? task.revision
      return { task, cursor: task.revision, reset: cursor > task.revision || (cursor > 0 && cursor < first - 1), changes: task.recentChanges.filter(row => row.sequence > cursor) }
    },
  }
}
