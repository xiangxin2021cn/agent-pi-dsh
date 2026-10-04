import { createHash } from 'node:crypto'
import { inspectDeliverable } from '../../tender-host/src/deliverable-format.ts'
import { auditProjectCitations, extractCitationTokens, resolveSourceCitation, verifyCitationToken } from '../../tender-host/src/citations.ts'
import { projectForBoundSession } from '../../tender-host/src/orchestration.ts'
import { officialProjectDir } from '../../tender-host/src/outputs.ts'
import { resolve } from 'node:path'
import { inspectWriting } from '../../../packages/professional-tasks/quality.ts'
import { qualityInputFingerprint } from '../../../packages/professional-tasks/task.ts'
import { buildArtifactVerification, deliverableEvidence } from '../../../packages/professional-tasks/verification.ts'
import type { Deliverable, ProfessionalTask, QualityCriterion } from '../../../packages/professional-tasks/types.ts'

/** A receipt is based on actual authorized reads, not a model's completion report. */
export async function verifyTaskDeliverable(fs: any, cwd: string, task: ProfessionalTask, original: Deliverable, signal?: AbortSignal): Promise<Deliverable> {
  if (!fs) throw new Error('主执行者的授权文件系统不可用，不能签发审核凭据。')
  const row = structuredClone(original), sourceHashes: Record<string, string | null> = {}, unresolved: string[] = []
  const cache = new Map<string, { bytes: Uint8Array; sha256: string; text: string | null; evidence: string; inspected: boolean }>()
  let artifactText: string | null = null
  const read = async (path: string, inspect = true) => {
    signal?.throwIfAborted()
    const old = cache.get(path)
    if (old && (!inspect || old.inspected)) return old
    if (old) { const content = await inspectDeliverable(old.bytes, path); Object.assign(old, { text: content.text, evidence: content.evidence, inspected: true }); return old }
    const target = await fs.resolve(path, { cwd, signal }), stat = await fs.stat(target, signal)
    if (!stat || stat.type !== 'file') throw new Error(`实际文件不存在：${path}`)
    const bytes = await fs.readBytes(target, signal, 32 * 1024 * 1024)
    if (!bytes.length) throw new Error(`实际文件为空：${path}`)
    const sha256 = createHash('sha256').update(bytes).digest('hex'), content = inspect ? await inspectDeliverable(bytes, path) : { text: null, evidence: '已读取实际来源字节。' }
    const value = { bytes, sha256, text: content.text, evidence: content.evidence, inspected: inspect }
    cache.set(path, value)
    return value
  }
  const checks = row.checks.filter(value => !['file', 'writing'].includes(value.kind))
  let artifactSha256: string | null = null
  try {
    const actual = await read(row.path)
    artifactSha256 = actual.sha256
    artifactText = actual.text
    const previous = row.checks.find(value => value.kind === 'file')?.fingerprint
    if (previous && previous !== artifactSha256) checks.length = 0
    for (let index = checks.length - 1; index >= 0; index--) if (checks[index].fingerprint !== artifactSha256) checks.splice(index, 1)
    checks.push({ kind: 'file', status: 'passed', detail: actual.evidence, fingerprint: artifactSha256 })
    const writing = actual.text === null ? null : inspectWriting(actual.text, task.brief.profession)
    checks.push({ kind: 'writing', status: writing && !writing.findings.length ? 'passed' : 'review', detail: writing ? writing.findings.length ? JSON.stringify(writing.findings) : '已检查实际正文的套话、内部说明和重复；专业准确性仍需明确复核。' : '正文尚不能自动检查。', fingerprint: artifactSha256 })
  } catch (error) { signal?.throwIfAborted(); checks.push({ kind: 'file', status: 'failed', detail: (error as Error).message }) }
  for (const evidence of deliverableEvidence(task, row).filter(value => value.sourcePath)) {
    try { sourceHashes[evidence.sourcePath!] = (await read(evidence.sourcePath!, false)).sha256 }
    catch (error) { signal?.throwIfAborted(); sourceHashes[evidence.sourcePath!] = null; unresolved.push((error as Error).message) }
  }
  const criteria: QualityCriterion[] = [...(task.quality.enabled ? task.quality.criteria : []), ...task.requirements.filter(value => row.requirementIds.includes(value.id) && value.checkSpec).map(value => value.checkSpec!)]
  for (const criterion of criteria) {
    if (criterion.kind === 'review') {
      const old = task.quality.checks.find(value => value.id === criterion.id)
      if (!old || old.status !== 'passed' || old.stale || old.inputFingerprint !== qualityInputFingerprint(task, criterion)) unresolved.push(`${criterion.title}：专业评审尚未按当前依据通过。`)
      continue
    }
    try {
      const path = criterion.path || row.path, actual = await read(path)
      if (path !== row.path) sourceHashes[path] = actual.sha256
      if (criterion.kind === 'contains' && !actual.text?.includes(criterion.expected!)) throw new Error(`${criterion.title}：实际文件中未找到约定内容。`)
      if (criterion.kind === 'json') JSON.parse(actual.text || '')
    } catch (error) { signal?.throwIfAborted(); unresolved.push((error as Error).message) }
  }
  const tokens = extractCitationTokens(artifactText || '')
  if (tokens.length) {
    const project = task.binding?.cwd && projectForBoundSession(task.binding.cwd, task.sessionId)
    if (!project) unresolved.push('实际成果含引用，尚无项目原始依据定位及独立支持复核。')
    else {
      const pathKey = (path: string) => resolve(task.binding!.cwd!, path).replace(/\\/g, '/').toLowerCase()
      const artifactPath = pathKey(row.path), audit = auditProjectCitations(task.binding!.cwd!, project, { persist: false })
      const issues = [...audit.orphans, ...(audit.support?.issues || [])].filter(value => pathKey(value.file) === artifactPath)
      unresolved.push(...issues.map(value => `引用第${value.line}行 ${value.token}：${value.reason}`))
      if (!artifactPath.startsWith(pathKey(officialProjectDir(task.binding!.cwd!, project.projectId)) + '/') || !/\.md$/i.test(row.path)) unresolved.push('当前引用成果尚未纳入独立支持审核范围，不能用可定位性代替结论支持。')
      for (const token of tokens) {
        const issue = verifyCitationToken(task.binding!.cwd!, project, token)
        if (issue) unresolved.push(`引用第${token.line}行 ${token.raw}：${issue}`)
        if (token.kind === 'kb' && !token.versionId) unresolved.push(`引用未固定知识版本：${token.raw}`)
        if (token.kind === 'src') {
          const path = resolveSourceCitation(task.binding!.cwd!, project, token.path!)
          if (path) try { sourceHashes[path] = (await read(path, false)).sha256 }
          catch (error) { signal?.throwIfAborted(); sourceHashes[path] = null; unresolved.push((error as Error).message) }
        }
      }
    }
  }
  for (const [path, inspected] of cache) {
    signal?.throwIfAborted()
    const target = await fs.resolve(path, { cwd, signal }), bytes = await fs.readBytes(target, signal, 32 * 1024 * 1024)
    if (createHash('sha256').update(bytes).digest('hex') !== inspected.sha256) unresolved.push(`文件在审核过程中变化，请按最新字节重新审核：${path}`)
  }
  row.checks = checks
  row.verification = buildArtifactVerification(task, row, { artifactSha256, sourceHashes, checks, unresolved })
  row.status = row.verification.status === 'passed' ? original.status === 'accepted' ? 'accepted' : 'reviewed' : original.status === 'accepted' || original.status === 'stale' ? 'stale' : 'draft'
  return row
}
