import { realpathSync } from 'node:fs'
import { basename, resolve } from 'node:path'
import { createHash } from 'node:crypto'
import { engineeringInputFingerprint, reviseEngineeringProject } from '../../../packages/engineering-core/index.ts'
import type { EngineeringCoverage, EngineeringDependency, EngineeringProject } from '../../../packages/engineering-core/index.ts'

export interface EngineeringObservation {
  kind: 'pdf' | 'cad'
  source: { path: string; sha256: string; title?: string }
  summary: string
  inventory: Array<{ id: string; title: string; locator: string; reason?: string }>
  observedIds: string[]
  parameterFingerprint?: string
  details?: unknown
}
const hash = (value: string) => createHash('sha256').update(value).digest('hex')
const key = (path: string) => process.platform === 'win32' ? path.toLowerCase() : path
export function normalizeObservation(value: EngineeringObservation): EngineeringObservation {
  if (!value || !['pdf', 'cad'].includes(value.kind) || !value.source?.path || !/^[a-f0-9]{64}$/i.test(value.source.sha256) || !value.summary?.trim()) throw new Error('读图记录需要实际来源、内容哈希及结果摘要。')
  if (!Array.isArray(value.inventory) || value.inventory.length > 20000 || !Array.isArray(value.observedIds)) throw new Error('读图目录超出范围。')
  const ids = new Set<string>()
  for (const row of value.inventory) {
    if (!row.id?.trim() || !row.title?.trim() || !row.locator?.trim() || ids.has(row.id)) throw new Error('读图目录需要唯一标识、名称与位置。')
    ids.add(row.id)
  }
  if (value.observedIds.some(id => !ids.has(id))) throw new Error('实际读取范围不在图纸目录中。')
  if (Buffer.byteLength(JSON.stringify(value)) > 8 * 1024 * 1024) throw new Error('读图记录过大，请只登记目录与结果引用。')
  return { ...structuredClone(value), source: { ...value.source, path: realpathSync(value.source.path), sha256: value.source.sha256.toLowerCase() } }
}
export function observedProject(current: EngineeringProject, observation: EngineeringObservation, cwd: string) {
  const path = observation.source.path
  const existing = current.sources.find(source => {
    if (!source.path) return false
    try { return key(realpathSync(resolve(cwd, source.path))) === key(path) } catch { return key(resolve(cwd, source.path)) === key(path) }
  })
  const sourceId = existing?.id || `drawing:${hash(key(path)).slice(0, 24)}`
  const source = { id: sourceId, title: observation.source.title || existing?.title || basename(path), path, sha256: observation.source.sha256, status: 'active' as const }
  const dependencies: EngineeringDependency[] = [{ kind: 'source', id: sourceId }]
  const prefix = `drawing:${observation.kind}:${hash(sourceId).slice(0, 16)}:`
  const sameVersion = existing?.sha256 === source.sha256
  const seen = new Set(observation.observedIds)
  const coverage: EngineeringCoverage[] = observation.inventory.map(row => {
    const id = prefix + row.id, previous = current.coverage.find(item => item.id === id)
    // Reading a page does not change a professional review or an explicit exclusion.
    if (sameVersion && previous && ['reviewed', 'excluded', 'missing'].includes(previous.status)) return previous
    if (sameVersion && previous && !seen.has(row.id)) return previous
    return { id, title: `${source.title} · ${row.title}`, required: true, status: !sameVersion && previous ? 'stale' : 'pending', dependencies,
      reason: [row.locator, row.reason, seen.has(row.id) ? observation.summary : sameVersion && previous?.reason ? previous.reason : '尚未逐项检查', '仍需专业复核'].filter(Boolean).join('；') }
  })
  const project = reviseEngineeringProject(current, { sources: [...current.sources.filter(row => row.id !== sourceId), source], coverage: [...current.coverage.filter(row => !row.id.startsWith(prefix)), ...coverage] }, current.revision)
  return { project, sourceId, dependencies, dependencyFingerprint: engineeringInputFingerprint(project, dependencies) }
}
