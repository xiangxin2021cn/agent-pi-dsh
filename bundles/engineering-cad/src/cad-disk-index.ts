import { createHash } from 'node:crypto'
import { closeSync, createReadStream, existsSync, mkdirSync, mkdtempSync, openSync, readFileSync, readSync, realpathSync, renameSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { isAbsolute, join, relative, sep } from 'node:path'
import { createInterface } from 'node:readline'
import { parseCadDxf } from '../../../packages/engineering-cad/index.ts'
import type { CadIndex, CadLibrary, CadQuery, CadRecord } from '../../../packages/engineering-cad/index.ts'
import { assertDxfDiskSourceUnchanged, buildDxfDiskSource, readDxfSourcePairs } from './dxf-disk-source.ts'
import type { DxfDiskSource, DxfSourceRecord } from './dxf-disk-source.ts'

const files = ['geometry.dxf', 'records.jsonl', 'pairs.bin', 'geometry-records.jsonl', 'geometry-records.offsets', 'instances.jsonl']
const diskJson = (value: unknown) => JSON.stringify(value, (_key, item) => {
  if (typeof item === 'number' && !Number.isFinite(item)) throw new Error('CAD 返回非有限数值，不能保存为有效几何索引。')
  return item
})
type RawSource = { recordId: string; byteOffset: number; byteLength: number; pairCount: number; binaryPairCount: number }
type DiskRecord = CadRecord & { rawSource: RawSource; binaryDataDeferred?: boolean }
export type CadDiskIndex = { schema: 1; source: DxfDiskSource; index: CadIndex; binaryRecordCount: number; files: { name: string; size: number; sha256: string }[]; directory: string; cached: boolean }

export async function cadFileHash(path: string) {
  const digest = createHash('sha256')
  for await (const bytes of createReadStream(path)) digest.update(bytes)
  return digest.digest('hex')
}
async function* jsonRows(path: string): AsyncGenerator<any> {
  const input = createReadStream(path), lines = createInterface({ input, crlfDelay: Infinity })
  try { for await (const line of lines) if (line) yield JSON.parse(line) }
  finally { lines.close(); input.destroy() }
}
function cachePath(directory: string, name: string) {
  const path = join(directory, name), r = relative(realpathSync(directory), realpathSync(path))
  if (isAbsolute(r) || r === '..' || r.startsWith('..' + sep)) throw new Error('CAD 索引文件通过符号链接越出了索引目录。')
  return path
}
const builds = new Map<string, Promise<CadDiskIndex>>()

/** Binary payloads stay in the original DXF. Persist geometry and instance metadata for bounded page queries. */
export async function openCadDiskIndex(path: string, directory: string, sourceHash: string, library: CadLibrary): Promise<CadDiskIndex> {
  const pending = builds.get(directory)
  if (pending) { await pending; return openCadDiskIndex(path, directory, sourceHash, library) }
  const receiptPath = join(directory, 'summary.json')
  if (existsSync(receiptPath)) {
    try {
      const receipt = cachePath(directory, 'summary.json')
      if (statSync(receipt).size > 8 * 1024 * 1024) throw new Error('CAD 索引摘要超过读取预算。')
      const disk: CadDiskIndex = JSON.parse(readFileSync(receipt, 'utf8'))
      if (disk.schema !== 1 || disk.source.source.path !== path || disk.source.source.sha256 !== sourceHash || disk.index.sourceHash !== sourceHash
        || disk.source.recordsPath !== join(directory, 'records.jsonl') || disk.source.pairsPath !== join(directory, 'pairs.bin')
        || disk.source.projection.path !== join(directory, 'geometry.dxf') || disk.directory !== directory
        || disk.files.length !== files.length || disk.files.some((file, i) => file.name !== files[i])) throw new Error('CAD 索引来源或格式不一致。')
      assertDxfDiskSourceUnchanged(disk.source)
      for (const file of disk.files) {
        const filePath = cachePath(directory, file.name)
        if (statSync(filePath).size !== file.size || await cadFileHash(filePath) !== file.sha256) throw new Error('CAD 磁盘索引文件发生变化。')
      }
      assertDxfDiskSourceUnchanged(disk.source)
      return { ...disk, cached: true }
    } catch {
      // Refuse escaped cache paths; only stale files in this already scoped directory may be rebuilt.
      for (const name of ['summary.json', ...files]) if (existsSync(join(directory, name))) cachePath(directory, name)
      rmSync(directory, { recursive: true, force: true })
    }
  }
  if (existsSync(directory)) {
    for (const name of files) if (existsSync(join(directory, name))) cachePath(directory, name)
    rmSync(directory, { recursive: true, force: true })
  }
  const build = buildIndex(path, directory, sourceHash, library)
  builds.set(directory, build)
  try { return await build } finally { builds.delete(directory) }
}

async function buildIndex(path: string, directory: string, sourceHash: string, library: CadLibrary): Promise<CadDiskIndex> {
  const parent = join(directory, '..'); mkdirSync(parent, { recursive: true })
  const temporary = mkdtempSync(join(parent, '.building-')), fds: number[] = []
  try {
    const source = await buildDxfDiskSource(path, temporary)
    if (source.source.sha256 !== sourceHash) throw new Error('DXF 在索引期间发生变化，请重新读取 inventory。')
    const index = await parseCadDxf(readFileSync(source.projection.path), library)
    index.sourceHash = sourceHash
    let binaryRecordCount = 0, geometryCount = 0
    for await (const raw of jsonRows(source.recordsPath) as AsyncGenerator<DxfSourceRecord>) {
      if (raw.binaryPairCount) binaryRecordCount++
      if (!raw.geometryRecordId) continue
      const record = index.records[geometryCount++] as DiskRecord
      if (!record || record.id !== raw.geometryRecordId || record.type !== raw.type) throw new Error('DXF 原始记录与几何索引顺序不一致。')
      record.rawSource = { recordId: raw.id, byteOffset: raw.offset, byteLength: raw.byteLength, pairCount: raw.pairCount, binaryPairCount: raw.binaryPairCount }
      if (raw.binaryPairCount || (source.projection.binaryPairsOmitted && ['3DSOLID', 'BODY', 'REGION', 'SURFACE'].includes(record.type))) {
        record.binaryDataDeferred = true; record.nativeDecoded = false
      }
    }
    if (geometryCount !== index.records.length) throw new Error('DXF 原始实体索引不完整。')
    if (source.projection.binaryPairsOmitted) {
      index.inventory.unknownRecords = index.records.filter(record => !record.nativeDecoded && !record.auxiliary).length
      index.inventory.structuralReadComplete = false
      index.issues = index.issues.filter(issue => issue.code !== 'undecoded-entities')
      index.issues.unshift({ code: 'binary-data-deferred', message: `${binaryRecordCount} 条含内嵌数据的原始记录完整保存在 DXF 磁盘中，几何解码未加载其二进制内容；使用 source_records / raw_pairs 分页读取，不代表这些内容已被专业识别。` })
      if (index.inventory.unknownRecords) index.issues.push({ code: 'undecoded-entities', message: `${index.inventory.unknownRecords} 条实体未完整解码；原始记录及组码可从磁盘分页查询。` })
    }
    const openOutput = (name: string) => { const fd = openSync(join(temporary, name), 'wx'); fds.push(fd); return fd }
    const recordFd = openOutput('geometry-records.jsonl'), offsetFd = openOutput('geometry-records.offsets'), instanceFd = openOutput('instances.jsonl')
    let offset = 0
    for (const record of index.records) {
      const bytes = Buffer.from(diskJson(record) + '\n'), locator = Buffer.allocUnsafe(16)
      if (bytes.length > 8 * 1024 * 1024) throw new Error('单条 CAD 几何记录超过磁盘分页预算；完整 DXF 保留，未截断。')
      locator.writeDoubleLE(offset, 0); locator.writeDoubleLE(bytes.length, 8)
      writeFileSync(recordFd, bytes); writeFileSync(offsetFd, locator); offset += bytes.length
    }
    for (const instance of index.instances) {
      const ordinal = Number(instance.recordId.slice('entity:'.length)), record = index.records[ordinal]
      if (!record || record.id !== instance.recordId) throw new Error('CAD 实例没有有效实体依据。')
      writeFileSync(instanceFd, diskJson({ ...instance, ...(record.text === undefined ? {} : { sourceText: record.text }) }) + '\n')
    }
    for (const fd of fds.splice(0)) closeSync(fd)
    assertDxfDiskSourceUnchanged(source)
    const finalSource = { ...source, recordsPath: join(directory, 'records.jsonl'), pairsPath: join(directory, 'pairs.bin'), projection: { ...source.projection, path: join(directory, 'geometry.dxf') } }
    const checks = []
    for (const name of files) { const file = join(temporary, name); checks.push({ name, size: statSync(file).size, sha256: await cadFileHash(file) }) }
    const disk: CadDiskIndex = { schema: 1, source: finalSource, index: { ...index, records: [], instances: [] }, binaryRecordCount, files: checks, directory, cached: false }
    writeFileSync(join(temporary, 'summary.json'), diskJson(disk))
    assertDxfDiskSourceUnchanged(source)
    if (existsSync(directory)) throw new Error('CAD 索引目录已存在，未覆盖并发结果。')
    renameSync(temporary, directory)
    return disk
  } finally { for (const fd of fds) closeSync(fd); if (existsSync(temporary)) rmSync(temporary, { recursive: true, force: true }) }
}

function readRecord(disk: CadDiskIndex, id: string): DiskRecord {
  if (!/^entity:\d+$/.test(id)) throw new Error('CAD 实体 ID 无效。')
  const ordinal = Number(id.slice(7))
  if (!Number.isSafeInteger(ordinal) || ordinal >= disk.index.inventory.records) throw new Error('CAD 实体 ID 不存在。')
  const offsets = openSync(cachePath(disk.directory, 'geometry-records.offsets'), 'r')
  let records: number | undefined
  try {
    records = openSync(cachePath(disk.directory, 'geometry-records.jsonl'), 'r')
    const locator = Buffer.alloc(16)
    if (readSync(offsets, locator, 0, 16, ordinal * 16) !== 16) throw new Error('CAD 实体磁盘定位不完整。')
    const offset = locator.readDoubleLE(0), length = locator.readDoubleLE(8)
    if (!Number.isSafeInteger(offset) || !Number.isSafeInteger(length) || offset < 0 || length < 1 || length > 8 * 1024 * 1024) throw new Error('单条 CAD 几何记录超过分页预算，请按原始组码分页读取。')
    const bytes = Buffer.alloc(length)
    if (readSync(records, bytes, 0, length, offset) !== length) throw new Error('CAD 几何记录不完整。')
    const record: DiskRecord = JSON.parse(bytes.toString('utf8'))
    if (record.id !== id) throw new Error('CAD 实体磁盘定位不一致。')
    return record
  } finally { closeSync(offsets); if (records !== undefined) closeSync(records) }
}

export async function queryCadDisk(disk: CadDiskIndex, library: CadLibrary, query: CadQuery = {}) {
  assertDxfDiskSourceUnchanged(disk.source)
  const offset = query.offset ?? 0, limit = query.limit ?? 50, collection = query.collection ?? 'instances'
  if (!Number.isSafeInteger(offset) || offset < 0 || !Number.isSafeInteger(limit) || limit < 1 || limit > 500) throw new Error('offset must be a nonnegative integer; limit must be 1..500.')
  if (!['records', 'instances'].includes(collection)) throw new Error('collection must be records or instances.')
  for (const filter of [query.types, query.layers]) if (filter !== undefined && (!Array.isArray(filter) || filter.some(value => typeof value !== 'string'))) throw new Error('types/layers must be string arrays.')
  const rows = jsonRows(cachePath(disk.directory, collection === 'records' ? 'geometry-records.jsonl' : 'instances.jsonl')), selected: any[] = []
  let total = 0
  for await (const row of rows) {
    if ((query.types?.length && !query.types.some(type => type.toUpperCase() === row.type)) || (query.layers?.length && !query.layers.includes(row.layer))
      || (query.layout && row.layout !== query.layout) || (query.handle && row.handle?.toLowerCase() !== query.handle.toLowerCase())
      || (query.recordId && (row.recordId ?? row.id) !== query.recordId) || (query.text && !(row.text ?? row.sourceText)?.toLowerCase().includes(query.text.toLowerCase()))) continue
    if (total >= offset && selected.length < limit) selected.push(row)
    total++
  }
  const items = []
  for (const row of selected) {
    const record: DiskRecord = collection === 'records' ? row : readRecord(disk, row.recordId)
    const { pairs, ...detail } = record, { sourceText, ...instance } = row
    const rawPage = query.includeRaw ? await readDxfSourcePairs(disk.source, library, { recordId: record.id, limit: 200 }) : undefined
    items.push({ ...detail, ...(collection === 'instances' ? instance : {}), ...(rawPage ? { rawPage } : {}) })
  }
  assertDxfDiskSourceUnchanged(disk.source)
  return { sourceHash: disk.index.sourceHash, collection, offset, limit, total, nextOffset: offset + limit < total ? offset + limit : null, items }
}
