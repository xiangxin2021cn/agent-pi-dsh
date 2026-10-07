import { createHash } from 'node:crypto'
import { existsSync, readFileSync, realpathSync, statSync } from 'node:fs'
import { extname, isAbsolute, relative, resolve } from 'node:path'
import { listBusinessProjects } from '../../../packages/business-projects/index.ts'
import {
  auditTenderWorkspace, tenderMaterialIssues, TenderResponseReviewInputSchema,
  type TenderResponsePlan, type TenderWorkspace, type TenderSourceLocator,
  type TenderResponseReviewInput, type TenderResponseArtifactReview,
  type TenderCriterionRubric,
} from '../../../packages/business-core/src/tender/index.ts'
import { loadWorkspace, upsertWorkspaceSection, workspacePaths, type TenderWorkspaceModule } from './workspace.ts'
import { SAFE_PROJECT_ID } from './fsutil.ts'
import { inspectOfficeZip } from './deliverable-format.ts'
import { kbRoot, readKbChunk } from './kb.ts'
import { knowledgeApplicability, readKnowledgeVersion } from './knowledge-versions.ts'

type Check = { kind: string; status: 'passed' | 'review' | 'failed'; message: string }
type ResponseState = 'planned' | 'drafted' | 'reviewed' | 'needs_review' | 'stale' | 'blocked'
export interface TenderResponseCoverage {
  projectId: string
  module: TenderWorkspaceModule
  revision: number
  sourceCoverage: { complete: null; gaps: string[] }
  summary: { requirements: number; criteria: number; planned: number; drafted: number; evidenced: number; reviewed: number; stale: number; blocked: number }
  rows: Array<{
    id: string; kind: 'requirement' | 'criterion'; title: string; text?: string; rubric?: TenderCriterionRubric; mandatory: boolean; method?: string; weight?: number
    source: { title: string; path?: string; locator?: string; sourceHash?: string }
    responses: Array<{
      id: string; title: string; sectionId?: string; section?: string; path?: string; status: ResponseState; generationMode?: string
      evidence: Array<{ title: string; path?: string; locator?: string; status: 'ready' | 'needs_review' | 'blocked'; reason?: string }>
      checks: Check[]
    }>
    status: ResponseState | 'unplanned'; gaps: string[]
  }>
}

const hash = (value: string | Buffer) => createHash('sha256').update(value).digest('hex')
const key = (path: string) => resolve(path).replace(/\\/g, '/').toLowerCase()
const textExtensions = new Set(['.md', '.markdown', '.txt', '.csv', '.json', '.xml', '.html', '.htm', '.yaml', '.yml'])
function projectWorkspace(cwd: string, projectId: string, module: TenderWorkspaceModule) {
  if (!SAFE_PROJECT_ID.test(projectId)) throw new Error('Invalid projectId')
  return existsSync(workspacePaths(cwd, projectId, module).model) ? loadWorkspace(cwd, projectId, module) : undefined
}
function context(cwd: string, workspace: TenderWorkspace, module: TenderWorkspaceModule) {
  const projects = listBusinessProjects(cwd, module).filter(row => row.projectId === workspace.project.id)
  const roots = (projects.length ? projects.map(row => row.rootPath) : [cwd]).map(path => existsSync(path) ? realpathSync(path) : resolve(path))
  const inputs = [...workspace.documents.map(row => resolve(cwd, row.path)), ...projects.flatMap(row => row.inputPaths.map(path => resolve(cwd, path)))]
  const allowed = (path: string) => {
    const absolute = resolve(cwd, path)
    const actual = existsSync(absolute) ? realpathSync(absolute) : absolute
    return inputs.some(input => key(existsSync(input) ? realpathSync(input) : input) === key(actual)) || roots.some(root => {
      const child = relative(root, actual)
      return !child || !isAbsolute(child) && child !== '..' && !child.startsWith(`..\\`) && !child.startsWith('../')
    })
  }
  const fingerprints = new Map<string, string | null>()
  const fingerprint = (path: string) => {
    const absolute = resolve(cwd, path)
    if (!fingerprints.has(key(absolute))) fingerprints.set(key(absolute), allowed(absolute) && existsSync(absolute) && statSync(absolute).isFile() ? hash(readFileSync(absolute)) : null)
    return fingerprints.get(key(absolute))!
  }
  const visiblePath = (path?: string) => path && fingerprint(path) ? resolve(cwd, path) : undefined
  return { allowed, fingerprint, visiblePath }
}
function sourceLocation(source: TenderSourceLocator): string {
  return [source.page ? `第 ${source.page} 页` : '', source.sheet, source.clause, source.section, source.cell, source.blockId].filter(Boolean).join(' · ')
}
function reviewAsOf(workspace: TenderWorkspace, now = new Date().toISOString()) {
  return workspace.project.closingAt && Date.parse(workspace.project.closingAt) > Date.parse(now) ? workspace.project.closingAt : now
}
function knowledgeMaterial(citation: string, workspace: TenderWorkspace, asOf: string) {
  const match = /^\[kb:([a-z0-9][a-z0-9-]*)@([a-f0-9]{64}):([A-Za-z0-9][A-Za-z0-9_.()-]*)\]$/.exec(citation)
  if (!match) throw new Error('知识材料未固定版本。')
  const version = readKnowledgeVersion(kbRoot(), match[1], match[2])
  readKbChunk(match[1], match[3], match[2])
  if (version.entry.sourceKind === 'generated') throw new Error('生成样稿不能作为企业事实证明。')
  const applicability = knowledgeApplicability(version.entry, { region: workspace.project.jurisdiction, asOf: asOf.slice(0, 10) })
  if (applicability.status !== 'applicable') throw new Error(applicability.reason || '知识材料适用条件尚未确认。')
  return hash(JSON.stringify({ version: version.versionId, original: version.originalHash, manuscript: version.manuscriptHash }))
}

/** Fingerprint linked entities and exact files, not the unrelated workspace revision. */
export function tenderResponseFingerprints(cwd: string, workspace: TenderWorkspace, response: TenderResponsePlan, module: TenderWorkspaceModule = 'tender', ctx = context(cwd, workspace, module)): Record<string, string | null> {
  const result: Record<string, string | null> = {}
  const visited = new Set<string>()
  const add = (kind: string, id: string) => {
    const name = `${kind}:${id}`
    if (visited.has(name)) return
    visited.add(name)
    if (kind === 'file') { result[name] = ctx.fingerprint(id); return }
    if (kind === 'document') {
      const row = workspace.documents.find(value => value.id === id)
      const actual = row && ctx.fingerprint(row.path)
      result[name] = row && actual && row.status === 'active' ? hash(JSON.stringify({ id: row.id, revision: row.revision, status: row.status, sha256: actual })) : null
      return
    }
    if (kind === 'requirement') {
      const row = workspace.requirements.find(value => value.id === id)
      result[name] = row ? hash(JSON.stringify({ title: row.title, text: row.text, type: row.type, criticality: row.criticality, source: row.source, evidenceNeeded: row.evidenceNeeded })) : null
      if (row) add('document', row.source.documentId)
      return
    }
    if (kind === 'criterion') {
      const row = workspace.criteria.find(value => value.id === id)
      result[name] = row ? hash(JSON.stringify({ title: row.title, method: row.method, weight: row.weight, minimumScore: row.minimumScore, requirementIds: row.requirementIds, source: row.source, evidenceNeeded: row.evidenceNeeded, rubric: row.rubric })) : null
      if (row) { add('document', row.source.documentId); row.requirementIds.forEach(id => add('requirement', id)) }
    }
  }
  result.plan = hash(JSON.stringify({ title: response.title, requirementIds: response.requirementIds, criterionIds: response.criterionIds, deliverableId: response.deliverableId, responseSection: response.responseSection, evidenceRefs: response.evidenceRefs, evidenceArtifacts: response.evidenceArtifacts, chapter: response.chapter }))
  for (const id of response.requirementIds) add('requirement', id)
  for (const id of response.criterionIds) add('criterion', id)
  for (const source of response.evidenceRefs) add('document', source.documentId)
  for (const path of response.evidenceArtifacts ?? []) add('file', path)
  for (const row of response.chapter?.dependencies ?? []) add(row.kind, row.id)
  for (const material of response.chapter?.materials ?? []) {
    if (material.documentId) add('document', material.documentId)
    if (material.path) add('file', material.path)
    if (material.knowledgeCitation) {
      try { result[`knowledge:${material.id}`] = knowledgeMaterial(material.knowledgeCitation, workspace, reviewAsOf(workspace)) }
      catch { result[`knowledge:${material.id}`] = null }
    }
  }
  return Object.fromEntries(Object.entries(result).sort(([a], [b]) => a.localeCompare(b)))
}

function sameFingerprints(left: Record<string, string | null>, right: Record<string, string | null>) {
  return Object.keys(left).length === Object.keys(right).length && Object.entries(left).every(([name, value]) => right[name] === value)
}
function artifactText(path: string, bytes: Buffer): string | null {
  if (textExtensions.has(extname(path).toLowerCase())) return bytes.toString('utf8')
  if (extname(path).toLowerCase() !== '.docx') return null
  const xml = inspectOfficeZip(bytes).get('word/document.xml')?.toString('utf8')
  if (!xml) throw new Error('DOCX 缺少正文部件。')
  const unescape = (text: string) => text.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, '&')
  return [...xml.matchAll(/<w:p\b[^>]*>([\s\S]*?)<\/w:p>/g)].map(match => {
    const heading = /<w:pStyle\b[^>]*w:val="(?:Heading|heading)([1-6])"/.exec(match[1])
    const text = [...match[1].matchAll(/<w:t\b[^>]*>([\s\S]*?)<\/w:t>/g)].map(value => unescape(value[1])).join('')
    return (heading ? '#'.repeat(Number(heading[1])) + ' ' : '') + text
  }).join('\n')
}
function locationVerified(text: string | null, location: TenderResponseReviewInput['location']): boolean {
  if (text === null || location.page && !location.lineStart && !location.section) return false
  const lines = text.split(/\r?\n/)
  if (location.lineStart) return lines.slice(location.lineStart - 1, location.lineEnd ?? location.lineStart).join('\n').includes(location.excerpt)
  if (!location.section) return false
  const start = lines.findIndex(line => line.replace(/^\s*#{1,6}\s*/, '').trim() === location.section!.trim())
  if (start < 0) return false
  const heading = /^(#{1,6})\s/.exec(lines[start])
  // Unstyled headings have no deterministic section boundary: require paragraph/line location.
  if (!heading) return false
  let end = start + 1
  while (end < lines.length) {
    const next = /^(#{1,6})\s/.exec(lines[end])
    if (next && next[1].length <= heading[1].length) break
    end++
  }
  return lines.slice(start, end).join('\n').includes(location.excerpt)
}

export function captureTenderResponseDependencies(cwd: string, projectId: string, responseId: string, module: TenderWorkspaceModule = 'tender') {
  const workspace = projectWorkspace(cwd, projectId, module)
  const response = workspace?.responses.find(row => row.id === responseId)
  if (!workspace || !response) throw new Error('投标响应不存在。')
  const snapshot = { capturedAt: new Date().toISOString(), fingerprints: tenderResponseFingerprints(cwd, workspace, response, module) }
  upsertWorkspaceSection(cwd, projectId, { responses: workspace.responses.map(row => row.id === responseId ? { ...row, dependencySnapshot: snapshot } : row) }, { trustedResponseState: true, module })
  return { snapshot, responseCoverage: getTenderResponseCoverage(cwd, projectId, module) }
}

export function verifyTenderResponse(cwd: string, projectId: string, responseId: string, review: TenderResponseReviewInput, module: TenderWorkspaceModule = 'tender') {
  const input = TenderResponseReviewInputSchema.parse(review)
  const workspace = projectWorkspace(cwd, projectId, module)
  const response = workspace?.responses.find(row => row.id === responseId)
  if (!workspace || !response) throw new Error('投标响应不存在。')
  const artifactPath = resolve(cwd, input.artifactPath), ctx = context(cwd, workspace, module)
  if (!ctx.allowed(artifactPath) || !existsSync(artifactPath) || !statSync(artifactPath).isFile()) throw new Error('响应成果必须是本项目可访问的实际文件。')
  const bytes = readFileSync(artifactPath)
  if (!bytes.length) throw new Error('响应成果为空文件。')
  const text = artifactText(artifactPath, bytes)
  const located = locationVerified(text, input.location)
  if (text !== null && !located && (input.location.lineStart || input.location.section)) throw new Error('摘录未在当前成果的指定行或可识别章节中找到；DOCX 行号指正文段落。')
  const pointReviews = input.pointReviews?.map(point => {
    if (!response.chapter?.pointResponses.some(row => row.criterionId === point.criterionId && row.pointId === point.pointId)) throw new Error(`评分子点 ${point.criterionId}:${point.pointId} 未在本章节计划中登记。`)
    const pointLocated = locationVerified(text, point.location)
    if (text !== null && !pointLocated && (point.location.lineStart || point.location.section)) throw new Error(`评分子点 ${point.criterionId}:${point.pointId} 的摘录未在当前成果指定位置找到。`)
    if (text !== null && input.location.section && !locationVerified(text, { section: input.location.section, excerpt: point.location.excerpt })) throw new Error(`评分子点 ${point.criterionId}:${point.pointId} 的摘录不在本响应登记的章节内。`)
    return { ...point, locationStatus: pointLocated ? 'verified' as const : 'manual_review' as const }
  })
  const receipt: TenderResponseArtifactReview = { ...input, pointReviews, artifactPath, artifactSha256: hash(bytes), checkedAt: new Date().toISOString(), locationStatus: located ? 'verified' : 'manual_review', dependencyFingerprints: tenderResponseFingerprints(cwd, workspace, response, module) }
  upsertWorkspaceSection(cwd, projectId, { responses: workspace.responses.map(row => row.id === responseId ? { ...row, artifactReview: receipt } : row) }, { trustedResponseState: true, module })
  return { review: receipt, responseCoverage: getTenderResponseCoverage(cwd, projectId, module) }
}

/** Read-only shared projection. Missing legacy data is empty; malformed data remains an error. */
export function getTenderResponseCoverage(cwd: string, projectId: string, module: TenderWorkspaceModule = 'tender'): TenderResponseCoverage {
  const workspace = projectWorkspace(cwd, projectId, module)
  const result: TenderResponseCoverage = {
    projectId, module, revision: workspace?.revision ?? 0,
    sourceCoverage: { complete: null, gaps: ['以下仅统计已登记要求和评分项；未登记文件、未读页面及补遗覆盖须另行核对。'] },
    summary: { requirements: workspace?.requirements.length ?? 0, criteria: workspace?.criteria.length ?? 0, planned: workspace?.responses.length ?? 0, drafted: 0, evidenced: 0, reviewed: 0, stale: 0, blocked: 0 }, rows: [],
  }
  if (!workspace) return result
  const ctx = context(cwd, workspace, module), now = new Date().toISOString()
  const audit = auditTenderWorkspace(workspace, now)
  const asOf = reviewAsOf(workspace, now)
  const responseViews = new Map<string, TenderResponseCoverage['rows'][number]['responses'][number]>(workspace.responses.map(response => {
    const checks: Check[] = [], evidence: TenderResponseCoverage['rows'][number]['responses'][number]['evidence'] = []
    const fingerprints = tenderResponseFingerprints(cwd, workspace, response, module, ctx)
    const receipt = response.artifactReview
    const baseline = receipt?.dependencyFingerprints ?? response.dependencySnapshot?.fingerprints
    const staleDependencies = !!baseline && !sameFingerprints(baseline, fingerprints)
    const actualHash = receipt ? ctx.fingerprint(receipt.artifactPath) : null
    const staleArtifact = !!receipt && actualHash !== receipt.artifactSha256
    checks.push({ kind: 'dependencies', status: staleDependencies ? 'review' : Object.values(fingerprints).some(value => !value) ? 'failed' : 'passed', message: staleDependencies ? '相关要求、材料或工程依据已变化，需复核本响应。' : Object.values(fingerprints).some(value => !value) ? '存在缺失、失效或不可访问的依据。' : '已登记依赖可读取；不表示资料覆盖完整。' })
    for (const issue of audit.issues.filter(row => row.entityType === 'response' && row.entityId === response.id)) checks.push({ kind: issue.code, status: issue.severity === 'error' ? 'failed' : 'review', message: issue.message })
    for (const material of response.chapter?.materials ?? []) {
      const document = workspace.documents.find(row => row.id === material.documentId)
      const path = material.path ?? document?.path
      const reasons = tenderMaterialIssues(material, asOf)
      if (material.documentId && document?.status !== 'active') reasons.push('材料来源未登记或已失效。')
      if (path && !ctx.fingerprint(path)) reasons.push('材料文件缺失或不可访问。')
      if (material.knowledgeCitation) try { knowledgeMaterial(material.knowledgeCitation, workspace, asOf) } catch (error) { reasons.push(error instanceof Error ? error.message : '知识材料不可读取。') }
      evidence.push({ title: material.title, path: ctx.visiblePath(path), locator: material.knowledgeCitation, status: reasons.length ? 'needs_review' : 'ready', reason: reasons.join(' ') || '已记录材料主体、用途、可用性及授权复核；未由程序独立验真。' })
    }
    for (const source of response.evidenceRefs) {
      const document = workspace.documents.find(row => row.id === source.documentId), path = document?.path
      evidence.push({ title: document?.name ?? source.documentId, path: ctx.visiblePath(path), locator: sourceLocation(source), status: document?.status === 'active' && path && ctx.fingerprint(path) ? 'ready' : 'blocked', reason: '仅核对来源可读性；是否支持章节结论由内容审阅负责。' })
    }
    for (const path of [...(response.evidenceArtifacts ?? []), ...(response.chapter?.dependencies ?? []).filter(row => row.kind === 'file').map(row => row.id)]) evidence.push({ title: path, path: ctx.visiblePath(path), status: ctx.fingerprint(path) ? 'ready' : 'blocked', reason: '工程/证据文件存在性检查，不代替计算及专业复核。' })
    if (!evidence.length || evidence.some(row => row.status !== 'ready')) checks.push({ kind: 'evidence', status: 'review', message: '所选材料或工程依据仍有缺口。' })
    if (!response.chapter) checks.push({ kind: 'chapter', status: 'review', message: '旧响应尚未建立结构化章节计划。' })
    if (receipt) {
      checks.push({ kind: 'artifact', status: staleArtifact ? 'failed' : 'passed', message: staleArtifact ? '成稿文件缺失或已修改，原复核记录不再适用。' : '当前成果字节与登记版本一致。' })
      checks.push({ kind: 'location', status: receipt.locationStatus === 'verified' ? 'passed' : 'review', message: receipt.locationStatus === 'verified' ? '摘录已在当前文件的指定章节/正文行定位；页码及版式仍需另行检查。' : '仅记录文件版本和人工定位；此格式或页码尚未完成自动定位。' })
      checks.push({ kind: 'content', status: receipt.contentReview.verdict === 'supported' ? 'passed' : 'review', message: `${receipt.contentReview.reviewer}：${receipt.contentReview.note}（登记的内容审阅，不是程序独立判断）` })
    } else checks.push({ kind: 'artifact', status: 'review', message: '尚未登记实际成稿及定位复核。' })
    for (const point of response.chapter?.pointResponses ?? []) {
      const pointReview = receipt?.pointReviews?.find(row => row.criterionId === point.criterionId && row.pointId === point.pointId)
      const title = workspace.criteria.find(row => row.id === point.criterionId)?.rubric?.points.find(row => row.id === point.pointId)?.text ?? `${point.criterionId}:${point.pointId}`
      checks.push({ kind: `rubric_point:${point.criterionId}:${point.pointId}`, status: pointReview?.locationStatus === 'verified' && pointReview.verdict === 'supported' ? 'passed' : 'review', message: pointReview ? `评分子点“${title}”：${pointReview.locationStatus === 'verified' ? '已定位当前文件摘录' : '位置尚待核对'}；${pointReview.verdict === 'supported' ? '已记录支持判断' : '内容仍需复核'}。${pointReview.note}` : `评分子点“${title}”尚未登记当前成稿的逐点定位与支持复核。` })
    }
    let status: ResponseState = response.status === 'blocked' || checks.some(row => row.status === 'failed') ? 'blocked' : 'planned'
    if (staleDependencies || staleArtifact) status = 'stale'
    else if (status !== 'blocked' && receipt && actualHash) status = checks.every(row => row.status === 'passed') && response.chapter ? 'reviewed' : 'needs_review'
    if (receipt && actualHash) result.summary.drafted++
    if (evidence.length && evidence.every(row => row.status === 'ready')) result.summary.evidenced++
    if (status === 'reviewed') result.summary.reviewed++
    if (status === 'stale') result.summary.stale++
    if (status === 'blocked') result.summary.blocked++
    return [response.id, { id: response.id, title: response.title, sectionId: response.chapter?.id, section: response.chapter?.title ?? response.responseSection, path: ctx.visiblePath(receipt?.artifactPath), status, generationMode: response.chapter?.generationMode, evidence, checks }] as const
  }))
  const row = (entity: TenderWorkspace['requirements'][number] | TenderWorkspace['criteria'][number], kind: 'requirement' | 'criterion'): TenderResponseCoverage['rows'][number] => {
    const document = workspace.documents.find(value => value.id === entity.source.documentId)
    const responses = workspace.responses.filter(response => (kind === 'requirement' ? response.requirementIds : response.criterionIds).includes(entity.id)).map(response => responseViews.get(response.id)!)
    const gaps = audit.issues.filter(issue => issue.entityType === kind && issue.entityId === entity.id).map(issue => issue.message)
    for (const response of responses) gaps.push(...response.checks.filter(check => check.status !== 'passed').map(check => check.message))
    if (!responses.length) gaps.push('尚未建立响应计划。')
    let status: TenderResponseCoverage['rows'][number]['status'] = 'unplanned'
    if (responses.length) status = responses.some(value => value.status === 'stale') ? 'stale' : responses.some(value => value.status === 'blocked') ? 'blocked' : responses.every(value => value.status === 'reviewed') && !gaps.length ? 'reviewed' : responses.some(value => value.status === 'needs_review') || gaps.length ? 'needs_review' : responses.some(value => value.status === 'drafted') ? 'drafted' : 'planned'
    return { id: entity.id, kind, title: entity.title, text: 'text' in entity ? entity.text : entity.rubric?.text ?? entity.source.excerpt, ...('rubric' in entity ? { rubric: entity.rubric } : {}), mandatory: 'type' in entity ? ['mandatory', 'qualification'].includes(entity.type) : entity.method === 'pass_fail', ...('method' in entity ? { method: entity.method, weight: entity.weight } : {}), source: { title: document?.name ?? entity.source.documentId, path: ctx.visiblePath(document?.path), locator: sourceLocation(entity.source), sourceHash: document && ctx.fingerprint(document.path) || undefined }, responses, status, gaps: [...new Set(gaps)] }
  }
  result.rows = [...workspace.requirements.map(entity => row(entity, 'requirement')), ...workspace.criteria.map(entity => row(entity, 'criterion'))]
  return result
}
