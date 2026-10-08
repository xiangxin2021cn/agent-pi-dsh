import test from 'node:test'
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { closeSync, existsSync, mkdirSync, mkdtempSync, openSync, readFileSync, readdirSync, rmSync, statSync, symlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { cadFixture } from '../../../packages/engineering-cad/tests/fixture.ts'
import { executeCadRead, readCadDrawing } from '../src/reader.ts'

const indexed = { diskThresholdBytes: 1 }
const groups = (...values: (string | number)[]) => values.join('\n') + '\n'
const digest = (bytes: Uint8Array) => createHash('sha256').update(bytes).digest('hex')

function workspace() {
  const directory = mkdtempSync(join(tmpdir(), 'engineering-cad-large-')), root = join(directory, 'workspace')
  mkdirSync(root); writeFileSync(join(root, 'drawing.dxf'), cadFixture())
  return { directory, root, cleanup: () => rmSync(directory, { recursive: true, force: true }) }
}

/** Write complete binary groups in bounded chunks rather than manufacturing one large JS string. */
function embeddedDrawing(path: string, binaryPairs: number) {
  const text = cadFixture().toString(), marker = '0\nENDSEC\n0\nSECTION\n2\nOBJECTS\n'
  const split = text.indexOf(marker)
  assert.ok(split > 0)
  const suffix = text.slice(split).replace('0\nENDSEC\n0\nEOF\n',
    groups(0, 'UNSUPPORTED_TEST_OBJECT', 5, 'F2', 1, '未解码对象原文', 310, 'DEADBEEF') + '0\nENDSEC\n0\nEOF\n')
  const head = groups(0, 'OLE2FRAME', 5, 'EE', 330, 'B1', 100, 'AcDbEntity', 8, 'STRUCTURE', 100, 'AcDbOle2Frame', 70, 2, 3, 'embedded test data', 10, 0, 20, 0, 30, 0, 11, 1, 21, 1, 31, 0, 90, binaryPairs * 127)
  const binaryGroup = Buffer.from(groups(310, 'AA'.repeat(127))), batchPairs = 1024
  const batch = Buffer.alloc(binaryGroup.length * batchPairs)
  for (let i = 0; i < batchPairs; i++) binaryGroup.copy(batch, i * binaryGroup.length)
  const fd = openSync(path, 'w'), hash = createHash('sha256')
  const write = (bytes: Buffer) => { writeFileSync(fd, bytes); hash.update(bytes) }
  try {
    write(Buffer.from(text.slice(0, split))); write(Buffer.from(head))
    let remaining = binaryPairs
    while (remaining >= batchPairs) { write(batch); remaining -= batchPairs }
    if (remaining) write(batch.subarray(0, remaining * binaryGroup.length))
    write(Buffer.from(groups(1, '嵌入内容后仍保留的文字') + suffix))
  } finally { closeSync(fd) }
  return { sha256: hash.digest('hex'), binaryPairs, encodedBinaryBytes: binaryPairs * binaryGroup.length, binaryValues: Array<number>(127).fill(170) }
}

function comparableRows(items: any[]) {
  const fields = ['id', 'type', 'handle', 'owner', 'section', 'block', 'space', 'layout', 'layer', 'auxiliary', 'nativeDecoded', 'text', 'dimension', 'points', 'geometry', 'recordId', 'path', 'parentTransform', 'geometryTransform', 'blockTransform']
  return JSON.parse(JSON.stringify(items.map(row => Object.fromEntries(fields.filter(field => field in row).map(field => [field, row[field]])))))
}

test('disk projection preserves the normal drawing inventory, geometry and nested-instance pages', async () => {
  const w = workspace()
  try {
    const memory = await readCadDrawing(w.root, 'drawing.dxf')
    const disk = await readCadDrawing(w.root, 'drawing.dxf', indexed)
    assert.equal(disk.source.sha256, memory.source.sha256)
    assert.equal(disk.source.derivedSha256, memory.source.derivedSha256)
    assert.deepEqual(disk.index.inventory, memory.index.inventory)
    assert.deepEqual(disk.index.units, memory.index.units)
    assert.equal(disk.storage?.mode, 'disk')
    assert.equal(disk.storage?.originalPairsComplete, true)
    assert.equal(disk.storage?.embeddedData, 'preserved_on_disk')
    assert.equal(disk.index.records.length, 0)
    assert.equal(disk.index.instances.length, 0)
    for (const collection of ['records', 'instances', 'blocks', 'layers', 'layouts'] as const) {
      const args = { action: 'query', path: 'drawing.dxf', sourceHash: disk.source.sha256, query: { collection, limit: 500 } }
      const expected = await executeCadRead(args, w.root)
      const actual = await executeCadRead(args, w.root, indexed)
      assert.ok('page' in expected && expected.page && 'page' in actual && actual.page)
      assert.equal(actual.page.total, expected.page.total)
      assert.deepEqual(comparableRows(actual.page.items), comparableRows(expected.page.items), collection)
    }
    const page = await executeCadRead({ action: 'query', path: 'drawing.dxf', query: { collection: 'records', handle: 'E6', includeRaw: true } }, w.root, indexed)
    assert.ok('page' in page && page.page)
    const row = page.page.items[0] as any
    assert.ok(row.rawSource.recordId.startsWith('source-record:'))
    assert.equal(row.rawPage.nextOffset, null)
    assert.ok(row.rawPage.items.some((pair: any) => pair.code === 3 && pair.value === '钢筋 '))
    assert.equal('pairs' in row, false)
  } finally { w.cleanup() }
})

test('original OLE groups and unknown objects remain available through bounded raw pagination', async () => {
  const w = workspace()
  try {
    const fixture = embeddedDrawing(join(w.root, 'drawing.dxf'), 603)
    const inventory = await executeCadRead({ action: 'inventory', path: 'drawing.dxf' }, w.root, indexed)
    assert.equal(inventory.source.sha256, fixture.sha256)
    assert.equal(inventory.inventory.byType.OLE2FRAME, 1)
    const records = await executeCadRead({ action: 'query', path: 'drawing.dxf', sourceHash: fixture.sha256, query: { collection: 'records', handle: 'EE', includeRaw: true } }, w.root, indexed)
    assert.ok('page' in records && records.page)
    const embedded = records.page.items[0] as any
    assert.equal(embedded.nativeDecoded, false)
    assert.equal(embedded.rawSource.binaryPairCount, fixture.binaryPairs)
    assert.ok(embedded.rawPage.nextOffset !== null)
    assert.ok(embedded.rawPage.items.length <= 500)
    const allPairs: any[] = []
    let offset = 0
    for (;;) {
      const result = await executeCadRead({ action: 'query', path: 'drawing.dxf', sourceHash: fixture.sha256, query: { collection: 'raw_pairs', recordId: embedded.id, offset, limit: 200 } }, w.root, indexed)
      assert.ok('page' in result && result.page)
      assert.ok(result.page.items.length <= 200)
      allPairs.push(...result.page.items)
      if (result.page.nextOffset === null) break
      offset = result.page.nextOffset
    }
    assert.equal(allPairs.length, embedded.rawSource.pairCount)
    assert.equal(allPairs[0].code, 0)
    assert.equal(allPairs[0].value, 'OLE2FRAME')
    const binary = allPairs.filter(pair => pair.code === 310)
    assert.equal(binary.length, fixture.binaryPairs)
    assert.ok(binary.every(pair => pair.value.length === 127 && pair.value[0] === 170 && pair.value[126] === 170))
    assert.ok(allPairs.some(pair => pair.code === 1 && pair.value === '嵌入内容后仍保留的文字'))
    const unknown = await executeCadRead({ action: 'query', path: 'drawing.dxf', query: { collection: 'source_records', section: 'OBJECTS', types: ['UNSUPPORTED_TEST_OBJECT'], limit: 1 } }, w.root, indexed)
    assert.ok('page' in unknown && unknown.page)
    assert.equal(unknown.page.total, 1)
    const raw = await executeCadRead({ action: 'query', path: 'drawing.dxf', query: { collection: 'raw_pairs', recordId: unknown.page.items[0].id, limit: 500 } }, w.root, indexed)
    assert.ok('page' in raw && raw.page)
    assert.deepEqual(raw.page.items.find((pair: any) => pair.code === 310), { code: 310, value: [222, 173, 190, 239] })
    assert.equal(digest(readFileSync(join(w.root, 'drawing.dxf'))), fixture.sha256)
  } finally { w.cleanup() }
})

test('disk pages reuse the validated index and rebuild a broken summary instead of trusting it', async () => {
  const w = workspace()
  try {
    const first = await readCadDrawing(w.root, 'drawing.dxf', indexed)
    const summaryPath = join(w.root, '.agent-pi', 'cad-index', first.source.derivedSha256, 'summary.json')
    assert.ok(existsSync(summaryPath))
    const summary = readFileSync(summaryPath), modified = statSync(summaryPath).mtimeMs
    const args = { action: 'query', path: 'drawing.dxf', sourceHash: first.source.sha256, query: { collection: 'instances' as const, offset: 1, limit: 2 } }
    const second = await executeCadRead(args, w.root, indexed), third = await executeCadRead(args, w.root, indexed)
    assert.ok('page' in second && second.page && 'page' in third && third.page)
    assert.deepEqual(third.page, second.page)
    assert.deepEqual(readFileSync(summaryPath), summary)
    assert.equal(statSync(summaryPath).mtimeMs, modified)
    writeFileSync(summaryPath, '{ broken index summary')
    const rebuilt = await executeCadRead(args, w.root, indexed)
    assert.ok('page' in rebuilt && rebuilt.page)
    assert.deepEqual(rebuilt.page, second.page)
    assert.doesNotThrow(() => JSON.parse(readFileSync(summaryPath, 'utf8')))
  } finally { w.cleanup() }
})

test('indexed pages reject a changed source hash and invalid pair page size', async () => {
  const w = workspace()
  try {
    const initial = await readCadDrawing(w.root, 'drawing.dxf', indexed)
    await assert.rejects(executeCadRead({ action: 'query', path: 'drawing.dxf', query: { collection: 'raw_pairs', recordId: 'entity:0', limit: 501 } }, w.root, indexed), /1\.\.500/)
    writeFileSync(join(w.root, 'drawing.dxf'), cadFixture().toString().replace('600', '650'))
    await assert.rejects(executeCadRead({ action: 'query', path: 'drawing.dxf', sourceHash: initial.source.sha256, query: { collection: 'records', limit: 1 } }, w.root, indexed), /版本已变化/)
    const current = await executeCadRead({ action: 'query', path: 'drawing.dxf', query: { collection: 'records', handle: 'E4' } }, w.root, indexed)
    assert.ok('page' in current && current.page)
    assert.equal((current.page.items[0] as any).dimension.override, '650')
  } finally { w.cleanup() }
})

test('disk cache cannot escape through an existing directory junction', async () => {
  const w = workspace(), outside = join(w.directory, 'outside')
  try {
    mkdirSync(outside)
    symlinkSync(outside, join(w.root, '.agent-pi'), process.platform === 'win32' ? 'junction' : 'dir')
    await assert.rejects(readCadDrawing(w.root, 'drawing.dxf', indexed), /符号链接/)
    assert.equal(existsSync(join(outside, 'cad-index')), false)
  } finally { w.cleanup() }
})

test('overflowed nested transforms cannot become null in a persisted geometry index', async () => {
  const w = workspace()
  try {
    const original = cadFixture().toString(), needle = 'INSERT\n5\nE1\n8\nSTRUCTURE\n330\nB1'
    const text = original.replace(needle, needle + '\n41\n9' + '0'.repeat(307))
    assert.notEqual(text, original)
    const bytes = Buffer.from(text), path = join(w.root, 'drawing.dxf')
    writeFileSync(path, bytes)
    await assert.rejects(readCadDrawing(w.root, 'drawing.dxf', indexed), /非有限数值/)
    assert.deepEqual(readFileSync(path), bytes)
    const cache = join(w.root, '.agent-pi', 'cad-index')
    assert.equal(existsSync(join(cache, digest(bytes), 'summary.json')), false)
    assert.deepEqual(existsSync(cache) ? readdirSync(cache) : [], [])
  } finally { w.cleanup() }
})

test('valid ASCII DXF above 128 MiB takes the disk path without dropping embedded groups', { timeout: 120_000 }, async () => {
  const w = workspace()
  try {
    const binaryPairs = Math.ceil((128 * 1024 * 1024 + 1) / groups(310, 'AA'.repeat(127)).length)
    const fixture = embeddedDrawing(join(w.root, 'drawing.dxf'), binaryPairs)
    assert.ok(statSync(join(w.root, 'drawing.dxf')).size > 128 * 1024 * 1024)
    const drawing = await readCadDrawing(w.root, 'drawing.dxf')
    assert.equal(drawing.storage?.mode, 'disk')
    assert.equal(drawing.source.sha256, fixture.sha256)
    assert.equal(drawing.source.derivedSha256, fixture.sha256)
    assert.equal(drawing.index.inventory.byType.OLE2FRAME, 1)
    assert.equal(drawing.index.inventory.professionalCoverage, 'not_assessed')
    const source = await executeCadRead({ action: 'query', path: 'drawing.dxf', sourceHash: fixture.sha256, query: { collection: 'source_records', handle: 'EE', limit: 1 } }, w.root)
    assert.ok('page' in source && source.page)
    const record = source.page.items[0] as any
    assert.equal(record.binaryPairCount, binaryPairs)
    assert.ok(record.byteLength > 128 * 1024 * 1024)
    const last = await executeCadRead({ action: 'query', path: 'drawing.dxf', sourceHash: fixture.sha256, query: { collection: 'raw_pairs', recordId: record.id, offset: record.pairCount - 2, limit: 2 } }, w.root)
    assert.ok('page' in last && last.page)
    assert.equal(last.page.nextOffset, null)
    assert.deepEqual(last.page.items[0], { code: 310, value: fixture.binaryValues })
    assert.deepEqual(last.page.items[1], { code: 1, value: '嵌入内容后仍保留的文字' })
  } finally { w.cleanup() }
})
