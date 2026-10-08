import test from 'node:test'
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { createRequire } from 'node:module'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { executeCadRead } from '../src/reader.ts'
import { convertDwgToDxf } from '../../tender-host/src/cad-convert.ts'

const requireCad = createRequire(new URL('../../tender-host/package.json', import.meta.url))
const { createCanvas } = requireCad('@napi-rs/canvas')
const hash = (bytes: Uint8Array) => createHash('sha256').update(bytes).digest('hex')
const groups = (...values: (string | number)[]) => values.join('\n') + '\n'

function fixture(withPayload = true, withPolyline = false) {
  const root = mkdtempSync(join(tmpdir(), 'cad-embedded-reader-')), canvas = createCanvas(32, 17)
  const context = canvas.getContext('2d'); context.fillStyle = '#276392'; context.fillRect(0, 0, 32, 17)
  const payload = withPayload ? Buffer.concat([Buffer.alloc(128), canvas.toBuffer('image/png')]) : Buffer.alloc(0)
  let ole = groups(0, 'OLE2FRAME', 5, 'F1', 100, 'AcDbEntity', 8, '嵌入材料', 100, 'AcDbOle2Frame', 70, 2, 3, 'embedded picture', 10, 10, 20, 20, 30, 0, 11, 42, 21, 3, 31, 0, 71, 2, 72, 0, 90, payload.length)
  for (let i = 0; i < payload.length; i += 127) ole += groups(310, payload.subarray(i, i + 127).toString('hex'))
  const polyline = withPolyline ? groups(0, 'POLYLINE', 5, 'F3', 100, 'AcDbEntity', 8, '0', 100, 'AcDb2dPolyline', 66, 1, 10, 0, 20, 0, 30, 0, 70, 0,
    0, 'VERTEX', 5, 'F4', 100, 'AcDbEntity', 8, '0', 100, 'AcDbVertex', 100, 'AcDb2dVertex', 10, 0, 20, 0, 30, 0, 70, 0,
    0, 'VERTEX', 5, 'F5', 100, 'AcDbEntity', 8, '0', 100, 'AcDbVertex', 100, 'AcDb2dVertex', 10, 2, 20, 0, 30, 0, 70, 0,
    0, 'SEQEND', 5, 'F6', 100, 'AcDbEntity', 8, '0') : ''
  const dxf = Buffer.from(groups(0, 'SECTION', 2, 'ENTITIES') + ole + groups(0, 'LINE', 5, 'F2', 8, '0', 10, 0, 20, 0, 30, 0, 11, 2, 21, 0, 31, 0) + polyline + groups(0, 'ENDSEC', 0, 'EOF'))
  writeFileSync(join(root, 'drawing.dxf'), dxf)
  return { root, dxf, payload, cleanup: () => rmSync(root, { recursive: true, force: true }) }
}

test('cad_read embedded creates a full-resolution image with source identity and placement links', async () => {
  const w = fixture()
  try {
    const inventory = await executeCadRead({ action: 'inventory', path: 'drawing.dxf' }, w.root)
    assert.equal(inventory.inventory.byType.OLE2FRAME, 1)
    const records = await executeCadRead({ action: 'query', path: 'drawing.dxf', sourceHash: hash(w.dxf), query: { collection: 'source_records', types: ['OLE2FRAME'] } }, w.root)
    assert.ok('page' in records)
    const record = records.page.items[0] as any
    const result = await executeCadRead({ action: 'query', path: 'drawing.dxf', sourceHash: hash(w.dxf), query: { collection: 'embedded', recordId: record.geometryRecordId } }, w.root)
    assert.ok('page' in result)
    assert.equal(result.page.collection, 'embedded'); assert.equal(result.page.total, 1)
    const embedded = result.page.items[0] as any
    assert.equal(embedded.sourceHash, hash(w.dxf)); assert.equal(embedded.sourceRecordId, record.id); assert.equal(embedded.handle, 'F1')
    assert.equal(embedded.status, 'visual_ready'); assert.equal(embedded.preview.width, 32); assert.equal(embedded.preview.height, 17)
    assert.ok(existsSync(embedded.imagePath)); assert.deepEqual(readFileSync(embedded.payload.path), w.payload)
    assert.equal(embedded.placements.total, 1); assert.equal(embedded.placements.items[0].recordId, record.geometryRecordId)
    assert.equal(embedded.placements.items[0].geometryTransform.length, 16)
    assert.ok(result.observation.details.embedded)
    assert.equal(result.observation.details.embedded.items[0].imagePath, embedded.imagePath)
    assert.equal(result.inventory.professionalCoverage, 'not_assessed')
    assert.deepEqual(readFileSync(join(w.root, 'drawing.dxf')), w.dxf)
    const cached = await executeCadRead({ action: 'query', path: 'drawing.dxf', query: { collection: 'embedded', recordId: record.id } }, w.root)
    assert.ok('page' in cached)
    assert.equal((cached.page.items[0] as any).cached, true)
  } finally { w.cleanup() }
})

test('DWG embedded extraction separates original DWG hash from derived DXF hash and retains parser warnings', async () => {
  const w = fixture(), dwg = Buffer.from('original DWG identity for converter fixture')
  writeFileSync(join(w.root, 'source.dwg'), dwg)
  try {
    const result = await executeCadRead({ action: 'query', path: 'source.dwg', sourceHash: hash(dwg), query: { collection: 'embedded', recordId: 'entity:0' } }, w.root, {
      convert: async () => ({ path: join(w.root, 'drawing.dxf'), relativePath: 'drawing.dxf', sourceHash: hash(dwg), cached: true, warnings: [87], engine: 'mlightcad' }),
    })
    assert.ok('page' in result)
    assert.equal(result.source.sha256, hash(dwg)); assert.equal(result.source.derivedSha256, hash(w.dxf))
    assert.equal((result.page.items[0] as any).sourceHash, hash(w.dxf))
    assert.ok(result.issues.some(issue => issue.code === 'dwg-parser-warning'))
    assert.equal(result.observation.details.source.sha256, hash(dwg))
  } finally { w.cleanup() }
})

test('an OLE frame lacking binary data remains an explicit missing-content result', async () => {
  const w = fixture(false)
  try {
    const result = await executeCadRead({ action: 'query', path: 'drawing.dxf', query: { collection: 'embedded', recordId: 'entity:0' } }, w.root)
    assert.ok('page' in result)
    const embedded = result.page.items[0] as any
    assert.equal(embedded.status, 'raw_only'); assert.equal(embedded.payload.bytes, 0); assert.equal(embedded.imagePath, undefined)
    assert.match(embedded.reason, /未包含二进制/)
    assert.equal(result.inventory.professionalCoverage, 'not_assessed')
  } finally { w.cleanup() }
})

test('formal embedded route rejects missing identities, stale versions and non-OLE records', async () => {
  const w = fixture()
  try {
    await assert.rejects(executeCadRead({ action: 'query', path: 'drawing.dxf', query: { collection: 'embedded' } }, w.root), /需要 recordId/)
    await assert.rejects(executeCadRead({ action: 'query', path: 'drawing.dxf', query: { collection: 'embedded', recordId: 'entity:999' } }, w.root), /未找到该内嵌/)
    await assert.rejects(executeCadRead({ action: 'query', path: 'drawing.dxf', sourceHash: '0'.repeat(64), query: { collection: 'embedded', recordId: 'entity:0' } }, w.root), /文件版本已变化/)
    await assert.rejects(executeCadRead({ action: 'query', path: 'drawing.dxf', query: { collection: 'embedded', recordId: 'entity:1' } }, w.root), /OLE2FRAME\/OLEFRAME/)
  } finally { w.cleanup() }
})

test('cad_prepare output preserves its original DWG lineage when passed to cad_read', async () => {
  const w = fixture(), dwg = Buffer.from('DWG origin for prepared DXF lineage')
  const sourcePath = join(w.root, 'source.dwg')
  writeFileSync(sourcePath, dwg)
  try {
    const prepared = await convertDwgToDxf(w.root, sourcePath, async (_source, output) => {
      writeFileSync(output, w.dxf)
      return { engine: 'mlightcad', warnings: [87], bundledModelQuality: { valid: true } }
    })
    const receipt = JSON.parse(readFileSync(prepared.path + '.conversion.json', 'utf8'))
    assert.equal(receipt.schema, 'cad-dxf-verified/v2'); assert.equal(receipt.sourcePath, sourcePath); assert.equal(receipt.sourceHash, hash(dwg))
    const result = await executeCadRead({ action: 'query', path: prepared.relativePath, sourceHash: hash(dwg), query: { collection: 'embedded', recordId: 'entity:0' } }, w.root, { convert: async () => prepared })
    assert.ok('page' in result)
    const embedded = result.page.items[0] as any
    assert.equal(result.source.path, sourcePath); assert.equal(result.source.sha256, hash(dwg)); assert.equal(result.source.format, 'dwg')
    assert.equal(result.source.derivedPath, prepared.path); assert.equal(result.source.derivedSha256, hash(w.dxf))
    assert.equal(result.observation.source.path, sourcePath); assert.equal(result.observation.source.sha256, hash(dwg))
    assert.ok(result.issues.some(issue => issue.code === 'dwg-parser-warning'))
    assert.equal(embedded.status, 'visual_ready'); assert.equal(embedded.sourceHash, hash(w.dxf))
    assert.deepEqual(readFileSync(embedded.payload.path), w.payload)
  } finally { w.cleanup() }
})

test('verified block and layer relations cannot hide DWG entities absent from exported DXF', async () => {
  const w = fixture(true, true), sourcePath = join(w.root, 'source.dwg'), dwg = Buffer.from('DWG contains solid geometry missing from its DXF export')
  writeFileSync(sourcePath, dwg)
  try {
    const prepared = await convertDwgToDxf(w.root, sourcePath, async (_source, output) => {
      writeFileSync(output, w.dxf)
      return { engine: 'mlightcad', warnings: [68], bundledModelQuality: { valid: true, entityTypes: { OLE2FRAME: 1, LINE: 1, POLYLINE2D: 1, '3DSOLID': 57 } } }
    })
    const result = await executeCadRead({ action: 'inventory', path: prepared.relativePath, sourceHash: hash(dwg) }, w.root, { convert: async () => prepared })
    const gap = result.issues.find(issue => issue.code === 'dwg-export-coverage-gap')
    assert.ok(gap); assert.match(gap.message, /3DSOLID 57→0/)
    assert.equal(result.inventory.byType.POLYLINE, 1); assert.doesNotMatch(gap.message, /POLYLINE/)
    assert.ok(result.issues.some(issue => issue.code === 'dwg-parser-warning'))
    assert.equal(result.inventory.professionalCoverage, 'not_assessed')
    assert.equal(result.source.sha256, hash(dwg)); assert.equal(result.source.derivedSha256, hash(w.dxf))
    assert.deepEqual(readFileSync(sourcePath), dwg)
  } finally { w.cleanup() }
})

test('an internal DXF cannot reuse a valid receipt for a different derived path', async () => {
  const w = fixture(), dwg = Buffer.from('DWG source for mismatched derived path'), sourcePath = join(w.root, 'source.dwg')
  writeFileSync(sourcePath, dwg)
  try {
    const prepared = await convertDwgToDxf(w.root, sourcePath, async (_source, output) => { writeFileSync(output, w.dxf); return { warnings: [] } })
    const clone = join(w.root, '.agent-pi', 'cad-converted', 'other-output.dxf')
    writeFileSync(clone, w.dxf); writeFileSync(clone + '.conversion.json', readFileSync(prepared.path + '.conversion.json'))
    await assert.rejects(executeCadRead({ action: 'inventory', path: clone }, w.root, { convert: async () => prepared }), /已校核转换不一致/)
  } finally { w.cleanup() }
})

test('an internal legacy DXF without a verified source receipt is rejected', async () => {
  const w = fixture()
  try {
    const directory = join(w.root, '.agent-pi', 'cad-converted'); mkdirSync(directory, { recursive: true })
    const path = join(directory, 'legacy.dxf'); writeFileSync(path, w.dxf)
    assert.ok(existsSync(path)); assert.equal(existsSync(path + '.conversion.json'), false)
    await assert.rejects(executeCadRead({ action: 'inventory', path }, w.root))
  } finally { w.cleanup() }
})

test('a changed original DWG cannot be hidden by its prepared DXF', async () => {
  const w = fixture(), sourcePath = join(w.root, 'source.dwg')
  writeFileSync(sourcePath, Buffer.from('original DWG source'))
  try {
    const prepared = await convertDwgToDxf(w.root, sourcePath, async (_source, output) => { writeFileSync(output, w.dxf); return { warnings: [] } })
    writeFileSync(sourcePath, Buffer.from('a revised DWG source'))
    await assert.rejects(executeCadRead({ action: 'inventory', path: prepared.relativePath }, w.root, { convert: async () => prepared }), /来源 DWG 已变化/)
  } finally { w.cleanup() }
})
