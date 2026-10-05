import test from 'node:test'
import assert from 'node:assert/strict'
import { calculateRebar, countSpacingZones, expandPingfa, parsePingfa, parseRebarInput, rebarFingerprint } from '../index.ts'
import type { ExpandPingfaInput, RebarInput, RebarRowInput } from '../index.ts'

const source = [{ documentId: 'drawing-1', revision: 'A', sha256: 'fixture-only', page: 2 }]
function row(overrides: Partial<RebarRowInput> = {}): RebarRowInput {
  return { id: 'g1', inputMode: 'bbs', hostId: 'beam-1', diameterMm: '16', steelGrade: 'fixture-grade', count: 5, lengths: { geometry: { value: '1200', unit: 'mm' } }, unitMassKgPerM: '1.58', sourceRefs: source, ...overrides }
}
function input(rows: RebarRowInput[] = [row()]): RebarInput { return { schemaVersion: 1, rows, coverage: { expectedGroupIds: rows.map(row => row.id) } } }

test('BBS computes independently checked totals with decimal arithmetic and no automatic approval', () => {
  const result = calculateRebar(input())
  assert.equal(result.rows[0].quantities.geometry.totalLengthM, '6')
  assert.equal(result.totalsByBasis.geometry.knownMassKg, '9.48')
  assert.equal(result.status, 'complete')
  assert.equal(result.fabricationApproved, false)
  assert.equal(result.rows[0].reviewState, 'unreviewed')
  assert.equal(result.rows[0].quantities.fabrication.totalLengthM, null)
})

test('per-host quantities expand once, do not multiply an already declared total again', () => {
  const result = calculateRebar(input([row({ count: 10, countPerHost: 5, hostCount: 2 })]))
  assert.equal(result.rows[0].count, 10)
  assert.equal(result.totalsByBasis.geometry.knownMassKg, '18.96')
  const conflict = calculateRebar(input([row({ count: 11, countPerHost: 5, hostCount: 2 })]))
  assert.equal(conflict.rows[0].count, null)
  assert.equal(conflict.rows[0].quantities.geometry.totalMassKg, null)
})

test('length bases remain independent; purchase is not accepted as a measured length', () => {
  const result = calculateRebar(input([row({ lengths: { geometry: { value: '1', unit: 'm' }, measurement: { value: '1.1', unit: 'm' }, fabrication: { value: '1.2', unit: 'm' } } })]))
  assert.equal(result.totalsByBasis.geometry.knownLengthM, '5')
  assert.equal(result.totalsByBasis.measurement.knownLengthM, '5.5')
  assert.equal(result.totalsByBasis.fabrication.knownLengthM, '6')
  assert.throws(() => calculateRebar(input([row({ lengths: { purchase: { value: '2', unit: 'm' } } as never })])), /unsupported basis/)
})

test('centerline straight and circular segments are computed without a bending deduction guess', () => {
  const result = calculateRebar(input([row({ lengths: undefined, count: 1, shape: { dimensionBasis: 'centerline', unit: 'mm', segments: [{ kind: 'line', length: '1000' }, { kind: 'arc', radius: '100', angleDegrees: '180' }] } })]))
  assert.equal(result.rows[0].quantities.geometry.singleLengthM, '1.31415926535897931')
  assert.equal(result.rows[0].lengthComponents.length, 2)
  assert.throws(() => calculateRebar(input([row({ shape: { dimensionBasis: 'outside', unit: 'mm', segments: [{ kind: 'line', length: '1000' }] } as never })])), /centerline/)
})

test('conflicting authored length and shape remain unresolved', () => {
  const result = calculateRebar(input([row({ shape: { dimensionBasis: 'centerline', unit: 'm', segments: [{ kind: 'line', length: '2' }] } })]))
  assert.equal(result.rows[0].quantities.geometry.singleLengthM, null)
  assert.ok(result.issues.some(issue => issue.code === 'geometry_length_conflict'))
})

test('unknowns stay null and do not stop other independently supported rows', () => {
  const result = calculateRebar(input([row(), row({ id: 'g2', count: null, unitMassKgPerM: null })]))
  assert.equal(result.rows[1].quantities.geometry.totalMassKg, null)
  assert.equal(result.totalsByBasis.geometry.knownMassKg, '9.48')
  assert.equal(result.totalsByBasis.geometry.incompleteRows, 1)
  assert.equal(result.status, 'partial')
  assert.equal(result.coverage.complete, false)
})

test('expected groups come from a declared inventory, not only successful model objects', () => {
  const data = input(); data.coverage!.expectedGroupIds.push('missing-wall')
  const result = calculateRebar(data)
  assert.deepEqual(result.coverage.missingGroupIds, ['missing-wall'])
  assert.equal(result.status, 'partial')
  delete data.coverage
  assert.equal(calculateRebar(data).coverage.complete, false)
})

test('explicit exclusions require a reason and cannot also be counted', () => {
  const data = input(); data.coverage!.expectedGroupIds.push('excluded'); data.coverage!.excluded = [{ id: 'excluded', reason: 'Separate contract; scope reviewed.' }]
  assert.equal(calculateRebar(data).coverage.complete, true)
  data.coverage!.excluded = [{ id: 'g1', reason: 'Not allowed while also counted.' }]
  assert.throws(() => calculateRebar(data), /Invalid excluded group/)
})

test('mixed BBS and drawing instances cannot double count a physical group', () => {
  const result = calculateRebar(input([row({ identityKey: 'same-steel' }), row({ id: 'g2', inputMode: 'pingfa', identityKey: 'same-steel' })]))
  assert.equal(result.totalsByBasis.geometry.knownMassKg, '0')
  assert.equal(result.totalsByBasis.geometry.massRows, 0)
  assert.equal(result.status, 'blocked')
  assert.ok(result.rows.every(row => !row.includedInTotals))
  assert.throws(() => calculateRebar(input([row(), row()])), /duplicate ID/)
})

test('same mark on different hosts is not globally deduplicated', () => {
  assert.equal(calculateRebar(input([row({ mark: '1' }), row({ id: 'g2', mark: '1', hostId: 'beam-2' })])).totalsByBasis.geometry.knownMassKg, '18.96')
})

test('spacing endpoints are explicit and adjoining zones share one position', () => {
  const zones = [
    { id: 'dense', start: '0', end: '1000', spacing: '100', unit: 'mm' as const, includeStart: true, includeEnd: true },
    { id: 'normal', start: '1', end: '2', spacing: '0.2', unit: 'm' as const, includeStart: true, includeEnd: true },
  ]
  assert.equal(countSpacingZones(zones).count, 16)
  assert.equal(countSpacingZones([{ ...zones[0], end: '100', spacing: '30' }]).count, 5)
  assert.equal(countSpacingZones([{ ...zones[0], end: '100', spacing: '30', includeStart: false, includeEnd: false }]).count, 3)
  assert.throws(() => countSpacingZones([{ ...zones[0], spacing: '0' }]), /positive/)
  const bad = calculateRebar(input([row({ count: null, spacingZones: [zones[0], { ...zones[1], start: '0.5' }] })]))
  assert.equal(bad.rows[0].count, null)
  assert.ok(bad.issues.some(issue => issue.code === 'invalid_distribution'))
})

test('invalid scalar data and unsafe counts are rejected before computation', () => {
  for (const value of ['NaN', '1,000', '1e3', '-1', '0']) assert.throws(() => calculateRebar(input([row({ diameterMm: value })])))
  assert.throws(() => calculateRebar(input([row({ count: 1.5 })])), /integer/)
  assert.throws(() => calculateRebar(input([row({ lengths: { geometry: { value: '1', unit: 'ft' as never } } })])), /mm or m/)
})

test('fingerprints are deterministic, change on relevant revision, and inputs stay untouched', () => {
  const data = input(); const original = structuredClone(data)
  assert.equal(calculateRebar(data).inputFingerprint, calculateRebar(data).inputFingerprint)
  assert.deepEqual(data, original)
  const a = calculateRebar(data); data.rows[0].sourceRefs = [{ documentId: 'drawing-1', revision: 'B' }]
  assert.notEqual(calculateRebar(data).rows[0].inputFingerprint, a.rows[0].inputFingerprint)
  assert.equal(rebarFingerprint({ b: 2, a: 1 }), rebarFingerprint({ a: 1, b: 2 }))
  assert.deepEqual(parseRebarInput(original), original)
})

function pingfa(): ExpandPingfaInput {
  return {
    hostId: 'KL1', hostType: 'beam', scopeId: 'span-1',
    central: [{ role: 'bottom', text: '4Φ16', sourceRefs: source }],
    parameters: { span: { value: '5000', unit: 'mm', sourceRefs: source }, left: { value: '300', unit: 'mm', sourceRefs: source }, right: { value: '300', unit: 'mm', sourceRefs: source }, mass: { value: '1.58', unit: 'kg/m', sourceRefs: source } },
    steelGradeBySymbol: { 'Φ': { grade: 'fixture-grade', sourceRefs: source } },
    ruleSet: { id: 'project-fixture', version: '1', standardRefs: ['Project-specific reviewed fixture; not a G101 normative algorithm'], errataFingerprint: 'fixture-errata', adopted: true, reviewStatus: 'reviewed', sourceRefs: source, supportedHostTypes: ['beam'], requiredRoles: ['bottom'], rules: [{ id: 'fixture-straight-length', role: 'bottom', requiredParameters: ['span', 'left', 'right'], lengths: { geometry: { terms: [{ parameter: 'span' }, { parameter: 'left' }, { parameter: 'right' }] } }, unitMassParameter: 'mass' }] },
  }
}

test('supported Pingfa forms retain symbols and exact roles without grade inference', () => {
  assert.deepEqual(parsePingfa('2Φ22+2Φ20').tokens.map(token => token.kind === 'bars' && token.count), [2, 2])
  assert.equal(parsePingfa('G4C12').tokens[0].kind, 'bars')
  const stirrup = parsePingfa('Φ8@100/200(2)').tokens[0]
  assert.equal(stirrup.kind, 'stirrups')
  if (stirrup.kind === 'stirrups') { assert.deepEqual(stirrup.spacingMm, ['100', '200']); assert.equal(stirrup.limbs, 2) }
  const beam = parsePingfa('KL1(3A) 300×600').tokens[0]
  assert.equal(beam.kind, 'beam')
  if (beam.kind === 'beam') { assert.equal(beam.mark, 'KL1'); assert.equal(beam.widthMm, '300'); assert.equal(beam.spans, 3) }
  const withoutSpan = parsePingfa('KL1 350x600').tokens[0]
  assert.equal(withoutSpan.kind, 'beam')
  if (withoutSpan.kind === 'beam') assert.equal(withoutSpan.widthMm, '350')
})

test('unsupported multi-row or malformed glyph annotations never silently become complete', () => {
  for (const annotation of ['4Φ20 2/2', '4?20', '4Φ20+未知', 'KL1300x600']) assert.equal(parsePingfa(annotation).supported, false)
  const data = pingfa(); data.central[0].text = '4Φ20 2/2'
  const expanded = expandPingfa(data)
  assert.equal(expanded.rows.length, 1)
  assert.equal(expanded.rows[0].count, undefined)
  assert.equal(calculateRebar({ schemaVersion: 1, ...expanded }).status, 'blocked')
})

test('reviewed project rule expands annotation and retains source and term-by-term evidence', () => {
  const expanded = expandPingfa(pingfa())
  const result = calculateRebar({ schemaVersion: 1, rows: expanded.rows, coverage: expanded.coverage })
  assert.equal(result.rows[0].quantities.geometry.singleLengthM, '5.6')
  assert.equal(result.rows[0].quantities.geometry.totalMassKg, '35.392')
  assert.equal(result.rows[0].rule?.fingerprint, expanded.ruleFingerprint)
  assert.deepEqual(result.rows[0].derivation?.[0].terms.map(term => term.parameter), ['span', 'left', 'right'])
  assert.equal(result.status, 'complete')
  assert.equal(result.fabricationApproved, false)
})

test('local annotation overrides only its declared role and matching scope', () => {
  const data = pingfa(); data.local = [{ role: 'bottom', scopeId: 'span-1', text: '6Φ16', sourceRefs: source }, { role: 'bottom', scopeId: 'span-2', text: '8Φ16', sourceRefs: source }]
  const expanded = expandPingfa(data)
  assert.equal(expanded.rows[0].count, 6)
  assert.equal(expanded.appliedAnnotations[0].origin, 'local')
  assert.ok(expanded.issues.some(issue => issue.code === 'local_scope_not_applied'))
})

test('missing required steel roles and unsupported hosts remain visible coverage items', () => {
  const data = pingfa(); data.ruleSet.requiredRoles.push('stirrups')
  const expanded = expandPingfa(data)
  assert.equal(expanded.rows.length, 2)
  assert.equal(expanded.coverage.expectedGroupIds.length, 2)
  assert.equal(calculateRebar({ schemaVersion: 1, rows: expanded.rows, coverage: expanded.coverage }).coverage.complete, false)
  data.hostType = 'column'
  assert.ok(expandPingfa(data).issues.some(issue => issue.code === 'unsupported_host'))
})

test('unknown required parameters are not given an anchor length default', () => {
  const data = pingfa(); data.parameters.left.value = null
  const expanded = expandPingfa(data)
  assert.equal(expanded.rows[0].lengths?.geometry, undefined)
  assert.ok(expanded.rows[0].missingInputs?.includes('left'))
  assert.equal(calculateRebar({ schemaVersion: 1, rows: expanded.rows, coverage: expanded.coverage }).status, 'blocked')
})

test('draft and unadopted rule packs do not emit production quantities', () => {
  const data = pingfa(); data.ruleSet.reviewStatus = 'draft'
  const expanded = expandPingfa(data)
  assert.equal(expanded.rows[0].lengths, undefined)
  assert.equal(expanded.fabricationApproved, false)
  data.ruleSet.reviewStatus = 'reviewed'; data.ruleSet.adopted = false
  assert.ok(expandPingfa(data).issues.some(issue => issue.code === 'rule_not_approved'))
})

test('stirrup spacing does not imply unknown distribution length or number of links', () => {
  const data = pingfa(); data.central[0].text = 'Φ8@100/200(2)'
  const expanded = expandPingfa(data)
  assert.equal(expanded.rows[0].count, null)
  assert.ok(expanded.rows[0].missingInputs?.includes('distribution'))
})

test('mixed diameters require separate unit masses and glyph mappings', () => {
  const data = pingfa(); data.central[0].text = '2Φ16+2Φ20'
  let expanded = expandPingfa(data)
  assert.ok(expanded.rows.every(row => row.unitMassKgPerM === undefined))
  data.unitMassByDiameter = { '16': data.parameters.mass, '20': { value: '2.47', unit: 'kg/m', sourceRefs: source } }
  expanded = expandPingfa(data)
  assert.deepEqual(expanded.rows.map(row => row.unitMassKgPerM), ['1.58', '2.47'])
  delete data.steelGradeBySymbol
  assert.ok(expandPingfa(data).rows.every(row => row.missingInputs!.some(item => item.startsWith('steelGradeForSymbol:'))))
})

test('rule fingerprint includes errata and expression changes', () => {
  const data = pingfa(); const before = expandPingfa(data)
  data.ruleSet.errataFingerprint = 'next-errata'
  assert.notEqual(expandPingfa(data).ruleFingerprint, before.ruleFingerprint)
  data.ruleSet.rules[0].lengths.geometry!.terms[0].multiplier = 'eval(process.exit())'
  assert.throws(() => expandPingfa(data), /decimal string/)
})
