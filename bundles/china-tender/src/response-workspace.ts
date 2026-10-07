import { existsSync, readFileSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { resolve } from 'node:path'
import { isDeepStrictEqual } from 'node:util'
import type { ChinaTenderRequirement } from '../../../packages/china-tender/types.ts'
import type { EngineeringProject } from '../../../packages/engineering-core/types.ts'
import type { TenderRequirement } from '../../../packages/business-core/src/tender/types.ts'
import { getBusinessProject } from '../../../packages/business-projects/index.ts'
import { initTenderWorkspace, loadWorkspace, upsertWorkspaceSection, workspacePaths } from '../../tender-host/src/workspace.ts'

const persistedShape = <T>(value: T): T => JSON.parse(JSON.stringify(value))

/** Explicit bridge: the China rule assessment and chapter planning keep identical requirement IDs. */
export function syncChinaResponseWorkspace(cwd: string, engineering: EngineeringProject, requirements: ChinaTenderRequirement[]) {
  const prefix = 'china-tender:'
  if (!engineering.id.startsWith(prefix)) throw new Error('响应同步需要当前中国投标工作台项目，请先绑定项目。')
  const projectId = engineering.id.slice(prefix.length)
  const project = getBusinessProject(cwd, 'china-tender', projectId)
  if (!project) throw new Error('未找到当前中国投标工作台项目。')
  const mapped = requirements.map(row => {
    const source = engineering.sources.find(source => source.id === row.source.documentId)
    if (!source?.path) throw new Error(`要求 ${row.id} 缺已登记的原始文件路径。`)
    if (row.source.sha256 && row.source.sha256.toLowerCase() !== source.sha256.toLowerCase()) throw new Error(`要求 ${row.id} 与登记的来源版本不同，请先核对补遗。`)
    const actualHash = createHash('sha256').update(readFileSync(resolve(cwd, source.path))).digest('hex')
    if (actualHash !== source.sha256.toLowerCase()) throw new Error(`要求 ${row.id} 的原始文件已变化，请先重新登记并核对要求。`)
    if (source.status !== 'active' || row.source.status !== 'active') throw new Error(`要求 ${row.id} 来源不是当前有效版本，请先核对。`)
    const type: TenderRequirement['type'] = row.category === 'scored' ? 'evaluated' : row.category === 'other' ? 'technical' : row.category
    return {
      document: { id: source.id, name: source.title, path: source.path, kind: 'other' as const, sha256: source.sha256, revision: source.revision, supersedesIds: [], status: 'active' as const },
      requirement: { id: row.id, title: row.title, text: row.source.excerpt || row.title, type, criticality: ['qualification', 'mandatory'].includes(type) ? 'critical' as const : 'normal' as const, source: { documentId: source.id, page: row.source.page, clause: row.source.clause, excerpt: row.source.excerpt }, evidenceNeeded: [], status: 'open' as const },
    }
  })
  if (!existsSync(workspacePaths(cwd, projectId, 'china-tender').model)) initTenderWorkspace(cwd, projectId, { id: projectId, title: project.name, jurisdiction: 'CN' }, 'china-tender')
  const current = loadWorkspace(cwd, projectId, 'china-tender')
  const documents = new Map(current.documents.map(row => [row.id, row]))
  const records = new Map(current.requirements.map(row => [row.id, row]))
  // Explicit source changes also propagate when no new requirement is imported.
  // Missing sources are not inferred to have been deleted or retired.
  for (const source of engineering.sources) {
    const old = documents.get(source.id)
    if (!old) continue
    documents.set(source.id, { ...old, name: source.title, path: source.path || old.path, sha256: source.sha256, revision: source.revision, status: source.status })
  }
  for (const { document, requirement } of mapped) {
    documents.set(document.id, { ...documents.get(document.id), ...document, kind: documents.get(document.id)?.kind || document.kind, supersedesIds: documents.get(document.id)?.supersedesIds || [] })
    const old = records.get(requirement.id)
    const same = old && old.text === requirement.text && isDeepStrictEqual(old.source, persistedShape(requirement.source)) && current.documents.find(row => row.id === document.id)?.sha256 === document.sha256
    records.set(requirement.id, { ...old, ...requirement, evidenceNeeded: old?.evidenceNeeded || [], status: same ? old.status : 'open' })
  }
  // Repeated analysis of unchanged sources does not churn revision or invalidate capability packs.
  const patch = persistedShape({ documents: [...documents.values()], requirements: [...records.values()] })
  const changed = !isDeepStrictEqual(current.documents, patch.documents) || !isDeepStrictEqual(current.requirements, patch.requirements)
  const workspace = changed ? upsertWorkspaceSection(cwd, projectId, patch, { module: 'china-tender' }).workspace : current
  return { module: 'china-tender', projectId, revision: workspace.revision, requirementIds: requirements.map(row => row.id), changed, note: '已同步原文要求与已登记来源状态；评分分值、细则与章节须依据评标办法登记，资料支持不等于成稿复核。' }
}
