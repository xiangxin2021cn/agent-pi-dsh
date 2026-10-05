import assert from 'node:assert/strict'
import { test } from 'node:test'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { calculateCivil, calibratePdf } from '../index.ts'
import type { CivilObject, CivilCalculationInput, CivilEvidence, PdfCalibrationInput } from '../index.ts'
import { EngineeringProviderRegistry, engineeringInputFingerprint } from '../../engineering-core/index.ts'
import { apply, civilProvider } from '../../../bundles/engineering-civil/src/index.ts'
import { createEngineeringStore, hash } from '../../../bundles/engineering/src/store.ts'

const source = { sourceId: 'drawing', sourceHash: hash('actual drawing'), locator: 'Sheet C1, dimensions and schedule' }
const evidence: CivilEvidence = { sources: [{ id: 'drawing', title: '图纸', path: 'drawing.pdf', sha256: source.sourceHash, status: 'active' }], dependencies: [{ kind: 'source', id: 'drawing' }] }
const base = (id: string) => ({ id, physicalId: id, title: id, sources: [source] })
const pipe = (id = 'pipe'): CivilObject => ({ ...base(id), kind: 'pipe', dimension: '2d', pathKind: 'polyline', unit: 'm', points: [[0, 0], [3, 4], [6, 4]] })
const layer = (id = 'layer'): CivilObject => ({ ...base(id), kind: 'road_layer', unit: 'm', outline: [[0, 0], [10, 0], [10, 2], [0, 2], [0, 0]], holes: 'none', surface: 'planar', thickness: { value: 300, unit: 'mm' } })
const box = (id = 'box'): CivilObject => ({ ...base(id), kind: 'rectangular', unit: 'm', length: 2, width: 3, height: 4, voids: 'none' })
const count = (id = 'wells', count: number | null = 3): CivilObject => ({ ...base(id), kind: 'count', count })
function input(objects: CivilObject[]): CivilCalculationInput {
  return { catalog: { id: 'drawing-inventory', title: 'Independent drawing inventory', sources: [source], items: objects.map(object => ({ physicalId: object.physicalId, kind: object.kind, title: object.title, sources: [source], disposition: 'include' })) }, objects }
}

test('hand-calculated 2D/3D routes, millimetres, road layers, boxes and explicit counts stay separate', () => {
  const three: CivilObject = { ...base('three'), kind: 'pipe', dimension: '3d', pathKind: 'polyline', unit: 'mm', points: [[0, 0, 0], [3000, 4000, 12000]] }
  const result = calculateCivil(input([pipe(), three, layer(), box(), count()]), evidence)
  assert.deepEqual(result.rows.map(row => row.quantity), [8, 13, 6, 24, 3])
  assert.deepEqual(result.totals.map(row => [row.kind, row.quantityBasis, row.unit, row.knownSubtotal]), [['pipe', 'plan_2d', 'm', 8], ['pipe', 'spatial_3d', 'm', 13], ['road_layer', 'plan_area_thickness', 'm3', 6], ['rectangular', 'rectangular_solid', 'm3', 24], ['count', 'count', 'item', 3]])
  assert.equal(result.rows[2].measures.areaM2, 20)
  assert.equal(result.rows[2].sources[0].sourceHash, source.sourceHash)
  assert.equal(result.rows[3].purpose, 'geometric')
  assert.equal(result.reviewStatus, 'needs_review')
  assert.equal(result.coverage.completeWithinDeclaredCatalog, true)
})

test('broken routes preserve known contiguous length without bridging or hiding missing objects', () => {
  const broken = pipe() as Extract<CivilObject, { kind: 'pipe' | 'drain' }>
  broken.points = [[0, 0], [3, 4], null, [100, 100], [103, 104]]
  const data = input([broken, pipe('whole')])
  data.catalog.items.push({ physicalId: 'missing', kind: 'pipe', title: 'Missing from drawings read', disposition: 'include', sources: [source] })
  const result = calculateCivil(data, evidence)
  assert.equal(result.rows[0].quantity, null)
  assert.equal(result.rows[0].knownPortion, 10)
  assert.equal(result.rows[0].status, 'partial')
  assert.equal(result.rows[2].status, 'missing')
  assert.deepEqual(result.totals[0], { kind: 'pipe', unit: 'm', quantityBasis: 'plan_2d', completeSubtotal: 8, knownPartialSubtotal: 10, knownSubtotal: 18, incomplete: true })
  assert.equal(result.totals[1].quantityBasis, 'unknown')
  assert.equal(result.totals[1].knownSubtotal, null)
  assert.equal(result.coverage.completeWithinDeclaredCatalog, false)
})

test('physical duplicates, cross-object record duplicates and unlisted geometry cannot inflate totals', () => {
  const data = input([box()])
  data.objects.push({ ...box('second-view'), physicalId: 'box' }, box('unlisted'))
  const result = calculateCivil(data, evidence)
  assert.equal(result.rows[0].quantity, null)
  assert.ok(result.rows[0].issues.some(row => row.code === 'physical-duplicate'))
  assert.equal(result.rows[1].status, 'unlisted')
  assert.equal(result.totals[0].knownSubtotal, null)
  const duplicateRecord = input([box('a'), box('b')]); duplicateRecord.objects[1].id = 'a'
  assert.deepEqual(calculateCivil(duplicateRecord, evidence).rows.map(row => row.quantity), [null, null])
})

test('independent expected catalog requires reasons for exclusions and cannot be synthesized from success', () => {
  const data = input([count()])
  data.catalog.items.push({ physicalId: 'external-scope', kind: 'rectangular', title: 'By another package', sources: [source], disposition: 'exclude', reason: '本次范围外，由另标段负责。' })
  const valid = calculateCivil(data, evidence)
  assert.equal(valid.coverage.excluded, 1)
  assert.equal(valid.rows[1].status, 'excluded')
  delete data.catalog.items[1].reason
  const missing = calculateCivil(data, evidence)
  assert.equal(missing.coverage.excluded, 0)
  assert.equal(missing.rows[1].status, 'blocked')
  assert.equal(missing.coverage.completeWithinDeclaredCatalog, false)
  assert.equal(calculateCivil({ ...data, catalog: { ...data.catalog, items: [] } }, evidence).coverage.completeWithinDeclaredCatalog, false)
})

test('invalid or unsupported polygons, holes and missing thickness never become zero volume', () => {
  const cases = [
    { outline: [[0, 0], [2, 2], [0, 2], [2, 0], [0, 0]] },
    { outline: [[0, 0], [1, 0], [2, 0], [0, 0]] },
    { outline: [[0, 0], [2, 0], [2, 2], [0, 2]] },
    { holes: 'unknown' }, { holes: 'present' }, { surface: 'curved' }, { thickness: { value: null, unit: 'm' } },
  ]
  for (const patch of cases) {
    const result = calculateCivil(input([{ ...layer(), ...patch } as CivilObject]), evidence)
    assert.equal(result.rows[0].quantity, null, JSON.stringify(patch))
    assert.equal(result.totals[0].knownSubtotal, null)
    assert.equal(result.coverage.completeWithinDeclaredCatalog, false)
  }
  const mm = { ...layer(), unit: 'mm', outline: [[0, 0], [0, 2000], [10000, 2000], [10000, 0], [0, 0]] } as CivilObject
  assert.equal(calculateCivil(input([mm]), evidence).rows[0].quantity, 6)
})

test('unknown dimensions, units and counts remain null while evidenced zero count remains zero', () => {
  const data = input([{ ...box(), height: null } as CivilObject, count('unknown', null), count('zero', 0), { ...pipe(), unit: 'ft' } as unknown as CivilObject])
  const result = calculateCivil(data, evidence)
  assert.deepEqual(result.rows.map(row => row.quantity), [null, null, 0, null])
  assert.equal(result.totals.find(row => row.kind === 'rectangular')!.knownSubtotal, null)
  assert.equal(result.totals.find(row => row.kind === 'count')!.knownSubtotal, 0)
})

test('source hash and dependency failures block only affected objects without mutating inputs', () => {
  const data = input([box(), count()])
  data.objects[0].sources = [{ ...source, sourceHash: 'b'.repeat(64) }]
  const before = JSON.stringify(data)
  const result = calculateCivil(data, evidence)
  assert.deepEqual(result.rows.map(row => row.quantity), [null, 3])
  assert.equal(JSON.stringify(data), before)
  assert.equal(evidence.sources[0].sha256, source.sourceHash)
  assert.ok(calculateCivil(input([box()]), { ...evidence, dependencies: [] }).rows[0].issues.some(row => row.code === 'source-dependency'))
})

const calibration = (): PdfCalibrationInput => ({ source, page: 2, viewport: { id: 'page2-detailA', width: 1000, height: 500 }, coordinateSpace: 'normalized', reference: { source, page: 2, viewportId: 'page2-detailA', start: [0, 0], end: [0.3, 0.4], realLength: 1000, unit: 'mm', label: '1000' } })
test('PDF calibration respects viewport aspect, explicit dimensions and same-page/version/frame constraints', () => {
  const basis = calibration(), result = calibratePdf(basis, evidence)
  assert.equal(result.status, 'calibrated')
  assert.equal(result.viewportDistance, Math.hypot(300, 200))
  assert.equal(result.metersPerViewportPixel, 1 / Math.hypot(300, 200))
  assert.equal(result.metersPerNormalizedX! / result.metersPerNormalizedY!, 2)
  const pixels = calibration(); pixels.coordinateSpace = 'pixels'; pixels.reference.end = [300, 200]
  assert.equal(calibratePdf(pixels, evidence).metersPerViewportPixel, result.metersPerViewportPixel)
  for (const change of [
    (value: PdfCalibrationInput) => { value.reference.page = 3 },
    (value: PdfCalibrationInput) => { value.reference.source = { ...source, sourceHash: 'a'.repeat(64) } },
    (value: PdfCalibrationInput) => { value.reference.viewportId = 'other' },
    (value: PdfCalibrationInput) => { value.reference.realLength = null },
    (value: PdfCalibrationInput) => { value.reference.end = [0, 0] },
    (value: PdfCalibrationInput) => { value.reference.end = [1.1, 0] },
    (value: PdfCalibrationInput) => { value.coordinateSpace = 'pixels'; value.viewport.width = 1e308; value.reference.end = [0.5, 0]; value.reference.realLength = 1e308 },
  ]) { const value = calibration(); change(value); assert.equal(calibratePdf(value, evidence).metersPerViewportPixel, null) }
})

test('civil plugin registration, actual engineering persistence, stale source and disposer preserve history', async t => {
  const cwd = mkdtempSync(join(tmpdir(), 'civil-provider-'))
  t.after(() => rmSync(cwd, { recursive: true, force: true }))
  writeFileSync(join(cwd, 'drawing.pdf'), 'actual drawing')
  const providers = new EngineeringProviderRegistry(), disposers: Array<() => void> = []
  apply({ engineering: { providers }, effect: (install: () => () => void) => disposers.push(install()) })
  const provider = providers.get('civil-quantities'), store = createEngineeringStore(cwd, 'civil:test', 'Civil')
  const state = store.patch({ sources: evidence.sources }, 0, 'sources')
  const request = { action: 'calculate', data: input([layer()]) }
  const output: any = await provider.execute!(request, state.project, { cwd, previousRuns: [], dependencies: evidence.dependencies })
  store.record({ id: 'civil-run', providerId: provider.id, providerVersion: provider.version, title: provider.title, createdAt: new Date().toISOString(), dependencies: [...evidence.dependencies], dependencyFingerprint: engineeringInputFingerprint(state.project, [...evidence.dependencies]), input: request, output }, 1, 'calculate')
  disposers.forEach(dispose => dispose())
  assert.equal(providers.assess('civil-quantities').status, 'unavailable')
  const restored = createEngineeringStore(cwd, 'civil:test', 'Civil').read()
  assert.equal((restored.runs[0].output.details as any).rows[0].quantity, 6)
  writeFileSync(join(cwd, 'drawing.pdf'), 'new revision')
  assert.equal(store.runStatus(restored, restored.runs[0]), 'stale')
  assert.notEqual(hash(readFileSync(join(cwd, 'drawing.pdf'), 'utf8')), restored.project.sources[0].sha256)
  assert.ok(civilProvider.inputDescription!.includes('calibrate_pdf'))
})
