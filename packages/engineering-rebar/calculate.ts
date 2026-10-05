import { compareDecimalStrings, multiplyDecimalStrings, sumDecimalStrings } from '../business-core/src/tender/capabilities/cost/decimal.ts'
import { fingerprint, meters, parseRebarInput } from './schema.ts'
import type { QuantityBasis, RebarBasisResult, RebarInput, RebarIssue, RebarResult, RebarRowInput, RebarRowResult, SpacingZone } from './types.ts'

export const REBAR_ENGINE_VERSION = '1.0.0'
const BASES: QuantityBasis[] = ['geometry', 'measurement', 'fabrication']
// Explicit numerical approximation for centerline circular arcs, not a construction coefficient.
const RADIANS_PER_DEGREE = '0.017453292519943295'

export function countSpacingZones(zones: SpacingZone[]): { count: number; positionsM: string[] } {
  parseRebarInput({ schemaVersion: 1, rows: [{ id: 'distribution', inputMode: 'bbs', sourceRefs: [], spacingZones: zones }] })
  const sorted = zones.map(zone => ({ ...zone, startM: meters(zone.start, zone.unit), endM: meters(zone.end, zone.unit), spacingM: meters(zone.spacing, zone.unit) }))
    .sort((a, b) => compareDecimalStrings(a.startM, b.startM))
  const positions = new Set<string>()
  let previousEnd: string | undefined
  for (const zone of sorted) {
    if (previousEnd !== undefined && compareDecimalStrings(zone.startM, previousEnd) < 0) throw new RangeError(`Overlapping spacing zones: ${zone.id}`)
    previousEnd = zone.endM
    let current = zone.startM
    let steps = 0
    while (compareDecimalStrings(current, zone.endM) <= 0) {
      if (++steps > 100000 || positions.size > 100000) throw new RangeError('At most 100000 bar positions per group')
      const atStart = compareDecimalStrings(current, zone.startM) === 0
      const atEnd = compareDecimalStrings(current, zone.endM) === 0
      if ((!atStart || zone.includeStart) && (!atEnd || zone.includeEnd)) positions.add(current)
      current = sumDecimalStrings([current, zone.spacingM])
    }
    if (zone.includeEnd && (zone.startM !== zone.endM || zone.includeStart)) positions.add(zone.endM)
  }
  const positionsM = [...positions].sort(compareDecimalStrings)
  return { count: positionsM.length, positionsM }
}

function duplicateGroups(rows: RebarRowInput[]): Set<string> {
  const keys = new Map<string, string[]>()
  for (const row of rows) {
    const key = row.identityKey ?? (row.hostId && row.mark ? JSON.stringify([row.hostId, row.mark]) : undefined)
    if (key) keys.set(key, [...(keys.get(key) ?? []), row.id])
  }
  return new Set([...keys.values()].filter(ids => ids.length > 1).flat())
}

export function calculateRebar(value: RebarInput | unknown): RebarResult {
  const input = parseRebarInput(value)
  const issues: RebarIssue[] = []
  const duplicates = duplicateGroups(input.rows)
  const rows = input.rows.map(row => calculateRow(row, duplicates.has(row.id), issues))
  const totalsByBasis = Object.fromEntries(BASES.map(basis => {
    const included = rows.filter(row => row.includedInTotals)
    const lengths = included.flatMap(row => row.quantities[basis].totalLengthM === null ? [] : [row.quantities[basis].totalLengthM!])
    const masses = included.flatMap(row => row.quantities[basis].totalMassKg === null ? [] : [row.quantities[basis].totalMassKg!])
    return [basis, { knownLengthM: sumDecimalStrings(lengths), knownMassKg: sumDecimalStrings(masses), lengthRows: lengths.length, massRows: masses.length, incompleteRows: rows.filter(row => !row.includedInTotals || row.status !== 'calculated' || row.quantities[basis].totalMassKg === null).length }]
  })) as RebarResult['totalsByBasis']
  const expected = input.coverage?.expectedGroupIds ?? []
  const excluded = new Set(input.coverage?.excluded?.map(item => item.id) ?? [])
  const rowMap = new Map(rows.map(row => [row.id, row]))
  const missingGroupIds = expected.filter(id => !rowMap.has(id) && !excluded.has(id))
  const unexpectedGroupIds = input.coverage ? rows.filter(row => !expected.includes(row.id)).map(row => row.id) : []
  const scopeRows = input.coverage ? rows.filter(row => expected.includes(row.id)) : rows
  const coverage: RebarResult['coverage'] = {
    declared: Boolean(input.coverage), expected: expected.length,
    calculated: scopeRows.filter(row => row.status === 'calculated').length,
    partial: scopeRows.filter(row => row.status === 'partial').length,
    blocked: scopeRows.filter(row => row.status === 'blocked').length,
    excluded: excluded.size, missingGroupIds, unexpectedGroupIds, complete: false,
  }
  coverage.complete = coverage.declared && expected.length > 0 && missingGroupIds.length === 0 && unexpectedGroupIds.length === 0
    && coverage.partial === 0 && coverage.blocked === 0 && coverage.calculated + coverage.excluded === expected.length
  if (!input.coverage) issues.push({ code: 'coverage_not_declared', severity: 'warning', message: 'Whole-project completeness is unknown: supply an independently reviewed expected group inventory.' })
  for (const id of missingGroupIds) issues.push({ code: 'missing_group', severity: 'error', rowId: id, message: `Expected steel group ${id} has no result or explicit exclusion.` })
  for (const id of unexpectedGroupIds) issues.push({ code: 'unexpected_group', severity: 'warning', rowId: id, message: `Group ${id} is outside the declared coverage inventory.` })
  const hasResult = rows.some(row => row.includedInTotals && BASES.some(basis => row.quantities[basis].totalLengthM !== null))
  return {
    schemaVersion: 1, engineVersion: REBAR_ENGINE_VERSION, inputFingerprint: fingerprint({ engineVersion: REBAR_ENGINE_VERSION, input }),
    status: !hasResult ? 'blocked' : coverage.complete && !issues.some(issue => issue.severity === 'error') ? 'complete' : 'partial',
    rows, totalsByBasis, coverage, issues, reviewState: 'unreviewed', fabricationApproved: false,
  }
}

function calculateRow(row: RebarRowInput, duplicate: boolean, issues: RebarIssue[]): RebarRowResult {
  const missingInputs = [...(row.missingInputs ?? [])]
  const rowIssues: RebarIssue[] = []
  const issue = (code: string, message: string, parameter?: string, severity: 'error' | 'warning' = 'error') => rowIssues.push({ code, severity, rowId: row.id, parameter, message })
  const missing = (parameter: string) => { if (!missingInputs.includes(parameter)) missingInputs.push(parameter); issue('missing_input', `Missing ${parameter}; affected output remains unknown.`, parameter) }
  let count: number | null = row.count ?? null
  let positionsM: string[] | undefined
  if (row.countPerHost != null || row.hostCount != null) {
    if (row.countPerHost == null) missing('countPerHost')
    if (row.hostCount == null) missing('hostCount')
    if (row.countPerHost != null && row.hostCount != null) {
      const expanded = row.countPerHost * row.hostCount
      if (!Number.isSafeInteger(expanded)) issue('count_overflow', 'Expanded count exceeds safe integer range.')
      else if (count !== null && count !== expanded) { issue('count_conflict', 'Total count conflicts with countPerHost × hostCount.'); count = null }
      else count = expanded
    }
  }
  if (row.spacingZones) {
    try {
      const distributed = countSpacingZones(row.spacingZones)
      positionsM = distributed.positionsM
      if (count !== null && count !== distributed.count) { issue('count_conflict', 'Explicit count conflicts with the spacing positions.'); count = null }
      else if (!distributed.count) issue('empty_distribution', 'Spacing zones generate no bar positions.')
      else count = distributed.count
    } catch (error) { issue('invalid_distribution', error instanceof Error ? error.message : String(error)); count = null }
  }
  if (rowIssues.some(issue => ['count_conflict', 'count_overflow', 'invalid_distribution', 'empty_distribution'].includes(issue.code))) count = null
  if (count === null) missing('count')
  const lengthComponents: RebarRowResult['lengthComponents'] = []
  const singleLengths: Partial<Record<QuantityBasis, string>> = {}
  for (const basis of BASES) {
    const length = row.lengths?.[basis]
    if (length) singleLengths[basis] = meters(length.value, length.unit)
  }
  if (row.shape) {
    for (const [index, segment] of row.shape.segments.entries()) {
      const value = segment.kind === 'line' ? segment.length : multiplyDecimalStrings(multiplyDecimalStrings(segment.radius, segment.angleDegrees), RADIANS_PER_DEGREE)
      lengthComponents.push({ label: `${segment.kind}:${index + 1}`, lengthM: meters(value, row.shape.unit) })
    }
    const shapeLength = sumDecimalStrings(lengthComponents.map(item => item.lengthM))
    if (singleLengths.geometry !== undefined && compareDecimalStrings(singleLengths.geometry, shapeLength) !== 0) {
      issue('geometry_length_conflict', 'Declared geometry length differs from centerline shape; both sources need reconciliation.')
      delete singleLengths.geometry
    } else singleLengths.geometry = shapeLength
  }
  if (!BASES.some(basis => singleLengths[basis] !== undefined)) missing('length')
  if (row.unitMassKgPerM == null) missing('unitMassKgPerM')
  if (row.diameterMm == null) missing('diameterMm')
  if (!row.steelGrade) missing('steelGrade')
  if (!row.sourceRefs.length) issue('missing_source', 'A calculation requires source references for review.')
  if (row.inputMode === 'pingfa' && !row.rule) issue('missing_rule', 'Pingfa-derived quantities require their rule execution reference.')
  if (row.rule && (!row.rule.adopted || row.rule.reviewStatus !== 'reviewed')) issue('rule_not_approved', 'Rule is not reviewed and adopted; computed values remain a draft.')
  if (row.rule && (!row.rule.standardRefs.length || !row.rule.sourceRefs.length)) issue('rule_missing_basis', 'Rule must retain its adopted basis and source references.')
  for (const parameter of row.missingInputs ?? []) issue('unresolved_input', `Unresolved input ${parameter}.`, parameter)
  if (duplicate) issue('duplicate_physical_group', 'Same physical group occurs more than once; all conflicting rows are excluded from totals until reconciled.')
  const quantities = Object.fromEntries(BASES.map(basis => {
    const singleLengthM = singleLengths[basis] ?? null
    const totalLengthM = singleLengthM !== null && count !== null ? multiplyDecimalStrings(singleLengthM, String(count)) : null
    const totalMassKg = totalLengthM !== null && row.unitMassKgPerM != null ? multiplyDecimalStrings(totalLengthM, row.unitMassKgPerM) : null
    return [basis, { singleLengthM, totalLengthM, totalMassKg } satisfies RebarBasisResult]
  })) as RebarRowResult['quantities']
  const hasResult = BASES.some(basis => quantities[basis].totalLengthM !== null)
  issues.push(...rowIssues)
  return {
    id: row.id, hostId: row.hostId, mark: row.mark, role: row.role, diameterMm: row.diameterMm, steelGrade: row.steelGrade,
    inputFingerprint: fingerprint({ engineVersion: REBAR_ENGINE_VERSION, row }), count, positionsM, lengthComponents, quantities,
    sourceRefs: row.sourceRefs, rule: row.rule, derivation: row.derivation, missingInputs,
    status: duplicate || !hasResult ? 'blocked' : rowIssues.length ? 'partial' : 'calculated',
    includedInTotals: !duplicate, reviewState: 'unreviewed', fabricationApproved: false,
  }
}

/** Audit is derived from the same validated inputs; it never promotes an approval state. */
export function auditRebar(input: RebarInput | unknown): Pick<RebarResult, 'issues' | 'coverage' | 'status'> {
  const { issues, coverage, status } = calculateRebar(input)
  return { issues, coverage, status }
}
