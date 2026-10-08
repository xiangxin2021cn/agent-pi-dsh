import assert from 'node:assert/strict'
import { constants } from 'node:buffer'
import { createHash } from 'node:crypto'
import { closeSync, createReadStream, existsSync, mkdtempSync, openSync, readFileSync, readSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'
import { writeDatabaseDxf } from '../src/cad-dxf-output.mjs'
import { convertDwgToDxf } from '../src/cad-convert.ts'

const require = createRequire(import.meta.url)
const { AcDbDatabase, AcDbDxfFiler, AcDbLine, AcDbMText, AcDbBlockTableRecord, AcDbBlockReference, acdbHostApplicationServices } = require('@mlightcad/data-model')

function databaseFixture() {
  const database = new AcDbDatabase()
  acdbHostApplicationServices().workingDatabase = database
  database.createDefaultData()
  const block = new AcDbBlockTableRecord({ name: '钢筋块' })
  database.tables.blockTable.add(block)
  block.appendEntity(new AcDbLine({ x: 0.123456789, y: -2.5, z: 0 }, { x: 3.25, y: 4.5, z: 0 }))
  const text = new AcDbMText()
  text.contents = '钢筋 Φ20 😀\\P' + 'abc中文😀'.repeat(150)
  text.height = 2.25
  text.width = 5.125
  text.location = { x: 10.5, y: -11.25, z: 0 }
  const reference = new AcDbBlockReference('钢筋块')
  reference.position = { x: 25.125, y: 100.5, z: 0 }
  database.tables.blockTable.modelSpace.appendEntity([
    text, reference, new AcDbLine({ x: 1 / 3, y: -0.000001, z: 0 }, { x: 20.25, y: 5.125, z: 2.25 }),
  ])
  return database
}

function syntheticDatabase(payload, count, fail = false) {
  return {
    dxfOut() {
      const filer = new AcDbDxfFiler({ database: this })
      filer.startSection('ENTITIES')
      for (let i = 0; i < count; i++) filer.writeGroup(999, payload)
      if (fail) throw new Error('synthetic entity export failed')
      filer.endSection().writeStart('EOF')
      return filer.toString()
    },
  }
}

function withWorkspace(run) {
  const directory = mkdtempSync(join(tmpdir(), 'ap-dxf-output-'))
  return Promise.resolve().then(() => run(directory)).finally(() => rmSync(directory, { recursive: true, force: true }))
}

function originalMethods() {
  return { writeGroup: AcDbDxfFiler.prototype.writeGroup, toString: AcDbDxfFiler.prototype.toString }
}

function assertMethodsRestored(original) {
  assert.equal(AcDbDxfFiler.prototype.writeGroup, original.writeGroup)
  assert.equal(AcDbDxfFiler.prototype.toString, original.toString)
  const filer = new AcDbDxfFiler()
  assert.equal(filer.writeGroup(1, 'ordinary filer').toString(), '1\nordinary filer\n')
}

test('streamed real database DXF preserves native formatting, blocks, MTEXT and Unicode', () => withWorkspace(directory => {
  // Export independent identical databases: the native exporter allocates fresh BLOCK handles on every call.
  const expected = databaseFixture().dxfOut()
  const original = originalMethods(), output = join(directory, 'drawing.dxf')
  writeDatabaseDxf(databaseFixture(), output)
  // Compare the bytes the original writeFileSync(string, 'utf8') would have written.
  assert.deepEqual(readFileSync(output), Buffer.from(expected, 'utf8'))
  for (const marker of ['MTEXT', 'INSERT', 'ENDBLK', 'OBJECTS', '钢筋', '😀', '0.123456789']) assert.ok(expected.includes(marker), marker)
  assertMethodsRestored(original)
}))

test('chunk boundaries keep complete Unicode group values and native newline sanitization', () => withWorkspace(directory => {
  const payload = '中😀\\P钢筋\r\n说明\0'.repeat(120_000)
  const database = syntheticDatabase(payload, 2), expected = database.dxfOut()
  const output = join(directory, 'unicode.dxf'), original = originalMethods()
  writeDatabaseDxf(database, output)
  assert.equal(readFileSync(output, 'utf8'), expected)
  assert.ok(expected.length > 2 * 1024 * 1024)
  assert.ok(!expected.includes('\0'))
  assertMethodsRestored(original)
}))

test('output larger than the native string limit is complete without allocating its full string', () => withWorkspace(async directory => {
  const payload = 'x'.repeat(1024 * 1024)
  const count = Math.ceil(constants.MAX_STRING_LENGTH / payload.length)
  const database = syntheticDatabase(payload, count), output = join(directory, 'large.dxf')
  assert.throws(() => database.dxfOut(), { name: 'RangeError', message: 'Invalid string length' })
  const original = originalMethods()
  writeDatabaseDxf(database, output)
  const prefix = Buffer.from('0\nSECTION\n2\nENTITIES\n'), group = Buffer.from('999\n' + payload + '\n'), suffix = Buffer.from('0\nENDSEC\n0\nEOF\n')
  assert.equal(statSync(output).size, prefix.length + count * group.length + suffix.length)
  assert.ok(statSync(output).size > constants.MAX_STRING_LENGTH)
  const expectedHash = createHash('sha256').update(prefix)
  for (let i = 0; i < count; i++) expectedHash.update(group)
  expectedHash.update(suffix)
  const actualHash = createHash('sha256')
  for await (const chunk of createReadStream(output)) actualHash.update(chunk)
  assert.equal(actualHash.digest('hex'), expectedHash.digest('hex'))
  const fd = openSync(output, 'r'), tail = Buffer.alloc(suffix.length)
  try { assert.equal(readSync(fd, tail, 0, tail.length, statSync(output).size - tail.length), tail.length) }
  finally { closeSync(fd) }
  assert.deepEqual(tail, suffix)
  assertMethodsRestored(original)
}))

test('serialization failure removes partial output and restores the shared filer methods', () => withWorkspace(directory => {
  const original = originalMethods(), output = join(directory, 'partial.dxf')
  assert.throws(() => writeDatabaseDxf(syntheticDatabase('x'.repeat(1024 * 1024), 2, true), output), /synthetic entity export failed/)
  assert.equal(existsSync(output), false)
  assertMethodsRestored(original)
}))

test('output open failure leaves the original filer methods usable', () => withWorkspace(directory => {
  const original = originalMethods()
  assert.throws(() => writeDatabaseDxf(databaseFixture(), join(directory, 'missing', 'drawing.dxf')), /ENOENT/)
  assertMethodsRestored(original)
}))

test('an unrelated filer remains independent while the target database is exporting', () => withWorkspace(directory => {
  let unrelated
  const database = {
    dxfOut() {
      const side = new AcDbDxfFiler()
      unrelated = side.writeGroup(1, 'outside target database').toString()
      const target = new AcDbDxfFiler({ database: this })
      return target.startSection('ENTITIES').endSection().writeStart('EOF').toString()
    },
  }
  const output = join(directory, 'scoped.dxf'), original = originalMethods()
  writeDatabaseDxf(database, output)
  assert.equal(unrelated, '1\noutside target database\n')
  assert.equal(readFileSync(output, 'utf8'), '0\nSECTION\n2\nENTITIES\n0\nENDSEC\n0\nEOF\n')
  assertMethodsRestored(original)
}))

test('an existing output is preserved when exclusive creation fails', () => withWorkspace(directory => {
  const output = join(directory, 'existing.dxf'), original = originalMethods()
  writeFileSync(output, 'existing verified output')
  assert.throws(() => writeDatabaseDxf(databaseFixture(), output), /EEXIST/)
  assert.equal(readFileSync(output, 'utf8'), 'existing verified output')
  assertMethodsRestored(original)
}))

test('conversion failure does not cache a partial DXF or retain a temporary file', () => withWorkspace(async directory => {
  const source = join(directory, 'drawing.dwg'), original = originalMethods()
  writeFileSync(source, 'unchanged DWG source')
  await assert.rejects(convertDwgToDxf(directory, source, async (_source, output) => {
    writeDatabaseDxf(syntheticDatabase('x'.repeat(1024 * 1024), 2, true), output)
  }), /synthetic entity export failed/)
  assert.deepEqual(readdirSync(join(directory, '.agent-pi', 'cad-converted')), [])
  assert.equal(readFileSync(source, 'utf8'), 'unchanged DWG source')
  assertMethodsRestored(original)
}))
