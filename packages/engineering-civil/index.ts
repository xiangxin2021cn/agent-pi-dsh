import { createHash } from 'node:crypto'
import type { EngineeringIssue, EngineeringSourceRef } from '../engineering-core/index.ts'
import type { CivilCalculationInput, CivilCalculationResult, CivilEvidence, CivilObject, CivilRow, CivilKind, CivilUnit, PdfCalibrationInput } from './types.ts'
export type * from './types.ts'

const VERSION = 'civil-geometry-v1' as const
const kinds = ['pipe', 'drain', 'road_layer', 'rectangular', 'count']
const issue = (code: string, message: string, entityId?: string): EngineeringIssue => ({ code, severity: 'warning', message, ...(entityId ? { entityId } : {}) })
const scale = (unit: CivilUnit) => unit === 'm' ? 1 : unit === 'mm' ? 0.001 : NaN
const finite = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value)
const text = (value: unknown): value is string => typeof value === 'string' && !!value.trim()
const outputUnit = (kind: CivilKind): CivilRow['unit'] => ['pipe', 'drain'].includes(kind) ? 'm' : kind === 'count' ? 'item' : 'm3'

/** The host checks actual file bytes; this kernel requires matching version and explicit source dependencies. */
function sourceIssues(refs: EngineeringSourceRef[], evidence: CivilEvidence, id: string): EngineeringIssue[] {
  if (!Array.isArray(refs) || !refs.length) return [issue('source-missing', '缺少实际资料的来源和定位，当前对象不能计量。', id)]
  return refs.flatMap(ref => {
    if (!ref || !text(ref.sourceId) || !text(ref.locator) || !/^[a-f\d]{64}$/i.test(ref.sourceHash || '')) return [issue('source-reference', '来源必须具有 sourceId、真实 SHA-256 和具体定位。', id)]
    const source = evidence.sources.find(value => value.id === ref.sourceId)
    if (!source?.path || source.status !== 'active' || source.sha256.toLowerCase() !== ref.sourceHash.toLowerCase()) return [issue('source-version', `来源 ${ref.sourceId} 未登记本地文件、已失效或版本不一致。`, id)]
    if (!evidence.dependencies.some(value => value.kind === 'source' && value.id === ref.sourceId)) return [issue('source-dependency', `缺少来源 ${ref.sourceId} 的明确 source 依赖，不能登记为可追溯计算。`, id)]
    return []
  })
}

function rowFor(physicalId: string, kind: CivilKind, title: string, objects: CivilObject[]): CivilRow {
  const object = objects[0]
  const quantityBasis = kind === 'road_layer' ? 'plan_area_thickness' : kind === 'rectangular' ? 'rectangular_solid' : kind === 'count' ? 'count' : object && (object.kind === 'pipe' || object.kind === 'drain') && object.dimension === '2d' ? 'plan_2d' : object && (object.kind === 'pipe' || object.kind === 'drain') && object.dimension === '3d' ? 'spatial_3d' : 'unknown'
  return { physicalId, kind, title, objectIds: objects.map(value => value.id), sources: objects.flatMap(value => value.sources || []), status: 'blocked', quantity: null, knownPortion: null, unit: outputUnit(kind), quantityBasis, purpose: 'geometric', reviewStatus: 'needs_review', algorithmVersion: VERSION, formula: '', measures: {}, issues: [] }
}

function measure(row: CivilRow, object: CivilObject) {
  const reject = (code: string, message: string) => { row.issues.push(issue(code, message, row.physicalId)) }
  if (object.kind === 'count') {
    row.formula = 'count = explicit documented count'
    if (!Number.isSafeInteger(object.count) || object.count! < 0) return reject('count-unknown', '构筑物数量未知或不是非负安全整数；不按零计。')
    row.quantity = object.count
    return
  }
  const multiplier = scale(object.unit)
  if (!Number.isFinite(multiplier)) return reject('unit-unknown', '必须明确采用 m 或 mm，不推测单位。')
  if (object.kind === 'pipe' || object.kind === 'drain') {
    row.formula = object.dimension === '3d' ? 'L = sum(sqrt(dx² + dy² + dz²)) on consecutive known vertices, converted to m' : 'L = sum(sqrt(dx² + dy²)) on consecutive known vertices, converted to m'
    if (!['2d', '3d'].includes(object.dimension)) return reject('dimension-unknown', '必须明确按平面 2D 或空间 3D 长度计量。')
    if (object.pathKind !== 'polyline') return reject('path-unsupported', '当前仅支持已确认折线路径；曲线及未明路径保留缺口。')
    if (!Array.isArray(object.points) || object.points.length < 2 || object.points.length > 2000) return reject('path-points', '路径需 2 至 2000 个顶点；未知顶点用 null 明示间断。')
    const dimension = object.dimension === '3d' ? 3 : 2, missing: number[] = []
    const points = object.points.map((point, index) => {
      if (!Array.isArray(point) || point.length !== dimension || point.some(value => !finite(value))) { missing.push(index); return null }
      return point.map(value => value * multiplier)
    })
    const segments: Array<{ from: number; to: number; lengthM: number }> = []
    for (let index = 1; index < points.length; index++) {
      const a = points[index - 1], b = points[index]
      if (!a || !b) continue
      const lengthM = Math.hypot(...a.map((value, axis) => b[axis] - value))
      if (!Number.isFinite(lengthM)) return reject('numeric-range', '坐标差超出数值计算范围。')
      segments.push({ from: index - 1, to: index, lengthM })
    }
    const length = segments.reduce((total, segment) => total + segment.lengthM, 0)
    row.measures = { dimension: object.dimension, segments, missingVertexIndices: missing }
    if (missing.length) {
      reject('path-discontinuity', '路径存在未知或无效顶点，仅保留连续已知段小计，不跨越间断连接。')
      if (segments.some(segment => segment.lengthM > 0)) row.knownPortion = length
    } else if (length <= 0) reject('path-degenerate', '折线总长为零，不能据此认定已覆盖实际管沟。')
    else row.quantity = length
    return
  }
  if (object.kind === 'rectangular') {
    row.formula = 'V = length × width × height × unitToMeters³'
    if (object.voids !== 'none') return reject('voids-unresolved', '矩形构件必须明确无洞；有洞或洞口状态未知暂不支持，不默认实体满算。')
    const dimensions = [object.length, object.width, object.height]
    if (dimensions.some(value => !finite(value) || value <= 0)) return reject('dimensions-unknown', '长宽高需为明确的正数；不得猜测挖深或将缺失尺寸计零。')
    row.measures = { lengthM: object.length! * multiplier, widthM: object.width! * multiplier, heightM: object.height! * multiplier }
    row.quantity = dimensions.reduce<number>((total, value) => total * value! * multiplier, 1)
    return
  }
  if (object.kind !== 'road_layer') return reject('kind-unsupported', '不支持的工程对象类型。')
  row.formula = 'A = abs(sum(x_i*y_(i+1) - x_(i+1)*y_i))/2; V = A × explicit thickness (SI)'
  if (object.holes !== 'none' || object.surface !== 'planar') return reject('surface-unsupported', '结构层须明确为无洞平面；洞口、未知洞口或复杂曲面保留缺口，不按无洞平面处理。')
  if (!Array.isArray(object.outline) || object.outline.length < 4 || object.outline.length > 301 || object.outline.some(point => !Array.isArray(point) || point.length !== 2 || point.some(value => !finite(value)))) return reject('polygon-points', '需要显式闭合的 3 至 300 边平面多边形；首尾点须相同。')
  const first = object.outline[0], points = object.outline.map(point => [(point[0] - first[0]) * multiplier, (point[1] - first[1]) * multiplier])
  const extent = Math.max(1, ...points.flat().map(Math.abs)), epsilon = extent * 1e-12, areaEpsilon = extent * extent * 1e-12
  const same = (a: number[], b: number[]) => Math.hypot(a[0] - b[0], a[1] - b[1]) <= epsilon
  if (!same(points[0], points.at(-1)!)) return reject('polygon-open', '多边形未显式闭合，不自动补边。')
  const cross = (a: number[], b: number[], c: number[]) => (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0])
  const on = (a: number[], b: number[], c: number[]) => Math.abs(cross(a, b, c)) <= areaEpsilon && c[0] >= Math.min(a[0], b[0]) - epsilon && c[0] <= Math.max(a[0], b[0]) + epsilon && c[1] >= Math.min(a[1], b[1]) - epsilon && c[1] <= Math.max(a[1], b[1]) + epsilon
  const intersects = (a: number[], b: number[], c: number[], d: number[]) => {
    const abC = cross(a, b, c), abD = cross(a, b, d), cdA = cross(c, d, a), cdB = cross(c, d, b)
    return (abC > areaEpsilon && abD < -areaEpsilon || abC < -areaEpsilon && abD > areaEpsilon) && (cdA > areaEpsilon && cdB < -areaEpsilon || cdA < -areaEpsilon && cdB > areaEpsilon) || on(a, b, c) || on(a, b, d) || on(c, d, a) || on(c, d, b)
  }
  const edges = points.length - 1
  for (let a = 0; a < edges; a++) {
    if (same(points[a], points[a + 1])) return reject('polygon-degenerate', '多边形包含零长边或重复点。')
    for (let b = a + 1; b < edges; b++) {
      if (b === a + 1 || a === 0 && b === edges - 1) continue
      if (intersects(points[a], points[a + 1], points[b], points[b + 1])) return reject('polygon-self-intersection', '多边形存在自交、非相邻边接触或重叠，不能可靠算量。')
    }
  }
  const area = Math.abs(points.slice(0, -1).reduce((total, point, index) => total + point[0] * points[index + 1][1] - points[index + 1][0] * point[1], 0)) / 2
  if (!finite(area) || area <= areaEpsilon) return reject('polygon-degenerate', '多边形面积退化或超出数值范围。')
  row.measures = { areaM2: area }
  const thickness = object.thickness
  if (!thickness || !finite(thickness.value) || thickness.value <= 0 || !finite(scale(thickness.unit))) return reject('thickness-unknown', '结构层厚度需为有依据的明确正数和单位；已得面积不代替缺失体积。')
  row.measures.thicknessM = thickness.value * scale(thickness.unit)
  row.quantity = area * (row.measures.thicknessM as number)
}

export function calculateCivil(input: CivilCalculationInput, evidence: CivilEvidence): CivilCalculationResult {
  if (!input?.catalog || !text(input.catalog.id) || !Array.isArray(input.catalog.items) || input.catalog.items.length > 1000 || !Array.isArray(input.objects) || input.objects.length > 200) throw new Error('道路市政计算需要独立 catalog（最多 1000 项）和 objects（最多 200 项）。')
  const catalogIssues = sourceIssues(input.catalog.sources, evidence, input.catalog.id)
  const byIdentity = new Map<string, CivilObject[]>(), expected = new Map<string, typeof input.catalog.items>(), objectIds = new Set<string>(), duplicateIds = new Set<string>()
  for (const object of input.objects) {
    if (!text(object.id) || !text(object.physicalId) || !kinds.includes(object.kind)) throw new Error('工程对象需要 id、稳定 physicalId 和受支持 kind。')
    if (objectIds.has(object.id)) duplicateIds.add(object.id)
    objectIds.add(object.id)
    byIdentity.set(object.physicalId, [...(byIdentity.get(object.physicalId) || []), object])
  }
  for (const item of input.catalog.items) {
    if (!text(item.physicalId) || !kinds.includes(item.kind) || !['include', 'exclude'].includes(item.disposition)) throw new Error('独立目录项目需要 physicalId、kind 和 include/exclude。')
    expected.set(item.physicalId, [...(expected.get(item.physicalId) || []), item])
  }
  const rows: CivilRow[] = []
  for (const [physicalId, entries] of expected) {
    const item = entries[0], objects = byIdentity.get(physicalId) || [], row = rowFor(physicalId, item.kind, item.title, objects)
    row.sources.push(...(item.sources || []))
    row.issues.push(...catalogIssues, ...sourceIssues(item.sources, evidence, physicalId))
    if (entries.length > 1) row.issues.push(issue('catalog-duplicate', '独立目录重复列出同一实体，需先核对目录。', physicalId))
    if (item.disposition === 'exclude') {
      if (!text(item.reason)) row.issues.push(issue('exclusion-reason', '排除对象必须说明理由；不能据此隐藏未算项。', physicalId))
      if (objects.length) row.issues.push(issue('excluded-object-present', '对象同时被排除并提供计算输入，需明确范围后计入。', physicalId))
      row.measures = { exclusionReason: item.reason || null }
      if (!row.issues.length) row.status = 'excluded'
    } else if (!objects.length) {
      row.status = 'missing'; row.issues.push(issue('object-missing', '独立目录中的对象缺少算量输入，保持未算状态。', physicalId))
    } else {
      if (objects.length > 1 || objects.some(object => duplicateIds.has(object.id))) row.issues.push(issue('physical-duplicate', '同一实体/记录被重复提供，不能相加或静默选择一份。', physicalId))
      if (objects.some(object => object.kind !== item.kind)) row.issues.push(issue('kind-conflict', '对象专业类型与独立目录不一致。', physicalId))
      row.issues.push(...objects.flatMap(object => sourceIssues(object.sources, evidence, physicalId)))
      if (!row.issues.length) {
        measure(row, objects[0])
        if (row.quantity !== null && !finite(row.quantity) || row.knownPortion !== null && !finite(row.knownPortion)) { row.quantity = row.knownPortion = null; row.issues.push(issue('numeric-range', '结果超出数值范围，不能计入小计。', physicalId)) }
        row.status = row.quantity !== null ? 'calculated' : row.knownPortion !== null ? 'partial' : 'blocked'
      }
    }
    rows.push(row)
  }
  for (const [physicalId, objects] of byIdentity) if (!expected.has(physicalId)) {
    const row = rowFor(physicalId, objects[0].kind, objects[0].title, objects)
    row.status = 'unlisted'; row.issues.push(issue('object-unlisted', '对象不在独立目录，待核对归属与遗漏后计入；不自动扩充覆盖分母。', physicalId)); rows.push(row)
  }
  const totals: CivilCalculationResult['totals'] = []
  const groups = new Map(rows.filter(row => row.status !== 'excluded' && row.status !== 'unlisted').map(row => [`${row.kind}:${row.quantityBasis}`, { kind: row.kind, quantityBasis: row.quantityBasis }]))
  for (const { kind, quantityBasis } of groups.values()) {
    const items = rows.filter(row => row.kind === kind && row.quantityBasis === quantityBasis && row.status !== 'excluded' && row.status !== 'unlisted')
    const complete = items.filter(row => row.quantity !== null), partial = items.filter(row => row.knownPortion !== null)
    const completeSubtotal = complete.length ? complete.reduce((sum, row) => sum + row.quantity!, 0) : null
    const knownPartialSubtotal = partial.length ? partial.reduce((sum, row) => sum + row.knownPortion!, 0) : null
    const knownSubtotal = completeSubtotal === null && knownPartialSubtotal === null ? null : (completeSubtotal || 0) + (knownPartialSubtotal || 0)
    if (knownSubtotal !== null && !finite(knownSubtotal)) throw new Error('几何小计超出数值范围。')
    totals.push({ kind, unit: outputUnit(kind), quantityBasis, completeSubtotal, knownPartialSubtotal, knownSubtotal, incomplete: items.some(row => row.status !== 'calculated') })
  }
  const count = (status: CivilRow['status']) => rows.filter(row => row.status === status).length
  const coverage = { declared: expected.size, included: [...expected.values()].filter(items => items[0].disposition === 'include').length, excluded: count('excluded'), calculated: count('calculated'), partial: count('partial'), incomplete: count('partial') + count('blocked') + count('missing'), unlisted: count('unlisted'), completeWithinDeclaredCatalog: false }
  coverage.completeWithinDeclaredCatalog = coverage.included > 0 && coverage.incomplete === 0 && coverage.unlisted === 0 && catalogIssues.length === 0
  const issues = [...new Map([...catalogIssues, ...rows.flatMap(row => row.issues)].map(value => [JSON.stringify(value), value])).values()]
  if (!input.catalog.items.length) issues.push(issue('catalog-empty', '尚无独立预期对象目录，不能确认任何图纸覆盖。', input.catalog.id))
  return { schemaVersion: 1, action: 'calculate', algorithmVersion: VERSION, reviewStatus: 'needs_review', catalogId: input.catalog.id, rows, totals, coverage, issues }
}

export function calibratePdf(input: PdfCalibrationInput, evidence: CivilEvidence) {
  if (!input || !input.reference || !input.viewport) throw new Error('PDF 标定需要同一视口上的实际标注依据。')
  const issues = [...sourceIssues([input.source], evidence, 'calibration'), ...sourceIssues([input.reference.source], evidence, 'calibration')]
  const reference = input.reference, viewport = input.viewport
  if (!Number.isSafeInteger(input.page) || input.page < 1 || reference.page !== input.page || input.source?.sourceId !== reference.source?.sourceId || input.source?.sourceHash?.toLowerCase() !== reference.source?.sourceHash?.toLowerCase() || !text(viewport.id) || viewport.id !== reference.viewportId) issues.push(issue('calibration-frame', '标定两点和已知标注必须来自同一文件版本、同一页和同一视口。'))
  if (!finite(viewport.width) || !finite(viewport.height) || viewport.width <= 0 || viewport.height <= 0 || !['pixels', 'normalized'].includes(input.coordinateSpace)) issues.push(issue('calibration-viewport', '必须明确视口宽高和 pixels/normalized 坐标，不能用页面 DPI 猜比例。'))
  const validPoint = (point: unknown): point is [number, number] => Array.isArray(point) && point.length === 2 && point.every(finite) && point[0] >= 0 && point[1] >= 0 && point[0] <= (input.coordinateSpace === 'normalized' ? 1 : viewport.width) && point[1] <= (input.coordinateSpace === 'normalized' ? 1 : viewport.height)
  if (!validPoint(reference.start) || !validPoint(reference.end)) issues.push(issue('calibration-points', '标定端点必须位于当前视口坐标范围内。'))
  if (!finite(reference.realLength) || reference.realLength <= 0 || !finite(scale(reference.unit)) || !text(reference.label)) issues.push(issue('calibration-dimension', '需要明确的正数标注长度、m/mm 单位及原标注文字；未知尺寸不能标定。'))
  let metersPerViewportPixel: number | null = null, viewportDistance: number | null = null
  if (!issues.length) {
    viewportDistance = Math.hypot((reference.end[0] - reference.start[0]) * (input.coordinateSpace === 'normalized' ? viewport.width : 1), (reference.end[1] - reference.start[1]) * (input.coordinateSpace === 'normalized' ? viewport.height : 1))
    if (!finite(viewportDistance) || viewportDistance <= 0) issues.push(issue('calibration-degenerate', '标定端点重合或距离无效。'))
    else { metersPerViewportPixel = reference.realLength! * scale(reference.unit) / viewportDistance; if (!finite(metersPerViewportPixel) || metersPerViewportPixel <= 0 || !finite(metersPerViewportPixel * viewport.width) || !finite(metersPerViewportPixel * viewport.height)) { metersPerViewportPixel = null; issues.push(issue('calibration-range', '标定比例超出数值范围。')) } }
  }
  return { schemaVersion: 1, action: 'calibrate_pdf', algorithmVersion: VERSION, reviewStatus: 'needs_review', status: metersPerViewportPixel === null ? 'blocked' : 'calibrated', basis: structuredClone(input), calibrationId: createHash('sha256').update(JSON.stringify(input)).digest('hex'), viewportDistance, metersPerViewportPixel, metersPerNormalizedX: metersPerViewportPixel === null ? null : metersPerViewportPixel * viewport.width, metersPerNormalizedY: metersPerViewportPixel === null ? null : metersPerViewportPixel * viewport.height, formula: 'scale = documentedLengthMeters / distanceInSameViewportPixels; normalized coordinates first multiply X by viewport width, Y by viewport height', scope: '仅适用于所记录的同页同版本视口。不是像素识别、全图量取、DPI推定比例或工程审核；不得用于另一详图比例、非均匀缩放、透视照片或不同裁剪视口。', issues }
}
