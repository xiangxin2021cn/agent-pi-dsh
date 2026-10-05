import { createHash } from 'node:crypto'
import { identity, insertMatrix, multiply, ocsMatrix } from './matrix.ts'
import type { CadIndex, CadInstance, CadIssue, CadLibrary, CadPair, CadPoint, CadQuery, CadRecord } from './types.ts'
export * from './types.ts'
export { transformPoint } from './matrix.ts'

type Raw = { type: string; section: string; block?: string; pairs: CadPair[] }
// The existing native model uses a process-global working database during decoding.
// Serialize that narrow operation so simultaneous conversations cannot cross-bind entities.
const nativeReads = new WeakMap<CadLibrary, Promise<void>>()
const value = (r: { pairs: CadPair[] }, code: number): unknown => r.pairs.find(p => p.code === code)?.value
const str = (r: { pairs: CadPair[] }, code: number, fallback = ''): string => String(value(r, code) ?? fallback)
const num = (r: { pairs: CadPair[] }, code: number, fallback = 0): number => {
  const result = Number(value(r, code) ?? fallback)
  if (!Number.isFinite(result)) throw new Error(`Invalid DXF numeric group ${code}.`)
  return result
}
const point = (r: { pairs: CadPair[] }, code: number): CadPoint => ({ x: num(r, code), y: num(r, code + 10), z: num(r, code + 20) })
const normal = (r: { pairs: CadPair[] }): CadPoint => value(r, 210) === undefined ? { x: 0, y: 0, z: 1 } : point(r, 210)
const auxiliary = new Set(['VERTEX', 'SEQEND'])
const ocsTypes = new Set(['ARC', 'CIRCLE', 'LWPOLYLINE', 'TEXT', 'ATTRIB', 'ATTDEF', 'INSERT', 'SOLID', 'TRACE', 'HATCH'])
const wcsTypes = new Set(['LINE', 'POINT', 'MTEXT', 'ELLIPSE', 'SPLINE', '3DFACE', 'RAY', 'XLINE'])
const unitNames = ['unspecified', 'inch', 'foot', 'mile', 'millimetre', 'centimetre', 'metre', 'kilometre', 'microinch', 'mil', 'yard', 'angstrom', 'nanometre', 'micron', 'decimetre', 'decametre', 'hectometre', 'gigametre', 'astronomical-unit', 'light-year', 'parsec', 'US-survey-foot', 'US-survey-inch', 'US-survey-yard', 'US-survey-mile']
const unitScales: Record<number, number> = { 1: .0254, 2: .3048, 3: 1609.344, 4: .001, 5: .01, 6: 1, 7: 1000, 8: .0000000254, 9: .0000254, 10: .9144, 11: 1e-10, 12: 1e-9, 13: 1e-6, 14: .1, 15: 10, 16: 100, 17: 1e9, 21: 1200 / 3937, 22: 100 / 3937, 23: 3600 / 3937, 24: 6336000 / 3937 }
const counts = (rows: CadRecord[], field: 'type' | 'layer' | 'layout') => {
  const result: Record<string, number> = Object.create(null)
  for (const row of rows) result[row[field]] = (result[row[field]] || 0) + 1
  return result
}
function readRecords(bytes: Uint8Array, library: CadLibrary): Raw[] {
  const filer = library.AcDbDxfFiler.fromBuffer(bytes), rows: Raw[] = []
  let current: Raw | undefined, section = '', block: string | undefined, eof = false
  const flush = () => {
    if (!current) return
    if (current.type === 'SECTION') { section = str(current, 2); current.section = section }
    if (current.type === 'BLOCK') { block = str(current, 2); current.block = block }
    rows.push(current)
    if (current.type === 'ENDSEC') section = ''
    if (current.type === 'ENDBLK') block = undefined
  }
  while (!filer.atEof) {
    const pair = filer.readItem() as CadPair | undefined
    if (!pair) break
    if (pair.code === 0) {
      flush()
      const type = String(pair.value).trim().toUpperCase()
      current = { type, section, block, pairs: [] }
      if (type === 'EOF') { eof = true; break }
    } else current?.pairs.push({ code: pair.code, value: typeof pair.value === 'bigint' ? pair.value.toString() : ArrayBuffer.isView(pair.value) ? Array.from(new Uint8Array(pair.value.buffer, pair.value.byteOffset, pair.value.byteLength)) : pair.value })
  }
  flush()
  if (!eof || !rows.some(r => r.type === 'SECTION' && ['ENTITIES', 'BLOCKS'].includes(r.section))) throw new Error('Not a complete DXF drawing: entity/block section or EOF missing.')
  return rows
}
function geometry(row: Raw): Record<string, unknown> {
  const result: Record<string, unknown> = { extrusion: normal(row) }
  if (['ARC', 'CIRCLE'].includes(row.type)) Object.assign(result, { center: point(row, 10), radius: num(row, 40), ...(row.type === 'ARC' ? { startAngleDegrees: num(row, 50), endAngleDegrees: num(row, 51) } : {}) })
  if (row.type === 'LINE') Object.assign(result, { start: point(row, 10), end: point(row, 11) })
  if (row.type === 'INSERT') Object.assign(result, { blockName: str(row, 2), position: point(row, 10), scale: { x: num(row, 41, 1), y: num(row, 42, 1), z: num(row, 43, 1) }, rotationDegrees: num(row, 50), rows: num(row, 71, 1), columns: num(row, 70, 1), rowSpacing: num(row, 45), columnSpacing: num(row, 44) })
  if (row.type === 'LWPOLYLINE') {
    const vertices: { x: number; y: number; z: number; bulge: number; startWidth: number; endWidth: number }[] = []
    for (const pair of row.pairs) {
      if (pair.code === 10) vertices.push({ x: Number(pair.value), y: 0, z: num(row, 38), bulge: 0, startWidth: num(row, 43), endWidth: num(row, 43) })
      else if (vertices.length && [20, 40, 41, 42].includes(pair.code)) {
        const field = ({ 20: 'y', 40: 'startWidth', 41: 'endWidth', 42: 'bulge' } as const)[pair.code as 20 | 40 | 41 | 42]
        vertices[vertices.length - 1][field] = Number(pair.value)
      }
    }
    Object.assign(result, { vertices, closed: !!(num(row, 70) & 1), declaredVertices: num(row, 90), elevation: num(row, 38) })
  }
  if (['POLYLINE', 'VERTEX'].includes(row.type)) Object.assign(result, { flags: num(row, 70), bulge: num(row, 42) })
  return result
}

/** Complete typed-group census plus native database decoding; never silently drops unknown entity records. */
export async function parseCadDxf(bytes: Uint8Array, library: CadLibrary, options: { maxInstances?: number } = {}): Promise<CadIndex> {
  const maxInstances = options.maxInstances ?? 200_000
  if (!Number.isSafeInteger(maxInstances) || maxInstances < 1) throw new Error('maxInstances must be a positive integer.')
  const raw = readRecords(bytes, library), issues: CadIssue[] = [], nativeHandles = new Set<string>()
  let parsed = { unknownEntityCount: 0, unknownObjectCount: 0 }, nativeComplete = true
  const priorRead = nativeReads.get(library) || Promise.resolve()
  let release!: () => void
  nativeReads.set(library, new Promise<void>(resolve => { release = resolve }))
  await priorRead
  const host = library.acdbHostApplicationServices()
  let previous: any
  try { previous = host.workingDatabase } catch { /* No database has been opened in this runtime yet. */ }
  try {
    const db = new library.AcDbDatabase()
    host.workingDatabase = db
    parsed = await new library.AcDbDxfDocumentReader(db).read(library.AcDbDxfFiler.fromBuffer(bytes, { database: db }))
    for (const row of raw) { const handle = str(row, 5); if (handle && db.getObjectById(handle)) nativeHandles.add(handle) }
  } catch (error) { nativeComplete = false; issues.push({ code: 'native-decode-failed', message: `原始 DXF 记录保留；实体模型解码失败：${String(error)}` }) }
  finally { host.workingDatabase = previous; release() }
  const header = raw.find(r => r.type === 'SECTION' && r.section === 'HEADER')?.pairs || []
  const variable = (name: string) => { const i = header.findIndex(p => p.code === 9 && p.value === name); return i < 0 ? undefined : Number(header[i + 1]?.value) }
  const insunits = variable('$INSUNITS') ?? 0
  const units = { insunits, name: unitNames[insunits] || 'unknown', metresPerUnit: unitScales[insunits], measurement: variable('$MEASUREMENT'), verified: false as const }
  if (!units.metresPerUnit) issues.push({ code: 'units-unverified', message: '图纸单位未明确或未支持；不得按坐标直接推断米制工程量。' })
  const blockRecords = raw.filter(r => r.section === 'TABLES' && r.type === 'BLOCK_RECORD')
  const owners = new Map(blockRecords.map(r => [str(r, 5), str(r, 2)]))
  const layouts: CadIndex['layouts'] = [{ name: 'Model', space: 'model' }]
  for (const row of raw.filter(r => r.section === 'OBJECTS' && r.type === 'LAYOUT')) {
    const start = row.pairs.findIndex(p => p.code === 100 && p.value === 'AcDbLayout')
    const data = { pairs: start < 0 ? row.pairs : row.pairs.slice(start + 1) }, name = str(data, 1)
    if (name && name.toLowerCase() !== 'model') layouts.push({ name, blockRecordHandle: str(data, 330), space: 'paper' })
  }
  const ownerLayouts = new Map(layouts.filter(l => l.blockRecordHandle).map(l => [l.blockRecordHandle!, l.name]))
  const blocks = raw.filter(r => r.type === 'BLOCK').map(r => ({ name: str(r, 2), handle: str(r, 5) || undefined, base: point(r, 10), flags: num(r, 70), xrefPath: str(r, 1) || undefined, entityCount: 0 }))
  const blockMap = new Map(blocks.map(b => [b.name.toLowerCase(), b]))
  const layers = raw.filter(r => r.section === 'TABLES' && r.type === 'LAYER').map(r => ({ name: str(r, 2), handle: str(r, 5) || undefined, flags: num(r, 70), off: num(r, 62, 7) < 0, frozen: !!(num(r, 70) & 1), color: num(r, 62, 7) }))
  const records: CadRecord[] = []
  for (const row of raw) {
    if (!['ENTITIES', 'BLOCKS'].includes(row.section) || ['SECTION', 'ENDSEC', 'BLOCK', 'ENDBLK'].includes(row.type)) continue
    const owner = str(row, 330), block = row.block || owners.get(owner), handle = str(row, 5) || undefined
    const isModel = block?.toLowerCase() === '*model_space', isPaper = block?.toLowerCase().startsWith('*paper_space')
    const space = row.section === 'BLOCKS' && !isModel && !isPaper ? 'block' : isPaper || num(row, 67) === 1 || ownerLayouts.has(owner) ? 'paper' : 'model'
    const layout = space === 'block' ? `block:${block || '?'}` : str(row, 410) || ownerLayouts.get(owner) || (space === 'paper' ? block || 'Paper' : 'Model')
    if (space !== 'block' && !layouts.some(l => l.name === layout)) layouts.push({ name: layout, space })
    const coordinateSystem = ocsTypes.has(row.type) ? 'OCS' : wcsTypes.has(row.type) ? 'WCS' : 'entity-specific'
    // Retain repeated points (polyline vertices, spline control points, hatch loops) in original order.
    const points: CadRecord['points'] = [], coordinates = new Map<number, unknown[]>(), occurrences = new Map<number, number>()
    for (const p of row.pairs) if (p.code >= 10 && p.code <= 38) { const list = coordinates.get(p.code) || []; list.push(p.value); coordinates.set(p.code, list) }
    for (const p of row.pairs) {
      if (p.code < 10 || p.code > 18) continue
      const occurrence = occurrences.get(p.code) || 0
      occurrences.set(p.code, occurrence + 1)
      points.push({ code: p.code, coordinateSystem, value: { x: Number(p.value), y: Number(coordinates.get(p.code + 10)?.[occurrence] ?? 0), z: Number(coordinates.get(p.code + 20)?.[occurrence] ?? (row.type === 'LWPOLYLINE' ? num(row, 38) : 0)) } })
    }
    const text = ['TEXT', 'ATTRIB', 'ATTDEF', 'DIMENSION'].includes(row.type) ? str(row, 1) : row.type === 'MTEXT' ? row.pairs.filter(p => p.code === 3 || p.code === 1).map(p => String(p.value)).join('') : undefined
    const record: CadRecord = { id: `entity:${records.length}`, type: row.type, handle, owner: owner || undefined, section: row.section, block, space, layout, layer: str(row, 8, '0'), auxiliary: auxiliary.has(row.type), pairs: row.pairs, nativeDecoded: !!(handle && nativeHandles.has(handle)), text, points, geometry: geometry(row) }
    if (row.type === 'DIMENSION') record.dimension = { type: num(row, 70), override: str(row, 1) || undefined, storedMeasurement: value(row, 42) === undefined ? undefined : num(row, 42), style: str(row, 3) || undefined }
    records.push(record)
  }
  const children = new Map<string, CadRecord[]>()
  for (const row of records.filter(r => r.space === 'block')) {
    const key = (row.block || '').toLowerCase(), group = children.get(key) || []; group.push(row); children.set(key, group)
  }
  const blockCounts = new Map<string, number>()
  for (const row of records) if (row.block) { const key = row.block.toLowerCase(); blockCounts.set(key, (blockCounts.get(key) || 0) + 1) }
  for (const block of blocks) block.entityCount = blockCounts.get(block.name.toLowerCase()) || 0
  const xrefs = blocks.filter(b => !!(b.flags & 12) || !!b.xrefPath)
  for (const block of xrefs) issues.push({ code: 'xref-unresolved', message: `外部参照 ${block.name}：${block.xrefPath || '路径缺失'}；未加载核对，已有缓存不能证明当前完整性。` })
  const unknown = records.filter(r => !r.nativeDecoded && !r.auxiliary)
  if (unknown.length) issues.push({ code: 'undecoded-entities', message: `${unknown.length} 条实体未由 CAD 实体模型解码，仍可按 recordId 查询全部原始组码。` })
  const complex = records.filter(r => ['ACAD_PROXY_ENTITY', '3DSOLID', 'BODY', 'REGION', 'SURFACE', 'OLE2FRAME', 'IMAGE', 'PDFUNDERLAY'].includes(r.type))
  if (complex.length) issues.push({ code: 'complex-geometry', message: `${complex.length} 条代理、三维或外部内容记录需要原软件/专业工具复核，不作为已识别构件。` })
  if (records.some(r => r.dimension)) issues.push({ code: 'dimension-review', message: '尺寸显示替代文字、存储测量值与几何坐标分别保留；尚未验证 DIMLFAC、比例和单位，不自动把标注当作实际长度。' })
  const instances: CadInstance[] = []
  let expansionComplete = true
  const walk = (rows: CadRecord[], parent: number[], path: string[], active: string[], space: 'model' | 'paper', layout: string, inheritedLayer = '0') => {
    for (const row of rows) {
      if (instances.length >= maxInstances) { expansionComplete = false; return }
      if (row.auxiliary) continue
      const layer = row.layer === '0' ? inheritedLayer : row.layer
      let geometryTransform = parent
      try { if (ocsTypes.has(row.type)) geometryTransform = multiply(parent, ocsMatrix(normal(row))) }
      catch { issues.push({ code: 'invalid-extrusion', recordId: row.id, message: '无效挤出向量；此实体坐标变换未核实。' }); expansionComplete = false; continue }
      const instance: CadInstance = { id: `${path.join('/')}/${row.id}`, recordId: row.id, handle: row.handle, type: row.type, layer, layout, space, path: [...path, row.id], parentTransform: parent, geometryTransform }
      instances.push(instance)
      if (row.type !== 'INSERT') continue
      const key = str(row, 2).toLowerCase(), block = blockMap.get(key)
      if (!block) { expansionComplete = false; issues.push({ code: 'missing-block', recordId: row.id, message: `块定义缺失：${str(row, 2)}` }); continue }
      if (active.includes(key) || active.length >= 64) { expansionComplete = false; issues.push({ code: 'block-cycle', recordId: row.id, message: '嵌套块存在循环或超过 64 层；保留记录并停止此分支展开。' }); continue }
      const columns = num(row, 70, 1), rowsCount = num(row, 71, 1)
      if (![columns, rowsCount].every(n => Number.isSafeInteger(n) && n > 0) || columns * rowsCount > maxInstances) { expansionComplete = false; issues.push({ code: 'invalid-array', recordId: row.id, message: 'INSERT 阵列行列数无效或超过实例安全上限。' }); continue }
      for (let r = 0; r < rowsCount; r++) for (let c = 0; c < columns; c++) {
        if (instances.length >= maxInstances) { expansionComplete = false; return }
        const transform = multiply(parent, insertMatrix(point(row, 10), { x: num(row, 41, 1), y: num(row, 42, 1), z: num(row, 43, 1) }, num(row, 50), block.base, normal(row), { x: c * num(row, 44), y: r * num(row, 45), z: 0 }))
        if (r === 0 && c === 0) instance.blockTransform = transform
        walk(children.get(key) || [], transform, [...path, `${row.id}[${r},${c}]`], [...active, key], space, layout, layer)
      }
    }
  }
  for (const row of records.filter(r => r.space !== 'block')) walk([row], identity(), [], [], row.space as 'model' | 'paper', row.layout)
  if (!expansionComplete) issues.push({ code: 'incomplete-expansion', message: `实例展开未完整（安全上限 ${maxInstances} 条或块缺口），实例数量不能作为完整工程量；原始实体清点保留。` })
  return {
    format: 'dxf', sourceHash: createHash('sha256').update(bytes).digest('hex'), parser: { name: '@mlightcad/data-model', version: '1.14.3', unknownEntities: parsed.unknownEntityCount, unknownObjects: parsed.unknownObjectCount },
    units, layers, layouts, blocks, records, instances, issues,
    inventory: { records: records.length, auxiliaryRecords: records.filter(r => r.auxiliary).length, definitions: records.filter(r => r.space === 'block').length, modelRecords: records.filter(r => r.space === 'model').length, paperRecords: records.filter(r => r.space === 'paper').length, byType: counts(records, 'type'), byLayer: counts(records, 'layer'), byLayout: counts(records.filter(r => r.space !== 'block'), 'layout'), placedInstances: instances.length, modelInstances: instances.filter(i => i.space === 'model').length, paperInstances: instances.filter(i => i.space === 'paper').length, expansionComplete, unknownRecords: unknown.length, unresolvedXrefs: xrefs.length, structuralReadComplete: nativeComplete, professionalCoverage: 'not_assessed' },
  }
}

export function queryCad(index: CadIndex, query: CadQuery = {}) {
  const offset = query.offset ?? 0, limit = query.limit ?? 50, collection = query.collection ?? 'instances'
  if (!Number.isSafeInteger(offset) || offset < 0 || !Number.isSafeInteger(limit) || limit < 1 || limit > 500) throw new Error('offset must be a nonnegative integer; limit must be 1..500.')
  if (!['records', 'instances'].includes(collection)) throw new Error('collection must be records or instances.')
  for (const filter of [query.types, query.layers]) if (filter !== undefined && (!Array.isArray(filter) || filter.some(v => typeof v !== 'string'))) throw new Error('types/layers must be string arrays.')
  const byId = new Map(index.records.map(r => [r.id, r])), needle = query.text?.toLowerCase()
  const rows = (collection === 'records' ? index.records : index.instances).filter(row => {
    const record = 'recordId' in row ? byId.get(row.recordId)! : row
    return (!query.types?.length || query.types.some(t => t.toUpperCase() === row.type)) && (!query.layers?.length || query.layers.includes(row.layer)) && (!query.layout || row.layout === query.layout) && (!query.handle || row.handle?.toLowerCase() === query.handle.toLowerCase()) && (!query.recordId || record.id === query.recordId) && (!needle || record.text?.toLowerCase().includes(needle))
  })
  return { sourceHash: index.sourceHash, collection, offset, limit, total: rows.length, nextOffset: offset + limit < rows.length ? offset + limit : null,
    items: rows.slice(offset, offset + limit).map(row => {
      const record = 'recordId' in row ? byId.get(row.recordId)! : row
      const { pairs, ...detail } = record
      return { ...detail, ...('recordId' in row ? row : {}), ...(query.includeRaw ? { pairs } : {}) }
    }),
  }
}

export function queryCadCatalog(index: CadIndex, query: { collection: 'blocks' | 'layers' | 'layouts'; offset?: number; limit?: number; text?: string }) {
  const offset = query.offset ?? 0, limit = query.limit ?? 50
  if (!Number.isSafeInteger(offset) || offset < 0 || !Number.isSafeInteger(limit) || limit < 1 || limit > 500) throw new Error('offset must be a nonnegative integer; limit must be 1..500.')
  const rows = index[query.collection].filter(row => !query.text || row.name.toLowerCase().includes(query.text.toLowerCase()))
  return { collection: query.collection, offset, limit, total: rows.length, nextOffset: offset + limit < rows.length ? offset + limit : null, items: rows.slice(offset, offset + limit) }
}
