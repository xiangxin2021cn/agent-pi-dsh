import { test } from 'node:test'
import assert from 'node:assert/strict'
import { latestEngineeringRuns } from '../bundles/tender-web/src/client/engineering-panel.js'
import { bimPreviewScene } from '../bundles/tender-web/src/client/engineering-bim-view.js'

test('latest engineering results preserve independent source/object scopes and replace only matching scopes', () => {
  const a = { id: 'a', providerId: 'rebar', dependencies: [{ kind: 'source', id: 'sheet1' }, { kind: 'object', id: 'beam1' }] }
  const b = { id: 'b', providerId: 'rebar', dependencies: [{ kind: 'object', id: 'beam2' }] }
  const c = { id: 'c', providerId: 'rebar', dependencies: [...a.dependencies].reverse() }
  const d = { id: 'd', providerId: 'road', dependencies: b.dependencies }
  assert.deepEqual(latestEngineeringRuns([a, b, c, d]).map(row => row.id), ['c', 'b', 'd'])
})

test('BIM geometry and preview actions remain visible as separate results', () => {
  const dependencies = [{ kind: 'source', id: 'ifc' }]
  assert.equal(latestEngineeringRuns([{ providerId: 'bim-ifc', input: { action: 'geometry' }, dependencies }, { providerId: 'bim-ifc', input: { action: 'preview' }, dependencies }]).length, 2)
})
test('preview applies each mesh origin and retains GlobalIds and separate object extents', () => {
  const scene = bimPreviewScene([{ globalId: 'beam', name: 'Beam', mesh: { originMeters: [500000, 200000, 50], vertices: [-1, 0, 0, 1, 0, 0, 0, 2, 0], triangles: [0, 1, 2] } }, { globalId: 'failed' }])
  assert.equal(scene.objects.length, 1)
  assert.deepEqual(scene.center, [500000, 200001, 50])
  assert.equal(scene.span, 2)
  assert.equal(scene.objects[0].id, 'beam')
  assert.deepEqual(scene.objects[0].points[0], [499999, 200000, 50])
})
