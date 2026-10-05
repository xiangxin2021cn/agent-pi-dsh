import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  createEngineeringProject, engineeringDependencyIssues, engineeringInputFingerprint, EngineeringProviderRegistry,
  reviseEngineeringProject, sumEngineeringQuantities, validateEngineeringProject,
} from '../index.ts'
import type { EngineeringDependency, EngineeringProject, EngineeringProvider, EngineeringQuantity } from '../index.ts'

const sourceHash = 'a'.repeat(64)
const sourceRef = { sourceId: 'drawing', sourceHash, locator: 'S-01 / 梁剖面 A' }
function fixture(): EngineeringProject {
  const project = createEngineeringProject({ id: 'pump-house', title: '泵房工程' })
  project.sources = [{ id: 'drawing', title: '结构图', path: 'S-01.pdf', sha256: sourceHash, status: 'active' }]
  project.objects = [{ id: 'beam-1', type: 'beam', title: '梁 KL1', sources: [sourceRef], parameters: {
    width: { value: 300, unit: 'mm', status: 'confirmed', sources: [sourceRef] },
    height: { value: 600, unit: 'mm', status: 'confirmed', sources: [sourceRef] },
  } }]
  project.quantities = [quantity(project, 'width-result', [{ kind: 'parameter', id: 'beam-1', parameter: 'width' }]), quantity(project, 'height-result', [{ kind: 'parameter', id: 'beam-1', parameter: 'height' }])]
  validateEngineeringProject(project)
  return project
}
function quantity(project: EngineeringProject, id: string, dependencies: EngineeringDependency[], overrides: Partial<EngineeringQuantity> = {}): EngineeringQuantity {
  return { id, title: id, purpose: 'geometric', objectIds: ['beam-1'], value: 10, unit: 'm3', formula: '已确认尺寸计算', dependencies,
    inputFingerprint: engineeringInputFingerprint(project, dependencies), status: 'reviewed', issues: [], ...overrides }
}
function provider(id: string, dependencies: EngineeringProvider['dependencies'] = []): EngineeringProvider {
  return { id, version: '1.0.0', title: id, dependencies, limitations: ['仅验证声明的专业范围'], parse: input => input, audit: () => [] }
}

test('parameter changes invalidate only related calculations and propagate in any record order', () => {
  const current = fixture()
  const derived = quantity(current, 'derived', [{ kind: 'quantity', id: 'width-result' }])
  current.quantities.unshift(derived)
  current.coverage = [{ id: 'beam-check', title: '梁复核', required: true, status: 'reviewed', dependencies: [{ kind: 'quantity', id: 'derived' }], inputFingerprint: engineeringInputFingerprint(current, [{ kind: 'quantity', id: 'derived' }]) }]
  const objects = structuredClone(current.objects)
  objects[0].parameters.width.value = 350
  const next = reviseEngineeringProject(current, { objects }, 0)
  assert.equal(next.quantities.find(row => row.id === 'width-result')!.status, 'stale')
  assert.equal(next.quantities.find(row => row.id === 'derived')!.status, 'stale')
  assert.equal(next.quantities.find(row => row.id === 'height-result')!.status, 'reviewed')
  assert.equal(next.coverage[0].status, 'stale')
  assert.equal(current.quantities[0].status, 'reviewed')
  assert.equal(current.objects[0].parameters.width.value, 300)
})

test('drawing revisions cannot silently rebind old dimensions to new source bytes', () => {
  const current = fixture()
  const sources = structuredClone(current.sources)
  sources[0].sha256 = 'b'.repeat(64)
  const next = reviseEngineeringProject(current, { sources }, 0)
  assert.ok(next.quantities.every(row => row.status === 'stale'))
  assert.equal(next.objects[0].parameters.width.sources[0].sourceHash, sourceHash)
  const deps: EngineeringDependency[] = [{ kind: 'parameter', id: 'beam-1', parameter: 'width' }]
  assert.match(engineeringDependencyIssues(next, deps).map(row => row.message).join(), /来源版本尚未核实/)
  assert.equal(engineeringDependencyIssues(next, deps)[0].severity, 'error')
  const rows = structuredClone(next.quantities)
  rows[0] = { ...rows[0], status: 'reviewed', inputFingerprint: engineeringInputFingerprint(next, deps) }
  assert.throws(() => reviseEngineeringProject(next, { quantities: rows }, 1), /current, confirmed inputs/)
})

test('project label and unrelated sources do not invalidate quantities', () => {
  const current = fixture()
  const next = reviseEngineeringProject(current, { title: '新名称', sources: [...current.sources, { id: 'deadline', title: '招标日期补遗', sha256: 'c'.repeat(64), status: 'active' }] }, 0)
  assert.ok(next.quantities.every(row => row.status === 'reviewed'))
  assert.throws(() => reviseEngineeringProject(next, {}, 0), /latest revision/)
})

test('adopted rule version remains locked while a new edition can coexist', () => {
  const project = fixture()
  const adoption = { id: 'project-rule-v1', packId: 'cn.rebar', version: '1', contentHash: 'd'.repeat(64), scope: { country: 'CN', discipline: 'rebar' }, adoptedAt: '2026-10-05T00:00:00Z', sources: [sourceRef] }
  project.ruleAdoptions = [adoption]
  project.quantities[0] = quantity(project, 'width-result', [{ kind: 'rule', id: adoption.id }])
  assert.throws(() => reviseEngineeringProject(project, { ruleAdoptions: [{ ...adoption, version: '2' }] }, 0), /locked/)
  assert.throws(() => reviseEngineeringProject(project, { ruleAdoptions: [] }, 0), /locked/)
  const next = reviseEngineeringProject(project, { ruleAdoptions: [adoption, { ...adoption, id: 'project-rule-v2', version: '2', contentHash: 'e'.repeat(64) }] }, 0)
  assert.equal(next.quantities[0].status, 'reviewed')
  assert.equal(next.ruleAdoptions[0].version, '1')
})

test('unknown, non-finite and unsourced parameters cannot produce reviewed quantities', () => {
  const project = fixture()
  project.objects[0].parameters.width = { value: null, status: 'provisional', unit: 'mm', sources: [] }
  project.quantities[0] = quantity(project, 'width-result', [{ kind: 'parameter', id: 'beam-1', parameter: 'width' }], { value: null, status: 'blocked', issues: ['缺宽度依据'] })
  validateEngineeringProject(project)
  project.quantities[0].status = 'reviewed'
  assert.throws(() => validateEngineeringProject(project), /current, confirmed inputs/)
  project.quantities[0].status = 'blocked'
  project.objects[0].parameters.width = { value: 300, status: 'confirmed', sources: [] }
  assert.throws(() => validateEngineeringProject(project), /source evidence/)
  project.objects[0].parameters.width = { value: Infinity, status: 'provisional', sources: [] }
  assert.throws(() => validateEngineeringProject(project), /finite scalar/)
})

test('duplicate ids, missing dependencies and quantity cycles fail before persistence', () => {
  const project = fixture()
  assert.throws(() => reviseEngineeringProject(project, { sources: [...project.sources, project.sources[0]] }, 0), /Duplicate/)
  assert.throws(() => engineeringInputFingerprint(project, [{ kind: 'source', id: 'absent' }]), /Unknown engineering source/)
  assert.throws(() => engineeringInputFingerprint(project, [{ kind: 'parameter', id: 'beam-1', parameter: 'constructor' }]), /Unknown engineering parameter/)
  const rows = structuredClone(project.quantities)
  rows[0].dependencies = [{ kind: 'quantity', id: rows[1].id }]
  rows[1].dependencies = [{ kind: 'quantity', id: rows[0].id }]
  assert.throws(() => reviseEngineeringProject(project, { quantities: rows }, 0), /Circular/)
})

test('contract baseline is retained and quantity purposes and units cannot be mixed', () => {
  const project = fixture()
  project.quantities.push(quantity(project, 'original-boq', [{ kind: 'source', id: 'drawing' }], { purpose: 'contract', value: 12 }))
  assert.throws(() => reviseEngineeringProject(project, { quantities: project.quantities.filter(row => row.id !== 'original-boq') }, 0), /must be retained/)
  const changed = structuredClone(project.quantities)
  changed[2].value = 13
  assert.throws(() => reviseEngineeringProject(project, { quantities: changed }, 0), /contract quantity is immutable/)
  assert.deepEqual(sumEngineeringQuantities(project, ['width-result', 'height-result']), { value: 20, unit: 'm3', purpose: 'geometric' })
  assert.throws(() => sumEngineeringQuantities(project, ['width-result', 'original-boq']), /different quantity purposes/)
  project.quantities[1].unit = 'kg'
  assert.throws(() => sumEngineeringQuantities(project, ['width-result', 'height-result']), /units/)
  assert.throws(() => sumEngineeringQuantities(project, ['width-result', 'width-result']), /distinct/)
})

test('coverage cannot claim review without evidence or hide exclusions without a reason', () => {
  const project = fixture()
  assert.throws(() => reviseEngineeringProject(project, { coverage: [{ id: 'roof', title: '屋面全部钢筋', status: 'reviewed', required: true, dependencies: [] }] }, 0), /current evidence/)
  assert.throws(() => reviseEngineeringProject(project, { coverage: [{ id: 'roof', title: '屋面全部钢筋', status: 'excluded', required: true, dependencies: [] }] }, 0), /needs a reason/)
})

test('registry reports missing or wrong dependency versions and rejects duplicates and cycles', () => {
  const registry = new EngineeringProviderRegistry()
  registry.register(provider('cn.rebar', [{ id: 'geometry', version: '1.0.0' }]))
  assert.equal(registry.assess('cn.rebar').status, 'unavailable')
  assert.throws(() => registry.get('cn.rebar'), /Missing/)
  const removeWrong = registry.register({ ...provider('geometry'), version: '2.0.0' })
  assert.match(registry.assess('cn.rebar').reasons.join(), /requires 1.0.0/)
  removeWrong()
  registry.register(provider('geometry'))
  assert.equal(registry.assess('cn.rebar').status, 'available')
  assert.throws(() => registry.register(provider('geometry')), /already registered/)
  const cycles = new EngineeringProviderRegistry()
  cycles.register(provider('aa', [{ id: 'bb' }]))
  assert.throws(() => cycles.register(provider('bb', [{ id: 'aa' }])), /Circular/)
  assert.equal(cycles.list().length, 1)
})

test('provider lifecycle and metadata mutation do not alter durable project records', () => {
  const project = fixture(), saved = JSON.stringify(project), registry = new EngineeringProviderRegistry()
  const original = provider('geometry')
  const dispose = registry.register(original)
  original.dependencies.push({ id: 'missing' })
  registry.list()[0].dependencies.push({ id: 'other' })
  assert.equal(registry.assess('geometry').status, 'available')
  assert.deepEqual(registry.get('geometry').audit({}, project), [])
  dispose()
  assert.equal(registry.list().length, 0)
  registry.register(provider('geometry'))
  dispose() // an old disposer must not remove a newly registered provider
  assert.equal(registry.list().length, 1)
  assert.equal(JSON.stringify(project), saved)
  validateEngineeringProject(JSON.parse(saved))
})

test('optional provider execution remains callable without leaking functions into metadata', async () => {
  const registry = new EngineeringProviderRegistry()
  registry.register({ ...provider('geometry'), inputDescription: '{ width: number } in mm; no assumed width', execute: async data => ({ result: data }) })
  assert.equal('execute' in registry.list()[0], false)
  assert.match(registry.get('geometry').inputDescription!, /width/)
  assert.deepEqual(await registry.get('geometry').execute!('input', fixture()), { result: 'input' })
})
