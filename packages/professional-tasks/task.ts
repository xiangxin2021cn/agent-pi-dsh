import { createHash, randomUUID } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import type { ProfessionalTask, TaskBrief, Evidence } from './types.ts'

export function emptyTask(sessionId: string): ProfessionalTask {
  return { schemaVersion: 1, sessionId, revision: 0, needsAssessment: true, latestRequest: '',
    brief: { objective: '', scope: '', audience: '', formats: [], language: '', deadline: '', profession: 'general', webDiligence: 'allowed',
      basis: { country: '', location: '', employer: '', procurement: '', funding: '', contract: '', measurement: '', standards: [], precedence: [] } },
    questions: [], evidence: [], requirements: [], coverage: [], plan: [], deliverables: [], assessment: '', updatedAt: '' }
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
  if (task.schemaVersion !== 1 || !task.sessionId || !Number.isInteger(task.revision)) throw new Error('Invalid task identity')
  if (!['general', 'tender', 'drawing', 'quantity', 'method', 'research', 'report', 'spreadsheet'].includes(task.brief.profession)) throw new Error('Unknown profession')
  if (!['ask', 'allowed', 'forbidden'].includes(task.brief.webDiligence)) throw new Error('Invalid diligence policy')
  for (const key of ['objective', 'scope', 'audience', 'language', 'deadline'] as const) if (typeof task.brief[key] !== 'string') throw new Error(`Invalid brief ${key}`)
  if (!Array.isArray(task.brief.formats) || task.brief.formats.some(value => typeof value !== 'string')) throw new Error('Invalid formats')
  const evidenceIds = unique(task.evidence, 'evidence')
  const requirements = unique(task.requirements, 'requirements')
  unique(task.coverage, 'coverage'); unique(task.questions, 'questions'); unique(task.deliverables, 'deliverables')
  const reference = (ids: string[], known: Set<string>, field: string) => {
    if (!Array.isArray(ids) || ids.some(id => !known.has(id))) throw new Error(`${field}: unknown reference`)
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
    reference(step.dependsOn, steps, 'plan dependencies must precede consumer')
    reference(step.evidenceIds, evidenceIds, 'plan evidence'); reference(step.requirementIds, requirements, 'plan requirements')
    if (!['pending', 'working', 'done', 'blocked', 'needs_review'].includes(step.status)) throw new Error('Invalid plan status')
    steps.add(step.id)
  }
  for (const row of task.deliverables) {
    reference(row.requirementIds, requirements, 'deliverable requirements'); reference(row.evidenceIds, evidenceIds, 'deliverable evidence'); reference(row.stepIds, steps, 'deliverable steps')
    if (!row.path || !['draft', 'reviewed', 'accepted', 'stale'].includes(row.status)) throw new Error('Invalid deliverable')
    if (!['not_required', 'pending', 'signed'].includes(row.signature)) throw new Error('Invalid signature status')
    if (!Array.isArray(row.checks) || row.checks.some(check => !['passed', 'failed', 'review'].includes(check.status) || !check.detail?.trim())) throw new Error('Checks need status and actual evidence')
    if (row.status === 'accepted' && (row.checks.some(check => check.status !== 'passed') || ['file', 'professional', 'writing'].some(kind => !row.checks.some(check => check.kind === kind && check.status === 'passed')))) throw new Error('Unresolved checks cannot be accepted')
  }
}

export function reviseTask(current: ProfessionalTask, input: Partial<Omit<ProfessionalTask, 'sessionId' | 'schemaVersion' | 'revision'>>, revision: number, actor: 'user' | 'agent'): ProfessionalTask {
  if (current.revision !== revision) throw new Error('任务已更新，请读取最新版本后重试。')
  const next = structuredClone({ ...current, ...input, sessionId: current.sessionId, schemaVersion: 1, revision: revision + 1, updatedAt: new Date().toISOString() }) as ProfessionalTask
  if (actor === 'agent' && next.brief.webDiligence !== current.brief.webDiligence) throw new Error('网络尽调授权只能由用户修改。')
  if (actor === 'agent' && next.deliverables.some(row => row.status === 'accepted' && current.deliverables.find(old => old.id === row.id)?.status !== 'accepted')) throw new Error('客户验收只能由用户记录。')
  if (actor === 'agent' && next.deliverables.some(row => row.signature === 'signed' && current.deliverables.find(old => old.id === row.id)?.signature !== 'signed')) throw new Error('签署授权只能由用户确认。')
  const changedEvidence = new Set(next.evidence.filter(row => JSON.stringify(row) !== JSON.stringify(current.evidence.find(old => old.id === row.id))).map(row => row.id))
  for (const old of current.evidence) if (!next.evidence.some(row => row.id === old.id)) changedEvidence.add(old.id)
  let expanded = true
  while (expanded) {
    expanded = false
    for (const row of next.evidence) if (!changedEvidence.has(row.id) && row.dependsOn?.some(id => changedEvidence.has(id))) { changedEvidence.add(row.id); row.status = 'unverified'; expanded = true }
  }
  const briefChanged = JSON.stringify(next.brief) !== JSON.stringify(current.brief)
  const requirementsChanged = JSON.stringify(next.requirements) !== JSON.stringify(current.requirements)
  const changedRequirements = new Set([...current.requirements, ...next.requirements].filter(row => JSON.stringify(next.requirements.find(value => value.id === row.id)) !== JSON.stringify(current.requirements.find(value => value.id === row.id))).map(row => row.id))
  const coverageChanged = JSON.stringify(next.coverage) !== JSON.stringify(current.coverage)
  const changedSteps = new Set<string>()
  for (const step of next.plan) {
    if (current.plan.some(old => old.id === step.id) && (briefChanged || step.requirementIds.some(id => changedRequirements.has(id)) || step.evidenceIds.some(id => changedEvidence.has(id)) || step.dependsOn.some(id => changedSteps.has(id)))) {
      changedSteps.add(step.id)
      if (step.status === 'done' || step.status === 'working') step.status = 'needs_review'
    }
  }
  for (const row of next.deliverables) {
    if (current.deliverables.some(old => old.id === row.id) && (briefChanged || row.requirementIds.some(id => changedRequirements.has(id)) || row.evidenceIds.some(id => changedEvidence.has(id)) || row.stepIds.some(id => changedSteps.has(id)))) { row.status = 'stale'; row.checks = [] }
  }
  if ((actor === 'user' && (briefChanged || JSON.stringify(next.questions) !== JSON.stringify(current.questions) || next.latestRequest !== current.latestRequest)) || requirementsChanged || coverageChanged) next.needsAssessment = true
  validateTask(next)
  return next
}

export function createTaskStore(home: string) {
  const root = join(home, 'agent-pi', 'professional-tasks')
  const pathFor = (id: string) => join(root, `${createHash('sha256').update(id).digest('hex')}.json`)
  return {
    read(id: string): ProfessionalTask {
      if (!existsSync(pathFor(id))) return emptyTask(id)
      const state = JSON.parse(readFileSync(pathFor(id), 'utf8')) as ProfessionalTask
      if (state.sessionId !== id) throw new Error('Task does not belong to this session')
      validateTask(state)
      return state
    },
    update(id: string, input: Parameters<typeof reviseTask>[1], revision: number, actor: 'user' | 'agent') {
      const state = reviseTask(this.read(id), input, revision, actor)
      mkdirSync(root, { recursive: true })
      const path = pathFor(id)
      const temporary = `${path}.${randomUUID()}.tmp`
      writeFileSync(temporary, `${JSON.stringify(state, null, 2)}\n`, { flag: 'wx', mode: 0o600 })
      renameSync(temporary, path)
      return state
    },
  }
}
