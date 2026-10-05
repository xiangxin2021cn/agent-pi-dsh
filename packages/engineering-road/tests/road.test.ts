import { test } from 'node:test'
import assert from 'node:assert/strict'
import { calculateRoadQuantities } from '../index.ts'
import type { RoadInterval, RoadQuantityInput } from '../index.ts'

const source = { sourceId: 'cross-sections', sourceHash: 'a'.repeat(64), locator: 'sheet 2 / K0+000–020' }
const row = (patch: Partial<RoadInterval> = {}): RoadInterval => ({ id: 'r1', scope: 'road-a:cut', startM: 0, endM: 20, startAreaM2: 10, endAreaM2: 14, method: 'average_end_area', sources: [source], ...patch })
const input = (rows = [row()]): RoadQuantityInput => ({ schemaVersion: 1, intervals: rows, expectedRanges: [{ id: 'scope', scope: 'road-a:cut', startM: 0, endM: 20 }] })

test('average-end-area result retains method, actual source and unreviewed geometric purpose', () => {
  const result = calculateRoadQuantities(input())
  assert.equal(result.rows[0].volumeM3, 240)
  assert.equal(result.subtotals[0].knownVolumeM3, 240)
  assert.equal(result.purpose, 'geometric')
  assert.equal(result.review, 'unreviewed')
  assert.equal(result.coverageComplete, true)
  assert.deepEqual(result.rows[0].sources, [source])
  assert.equal(result.rows[0].formula, '20 × (10 + 14) / 2')
})
test('prismoidal integration requires a real midpoint, produces hand-calculated volume', () => {
  const valid = row({ method: 'prismoidal', startAreaM2: 6, middleAreaM2: 12, endAreaM2: 18, middleStationM: 10 })
  assert.equal(calculateRoadQuantities(input([valid])).rows[0].volumeM3, 240)
  const bad = calculateRoadQuantities(input([{ ...valid, middleStationM: 8 }]))
  assert.equal(bad.rows[0].volumeM3, null)
  assert.equal(bad.coverageComplete, false)
  assert.ok(bad.issues.some(issue => issue.code === 'road_middle_position'))
})
test('unknown area remains unknown; an explicitly zero area remains usable', () => {
  const missing = calculateRoadQuantities(input([row({ startAreaM2: null })]))
  assert.equal(missing.rows[0].volumeM3, null)
  assert.equal(missing.subtotals[0].unresolvedIntervals, 1)
  assert.deepEqual(missing.coverage[0].gaps, [{ startM: 0, endM: 20 }])
  assert.equal(calculateRoadQuantities(input([row({ startAreaM2: 0 })])).rows[0].volumeM3, 140)
})
test('independent coverage finds omitted middle chainage and never derives full scope from rows', () => {
  const result = calculateRoadQuantities(input([row({ endM: 5 }), row({ id: 'r2', startM: 10 })]))
  assert.deepEqual(result.coverage[0].gaps, [{ startM: 5, endM: 10 }])
  assert.equal(result.coverageComplete, false)
  const noInventory = calculateRoadQuantities({ schemaVersion: 1, intervals: [row()] })
  assert.equal(noInventory.coverageComplete, false)
  assert.ok(noInventory.issues.some(issue => issue.code === 'road_inventory_missing'))
})
test('overlapping same-work intervals are both excluded, independent cut/fill can coexist', () => {
  const duplicate = calculateRoadQuantities(input([row(), row({ id: 'r2', startM: 10 })]))
  assert.equal(duplicate.subtotals[0].knownVolumeM3, 0)
  assert.equal(duplicate.subtotals[0].unresolvedIntervals, 2)
  const both = calculateRoadQuantities({ ...input([row(), row({ id: 'fill', scope: 'road-a:fill' })]), expectedRanges: [...input().expectedRanges!, { id: 'fill-scope', scope: 'road-a:fill', startM: 0, endM: 20 }] })
  assert.equal(both.subtotals.length, 2)
  assert.ok(both.subtotals.every(scope => scope.knownVolumeM3 === 240))
})
test('missing provenance and excessive adopted spacing block subtotal and coverage', () => {
  const result = calculateRoadQuantities({ ...input([row({ sources: [] })]), maxIntervalM: 10 })
  assert.equal(result.rows[0].includedInSubtotal, false)
  assert.equal(result.subtotals[0].knownVolumeM3, 0)
  assert.ok(result.issues.some(issue => issue.code === 'road_source_missing'))
  assert.ok(result.issues.some(issue => issue.code === 'road_interval_too_long'))
})
test('scope exclusions are explicit and calculations crossing them cannot count', () => {
  const expectedRanges = [{ id: 'a', scope: 'road-a:cut', startM: 0, endM: 10 }, { id: 'b', scope: 'road-a:cut', startM: 10, endM: 20, excluded: true, reason: 'bridge scope measured separately' }]
  const crossing = calculateRoadQuantities({ ...input(), expectedRanges })
  assert.equal(crossing.rows[0].includedInSubtotal, false)
  const split = calculateRoadQuantities({ ...input([row({ endM: 10 })]), expectedRanges })
  assert.equal(split.coverageComplete, true)
  assert.equal(split.coverage[1].status, 'excluded')
  assert.equal(split.subtotals[0].knownVolumeM3, 120)
})
test('duplicate identities, invalid areas and ambiguous inventory are rejected', () => {
  assert.throws(() => calculateRoadQuantities(input([row(), row()])))
  assert.throws(() => calculateRoadQuantities(input([row({ startAreaM2: -1 })])))
  assert.throws(() => calculateRoadQuantities(input([row({ endAreaM2: Infinity })])))
  assert.throws(() => calculateRoadQuantities({ ...input(), expectedRanges: [{ ...input().expectedRanges![0], excluded: true }] }))
  assert.throws(() => calculateRoadQuantities({ ...input(), expectedRanges: [...input().expectedRanges!, { id: 'b', scope: 'road-a:cut', startM: 10, endM: 30 }] }))
})
test('input change alters calculation fingerprint without mutating original values', () => {
  const original = input(), before = structuredClone(original)
  const first = calculateRoadQuantities(original)
  assert.deepEqual(original, before)
  const changed = calculateRoadQuantities(input([row({ endAreaM2: 16 })]))
  assert.notEqual(first.inputFingerprint, changed.inputFingerprint)
  assert.equal(changed.subtotals[0].knownVolumeM3, 260)
})
