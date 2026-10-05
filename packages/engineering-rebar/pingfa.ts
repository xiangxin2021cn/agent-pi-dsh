import { compareDecimalStrings, multiplyDecimalStrings, sumDecimalStrings } from '../business-core/src/tender/capabilities/cost/decimal.ts'
import { decimal, fingerprint, meters, record, sourceRefs, text } from './schema.ts'
import type { ExpandPingfaInput, PingfaAnnotation, PingfaExpansion, PingfaParseResult, PingfaToken, QuantityBasis, RebarIssue, RebarRowInput, RebarSourceRef } from './types.ts'

const SYMBOL = '[ΦφØø∅ABCDEF]'
const COUNTED = new RegExp(`^(G|N)?([1-9]\\d*)(${SYMBOL})([1-9]\\d*(?:\\.\\d+)?)$`, 'i')
const STIRRUPS = new RegExp(`^(${SYMBOL})([1-9]\\d*(?:\\.\\d+)?)@([1-9]\\d*(?:\\.\\d+)?)(?:/([1-9]\\d*(?:\\.\\d+)?))?(?:\\(([1-9]\\d*)\\))?$`, 'i')

/** Parse only fully supported forms; preserve unknown glyphs and suffixes instead of guessing. */
export function parsePingfa(input: string | { text: string; sourceRefs?: RebarSourceRef[] }): PingfaParseResult {
  const original = typeof input === 'string' ? input : input.text
  text(original, 'pingfa.text')
  const refs = typeof input === 'string' ? [] : input.sourceRefs ?? []
  sourceRefs(refs, 'pingfa.sourceRefs')
  const normalized = original.trim().replace(/（/g, '(').replace(/）/g, ')').replace(/[×＊*]/g, 'x').replace(/＠/g, '@')
  const tokens: PingfaToken[] = []
  const unsupported: string[] = []
  const beam = normalized.match(/^(WKL|KL|L)([A-Za-z0-9._-]+)(?:\(([1-9]\d*)(A|B)?\)\s*|\s+)([1-9]\d*(?:\.\d+)?)x([1-9]\d*(?:\.\d+)?)$/i)
  if (beam && (!beam[3] || Number.isSafeInteger(Number(beam[3])))) {
    tokens.push({ kind: 'beam', beamType: beam[1].toUpperCase(), mark: `${beam[1]}${beam[2]}`, spans: beam[3] ? Number(beam[3]) : undefined, cantilever: beam[4]?.toUpperCase() as 'A' | 'B' | undefined, widthMm: beam[5], heightMm: beam[6] })
  } else {
    for (const part of normalized.replace(/\s+/g, '').split('+')) {
      const bars = part.match(COUNTED)
      const stirrups = part.match(STIRRUPS)
      if (bars && Number.isSafeInteger(Number(bars[2]))) tokens.push({ kind: 'bars', count: Number(bars[2]), diameterMm: bars[4], symbol: bars[3], ...(bars[1] ? { role: bars[1].toUpperCase() === 'G' ? 'side-construction' : 'side-torsion' } : {}) })
      else if (stirrups && (!stirrups[5] || Number.isSafeInteger(Number(stirrups[5])))) tokens.push({ kind: 'stirrups', diameterMm: stirrups[2], symbol: stirrups[1], spacingMm: [stirrups[3], ...(stirrups[4] ? [stirrups[4]] : [])], limbs: stirrups[5] ? Number(stirrups[5]) : undefined })
      else unsupported.push(part || original)
    }
  }
  return { text: original, supported: unsupported.length === 0 && tokens.length > 0, tokens, unsupported, sourceRefs: structuredClone(refs), issues: unsupported.map(part => ({ code: 'unsupported_annotation', severity: 'error', message: `Unsupported complete annotation fragment: ${part}. Keep the original drawing for review.` })) }
}

/** Rules are structured, project-adopted arithmetic. No normative coefficients or executable text are inferred. */
export function expandPingfa(input: ExpandPingfaInput): PingfaExpansion {
  validateExpansion(input)
  const issues: RebarIssue[] = []
  const rows: RebarRowInput[] = []
  const ruleFingerprint = fingerprint(input.ruleSet)
  const appliedAnnotations: PingfaExpansion['appliedAnnotations'] = []
  const expectedGroupIds: string[] = []
  const local = input.local ?? []
  const relevantLocal = local.filter(annotation => annotation.scopeId === input.scopeId)
  for (const annotation of local.filter(annotation => annotation.scopeId !== input.scopeId)) issues.push({ code: 'local_scope_not_applied', severity: 'warning', parameter: annotation.role, message: `Local annotation for ${annotation.scopeId} was not applied to ${input.scopeId}.` })
  const roles = [...new Set([...input.ruleSet.requiredRoles, ...input.central.map(annotation => annotation.role), ...relevantLocal.map(annotation => annotation.role)])]
  for (const role of roles) {
    const overrides = relevantLocal.filter(annotation => annotation.role === role)
    const central = input.central.filter(annotation => annotation.role === role)
    const candidates = overrides.length ? overrides : central
    const id = `${input.hostId}:${input.scopeId}:${role}`
    const rules = input.ruleSet.rules.filter(rule => rule.role === role)
    const rule = rules.length === 1 ? rules[0] : undefined
    const base: RebarRowInput = {
      id, hostId: input.hostId, inputMode: 'pingfa', role, sourceRefs: candidates.flatMap(annotation => annotation.sourceRefs),
      rule: { id: rule?.id ?? input.ruleSet.id, version: input.ruleSet.version, fingerprint: ruleFingerprint, standardRefs: [...input.ruleSet.standardRefs], errataFingerprint: input.ruleSet.errataFingerprint, reviewStatus: input.ruleSet.reviewStatus, adopted: input.ruleSet.adopted, sourceRefs: structuredClone(input.ruleSet.sourceRefs) },
      missingInputs: [],
    }
    const block = (code: string, parameter: string, message: string) => { base.missingInputs!.push(parameter); issues.push({ code, severity: 'error', rowId: id, parameter, message }) }
    if (!input.ruleSet.supportedHostTypes.includes(input.hostType)) block('unsupported_host', 'hostType', `Rule pack does not support ${input.hostType}.`)
    if (candidates.length !== 1) block(candidates.length ? 'annotation_conflict' : 'missing_annotation', 'annotation', `Expected one annotation for ${role}; found ${candidates.length}.`)
    if (!rule) block(rules.length ? 'ambiguous_rule' : 'missing_rule', 'rule', `Expected one supported rule for ${role}; found ${rules.length}.`)
    if (!input.ruleSet.adopted || input.ruleSet.reviewStatus !== 'reviewed') block('rule_not_approved', 'ruleApproval', 'The rule pack is not both reviewed and adopted.')
    const annotation = candidates.length === 1 ? candidates[0] : undefined
    if (annotation) appliedAnnotations.push({ role, origin: overrides.length ? 'local' : 'central', text: annotation.text, sourceRefs: structuredClone(annotation.sourceRefs) })
    const parsed = annotation ? parsePingfa(annotation) : undefined
    if (parsed && !parsed.supported) { issues.push(...parsed.issues.map(issue => ({ ...issue, rowId: id }))); base.missingInputs!.push('supportedAnnotation') }
    if (base.missingInputs!.length || !parsed || !rule) { rows.push(base); expectedGroupIds.push(id); continue }
    // A beam heading is geometry metadata, never a complete reinforcement group.
    if (parsed.tokens.some(token => token.kind === 'beam')) { block('reinforcement_missing', 'reinforcement', 'A member heading alone does not define reinforcement.'); rows.push(base); expectedGroupIds.push(id); continue }
    parsed.tokens.forEach((token, index) => {
      if (token.kind === 'beam') return
      const row: RebarRowInput = { ...structuredClone(base), id: parsed.tokens.length === 1 ? id : `${id}:${index + 1}`, diameterMm: token.diameterMm, count: token.kind === 'bars' ? token.count : null, lengths: {}, derivation: [] }
      expectedGroupIds.push(row.id)
      const usedParameters = new Set<string>()
      const required = new Set([...rule.requiredParameters, ...Object.values(rule.lengths).flatMap(expression => expression!.terms.map(term => term.parameter)), ...(rule.countParameter ? [rule.countParameter] : []), ...(rule.unitMassParameter ? [rule.unitMassParameter] : [])])
      for (const name of required) {
        const parameter = input.parameters[name]
        if (parameter?.value == null) { row.missingInputs!.push(name); issues.push({ code: 'missing_parameter', severity: 'error', rowId: row.id, parameter: name, message: `No value was supplied for ${name}.` }) }
        else usedParameters.add(name)
      }
      for (const basis of ['geometry', 'measurement', 'fabrication'] as QuantityBasis[]) {
        const expression = rule.lengths[basis]
        if (!expression) continue
        const parts: string[] = []
        const terms: NonNullable<RebarRowInput['derivation']>[number]['terms'] = []
        let complete = true
        for (const term of expression.terms) {
          const parameter = input.parameters[term.parameter]
          if (parameter?.value == null) { complete = false; continue }
          if (parameter.unit !== 'm' && parameter.unit !== 'mm') { complete = false; parameterIssue(row, issues, term.parameter, 'Length expressions require mm or m.'); continue }
          const lengthM = multiplyDecimalStrings(meters(String(parameter.value), parameter.unit), term.multiplier ?? '1')
          parts.push(lengthM)
          terms.push({ parameter: term.parameter, inputValue: String(parameter.value), inputUnit: parameter.unit, multiplier: term.multiplier ?? '1', lengthM, sourceRefs: structuredClone(parameter.sourceRefs) })
        }
        if (complete) {
          const length = sumDecimalStrings(parts)
          if (compareDecimalStrings(length, '0') <= 0) parameterIssue(row, issues, basis, 'Computed length must be positive.')
          else row.lengths![basis] = { value: length, unit: 'm' }
        }
        row.derivation!.push({ basis, terms })
      }
      if (rule.countParameter) {
        const parameter = input.parameters[rule.countParameter]
        if (parameter?.value != null) {
          const number = Number(parameter.value)
          if (parameter.unit !== 'count' || !Number.isSafeInteger(number) || number <= 0) parameterIssue(row, issues, rule.countParameter, 'Count requires a positive integer with count unit.')
          else if (token.kind === 'bars' && token.count !== number) { row.count = null; parameterIssue(row, issues, rule.countParameter, 'Explicit count conflicts with the parsed bar count.') }
          else row.count = number
        }
      }
      if (token.kind === 'stirrups' && !rule.countParameter) parameterIssue(row, issues, 'distribution', 'Stirrup spacing needs reviewed zone extents and endpoint rules; spacing alone does not determine count.')
      const diameterMass = input.unitMassByDiameter?.[token.diameterMm]
      if (diameterMass?.value != null) {
        if (diameterMass.unit !== 'kg/m' || compareDecimalStrings(String(diameterMass.value), '0') <= 0) parameterIssue(row, issues, `unitMass:${token.diameterMm}`, 'Unit mass requires a positive kg/m value.')
        else { row.unitMassKgPerM = String(diameterMass.value); row.sourceRefs.push(...diameterMass.sourceRefs) }
      } else if (rule.unitMassParameter) {
        const parameter = input.parameters[rule.unitMassParameter]
        if (parameter?.value != null) {
          if (new Set(parsed.tokens.filter(token => token.kind !== 'beam').map(token => token.diameterMm)).size > 1) parameterIssue(row, issues, rule.unitMassParameter, 'Mixed diameters require explicit per-diameter unit masses.')
          else if (parameter.unit !== 'kg/m' || compareDecimalStrings(String(parameter.value), '0') <= 0) parameterIssue(row, issues, rule.unitMassParameter, 'Unit mass requires a positive kg/m value.')
          else row.unitMassKgPerM = String(parameter.value)
        }
      }
      // The glyph is retained for review; it is never guessed to be a steel grade.
      const steelGrade = input.steelGradeBySymbol?.[token.symbol]
      if (steelGrade) { row.steelGrade = steelGrade.grade; row.sourceRefs.push(...steelGrade.sourceRefs) }
      else row.missingInputs!.push(`steelGradeForSymbol:${token.symbol}`)
      row.sourceRefs.push(...[...usedParameters].flatMap(name => input.parameters[name].sourceRefs))
      rows.push(row)
    })
  }
  return { rows, coverage: { expectedGroupIds }, issues, ruleFingerprint, appliedAnnotations, fabricationApproved: false }
}

function parameterIssue(row: RebarRowInput, issues: RebarIssue[], parameter: string, message: string) {
  row.missingInputs!.push(parameter)
  issues.push({ code: 'invalid_parameter', severity: 'error', rowId: row.id, parameter, message })
}

function validateExpansion(input: ExpandPingfaInput) {
  record(input, 'pingfa'); text(input.hostId, 'hostId'); text(input.scopeId, 'scopeId')
  if (!['beam', 'column', 'slab', 'foundation'].includes(input.hostType)) throw new TypeError('Unsupported hostType')
  if (!Array.isArray(input.central) || (input.local !== undefined && !Array.isArray(input.local))) throw new TypeError('Annotations must be arrays')
  const annotation = (item: PingfaAnnotation) => { record(item, 'annotation'); text(item.role, 'annotation.role'); text(item.text, 'annotation.text'); sourceRefs(item.sourceRefs, 'annotation.sourceRefs') }
  input.central.forEach(annotation)
  input.local?.forEach(item => { annotation(item); text(item.scopeId, 'annotation.scopeId') })
  record(input.parameters, 'parameters')
  for (const [name, parameter] of Object.entries(input.parameters)) {
    record(parameter, `parameter.${name}`); sourceRefs(parameter.sourceRefs, `parameter.${name}.sourceRefs`)
    if (!['mm', 'm', 'count', 'kg/m'].includes(parameter.unit)) throw new TypeError(`parameter.${name}: unsupported unit`)
    if (parameter.value != null) decimal(String(parameter.value), `parameter.${name}.value`)
  }
  if (input.steelGradeBySymbol !== undefined) {
    record(input.steelGradeBySymbol, 'steelGradeBySymbol')
    for (const entry of Object.values(input.steelGradeBySymbol)) { record(entry, 'steelGrade'); text(entry.grade, 'steelGrade.grade'); sourceRefs(entry.sourceRefs, 'steelGrade.sourceRefs') }
  }
  if (input.unitMassByDiameter !== undefined) {
    record(input.unitMassByDiameter, 'unitMassByDiameter')
    for (const [diameter, entry] of Object.entries(input.unitMassByDiameter)) { decimal(diameter, 'diameter', true); record(entry, 'unitMass'); sourceRefs(entry.sourceRefs, 'unitMass.sourceRefs'); if (entry.unit !== 'kg/m') throw new TypeError('unitMassByDiameter requires kg/m'); if (entry.value != null) decimal(String(entry.value), 'unitMass.value', true) }
  }
  const pack = input.ruleSet
  record(pack, 'ruleSet'); text(pack.id, 'ruleSet.id'); text(pack.version, 'ruleSet.version'); sourceRefs(pack.sourceRefs, 'ruleSet.sourceRefs')
  if (!['draft', 'reviewed'].includes(pack.reviewStatus) || typeof pack.adopted !== 'boolean') throw new TypeError('ruleSet reviewStatus/adopted required')
  for (const [key, values] of Object.entries({ standardRefs: pack.standardRefs, requiredRoles: pack.requiredRoles, supportedHostTypes: pack.supportedHostTypes })) {
    if (!Array.isArray(values) || !values.length || values.some(value => typeof value !== 'string' || !value.trim()) || new Set(values).size !== values.length) throw new TypeError(`ruleSet.${key}: nonempty unique entries required`)
  }
  if (!Array.isArray(pack.rules)) throw new TypeError('ruleSet.rules must be an array')
  const ids = new Set<string>()
  for (const rule of pack.rules) {
    record(rule, 'rule'); text(rule.id, 'rule.id'); text(rule.role, 'rule.role')
    if (ids.has(rule.id)) throw new TypeError(`Duplicate rule ID ${rule.id}`)
    ids.add(rule.id)
    if (!Array.isArray(rule.requiredParameters) || rule.requiredParameters.some(value => typeof value !== 'string' || !value.trim())) throw new TypeError('rule.requiredParameters must be names')
    record(rule.lengths, 'rule.lengths')
    for (const [basis, expression] of Object.entries(rule.lengths)) {
      if (!['geometry', 'measurement', 'fabrication'].includes(basis)) throw new TypeError(`Unsupported quantity basis ${basis}`)
      record(expression, 'expression')
      if (!Array.isArray(expression.terms) || !expression.terms.length) throw new TypeError('Length expressions require explicit parameter terms')
      for (const term of expression.terms) { record(term, 'term'); text(term.parameter, 'term.parameter'); if (term.multiplier !== undefined) decimal(term.multiplier, 'term.multiplier') }
    }
    for (const name of [rule.countParameter, rule.unitMassParameter]) if (name !== undefined) text(name, 'rule parameter name')
  }
}
