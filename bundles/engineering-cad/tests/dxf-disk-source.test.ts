import test from 'node:test'
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { createRequire } from 'node:module'
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { parseCadDxf } from '../../../packages/engineering-cad/index.ts'
import type { CadLibrary } from '../../../packages/engineering-cad/types.ts'
import { cadFixture } from '../../../packages/engineering-cad/tests/fixture.ts'
import { assertDxfDiskSourceUnchanged, buildDxfDiskSource, queryDxfSourceRecords, readDxfSourcePairs } from '../src/dxf-disk-source.ts'

const requireCad = createRequire(new URL('../../tender-host/package.json', import.meta.url))
const library: CadLibrary = requireCad('@mlightcad/data-model')
const hash = (bytes: Buffer) => createHash('sha256').update(bytes).digest('hex')
const groups = (...values: (string | number)[]) => values.join('\n') + '\n'
function fixture(bytes: Buffer = cadFixture()) {
  const directory = mkdtempSync(join(tmpdir(), 'cad-disk-source-')), path = join(directory, 'source.dxf'), indexDirectory = join(directory, 'index')
  writeFileSync(path, bytes)
  return { directory, path, indexDirectory, cleanup: () => rmSync(directory, { recursive: true, force: true }) }
}

test('disk census retains complete byte ranges, native entity mapping, UTF8 and CRLF without binary elision', async () => {
  const bytes = Buffer.from(cadFixture().toString().replace(/\n/g, '\r\n')), w = fixture(bytes)
  try {
    const source = await buildDxfDiskSource(w.path, w.indexDirectory)
    assert.equal(source.source.sha256, hash(bytes)); assert.equal(source.source.size, bytes.length)
    assert.equal(source.projection.sha256, hash(bytes)); assert.deepEqual(readFileSync(source.projection.path), bytes)
    const records = await queryDxfSourceRecords(source, { limit: 500 })
    assert.equal(records.total, source.recordCount); assert.equal(records.nextOffset, null)
    assert.equal(records.items[0].offset, 0)
    let nextOffset = 0, nextPair = 0
    for (const record of records.items) {
      assert.equal(record.offset, nextOffset); assert.equal(record.pairStart, nextPair)
      assert.equal(record.bodyPairCount, record.pairCount - 1)
      assert.deepEqual(bytes.subarray(record.offset, record.offset + record.byteLength), readFileSync(source.projection.path).subarray(record.projectionOffset, record.projectionOffset + record.projectionByteLength))
      nextOffset += record.byteLength; nextPair += record.pairCount
    }
    assert.equal(nextOffset, bytes.length); assert.equal(nextPair, source.pairCount)
    const parsed = await parseCadDxf(bytes, library)
    const entityRecords = records.items.filter(row => row.geometryRecordId)
    assert.equal(entityRecords.length, parsed.records.length)
    for (let i = 0; i < entityRecords.length; i++) {
      assert.equal(entityRecords[i].geometryRecordId, parsed.records[i].id)
      assert.equal(entityRecords[i].type, parsed.records[i].type)
      assert.equal(entityRecords[i].handle, parsed.records[i].handle)
      if (entityRecords[i].block !== undefined) assert.equal(entityRecords[i].block, parsed.records[i].block)
      assert.equal(entityRecords[i].owner, parsed.records[i].owner)
    }
    const mtext = entityRecords.find(row => row.type === 'MTEXT')!
    const page = await readDxfSourcePairs(source, library, { recordId: mtext.geometryRecordId! })
    assert.equal(page.items[0].code, 0); assert.equal(page.items[0].value, 'MTEXT')
    assert.equal(page.items.find(pair => pair.code === 3)!.value, '钢筋 ')
    assert.equal(page.items.find(pair => pair.code === 1)!.value, '表\\P详图')
    assert.equal(page.complete, true)
  } finally { w.cleanup() }
})

test('binary payload stays in source and paged groups preserve native number, bigint, binary and unknown object semantics', async () => {
  const bytes = Buffer.from(groups(0, 'SECTION', 2, 'ENTITIES', 0, 'UNKNOWN_ENTITY', 5, 'A', 8, '原始层', 10, 1.25, 310, '00FF7A', 310, 'DEADBEEF', 1004, 'AABB', 160, '9223372036854775806', 0, 'ENDSEC',
    0, 'SECTION', 2, 'OBJECTS', 0, 'UNKNOWN_OBJECT', 5, 'B', 1, 'opaque object preserved', 310, 'CAFE', 0, 'ENDSEC', 0, 'EOF'))
  const w = fixture(bytes)
  try {
    const source = await buildDxfDiskSource(w.path, w.indexDirectory)
    assert.equal(source.projection.binaryPairsOmitted, 4)
    assert.ok(source.projection.binaryBytesRetained > 0)
    assert.equal(source.source.sha256, hash(readFileSync(w.path)))
    const projected = readFileSync(source.projection.path).toString()
    assert.ok(!projected.includes('DEADBEEF')); assert.ok(projected.includes('UNKNOWN_OBJECT'))
    const objects = await queryDxfSourceRecords(source, { section: 'objects', types: ['unknown_object'] })
    assert.equal(objects.total, 1); assert.equal(objects.items[0].geometryRecordId, undefined)
    const entities = await queryDxfSourceRecords(source, { handle: 'a' }), record = entities.items[0]
    assert.equal(record.geometryRecordId, 'entity:0'); assert.equal(record.binaryPairCount, 3)
    const head = await readDxfSourcePairs(source, library, { recordId: record.id, limit: 4 })
    assert.equal(head.complete, false); assert.equal(head.nextOffset, 4)
    const tail = await readDxfSourcePairs(source, library, { recordId: 'entity:0', offset: 4 })
    assert.deepEqual(tail.items.filter(pair => pair.code === 310).map(pair => pair.value), [[0, 255, 122], [222, 173, 190, 239]])
    assert.deepEqual(tail.items.find(pair => pair.code === 1004)!.value, [170, 187])
    assert.equal(tail.items.find(pair => pair.code === 160)!.value, '9223372036854775806')
    assert.equal(tail.complete, true); assert.equal(tail.nextOffset, null)
    assert.equal(head.items.find(pair => pair.code === 10)!.value, 1.25)
    const objectPage = await readDxfSourcePairs(source, library, { recordId: objects.items[0].id })
    assert.equal(objectPage.items.find(pair => pair.code === 1)!.value, 'opaque object preserved')
    assert.deepEqual(objectPage.items.find(pair => pair.code === 310)!.value, [202, 254])
    await assert.rejects(readDxfSourcePairs(source, library, { recordId: record.id, limit: 501 }), /1\.\.500/)
    await assert.rejects(readDxfSourcePairs(source, library, { recordId: 'entity:999' }), /not found/)
  } finally { w.cleanup() }
})

test('scanner handles a UTF8 value split across stream chunks and final EOF without newline', async () => {
  const text = '钢筋'.repeat(50000), bytes = Buffer.from(groups(0, 'SECTION', 2, 'ENTITIES', 0, 'MTEXT', 5, '1', 1, text, 0, 'ENDSEC', 0, 'EOF').trimEnd()), w = fixture(bytes)
  try {
    const source = await buildDxfDiskSource(w.path, w.indexDirectory)
    assert.equal(source.source.sha256, hash(bytes))
    assert.equal((await readDxfSourcePairs(source, library, { recordId: 'entity:0' })).items.find(pair => pair.code === 1)!.value, text)
    assert.equal(readFileSync(source.projection.path).length, bytes.length)
  } finally { w.cleanup() }
})

test('strict incomplete and oversized projection inputs fail without changing source or leaving partial indexes', async () => {
  for (const text of [groups(0, 'SECTION', 2, 'ENTITIES', 0, 'LINE') + '10\n', groups(0, 'SECTION', 2, 'ENTITIES', 0, 'LINE', 10, 2, 0, 'ENDSEC'), '1\nbefore record\n', groups(0, 'SECTION', 2, 'ENTITIES', 0, 'ENDSEC', 0, 'EOF', 1, 'after EOF')]) {
    const bytes = Buffer.from(text), w = fixture(bytes)
    try {
      await assert.rejects(buildDxfDiskSource(w.path, w.indexDirectory), /Incomplete|complete|precede|after EOF/)
      assert.deepEqual(readFileSync(w.path), bytes)
      assert.equal(existsSync(join(w.indexDirectory, 'geometry.dxf')), false)
      assert.equal(existsSync(join(w.indexDirectory, 'records.jsonl')), false)
      assert.equal(existsSync(join(w.indexDirectory, 'pairs.bin')), false)
    } finally { w.cleanup() }
  }
  const w = fixture()
  try {
    await assert.rejects(buildDxfDiskSource(w.path, w.indexDirectory, { projectionBudgetBytes: 20 }), /explicit 20 byte budget.*not truncated/)
    assert.deepEqual(readFileSync(w.path), cadFixture())
    assert.equal(existsSync(join(w.indexDirectory, 'geometry.dxf')), false)
  } finally { w.cleanup() }
})

test('source comments are retained before SECTION and inside records even though the native filer skips them', async () => {
  const bytes = Buffer.from(groups(999, ' 前置注释 ', 0, 'SECTION', 2, 'ENTITIES', 0, 'UNKNOWN', 5, 'A', 999, '保留注释', 10, 2, 999, ' 尾注释 ', 0, 'ENDSEC', 0, 'EOF')), w = fixture(bytes)
  try {
    const source = await buildDxfDiskSource(w.path, w.indexDirectory)
    assert.deepEqual(readFileSync(source.projection.path), bytes)
    const preamble = (await queryDxfSourceRecords(source, { types: ['PREAMBLE'] })).items[0]
    assert.equal(preamble.hasStartGroup, false); assert.equal(preamble.bodyPairCount, 1)
    assert.deepEqual((await readDxfSourcePairs(source, library, { recordId: preamble.id })).items, [{ code: 999, value: ' 前置注释 ' }])
    const page = await readDxfSourcePairs(source, library, { recordId: 'entity:0' })
    assert.deepEqual(page.items.filter(pair => pair.code === 999).map(pair => pair.value), ['保留注释', ' 尾注释 '])
    assert.equal(page.items.find(pair => pair.code === 10)!.value, 2)
    assert.equal(page.items.length, page.total)
  } finally { w.cleanup() }
})

test('legacy invalid UTF8 is rejected explicitly and source bytes are never replaced', async () => {
  const bytes = Buffer.concat([Buffer.from(groups(0, 'SECTION', 2, 'ENTITIES', 0, 'TEXT', 1)), Buffer.from([0xff, 0x80]), Buffer.from('\n' + groups(0, 'ENDSEC', 0, 'EOF'))]), w = fixture(bytes)
  try {
    await assert.rejects(buildDxfDiskSource(w.path, w.indexDirectory), /requires valid UTF8/)
    assert.deepEqual(readFileSync(w.path), bytes)
    assert.equal(existsSync(join(w.indexDirectory, 'geometry.dxf')), false)
  } finally { w.cleanup() }
})

test('source version changes invalidate both record and typed-pair pages', async () => {
  const w = fixture()
  try {
    const source = await buildDxfDiskSource(w.path, w.indexDirectory)
    writeFileSync(w.path, Buffer.from(cadFixture().toString().replace('600', '650') + '\n'))
    assert.throws(() => assertDxfDiskSourceUnchanged(source), /version changed/)
    await assert.rejects(queryDxfSourceRecords(source), /version changed/)
    await assert.rejects(readDxfSourcePairs(source, library, { recordId: 'entity:0' }), /version changed/)
  } finally { w.cleanup() }
})

test('raw pages enforce their byte budget and can resume with fewer groups without source loss', async () => {
  const text = 'x'.repeat(5 * 1024 * 1024), bytes = Buffer.from(groups(0, 'SECTION', 2, 'ENTITIES', 0, 'MTEXT', 1, text, 3, text, 0, 'ENDSEC', 0, 'EOF')), w = fixture(bytes)
  try {
    const source = await buildDxfDiskSource(w.path, w.indexDirectory)
    await assert.rejects(readDxfSourcePairs(source, library, { recordId: 'entity:0' }), /raw page exceeds.*request fewer groups.*not truncated/)
    const page = await readDxfSourcePairs(source, library, { recordId: 'entity:0', offset: 1, limit: 1 })
    assert.equal(page.items.length, 1); assert.equal(page.items[0].value, text)
    assert.equal(page.nextOffset, 2); assert.equal(page.complete, false)
    assert.deepEqual(readFileSync(w.path), bytes)
  } finally { w.cleanup() }
})
