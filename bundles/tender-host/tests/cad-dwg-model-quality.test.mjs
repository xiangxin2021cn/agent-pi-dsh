import assert from 'node:assert/strict'
import test from 'node:test'
import { inspectDwgModel } from '../src/cad-dwg-model-quality.mjs'

function model(entities, layers = ['0'], blocks = []) {
  return {
    tables: {
      LAYER: { entries: layers.map(name => ({ name })) },
      BLOCK_RECORD: { entries: blocks },
    },
    entities,
  }
}

test('accepts existing block and layer names case insensitively without mutating the model', () => {
  const source = model([{ type: 'INSERT', handle: 'BB', layer: 'axis', name: '_axiso' }], ['0', 'AXIS'], [{ name: '_AXISO', entities: [] }])
  const before = structuredClone(source)
  const report = inspectDwgModel(source)
  assert.equal(report.valid, true)
  assert.deepEqual(report.counts, { layers: 2, blocks: 1, entities: 1, inserts: 1 })
  assert.deepEqual(source, before)
})

test('detects missing block definitions and missing layer tables separately', () => {
  const report = inspectDwgModel(model([{ type: 'INSERT', handle: 'BB', layer: '0', name: 0 }], [], [{ name: 'OTHER', entities: [] }]))
  assert.equal(report.valid, false)
  assert.equal(report.issues.total, 2)
  assert.equal(report.issues.unresolvedLayers, 1)
  assert.equal(report.issues.unresolvedBlocks, 1)
  assert.deepEqual(report.issues.samples, [
    { code: 'unresolved-layer', handle: 'BB', type: 'INSERT', reference: '0' },
    { code: 'unresolved-block', handle: 'BB', type: 'INSERT', reference: 0 },
  ])
})

test('permits the legitimate name 0 only as a defined string reference', () => {
  const blocks = [{ name: '0', entities: [] }]
  assert.equal(inspectDwgModel(model([{ type: 'INSERT', layer: '0', name: '0' }], ['0'], blocks)).valid, true)
  assert.equal(inspectDwgModel(model([{ type: 'INSERT', layer: '0', name: 0 }], ['0'], blocks)).valid, false)
})

test('checks nested block entities and insert attributes exactly once', () => {
  const attribute = { type: 'ATTRIB', handle: 'A1', layer: 'MISSING' }
  const insert = { type: 'INSERT', handle: 'B1', layer: '0', name: 'PART', attribs: [attribute] }
  const nested = { type: 'MINSERT', handle: 'B2', layer: '0', name: 'MISSING', attribs: [] }
  const source = model([insert, attribute], ['0'], [{ name: 'PART', entities: [insert, nested] }])
  const report = inspectDwgModel(source)
  assert.deepEqual(report.counts, { layers: 1, blocks: 1, entities: 3, inserts: 2 })
  assert.deepEqual(report.entityTypes, { INSERT: 1, ATTRIB: 1, MINSERT: 1 })
  assert.equal(report.issues.unresolvedLayers, 1)
  assert.equal(report.issues.unresolvedBlocks, 1)
})

test('bounds samples for each failure type while retaining complete counts', () => {
  const entities = Array.from({ length: 50 }, (_, i) => ({ type: 'INSERT', handle: i.toString(16), layer: 'MISSING', name: 'MISSING' }))
  const report = inspectDwgModel(model(entities))
  assert.equal(report.issues.total, 100)
  assert.equal(report.issues.samples.length, 20)
  assert.equal(report.issues.samples.filter(sample => sample.code === 'unresolved-block').length, 10)
})

test('accepts an empty drawing and flags absent reference names in populated drawings', () => {
  assert.equal(inspectDwgModel(model([], [])).valid, true)
  const report = inspectDwgModel(model([{ type: 'INSERT', handle: 'B' }]))
  assert.equal(report.issues.total, 2)
  assert.ok(report.issues.samples.every(sample => sample.reference === null))
})
