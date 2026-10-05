import { createHash } from 'node:crypto'
import { compareDecimalStrings, multiplyDecimalStrings } from '../business-core/src/tender/capabilities/cost/decimal.ts'
import type { LengthUnit, RebarInput, RebarSourceRef } from './types.ts'

export function fingerprint(value: unknown): string {
  const canonical = (item: unknown): unknown => Array.isArray(item) ? item.map(canonical)
    : item && typeof item === 'object' ? Object.fromEntries(Object.entries(item).filter(([, value]) => value !== undefined).sort(([a], [b]) => a.localeCompare(b)).map(([key, value]) => [key, canonical(value)])) : item
  return createHash('sha256').update(JSON.stringify(canonical(value))).digest('hex')
}

export function decimal(value: unknown, path: string, positive = false): asserts value is string {
  if (typeof value !== 'string' || value.length > 64 || !/^-?(?:0|[1-9]\d*)(?:\.\d+)?$/.test(value)) throw new TypeError(`${path}: expected an unformatted decimal string`)
  if (positive && compareDecimalStrings(value, '0') <= 0) throw new TypeError(`${path}: expected a positive value`)
}
export function record(value: unknown, path: string): asserts value is Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new TypeError(`${path}: expected an object`)
}
export function text(value: unknown, path: string): asserts value is string {
  if (typeof value !== 'string' || !value.trim()) throw new TypeError(`${path}: expected nonempty text`)
}
export function sourceRefs(value: unknown, path: string): asserts value is RebarSourceRef[] {
  if (!Array.isArray(value)) throw new TypeError(`${path}: expected source references`)
  value.forEach((ref, index) => {
    record(ref, `${path}[${index}]`)
    text(ref.documentId, `${path}[${index}].documentId`)
    if (ref.page !== undefined && (!Number.isSafeInteger(ref.page) || Number(ref.page) < 1)) throw new TypeError(`${path}[${index}].page: expected a positive integer`)
  })
}
export function unit(value: unknown, path: string): asserts value is LengthUnit {
  if (value !== 'mm' && value !== 'm') throw new TypeError(`${path}: expected mm or m`)
}
export function meters(value: string, lengthUnit: LengthUnit): string {
  return multiplyDecimalStrings(value, lengthUnit === 'mm' ? '0.001' : '1')
}
function count(value: unknown, path: string) {
  if (value !== undefined && value !== null && (!Number.isSafeInteger(value) || Number(value) <= 0)) throw new TypeError(`${path}: expected a positive safe integer or null`)
}

export function parseRebarInput(value: unknown): RebarInput {
  record(value, 'input')
  if (value.schemaVersion !== 1 || !Array.isArray(value.rows)) throw new TypeError('Expected schemaVersion: 1 and rows array')
  if (value.rows.length > 10000) throw new TypeError('At most 10000 groups per calculation')
  if (value.projectId !== undefined) text(value.projectId, 'projectId')
  const ids = new Set<string>()
  for (const [index, row] of value.rows.entries()) {
    const path = `rows[${index}]`
    record(row, path); text(row.id, `${path}.id`)
    if (ids.has(row.id)) throw new TypeError(`${path}.id: duplicate ID ${row.id}`)
    ids.add(row.id)
    if (row.inputMode !== 'bbs' && row.inputMode !== 'pingfa') throw new TypeError(`${path}.inputMode: expected bbs or pingfa`)
    sourceRefs(row.sourceRefs, `${path}.sourceRefs`)
    for (const key of ['hostId', 'mark', 'identityKey', 'role']) if (row[key] !== undefined) text(row[key], `${path}.${key}`)
    if (row.steelGrade != null) text(row.steelGrade, `${path}.steelGrade`)
    for (const key of ['diameterMm', 'unitMassKgPerM']) if (row[key] != null) decimal(row[key], `${path}.${key}`, true)
    for (const key of ['count', 'countPerHost', 'hostCount']) count(row[key], `${path}.${key}`)
    if (row.missingInputs !== undefined && (!Array.isArray(row.missingInputs) || row.missingInputs.some(item => typeof item !== 'string' || !item.trim()))) throw new TypeError(`${path}.missingInputs: expected parameter names`)
    if (row.lengths !== undefined) {
      record(row.lengths, `${path}.lengths`)
      for (const [basis, length] of Object.entries(row.lengths)) {
        if (!['geometry', 'measurement', 'fabrication'].includes(basis)) throw new TypeError(`${path}.lengths: unsupported basis ${basis}`)
        if (length == null) continue
        record(length, `${path}.lengths.${basis}`)
        decimal(length.value, `${path}.lengths.${basis}.value`, true); unit(length.unit, `${path}.lengths.${basis}.unit`)
      }
    }
    if (row.shape !== undefined) {
      record(row.shape, `${path}.shape`)
      if (row.shape.dimensionBasis !== 'centerline') throw new TypeError(`${path}.shape: only explicit centerline geometry is supported`)
      unit(row.shape.unit, `${path}.shape.unit`)
      if (!Array.isArray(row.shape.segments) || !row.shape.segments.length || row.shape.segments.length > 1000) throw new TypeError(`${path}.shape.segments: expected 1..1000 segments`)
      for (const segment of row.shape.segments) {
        record(segment, `${path}.shape.segment`)
        if (segment.kind === 'line') decimal(segment.length, `${path}.shape.length`, true)
        else if (segment.kind === 'arc') {
          decimal(segment.radius, `${path}.shape.radius`, true); decimal(segment.angleDegrees, `${path}.shape.angleDegrees`, true)
          if (compareDecimalStrings(segment.angleDegrees, '360') > 0) throw new TypeError(`${path}.shape.angleDegrees: cannot exceed 360`)
        } else throw new TypeError(`${path}.shape: unsupported segment`)
      }
    }
    if (row.spacingZones !== undefined) {
      if (!Array.isArray(row.spacingZones) || !row.spacingZones.length || row.spacingZones.length > 1000) throw new TypeError(`${path}.spacingZones: expected 1..1000 zones`)
      const zoneIds = new Set<string>()
      for (const zone of row.spacingZones) {
        record(zone, `${path}.spacingZone`); text(zone.id, `${path}.spacingZone.id`)
        if (zoneIds.has(zone.id)) throw new TypeError(`${path}: duplicate spacing zone ${zone.id}`)
        zoneIds.add(zone.id)
        decimal(zone.start, `${path}.zone.start`); decimal(zone.end, `${path}.zone.end`); decimal(zone.spacing, `${path}.zone.spacing`, true); unit(zone.unit, `${path}.zone.unit`)
        if (compareDecimalStrings(zone.end, zone.start) < 0) throw new TypeError(`${path}.zone: end precedes start`)
        if (typeof zone.includeStart !== 'boolean' || typeof zone.includeEnd !== 'boolean') throw new TypeError(`${path}.zone: explicit endpoint flags required`)
      }
    }
    if (row.rule !== undefined) {
      record(row.rule, `${path}.rule`)
      for (const key of ['id', 'version', 'fingerprint']) text(row.rule[key], `${path}.rule.${key}`)
      if (!Array.isArray(row.rule.standardRefs) || row.rule.standardRefs.some(item => typeof item !== 'string' || !item.trim())) throw new TypeError(`${path}.rule.standardRefs: expected strings`)
      if (!['draft', 'reviewed'].includes(String(row.rule.reviewStatus)) || typeof row.rule.adopted !== 'boolean') throw new TypeError(`${path}.rule: reviewStatus and adopted required`)
      sourceRefs(row.rule.sourceRefs, `${path}.rule.sourceRefs`)
    }
  }
  if (value.coverage !== undefined) {
    record(value.coverage, 'coverage')
    const expected = value.coverage.expectedGroupIds
    if (!Array.isArray(expected) || expected.some(id => typeof id !== 'string' || !id.trim()) || new Set(expected).size !== expected.length) throw new TypeError('coverage.expectedGroupIds: expected unique IDs')
    if (value.coverage.excluded !== undefined) {
      if (!Array.isArray(value.coverage.excluded)) throw new TypeError('coverage.excluded: expected array')
      const excluded = new Set<string>()
      for (const item of value.coverage.excluded) {
        record(item, 'coverage.excluded'); text(item.id, 'coverage.excluded.id'); text(item.reason, 'coverage.excluded.reason')
        if (!expected.includes(item.id) || excluded.has(item.id) || ids.has(item.id)) throw new TypeError(`Invalid excluded group: ${item.id}`)
        excluded.add(item.id)
      }
    }
  }
  return structuredClone(value) as unknown as RebarInput
}
