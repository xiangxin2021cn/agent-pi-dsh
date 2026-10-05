import { createHash } from 'node:crypto'
import { isDeepStrictEqual } from 'node:util'
import type { EngineeringDependency, EngineeringIssue, EngineeringProject, EngineeringProjectPatch, EngineeringSourceRef } from './types.ts'

const sha = /^[a-f0-9]{64}$/i
const text = (value: unknown): value is string => typeof value === 'string' && value.trim().length > 0
function requireValue(condition: unknown, message: string): asserts condition { if (!condition) throw new Error(message) }
function canonical(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonical)
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).filter(([, entry]) => entry !== undefined).sort(([a], [b]) => a.localeCompare(b)).map(([key, entry]) => [key, canonical(entry)]))
  return value
}
const digest = (value: unknown) => createHash('sha256').update(JSON.stringify(canonical(value))).digest('hex')

export function createEngineeringProject(input: { id: string; title: string }): EngineeringProject {
  const project: EngineeringProject = { schemaVersion: 1, id: input.id, title: input.title, revision: 0, sources: [], objects: [], quantities: [], ruleAdoptions: [], coverage: [] }
  validateEngineeringProject(project)
  return project
}

function sourceInput(project: EngineeringProject, id: string) {
  const row = project.sources.find(value => value.id === id)
  requireValue(row, `Unknown engineering source: ${id}`)
  return { id: row.id, sha256: row.sha256, revision: row.revision, status: row.status }
}
function referencedSources(project: EngineeringProject, refs: EngineeringSourceRef[]) {
  return refs.map(ref => ({ ...ref, current: sourceInput(project, ref.sourceId) }))
}
function dependencyInput(project: EngineeringProject, ref: EngineeringDependency, visiting: Set<string>): unknown {
  requireValue(ref && text(ref.id), 'Engineering dependency requires an id')
  if (ref.kind === 'source') return sourceInput(project, ref.id)
  if (ref.kind === 'object' || ref.kind === 'parameter') {
    const object = project.objects.find(value => value.id === ref.id)
    requireValue(object, `Unknown engineering object: ${ref.id}`)
    const keys = ref.kind === 'parameter' ? [ref.parameter] : Object.keys(object.parameters).sort()
    const parameters = Object.fromEntries(keys.map(key => {
      const parameter = Object.hasOwn(object.parameters, key) ? object.parameters[key] : undefined
      requireValue(parameter, `Unknown engineering parameter: ${ref.id}.${key}`)
      return [key, { ...parameter, sources: referencedSources(project, parameter.sources) }]
    }))
    return { id: object.id, type: object.type, parameters, ...(ref.kind === 'object' ? { sources: referencedSources(project, object.sources) } : {}) }
  }
  if (ref.kind === 'rule') {
    const rule = project.ruleAdoptions.find(value => value.id === ref.id)
    requireValue(rule, `Unknown adopted engineering rule: ${ref.id}`)
    return { ...rule, sources: referencedSources(project, rule.sources) }
  }
  requireValue(ref.kind === 'quantity', 'Unknown engineering dependency kind')
  const row = project.quantities.find(value => value.id === ref.id)
  requireValue(row, `Unknown engineering quantity: ${ref.id}`)
  requireValue(!visiting.has(row.id), 'Circular engineering quantity dependency')
  const nested = new Set(visiting).add(row.id)
  return { id: row.id, purpose: row.purpose, value: row.value, unit: row.unit, formula: row.formula, status: row.status, issues: row.issues,
    inputs: row.dependencies.map(value => ({ ref: value, input: dependencyInput(project, value, nested) })) }
}

/** Project revision and unrelated fields deliberately do not participate. */
export function engineeringInputFingerprint(project: EngineeringProject, dependencies: EngineeringDependency[]): string {
  return digest(dependencies.map(ref => ({ ref, input: dependencyInput(project, ref, new Set()) })).sort((a, b) => JSON.stringify(canonical(a.ref)).localeCompare(JSON.stringify(canonical(b.ref)))))
}

/** Drawing/rule sources actually covered by a run's explicit dependency scope. */
export function engineeringDependencySourceIds(project: EngineeringProject, dependencies: readonly EngineeringDependency[], visited = new Set<string>()): Set<string> {
  const ids = new Set<string>()
  for (const ref of dependencies) {
    if (ref.kind === 'source') ids.add(ref.id)
    else if (ref.kind === 'rule') for (const source of project.ruleAdoptions.find(row => row.id === ref.id)?.sources || []) ids.add(source.sourceId)
    else if (ref.kind === 'quantity') {
      if (visited.has(ref.id)) continue
      visited.add(ref.id)
      for (const id of engineeringDependencySourceIds(project, project.quantities.find(row => row.id === ref.id)?.dependencies || [], visited)) ids.add(id)
    } else {
      const object = project.objects.find(row => row.id === ref.id)
      const sources = ref.kind === 'parameter' ? object?.parameters[ref.parameter]?.sources || [] : [...object?.sources || [], ...Object.values(object?.parameters || {}).flatMap(row => row.sources)]
      for (const source of sources) ids.add(source.sourceId)
    }
  }
  return ids
}

function referenceIssues(project: EngineeringProject, refs: EngineeringSourceRef[]): string[] {
  return refs.flatMap(ref => {
    const source = project.sources.find(value => value.id === ref.sourceId)
    return !source || source.status !== 'active' || source.sha256 !== ref.sourceHash ? [`来源版本尚未核实：${ref.sourceId}（${ref.locator}）`] : []
  })
}

export function engineeringDependencyIssues(project: EngineeringProject, dependencies: EngineeringDependency[]): EngineeringIssue[] {
  engineeringInputFingerprint(project, dependencies) // also validates references and cycles
  const inspect = (ref: EngineeringDependency): string[] => {
    if (ref.kind === 'source') return project.sources.find(row => row.id === ref.id)?.status === 'active' ? [] : [`来源不可用于当前计算：${ref.id}`]
    if (ref.kind === 'object' || ref.kind === 'parameter') {
      const object = project.objects.find(row => row.id === ref.id)!
      const parameters = ref.kind === 'parameter' ? [[ref.parameter, object.parameters[ref.parameter]] as const] : Object.entries(object.parameters)
      return [...(ref.kind === 'object' ? referenceIssues(project, object.sources) : []), ...parameters.flatMap(([key, parameter]) => [
        ...(parameter.status !== 'confirmed' || parameter.value === null ? [`参数尚未确认：${object.id}.${key}`] : []), ...referenceIssues(project, parameter.sources),
      ])]
    }
    if (ref.kind === 'rule') return referenceIssues(project, project.ruleAdoptions.find(row => row.id === ref.id)!.sources)
    const row = project.quantities.find(value => value.id === ref.id)!
    return [...(row.status !== 'reviewed' || row.value === null || row.inputFingerprint !== engineeringInputFingerprint(project, row.dependencies) ? [`上游数量尚未复核：${row.id}`] : []), ...row.issues, ...row.dependencies.flatMap(inspect)]
  }
  return [...new Set(dependencies.flatMap(inspect))].map(message => ({ code: 'engineering_dependency_unverified', severity: 'error', message }))
}

export function validateEngineeringProject(project: EngineeringProject): void {
  requireValue(project?.schemaVersion === 1 && text(project.id) && text(project.title) && Number.isInteger(project.revision) && project.revision >= 0, 'Invalid engineering project identity')
  for (const collection of [project.sources, project.objects, project.quantities, project.ruleAdoptions, project.coverage]) {
    requireValue(Array.isArray(collection), 'Engineering collections must be arrays')
    const ids = new Set<string>()
    for (const row of collection) { requireValue(row && text(row.id) && !ids.has(row.id), 'Duplicate or missing engineering record id'); ids.add(row.id) }
  }
  const checkRefs = (refs: EngineeringSourceRef[]) => {
    requireValue(Array.isArray(refs), 'Engineering source references must be an array')
    for (const ref of refs) requireValue(ref && project.sources.some(row => row.id === ref.sourceId) && text(ref.locator) && typeof ref.sourceHash === 'string' && sha.test(ref.sourceHash), 'Source reference needs an existing source, inspected hash and locator')
  }
  const checkDependencies = (dependencies: EngineeringDependency[]) => {
    requireValue(Array.isArray(dependencies) && dependencies.length > 0, 'Engineering result requires dependencies')
    engineeringInputFingerprint(project, dependencies)
  }
  for (const source of project.sources) requireValue(text(source.title) && typeof source.sha256 === 'string' && sha.test(source.sha256) && ['active', 'superseded', 'unreadable'].includes(source.status), 'Invalid engineering source')
  for (const object of project.objects) {
    requireValue(text(object.type) && text(object.title) && object.parameters && typeof object.parameters === 'object' && !Array.isArray(object.parameters), 'Invalid engineering object')
    checkRefs(object.sources)
    for (const [key, parameter] of Object.entries(object.parameters)) {
      requireValue(text(key) && parameter && ['confirmed', 'provisional', 'conflict'].includes(parameter.status), 'Invalid engineering parameter')
      requireValue(parameter.value === null || ['string', 'boolean'].includes(typeof parameter.value) || typeof parameter.value === 'number' && Number.isFinite(parameter.value), 'Parameter must be a finite scalar or unknown')
      checkRefs(parameter.sources)
      if (parameter.status === 'confirmed') requireValue(parameter.value !== null && parameter.sources.length > 0, 'Confirmed parameter needs a value and source evidence')
    }
  }
  for (const rule of project.ruleAdoptions) {
    requireValue(text(rule.packId) && text(rule.version) && typeof rule.contentHash === 'string' && sha.test(rule.contentHash) && rule.scope && text(rule.scope.country) && text(rule.scope.discipline) && text(rule.adoptedAt) && Number.isFinite(Date.parse(rule.adoptedAt)), 'Invalid engineering rule adoption')
    checkRefs(rule.sources)
    requireValue(rule.sources.length > 0, 'Adopted rules need source evidence')
  }
  for (const quantity of project.quantities) {
    requireValue(text(quantity.title) && ['geometric', 'fabrication', 'contract', 'procurement'].includes(quantity.purpose) && text(quantity.unit) && text(quantity.formula), 'Quantity requires a purpose, unit and calculation basis')
    requireValue(quantity.value === null || typeof quantity.value === 'number' && Number.isFinite(quantity.value) && quantity.value >= 0, 'Quantity must be finite and non-negative, or unknown')
    requireValue(Array.isArray(quantity.objectIds) && quantity.objectIds.every(id => project.objects.some(row => row.id === id)), 'Quantity refers to an unknown object')
    requireValue(['draft', 'reviewed', 'stale', 'blocked'].includes(quantity.status) && Array.isArray(quantity.issues) && quantity.issues.every(text), 'Invalid quantity review state')
    checkDependencies(quantity.dependencies)
    if (quantity.inputFingerprint !== undefined) requireValue(sha.test(quantity.inputFingerprint), 'Invalid engineering input fingerprint')
    if (quantity.status === 'reviewed') requireValue(quantity.value !== null && !quantity.issues.length && quantity.inputFingerprint === engineeringInputFingerprint(project, quantity.dependencies) && !engineeringDependencyIssues(project, quantity.dependencies).length, 'Reviewed quantity requires current, confirmed inputs and no unresolved issues')
  }
  for (const row of project.coverage) {
    requireValue(text(row.title) && typeof row.required === 'boolean' && ['pending', 'reviewed', 'missing', 'excluded', 'stale'].includes(row.status) && Array.isArray(row.dependencies), 'Invalid engineering coverage')
    if (row.status === 'excluded' || row.status === 'missing') requireValue(text(row.reason), 'Missing or excluded coverage needs a reason')
    if (row.dependencies.length) checkDependencies(row.dependencies)
    if (row.status === 'reviewed') requireValue(row.dependencies.length > 0 && row.inputFingerprint === engineeringInputFingerprint(project, row.dependencies) && !engineeringDependencyIssues(project, row.dependencies).length, 'Reviewed coverage requires current evidence')
  }
}

export function reviseEngineeringProject(current: EngineeringProject, patch: EngineeringProjectPatch, expectedRevision: number): EngineeringProject {
  validateEngineeringProject(current)
  requireValue(current.revision === expectedRevision, 'Engineering project changed; read the latest revision')
  for (const key of Object.keys(patch)) requireValue(['title', 'sources', 'objects', 'quantities', 'ruleAdoptions', 'coverage'].includes(key), `Engineering project field cannot be patched: ${key}`)
  const next: EngineeringProject = structuredClone({ ...current, ...patch, revision: current.revision + 1 })
  for (const adopted of current.ruleAdoptions) requireValue(isDeepStrictEqual(adopted, next.ruleAdoptions.find(row => row.id === adopted.id)), 'Adopted rule versions are locked; register a new adoption id')
  for (const before of current.quantities) {
    const after = next.quantities.find(row => row.id === before.id)
    if (before.purpose === 'contract') requireValue(after, 'Original contract quantity must be retained')
    if (!after) continue
    requireValue(before.purpose === after.purpose && before.unit === after.unit, 'Quantity purpose and unit are immutable; create another record')
    if (before.purpose === 'contract') requireValue(before.value === after.value && before.formula === after.formula && isDeepStrictEqual(before.dependencies, after.dependencies), 'Original contract quantity is immutable; create another sourced baseline')
  }
  // Iterate to propagate invalidation through arbitrary ordering of quantity dependencies.
  let changed = true
  while (changed) {
    changed = false
    for (const row of next.quantities) {
      if (!['draft', 'reviewed'].includes(row.status) || !row.inputFingerprint) continue
      if (row.inputFingerprint !== engineeringInputFingerprint(next, row.dependencies)) { row.status = 'stale'; changed = true }
    }
  }
  for (const row of next.coverage) if (row.status === 'reviewed' && row.inputFingerprint && row.inputFingerprint !== engineeringInputFingerprint(next, row.dependencies)) row.status = 'stale'
  validateEngineeringProject(next)
  return next
}

/** Mixing physical, fabrication, payable and purchase quantities requires an explicit mapping. */
export function sumEngineeringQuantities(project: EngineeringProject, ids: string[]): { value: number; unit: string; purpose: string } {
  validateEngineeringProject(project)
  requireValue(ids.length > 0 && new Set(ids).size === ids.length, 'Select distinct engineering quantities')
  const rows = ids.map(id => { const row = project.quantities.find(value => value.id === id); requireValue(row, `Unknown engineering quantity: ${id}`); return row })
  requireValue(rows.every(row => row.unit === rows[0].unit && row.purpose === rows[0].purpose), 'Cannot sum different quantity purposes or units')
  requireValue(rows.every(row => row.status === 'reviewed' && row.value !== null), 'Only current reviewed quantities can be summed')
  const value = rows.reduce((sum, row) => sum + row.value!, 0)
  requireValue(Number.isFinite(value), 'Engineering quantity total overflow')
  return { value, unit: rows[0].unit, purpose: rows[0].purpose }
}
