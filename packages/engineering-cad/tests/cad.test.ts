import test from 'node:test'
import assert from 'node:assert/strict'
import { parseCadDxf, queryCad, transformPoint } from '../index.ts'
import { insertMatrix } from '../matrix.ts'
import { cadLibrary } from '../../../bundles/engineering-cad/src/reader.ts'
import { cadFixture } from './fixture.ts'

const close = (actual: number, expected: number) => assert.ok(Math.abs(actual - expected) < 1e-8, `${actual} != ${expected}`)

test('complete census includes definitions, unknown entities, layers and paper space separately', async () => {
  const drawing = await parseCadDxf(cadFixture(), cadLibrary)
  assert.equal(drawing.inventory.records, 10)
  assert.equal(drawing.inventory.modelRecords, 6)
  assert.equal(drawing.inventory.paperRecords, 1)
  assert.equal(drawing.inventory.definitions, 3)
  assert.equal(drawing.units.name, 'millimetre')
  assert.equal(drawing.units.metresPerUnit, .001)
  assert.equal(drawing.units.verified, false)
  assert.equal(drawing.layers[0].off, true)
  assert.equal(drawing.layers[0].frozen, true)
  assert.ok(drawing.layouts.some(l => l.name === 'Sheet 1' && l.space === 'paper'))
  assert.ok(drawing.issues.some(i => i.code === 'undecoded-entities'))
  assert.ok(drawing.issues.some(i => i.code === 'xref-unresolved'))
  assert.equal(drawing.inventory.professionalCoverage, 'not_assessed')
  assert.ok(drawing.records.some(r => r.type === 'LINE' && r.nativeDecoded), 'native CAD entity decoder is used')
})

test('nested INSERT transforms include basepoints, nonuniform scale, rotation and unique instance paths', async () => {
  const drawing = await parseCadDxf(cadFixture(), cadLibrary)
  const lines = queryCad(drawing, { types: ['LINE'] })
  assert.equal(lines.total, 5)
  const nested = lines.items.find(i => 'path' in i && i.path?.length === 3)!
  if (!('geometryTransform' in nested) || !nested.geometryTransform) throw new Error('instance transform missing')
  const start = transformPoint(nested.geometryTransform, { x: 1, y: 2, z: 0 }), end = transformPoint(nested.geometryTransform, { x: 3, y: 2, z: 0 })
  close(start.x, 100); close(start.y, 210); close(end.x, 96); close(end.y, 210)
  const array = lines.items.filter(i => 'path' in i && i.path?.length === 2)
  assert.equal(new Set(array.map(i => i.id)).size, 4)
  const origins = array.map(i => 'geometryTransform' in i && i.geometryTransform ? transformPoint(i.geometryTransform, { x: 1, y: 2, z: 0 }) : null)
  close(origins[3]!.x, -20); close(origins[3]!.y, 10)
})

test('negative extrusion is applied after insertion transforms', () => {
  const matrix = insertMatrix({ x: 10, y: 20, z: 0 }, { x: 1, y: 1, z: 1 }, 0, { x: 0, y: 0, z: 0 }, { x: 0, y: 0, z: -1 }, { x: 0, y: 0, z: 0 })
  assert.deepEqual(transformPoint(matrix, { x: 1, y: 2, z: 3 }), { x: -11, y: 22, z: -3 })
})

test('arc and polyline bulge remain curves; dimensions retain override separately from stored measurement', async () => {
  const drawing = await parseCadDxf(cadFixture(), cadLibrary)
  const arc = queryCad(drawing, { collection: 'records', types: ['ARC'] }).items[0]
  assert.equal(arc.geometry.radius, 5); assert.equal(arc.geometry.endAngleDegrees, 90)
  const polyline = queryCad(drawing, { types: ['LWPOLYLINE'] }).items[0]
  assert.equal((polyline.geometry.vertices as any[])[0].bulge, .5)
  assert.equal(polyline.points[1].value.z, 7)
  const dimension = queryCad(drawing, { types: ['DIMENSION'] }).items[0]
  assert.equal(dimension.dimension?.override, '600'); assert.equal(dimension.dimension?.storedMeasurement, 500)
})

test('text filters, full raw unknown records, and pagination are deterministic and do not silently truncate totals', async () => {
  const drawing = await parseCadDxf(cadFixture(), cadLibrary)
  assert.equal(queryCad(drawing, { text: '钢筋', layout: 'Sheet 1' }).total, 1)
  const unknown = queryCad(drawing, { collection: 'records', handle: 'e5', includeRaw: true }).items[0]
  assert.ok('pairs' in unknown && unknown.pairs?.some(p => p.value === 'raw payload preserved'))
  const ids: string[] = []
  for (let offset = 0; ; offset += 2) { const page = queryCad(drawing, { limit: 2, offset }); ids.push(...page.items.map(i => i.id)); if (page.nextOffset === null) break }
  assert.equal(ids.length, drawing.instances.length); assert.equal(new Set(ids).size, ids.length)
  assert.throws(() => queryCad(drawing, { limit: 501 }), /limit/)
  assert.throws(() => queryCad(drawing, { offset: -1 }), /offset/)
})

test('explicit expansion budget leaves full record inventory and marks instance coverage incomplete', async () => {
  const drawing = await parseCadDxf(cadFixture(), cadLibrary, { maxInstances: 2 })
  assert.equal(drawing.inventory.records, 10)
  assert.equal(drawing.instances.length, 2)
  assert.equal(drawing.inventory.expansionComplete, false)
})

test('incomplete DXF is rejected rather than reported as a complete read', async () => {
  await assert.rejects(parseCadDxf(Buffer.from('0\nSECTION\n2\nENTITIES\n0\nLINE\n'), cadLibrary), /complete DXF/)
})

test('missing block and recursive block are explicit expansion gaps, never silently counted as complete', async () => {
  const missing = await parseCadDxf(Buffer.from(cadFixture().toString().replace('2\nOuter\n10\n100', '2\nMissing\n10\n100')), cadLibrary)
  assert.equal(missing.inventory.expansionComplete, false)
  assert.ok(missing.issues.some(i => i.code === 'missing-block'))
  const cycle = await parseCadDxf(Buffer.from(cadFixture().toString().replace('2\nInner\n10\n20', '2\nOuter\n10\n20')), cadLibrary)
  assert.equal(cycle.inventory.expansionComplete, false)
  assert.ok(cycle.issues.some(i => i.code === 'block-cycle'))
})

test('binary DXF uses the installed native filer and preserves structural records', async () => {
  const Filer = (cadLibrary as any).AcDbDxfFiler, filer = new Filer({ outputFormat: 'binary' })
  const pairs: [number, string | number][] = [[0, 'SECTION'], [2, 'ENTITIES'], [0, 'LINE'], [5, 'AB'], [8, '0'], [10, 1], [20, 2], [11, 3], [21, 4], [0, 'ENDSEC'], [0, 'EOF']]
  for (const [code, value] of pairs) filer.writeGroup(code, value)
  const index = await parseCadDxf(filer.toBinary(), cadLibrary)
  assert.equal(index.inventory.records, 1)
  assert.deepEqual(index.records[0].geometry.end, { x: 3, y: 4, z: 0 })
  assert.ok(index.issues.some(i => i.code === 'units-unverified'))
})

test('simultaneous native reads do not mix process-global drawing databases', async () => {
  const inputs = [cadFixture(), Buffer.from(cadFixture().toString().replace('5\nD2\n', '5\nD9\n'))]
  const outputs = await Promise.all(inputs.map(bytes => parseCadDxf(bytes, cadLibrary)))
  assert.ok(outputs[0].records.find(r => r.handle === 'D2')?.nativeDecoded)
  assert.ok(outputs[1].records.find(r => r.handle === 'D9')?.nativeDecoded)
  assert.equal(outputs[1].records.some(r => r.handle === 'D2'), false)
})
