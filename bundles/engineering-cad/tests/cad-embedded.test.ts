import test from 'node:test'
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { createRequire } from 'node:module'
import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { extractCadEmbedded } from '../src/cad-embedded.ts'
import { buildDxfDiskSource, queryDxfSourceRecords } from '../src/dxf-disk-source.ts'

const requireCad = createRequire(new URL('../../tender-host/package.json', import.meta.url))
const { createCanvas, loadImage } = requireCad('@napi-rs/canvas')
const hash = (bytes: Uint8Array) => createHash('sha256').update(bytes).digest('hex')
const groups = (...values: (string | number)[]) => values.join('\n') + '\n'

async function fixture(payload: Buffer, options: { chunkBytes?: number; declaredBytes?: number; invalidHex?: boolean | string; type?: string } = {}) {
  const directory = mkdtempSync(join(tmpdir(), 'cad-embedded-')), path = join(directory, 'source.dxf'), output = join(directory, 'output')
  const chunkBytes = options.chunkBytes || 127
  let body = groups(0, options.type || 'OLE2FRAME', 5, 'FA', 100, 'AcDbEntity', 8, '钢筋', 100, 'AcDbOle2Frame', 90, options.declaredBytes ?? payload.length)
  for (let offset = 0; offset < payload.length; offset += chunkBytes) body += groups(310, options.invalidHex ? (typeof options.invalidHex === 'string' ? options.invalidHex : 'ABX0') : payload.subarray(offset, offset + chunkBytes).toString('hex'))
  writeFileSync(path, groups(0, 'SECTION', 2, 'ENTITIES') + body + groups(0, 'ENDSEC', 0, 'EOF'))
  const source = await buildDxfDiskSource(path, join(directory, 'index'))
  const record = (await queryDxfSourceRecords(source, { recordId: 'entity:0' })).items[0]
  return { directory, path, output, source, record, cleanup: () => rmSync(directory, { recursive: true, force: true }) }
}

function picture(width = 19, height = 11) {
  const canvas = createCanvas(width, height), context = canvas.getContext('2d')
  context.fillStyle = '#21a0d6'; context.fillRect(0, 0, width, height)
  context.fillStyle = '#fe4700'; context.fillRect(3, 2, 5, 4)
  return canvas.toBuffer('image/png') as Buffer
}

test('embedded content becomes a real full-resolution PNG and keeps hash-linked original bytes', async () => {
  const payload = Buffer.concat([Buffer.alloc(128), picture()]), w = await fixture(payload)
  try {
    const result = await extractCadEmbedded(w.source, w.record, w.output)
    assert.equal(result.status, 'visual_ready'); assert.equal(result.semanticStatus, 'requires_visual_review')
    assert.equal(result.sourceHash, w.source.source.sha256); assert.equal(result.recordId, 'entity:0')
    assert.equal(result.sourceRecordId, w.record.id); assert.equal(result.handle, 'FA')
    assert.equal(result.payload.sha256, hash(payload)); assert.deepEqual(readFileSync(result.payload.path), payload)
    assert.equal(result.preview!.width, 19); assert.equal(result.preview!.height, 11)
    assert.equal(result.imagePath, result.preview!.path); assert.equal(result.preview!.sha256, hash(readFileSync(result.imagePath!)))
    const image = await loadImage(result.imagePath), canvas = createCanvas(19, 11), context = canvas.getContext('2d')
    context.drawImage(image, 0, 0)
    assert.deepEqual(Array.from(context.getImageData(4, 3, 1, 1).data), [254, 71, 0, 255])
    assert.deepEqual(Array.from(context.getImageData(12, 7, 1, 1).data), [33, 160, 214, 255])
    assert.equal((await extractCadEmbedded(w.source, w.record, w.output)).cached, true)
  } finally { w.cleanup() }
})

test('more than 500 binary groups are streamed in order and preview cache corruption is repaired', async () => {
  const payload = Buffer.concat([Buffer.alloc(2000), picture()]), w = await fixture(payload, { chunkBytes: 3 })
  try {
    assert.ok(w.record.binaryPairCount > 500)
    const first = await extractCadEmbedded(w.source, w.record, w.output)
    assert.equal(first.binaryPairCount, Math.ceil(payload.length / 3)); assert.deepEqual(readFileSync(first.payload.path), payload)
    writeFileSync(first.imagePath!, 'corrupt')
    const rebuilt = await extractCadEmbedded(w.source, w.record, w.output)
    assert.equal(rebuilt.cached, false); assert.equal(rebuilt.status, 'visual_ready')
    assert.equal(rebuilt.preview!.sha256, first.preview!.sha256)
    writeFileSync(join(w.output, 'embedded.json'), JSON.stringify({ ...rebuilt, payload: undefined }))
    assert.equal((await extractCadEmbedded(w.source, w.record, w.output)).cached, false)
  } finally { w.cleanup() }
})

test('embedded extraction and its cache work below project paths longer than Windows MAX_PATH', async () => {
  const payload = Buffer.concat([Buffer.alloc(128), picture()]), w = await fixture(payload)
  try {
    const output = join(w.directory, 'project'.repeat(12), 'analysis'.repeat(12), 'source'.repeat(12), 'output')
    assert.ok(output.length > 260)
    const result = await extractCadEmbedded(w.source, w.record, output)
    assert.equal(result.status, 'visual_ready'); assert.deepEqual(readFileSync(result.payload.path), payload)
    assert.ok(existsSync(result.imagePath!)); assert.equal((await extractCadEmbedded(w.source, w.record, output)).cached, true)
    assert.equal(readdirSync(output).some(name => name.startsWith('.extract-')), false)
  } finally { w.cleanup() }
})

test('opaque OLE and its embedded compound bytes are retained with an explicit raw-only result', async () => {
  const compound = Buffer.concat([Buffer.from('d0cf11e0a1b11ae1', 'hex'), Buffer.alloc(1024)]), payload = Buffer.concat([Buffer.alloc(128), compound]), w = await fixture(payload)
  try {
    const result = await extractCadEmbedded(w.source, w.record, w.output)
    assert.equal(result.status, 'raw_only'); assert.equal(result.imagePath, undefined)
    assert.ok(result.reason); assert.equal(result.payload.bytes, payload.length)
    assert.equal(result.compoundFile!.payloadOffset, 128); assert.deepEqual(readFileSync(result.compoundFile!.path), compound)
    assert.equal(result.compoundFile!.sha256, hash(compound))
    assert.equal((await extractCadEmbedded(w.source, w.record, w.output)).cached, true)
  } finally { w.cleanup() }
})

test('changed source cannot reuse an old preview or create a new derived object', async () => {
  const w = await fixture(Buffer.concat([Buffer.alloc(128), picture()]))
  try {
    await extractCadEmbedded(w.source, w.record, w.output)
    writeFileSync(w.path, readFileSync(w.path).toString().replace('钢筋', '混凝土'))
    await assert.rejects(extractCadEmbedded(w.source, w.record, w.output), /changed|version/)
    assert.equal(readdirSync(w.output).some(name => name.startsWith('.extract-')), false)
  } finally { w.cleanup() }
})

test('malformed binary and mismatched length fail without returning partial or clipped images', async () => {
  for (const options of [{ invalidHex: true }, { invalidHex: '°' }, { declaredBytes: 20 }]) {
    const w = await fixture(Buffer.from([0, 1, 2, 3]), options)
    try {
      await assert.rejects(extractCadEmbedded(w.source, w.record, w.output), /十六进制|长度不一致/)
      assert.equal(existsSync(join(w.output, 'embedded.json')), false)
      assert.equal(readdirSync(w.output).length, 0)
    } finally { w.cleanup() }
  }
})

test('non-OLE records retain their raw reading route and do not masquerade as embedded pictures', async () => {
  const w = await fixture(Buffer.from([0, 1]), { type: 'UNKNOWN_OBJECT' })
  try { await assert.rejects(extractCadEmbedded(w.source, w.record, w.output), /OLE2FRAME\/OLEFRAME/) }
  finally { w.cleanup() }
})
