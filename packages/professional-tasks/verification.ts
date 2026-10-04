import { createHash } from 'node:crypto'
import { isDeepStrictEqual } from 'node:util'
import type { ArtifactVerification, Deliverable, ProfessionalTask } from './types.ts'

export const DELIVERY_RULE_VERSION = 'professional-delivery/v1'
const digest = (value: unknown) => createHash('sha256').update(JSON.stringify(value)).digest('hex')
const key = (path: string) => path.replace(/\\/g, '/').toLowerCase()

export function deliverableEvidence(task: ProfessionalTask, row: Deliverable) {
  const ids = new Set([...row.evidenceIds, ...task.requirements.filter(value => row.requirementIds.includes(value.id)).flatMap(value => value.evidenceIds)])
  let expanded = true
  while (expanded) { expanded = false; for (const evidence of task.evidence.filter(value => ids.has(value.id))) for (const id of evidence.dependsOn || []) if (!ids.has(id)) { ids.add(id); expanded = true } }
  return task.evidence.filter(value => ids.has(value.id))
}

export function deliverableInputFingerprint(task: ProfessionalTask, row: Deliverable): string {
  return digest({ brief: task.brief, directives: task.directives.filter(value => value.status === 'active' && value.kind !== 'request'),
    requirements: task.requirements.filter(value => value.mandatory || row.requirementIds.includes(value.id)), evidence: deliverableEvidence(task, row),
    steps: row.stepIds.map(id => task.plan.find(value => value.id === id)).map(value => value && ({ id: value.id, title: value.title, evidenceIds: value.evidenceIds, requirementIds: value.requirementIds })),
    quality: { enabled: task.quality.enabled, criteria: task.quality.criteria, brief: { ...task.quality.brief, purpose: task.brief.objective || task.quality.brief.purpose }, template: task.quality.template },
    references: { evidenceIds: row.evidenceIds, requirementIds: row.requirementIds, stepIds: row.stepIds } })
}

/** Host-only construction; callers obtain actual bytes through the executor's authorized filesystem. */
export function buildArtifactVerification(task: ProfessionalTask, row: Deliverable, input: { artifactSha256: string | null; sourceHashes: Record<string, string | null>; checks: Deliverable['checks']; unresolved?: string[]; ruleVersion?: string }): ArtifactVerification {
  const unresolved = [...(input.unresolved || [])]
  if (!input.artifactSha256) unresolved.push('没有可核验的实际成果版本。')
  for (const kind of ['file', 'professional', 'writing'] as const) if (!input.checks.some(value => value.kind === kind && value.status === 'passed' && value.fingerprint === input.artifactSha256)) unresolved.push(`${kind}：当前成果尚未通过检查。`)
  for (const requirement of task.requirements.filter(value => value.mandatory)) if (!row.requirementIds.includes(requirement.id) || !input.checks.some(value => value.kind === 'coverage' && value.status === 'passed' && value.fingerprint === input.artifactSha256)) unresolved.push(`尚未核验必需要求：${requirement.title}`)
  for (const evidence of deliverableEvidence(task, row)) {
    if (evidence.status !== 'verified' || evidence.applicable !== true) unresolved.push(`依据尚未核实：${evidence.title}`)
    if (evidence.kind === 'source' && (!evidence.sourcePath || !evidence.sourceHash)) unresolved.push(`原始依据缺少实际文件版本：${evidence.title}`)
    if (evidence.sourcePath) {
      const actual = Object.entries(input.sourceHashes).find(([path]) => key(path) === key(evidence.sourcePath!))?.[1]
      if (!evidence.sourceHash || actual !== evidence.sourceHash) unresolved.push(`来源版本不一致或无法核验：${evidence.title}`)
      if (key(evidence.sourcePath) === key(row.path)) unresolved.push(`生成成果不能作为自身的原始依据：${evidence.title}`)
    }
  }
  if (task.pendingProjectSync) unresolved.push('任务要求尚未同步到项目。')
  if (task.needsAssessment) unresolved.push('最新任务目标或要求尚未评估。')
  if (task.quality.enabled && (task.quality.needsAssessment || !task.quality.criteria.length)) unresolved.push('专业深度尚未形成当前明确的检查规则。')
  for (const check of input.checks) if (check.status !== 'passed') unresolved.push(check.detail)
  return { ruleVersion: input.ruleVersion || DELIVERY_RULE_VERSION, artifactSha256: input.artifactSha256, taskRevision: task.revision,
    inputFingerprint: deliverableInputFingerprint(task, row), sourceHashes: { ...input.sourceHashes }, checks: structuredClone(input.checks), unresolved: [...new Set(unresolved)],
    status: input.checks.some(value => value.status === 'failed') ? 'failed' : unresolved.length ? 'review' : 'passed', checkedAt: new Date().toISOString() }
}

export function verificationCurrent(task: ProfessionalTask, row: Deliverable, actualHashes?: Record<string, string | null>) {
  const value = row.verification, reasons: string[] = []
  if (!value) return { current: false, ready: false, reasons: ['尚无宿主审核凭据。'] }
  if (value.ruleVersion !== DELIVERY_RULE_VERSION) reasons.push('审核规则版本已变化。')
  if (value.inputFingerprint !== deliverableInputFingerprint(task, row)) reasons.push('用户要求、约束或输入依据已变化。')
  if (!value.artifactSha256 || row.checks.find(check => check.kind === 'file')?.fingerprint !== value.artifactSha256 || !isDeepStrictEqual(row.checks, value.checks)) reasons.push('成果版本或检查结果已变化。')
  if (actualHashes) for (const [path, expected] of [[row.path, value.artifactSha256], ...Object.entries(value.sourceHashes)] as Array<[string, string | null]>) {
    const actual = Object.entries(actualHashes).find(([candidate]) => key(candidate) === key(path))
    if (!actual || actual[1] !== expected || expected === null) reasons.push(`实际文件版本无法确认：${path}`)
  }
  const current = !reasons.length && value.status !== 'stale'
  const policyReady = !task.needsAssessment && !task.pendingProjectSync && (!task.quality.enabled || !task.quality.needsAssessment && task.quality.criteria.length > 0 && task.quality.criteria.every(criterion => task.quality.checks.some(check => check.id === criterion.id && check.status === 'passed' && !check.stale)))
  return { current, ready: current && policyReady && value.status === 'passed' && !value.unresolved.length, reasons }
}
