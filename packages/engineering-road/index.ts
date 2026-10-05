import { createHash } from 'node:crypto'
import type { EngineeringSourceRef, EngineeringIssue } from '../engineering-core/index.ts'

export interface RoadInterval {
  id: string
  /** Unique alignment + layer/material/work type scope. Cut and fill use distinct scopes. */
  scope: string
  startM: number
  endM: number
  startAreaM2: number | null
  endAreaM2: number | null
  middleAreaM2?: number | null
  middleStationM?: number
  method: 'average_end_area' | 'prismoidal'
  sources: EngineeringSourceRef[]
}
export interface RoadCoverageRange { id: string; scope: string; startM: number; endM: number; excluded?: boolean; reason?: string }
export interface RoadQuantityInput { schemaVersion: 1; intervals: RoadInterval[]; expectedRanges?: RoadCoverageRange[]; maxIntervalM?: number }
const finite = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value)
const range = (row: RoadCoverageRange | RoadInterval) => typeof row.id === 'string' && row.id.trim() && typeof row.scope === 'string' && row.scope.trim() && finite(row.startM) && finite(row.endM) && row.endM > row.startM
const overlap = (a: RoadCoverageRange | RoadInterval, b: RoadCoverageRange | RoadInterval) => a.scope === b.scope && a.startM < b.endM && b.startM < a.endM
const round = (value: number) => Number(value.toFixed(6))

/** Geometry integration only. This does not apply pay-item deductions, bulking or compaction factors. */
export function calculateRoadQuantities(input: RoadQuantityInput) {
  if (input?.schemaVersion !== 1 || !Array.isArray(input.intervals) || input.intervals.length > 10000) throw new Error('道路计算需要有限的分段断面清单。')
  if (input.maxIntervalM !== undefined && (!finite(input.maxIntervalM) || input.maxIntervalM <= 0)) throw new Error('最大断面间距必须为正数。')
  const issues: EngineeringIssue[] = []
  const add = (code: string, message: string, entityId?: string, severity: 'error' | 'warning' = 'error') => issues.push({ code, message, entityId, severity })
  const ids = new Set<string>()
  for (const row of input.intervals) {
    if (!range(row) || ids.has(row.id) || !['average_end_area', 'prismoidal'].includes(row.method) || !Array.isArray(row.sources)) throw new Error('道路分段标识、桩号范围或计算方法无效。')
    ids.add(row.id)
    for (const area of [row.startAreaM2, row.endAreaM2, row.middleAreaM2]) if (area !== undefined && area !== null && (!finite(area) || area < 0)) throw new Error('断面面积必须为非负有限值；挖方与填方分别计算。')
    for (const source of row.sources) if (!source?.sourceId?.trim() || !/^[a-f0-9]{64}$/i.test(source.sourceHash) || !source.locator?.trim()) throw new Error('断面来源需要源图标识、哈希与定位。')
  }
  const expected = input.expectedRanges || [], expectedIds = new Set<string>()
  if (!Array.isArray(expected) || expected.length > 10000) throw new Error('道路范围清单无效。')
  for (const row of expected) {
    if (!range(row) || expectedIds.has(row.id) || row.excluded !== undefined && typeof row.excluded !== 'boolean' || row.excluded && !row.reason?.trim()) throw new Error('范围清单需唯一标识、明确区间；排除项必须说明原因。')
    expectedIds.add(row.id)
  }
  for (let i = 0; i < expected.length; i++) for (let j = i + 1; j < expected.length; j++) if (overlap(expected[i], expected[j])) throw new Error('独立范围清单中的同类区间重叠，请先消除歧义。')
  const duplicate = new Set<string>()
  const ordered = [...input.intervals].sort((a, b) => a.scope.localeCompare(b.scope) || a.startM - b.startM)
  for (let i = 0; i < ordered.length; i++) for (let j = i + 1; j < ordered.length && ordered[j].scope === ordered[i].scope && ordered[j].startM < ordered[i].endM; j++) {
    duplicate.add(ordered[i].id); duplicate.add(ordered[j].id)
  }
  const rows = input.intervals.map(row => {
    const lengthM = row.endM - row.startM
    if (!row.sources.length) add('road_source_missing', '断面尚无实际图纸来源，暂不计入小计。', row.id)
    if (duplicate.has(row.id)) add('road_interval_overlap', '同一线路与工作范围存在重叠段，暂不重复累计。', row.id)
    if (expected.length && !expected.some(scope => !scope.excluded && scope.scope === row.scope && row.startM >= scope.startM && row.endM <= scope.endM)) add('road_outside_scope', '该分段超出已声明工作区间，或跨越排除区间；请拆分并核实。', row.id)
    if (input.maxIntervalM && lengthM > input.maxIntervalM) add('road_interval_too_long', '断面间距超过本次明确采用的上限，需补断面或复核。', row.id)
    let volumeM3: number | null = null, formula = ''
    if (row.startAreaM2 === null || row.startAreaM2 === undefined || row.endAreaM2 === null || row.endAreaM2 === undefined) add('road_area_missing', '起点或终点断面面积未知，不能按零面积计算。', row.id)
    else if (row.method === 'prismoidal') {
      if (row.middleAreaM2 === null || row.middleAreaM2 === undefined || !finite(row.middleStationM)) add('road_middle_missing', '拟柱体法需要明确中间断面面积及其桩号。', row.id)
      else if (Math.abs(row.middleStationM - (row.startM + row.endM) / 2) > 1e-8) add('road_middle_position', '中间断面不在区间中点，请拆分或更换有依据的计算方法。', row.id)
      else { volumeM3 = lengthM * (row.startAreaM2 + 4 * row.middleAreaM2 + row.endAreaM2) / 6; formula = `${lengthM} × (${row.startAreaM2} + 4 × ${row.middleAreaM2} + ${row.endAreaM2}) / 6` }
    } else { volumeM3 = lengthM * (row.startAreaM2 + row.endAreaM2) / 2; formula = `${lengthM} × (${row.startAreaM2} + ${row.endAreaM2}) / 2` }
    if (volumeM3 !== null && !Number.isFinite(volumeM3)) throw new Error('道路计算数值溢出。')
    const rowIssues = issues.filter(issue => issue.entityId === row.id)
    return { ...structuredClone(row), lengthM, volumeM3: volumeM3 === null ? null : round(volumeM3), formula, includedInSubtotal: volumeM3 !== null && !rowIssues.some(issue => issue.severity === 'error'), review: 'unreviewed' as const, issues: rowIssues }
  })
  const coverage = expected.map(scope => {
    if (scope.excluded) return { ...scope, gaps: [], status: 'excluded' as const }
    const intervals = rows.filter(row => row.includedInSubtotal && row.scope === scope.scope && row.startM >= scope.startM && row.endM <= scope.endM).sort((a, b) => a.startM - b.startM)
    const gaps: Array<{ startM: number; endM: number }> = []
    let end = scope.startM
    for (const row of intervals) { if (row.startM > end + 1e-8) gaps.push({ startM: end, endM: row.startM }); end = Math.max(end, row.endM) }
    if (end < scope.endM - 1e-8) gaps.push({ startM: end, endM: scope.endM })
    if (gaps.length) add('road_coverage_gap', `${scope.scope} 存在 ${gaps.length} 段未覆盖或尚未可靠计算的桩号区间。`, scope.id)
    return { ...scope, gaps, status: gaps.length ? 'partial' as const : 'calculated' as const }
  })
  if (!expected.length) add('road_inventory_missing', '尚无独立的线路及工作区间清单，不能判断全范围完整。', undefined, 'warning')
  const subtotals = [...new Set(rows.map(row => row.scope))].map(scope => ({ scope, knownVolumeM3: round(rows.filter(row => row.scope === scope && row.includedInSubtotal).reduce((sum, row) => sum + row.volumeM3!, 0)), includedIntervals: rows.filter(row => row.scope === scope && row.includedInSubtotal).length, unresolvedIntervals: rows.filter(row => row.scope === scope && !row.includedInSubtotal).length }))
  return { schemaVersion: 1, inputFingerprint: createHash('sha256').update(JSON.stringify(input)).digest('hex'), purpose: 'geometric' as const, unit: 'm3', rows, subtotals, coverage, coverageComplete: expected.length > 0 && coverage.every(row => row.status !== 'partial') && !issues.some(row => row.severity === 'error'), issues, limitations: ['断面积分为所选方法下的几何估算，需复核地形与断面间距。', '不包含合同扣减、松胀压实换算或采购损耗，不覆盖原始招标清单。'], review: 'unreviewed' as const }
}
