import { createHash } from 'node:crypto'
import { createReadStream, closeSync, fstatSync, mkdirSync, openSync, readSync, statSync, unlinkSync, writeSync } from 'node:fs'
import { join, resolve } from 'node:path'
import type { CadLibrary, CadPair } from '../../../packages/engineering-cad/types.ts'

const pairIndexBytes = 32
const defaultProjectionBudget = 64 * 1024 * 1024
const maxLineBytes = 8 * 1024 * 1024
const maxPageBytes = 8 * 1024 * 1024
const binaryCode = (code: number) => (code >= 310 && code <= 319) || code === 1004
type FileIdentity = { size: number; mtimeMs: number; ctimeMs: number; dev: number; ino: number }
const identity = (path: string): FileIdentity => {
  const stat = statSync(path)
  if (!stat.isFile()) throw new Error('DXF source must be a regular file.')
  return { size: stat.size, mtimeMs: stat.mtimeMs, ctimeMs: stat.ctimeMs, dev: stat.dev, ino: stat.ino }
}
const sameIdentity = (a: FileIdentity, b: FileIdentity) => (['size', 'mtimeMs', 'ctimeMs', 'dev', 'ino'] as const).every(key => a[key] === b[key])

export type DxfSourceRecord = {
  id: string; ordinal: number; type: string; section: string; block?: string; handle?: string; owner?: string; layer?: string
  offset: number; byteLength: number; pairStart: number; pairCount: number; bodyPairCount: number
  projectionOffset: number; projectionByteLength: number; binaryPairCount: number; geometryRecordId?: string; hasStartGroup: boolean
}
export type DxfDiskSource = {
  schema: 1; source: FileIdentity & { path: string; sha256: string }
  projection: { path: string; sha256: string; bytes: number; budgetBytes: number; binaryPairsOmitted: number; binaryBytesRetained: number }
  recordsPath: string; pairsPath: string; recordCount: number; pairCount: number
}

class BufferedWriter {
  private chunks: Buffer[] = []
  private buffered = 0
  bytes = 0
  readonly fd: number
  constructor(fd: number) { this.fd = fd }
  write(buffer: Buffer) {
    this.chunks.push(buffer); this.buffered += buffer.length; this.bytes += buffer.length
    if (this.buffered >= 256 * 1024) this.flush()
  }
  flush() {
    if (!this.buffered) return
    const buffer = Buffer.concat(this.chunks, this.buffered)
    let written = 0
    while (written < buffer.length) written += writeSync(this.fd, buffer, written, buffer.length - written)
    this.chunks = []; this.buffered = 0
  }
}

/** Byte offsets include the original line endings; no decoded whole-file string is created. */
async function* sourceLines(path: string, digest?: ReturnType<typeof createHash>, strictUtf8 = false) {
  let offset = 0, parts: Buffer[] = [], pending = 0
  const decoder = strictUtf8 ? new TextDecoder('utf-8', { fatal: true }) : undefined
  for await (const chunk of createReadStream(path, { highWaterMark: 256 * 1024 })) {
    const buffer = chunk as Buffer
    try { decoder?.decode(buffer, { stream: true }) } catch { throw new Error('Disk-indexed ASCII DXF currently requires valid UTF8; legacy encoded or binary DXF must be converted without replacing characters.') }
    digest?.update(buffer)
    let start = 0
    while (start < buffer.length) {
      const newline = buffer.indexOf(10, start)
      const end = newline < 0 ? buffer.length : newline + 1
      const piece = buffer.subarray(start, end)
      pending += piece.length
      if (pending > maxLineBytes) throw new Error(`DXF line exceeds the explicit ${maxLineBytes} byte line budget; source is not truncated.`)
      if (newline < 0) { parts.push(piece); break }
      const bytes = parts.length ? Buffer.concat([...parts, piece], pending) : piece
      yield { offset, bytes }
      offset += bytes.length; parts = []; pending = 0; start = end
    }
  }
  try { decoder?.decode() } catch { throw new Error('Disk-indexed ASCII DXF currently requires valid UTF8; incomplete character encoding is not replaced.') }
  if (pending) yield { offset, bytes: Buffer.concat(parts, pending) }
}

const lineText = (bytes: Buffer) => bytes.toString('utf8').replace(/\r?\n$/, '')

/** Persist all original records/groups, and a bounded geometry projection excluding only binary group values. */
export async function buildDxfDiskSource(path: string, directory: string, options: { projectionBudgetBytes?: number } = {}): Promise<DxfDiskSource> {
  const budget = options.projectionBudgetBytes ?? defaultProjectionBudget
  if (!Number.isSafeInteger(budget) || budget < 1 || budget > 128 * 1024 * 1024) throw new Error('DXF projection budget must be 1..128 MiB.')
  const sourcePath = resolve(path), before = identity(sourcePath)
  mkdirSync(directory, { recursive: true })
  const projectionPath = join(directory, 'geometry.dxf'), recordsPath = join(directory, 'records.jsonl'), pairsPath = join(directory, 'pairs.bin')
  if ([projectionPath, recordsPath, pairsPath].some(output => resolve(output) === sourcePath)) throw new Error('DXF source cannot be used as an index output.')
  const fds: number[] = [], outputs = [projectionPath, recordsPath, pairsPath]
  let successful = false
  try {
    const writers = outputs.map(output => { const fd = openSync(output, 'wx'); fds.push(fd); return new BufferedWriter(fd) })
    const [projection, records, pairs] = writers
    const sourceDigest = createHash('sha256'), projectionDigest = createHash('sha256')
    let codeLine: { offset: number; bytes: Buffer } | undefined, current: DxfSourceRecord | undefined
    let recordCount = 0, pairCount = 0, geometryCount = 0, section = '', block: string | undefined
    let hasDrawingSection = false, hasEof = false, binaryPairsOmitted = 0, binaryBytesRetained = 0
    const flushRecord = (end: number) => {
      if (!current) return
      current.byteLength = end - current.offset
      current.bodyPairCount = current.pairCount - (current.hasStartGroup ? 1 : 0)
      current.projectionByteLength = projection.bytes - current.projectionOffset
      if (['ENTITIES', 'BLOCKS'].includes(current.section) && !['SECTION', 'ENDSEC', 'BLOCK', 'ENDBLK'].includes(current.type)) current.geometryRecordId = `entity:${geometryCount++}`
      records.write(Buffer.from(JSON.stringify(current) + '\n'))
      if (current.type === 'ENDSEC') section = ''
      if (current.type === 'ENDBLK') block = undefined
      current = undefined
    }
    for await (const line of sourceLines(sourcePath, sourceDigest, true)) {
      if (!codeLine) { codeLine = line; continue }
      const codeText = lineText(codeLine.bytes).replace(/^\uFEFF/, '').trim()
      if (!/^\d{1,4}$/.test(codeText)) throw new Error(`Invalid ASCII DXF group code at byte ${codeLine.offset}; source is not truncated.`)
      const code = Number(codeText), length = codeLine.bytes.length + line.bytes.length
      if (code > 1071) throw new Error(`Invalid DXF group code ${code} at byte ${codeLine.offset}.`)
      if (hasEof) throw new Error('DXF contains groups after EOF; source is not truncated.')
      if (code === 0) {
        flushRecord(codeLine.offset)
        const type = lineText(line.bytes).trim().toUpperCase()
        if (!type) throw new Error(`Empty DXF record type at byte ${line.offset}.`)
        current = { id: `source-record:${recordCount}`, ordinal: recordCount++, type, section, block,
          offset: codeLine.offset, byteLength: 0, pairStart: pairCount, pairCount: 0, bodyPairCount: 0,
          projectionOffset: projection.bytes, projectionByteLength: 0, binaryPairCount: 0, hasStartGroup: true }
        hasEof = type === 'EOF'
      } else if (!current) {
        if (code !== 999) throw new Error('DXF groups precede the first record; source is not truncated.')
        current = { id: `source-record:${recordCount}`, ordinal: recordCount++, type: 'PREAMBLE', section: '',
          offset: codeLine.offset, byteLength: 0, pairStart: pairCount, pairCount: 0, bodyPairCount: 0,
          projectionOffset: projection.bytes, projectionByteLength: 0, binaryPairCount: 0, hasStartGroup: false }
      }
      const record = current!
      record.pairCount++
      if (code === 2 && record.type === 'SECTION') {
        section = lineText(line.bytes).trim().toUpperCase(); record.section = section
        hasDrawingSection ||= ['ENTITIES', 'BLOCKS'].includes(section)
      }
      if (code === 2 && record.type === 'BLOCK') { block = lineText(line.bytes); record.block = block }
      if ((code === 5 || code === 105) && record.handle === undefined) record.handle = lineText(line.bytes).trim()
      if (code === 330 && record.owner === undefined) record.owner = lineText(line.bytes).trim()
      if (code === 8 && record.layer === undefined) record.layer = lineText(line.bytes)
      const pairEntry = Buffer.allocUnsafe(pairIndexBytes)
      pairEntry.writeInt32LE(code, 0); pairEntry.writeInt32LE(0, 4)
      pairEntry.writeDoubleLE(codeLine.offset, 8); pairEntry.writeDoubleLE(length, 16); pairEntry.writeDoubleLE(line.offset, 24)
      pairs.write(pairEntry); pairCount++
      if (binaryCode(code)) {
        record.binaryPairCount++; binaryPairsOmitted++; binaryBytesRetained += length
      } else {
        if (projection.bytes + length > budget) throw new Error(`DXF geometry projection exceeds the explicit ${budget} byte budget; full source remains intact and is not truncated.`)
        projection.write(codeLine.bytes); projection.write(line.bytes)
        projectionDigest.update(codeLine.bytes); projectionDigest.update(line.bytes)
      }
      codeLine = undefined
    }
    if (codeLine) throw new Error(`Incomplete DXF code/value pair at byte ${codeLine.offset}; source is not truncated.`)
    flushRecord(before.size)
    if (!hasEof || !hasDrawingSection) throw new Error('Not a complete ASCII DXF drawing: entity/block section or EOF missing.')
    const after = identity(sourcePath)
    if (!sameIdentity(before, after)) throw new Error('DXF source changed while the disk index was being built.')
    for (const writer of writers) writer.flush()
    successful = true
    return { schema: 1, source: { path: sourcePath, sha256: sourceDigest.digest('hex'), ...before },
      projection: { path: projectionPath, sha256: projectionDigest.digest('hex'), bytes: projection.bytes, budgetBytes: budget, binaryPairsOmitted, binaryBytesRetained },
      recordsPath, pairsPath, recordCount, pairCount }
  } finally {
    for (const fd of fds) closeSync(fd)
    if (!successful) for (let i = 0; i < fds.length; i++) { try { unlinkSync(outputs[i]) } catch { /* Keep the original source intact on failed index construction. */ } }
  }
}

export function assertDxfDiskSourceUnchanged(source: DxfDiskSource) {
  if (!sameIdentity(source.source, identity(source.source.path))) throw new Error('DXF source version changed; rebuild the inventory and query with the new hash.')
}

async function* diskRecords(source: DxfDiskSource) {
  for await (const line of sourceLines(source.recordsPath)) yield JSON.parse(lineText(line.bytes)) as DxfSourceRecord
}

type SourceQuery = { offset?: number; limit?: number; types?: string[]; section?: string; block?: string; handle?: string; recordId?: string }
const pageParameters = (offset = 0, limit = 200) => {
  if (!Number.isSafeInteger(offset) || offset < 0 || !Number.isSafeInteger(limit) || limit < 1 || limit > 500) throw new Error('DXF page offset must be nonnegative and limit must be 1..500.')
  return { offset, limit }
}

export async function queryDxfSourceRecords(source: DxfDiskSource, query: SourceQuery = {}) {
  assertDxfDiskSourceUnchanged(source)
  const { offset, limit } = pageParameters(query.offset, query.limit), items: DxfSourceRecord[] = []
  if (query.types !== undefined && (!Array.isArray(query.types) || query.types.some(type => typeof type !== 'string'))) throw new Error('DXF source types must be a string array.')
  let total = 0
  for await (const record of diskRecords(source)) {
    if (query.types?.length && !query.types.some(type => type.toUpperCase() === record.type)) continue
    if (query.section && record.section !== query.section.toUpperCase()) continue
    if (query.block && record.block !== query.block) continue
    if (query.handle && record.handle?.toLowerCase() !== query.handle.toLowerCase()) continue
    if (query.recordId && record.id !== query.recordId && record.geometryRecordId !== query.recordId) continue
    if (total >= offset && items.length < limit) items.push(record)
    total++
  }
  assertDxfDiskSourceUnchanged(source)
  return { sourceHash: source.source.sha256, offset, limit, total, nextOffset: offset + limit < total ? offset + limit : null, items }
}

/** Read at most 500 original typed groups from one record, including its starting code 0. */
export async function readDxfSourcePairs(source: DxfDiskSource, library: CadLibrary, query: { recordId: string; offset?: number; limit?: number }) {
  const { offset, limit } = pageParameters(query.offset, query.limit)
  const record = (await queryDxfSourceRecords(source, { recordId: query.recordId, limit: 1 })).items[0]
  if (!record) throw new Error(`DXF source record not found: ${query.recordId}`)
  const count = Math.min(limit, Math.max(0, record.pairCount - offset)), items: CadPair[] = []
  if (!count) return { record, items, offset, limit, total: record.pairCount, nextOffset: null, complete: true }
  const fd = openSync(source.source.path, 'r')
  let indexFd: number | undefined
  try {
    indexFd = openSync(source.pairsPath, 'r')
    const indexes = Buffer.alloc(count * pairIndexBytes)
    if (readSync(indexFd, indexes, 0, indexes.length, (record.pairStart + offset) * pairIndexBytes) !== indexes.length) throw new Error('DXF pair disk index is incomplete.')
    const start = indexes.readDoubleLE(8), last = (count - 1) * pairIndexBytes
    const length = indexes.readDoubleLE(last + 8) + indexes.readDoubleLE(last + 16) - start
    if (!Number.isSafeInteger(start) || !Number.isSafeInteger(length) || start < record.offset || start + length > record.offset + record.byteLength || length > maxPageBytes) throw new Error(`DXF raw page exceeds the explicit ${maxPageBytes} byte budget or has invalid source ranges; request fewer groups; source is not truncated.`)
    const bytes = Buffer.alloc(length)
    if (readSync(fd, bytes, 0, length, start) !== length) throw new Error('DXF source page is incomplete.')
    const stat = fstatSync(fd)
    if (!sameIdentity(source.source, stat)) throw new Error('DXF source changed while reading the raw page.')
    const filer = library.AcDbDxfFiler.fromBuffer(bytes)
    const typed: CadPair[] = []
    while (!filer.atEof) {
      const pair = filer.readItem() as CadPair | undefined
      if (!pair) break
      typed.push({ code: pair.code, value: typeof pair.value === 'bigint' ? pair.value.toString() : ArrayBuffer.isView(pair.value) ? Array.from(new Uint8Array(pair.value.buffer, pair.value.byteOffset, pair.value.byteLength)) : pair.value })
    }
    let typedIndex = 0
    for (let i = 0; i < count; i++) {
      const entry = i * pairIndexBytes, code = indexes.readInt32LE(entry)
      if (code === 999) {
        const valueStart = indexes.readDoubleLE(entry + 24), valueEnd = indexes.readDoubleLE(entry + 8) + indexes.readDoubleLE(entry + 16)
        items.push({ code, value: lineText(bytes.subarray(valueStart - start, valueEnd - start)) })
      } else {
        const pair = typed[typedIndex++]
        if (!pair || pair.code !== code) throw new Error('Native DXF filer did not preserve all requested source groups.')
        items.push(pair)
      }
    }
    if (typedIndex !== typed.length) throw new Error('Native DXF filer returned unexpected source groups.')
    assertDxfDiskSourceUnchanged(source)
    return { record, items, offset, limit, total: record.pairCount, nextOffset: offset + count < record.pairCount ? offset + count : null, complete: offset + count >= record.pairCount }
  } finally { closeSync(fd); if (indexFd !== undefined) closeSync(indexFd) }
}
