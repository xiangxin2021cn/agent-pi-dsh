import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { apply, executeRebar, rebarCapability, rebarProvider } from '../src/index.ts'
import { EngineeringProviderRegistry } from '../../../packages/engineering-core/index.ts'
import { CapabilityRegistry } from '../../../packages/professional-tasks/capabilities.ts'
import { createEngineeringProject } from '../../../packages/engineering-core/index.ts'

function example(name: 'bbs' | 'pingfa') { return JSON.parse(readFileSync(new URL(`../../../packages/engineering-rebar/examples/${name}.json`, import.meta.url), 'utf8')) }

test('registered provider calculates real BBS fixture and preserves each quantity purpose', async () => {
  const registry = new EngineeringProviderRegistry()
  const dispose = registry.register(rebarProvider)
  const provider = registry.get('rebar')!
  const input = provider.parse({ action: 'calculate', data: example('bbs') })
  const output = await provider.execute!(input, { schemaVersion: 1, id: 'demo', title: 'Demo', revision: 0, sources: [], objects: [], quantities: [], ruleAdoptions: [], coverage: [] }) as ReturnType<typeof executeRebar>
  assert.ok('totalsByBasis' in output.details)
  if (!('totalsByBasis' in output.details)) return
  assert.equal(output.details.totalsByBasis.geometry.knownMassKg, '9.48')
  assert.equal(output.details.totalsByBasis.fabrication.knownMassKg, '9.875')
  assert.equal(output.details.fabricationApproved, false)
  assert.match(output.summary, /声明的组清单/)
  assert.deepEqual(output.issues, [])
  dispose()
  assert.throws(() => registry.get('rebar'), /Missing engineering provider/)
})

test('parse action reports unsupported suffix without claiming full interpretation', () => {
  const valid = executeRebar({ action: 'parse_pingfa', data: { text: 'Φ8@100/200(2)' } })
  assert.ok('tokens' in valid.details)
  if ('tokens' in valid.details) assert.equal(valid.details.tokens[0].kind, 'stirrups')
  const incomplete = executeRebar({ action: 'parse_pingfa', data: { text: '4Φ20 2/2' } })
  assert.match(incomplete.summary, /未完整解析/)
  assert.equal(incomplete.issues[0].severity, 'error')
  assert.equal(incomplete.details.fabricationApproved, false)
})

test('expand action executes reviewed arithmetic and distinguishes local coverage from whole project', () => {
  const output = executeRebar({ action: 'expand_pingfa', data: example('pingfa') })
  assert.ok('calculation' in output.details)
  if (!('calculation' in output.details)) return
  assert.equal(output.details.calculation.rows[0].quantities.geometry.totalMassKg, '35.392')
  assert.equal(output.details.coverageScope, 'declared_roles_only')
  assert.equal(output.details.calculation.fabricationApproved, false)
  assert.equal(output.issues.find(issue => issue.code === 'project_coverage_not_verified')?.severity, 'warning')
})

test('expansion missing dimensions remains unknown and maps engine row IDs into host issues', () => {
  const data = example('pingfa'); data.parameters.left.value = null
  const output = executeRebar({ action: 'expand_pingfa', data })
  assert.ok('calculation' in output.details)
  if (!('calculation' in output.details)) return
  assert.equal(output.details.calculation.rows[0].quantities.geometry.totalLengthM, null)
  assert.equal(output.issues.find(issue => issue.code === 'missing_parameter')?.entityId, 'DEMO-KL1:span-1:bottom')
  assert.match(output.summary, /1 组有未解决项/)
})

test('partial BBS calculations retain known subtotal but advertise unresolved row count', () => {
  const data = example('bbs'); data.rows[0].steelGrade = null
  const output = executeRebar({ action: 'calculate', data })
  assert.ok('totalsByBasis' in output.details)
  if (!('totalsByBasis' in output.details)) return
  assert.equal(output.details.totalsByBasis.geometry.knownMassKg, '9.48')
  assert.equal(output.details.totalsByBasis.geometry.incompleteRows, 1)
  assert.equal(output.details.coverage.complete, false)
  assert.equal(output.issues[0].entityId, data.rows[0].id)
  assert.equal(output.issues[0].severity, 'error')
})

test('wrapper rejects malformed action, missing mode and invalid parameters', () => {
  for (const value of [null, [], { action: 'calculate' }, { action: 'unknown', data: {} }, { action: 'calculate', data: [] }]) assert.throws(() => rebarProvider.parse(value))
  const data = example('bbs'); delete data.rows[0].inputMode
  assert.throws(() => executeRebar({ action: 'calculate', data }), /inputMode/)
  assert.throws(() => executeRebar({ action: 'parse_pingfa', data: { text: 8 } }), /text/)
  assert.throws(() => executeRebar({ action: 'expand_pingfa', data: {} }), /hostId/)
  assert.match(rebarProvider.inputDescription!, /inputMode/)
})

test('plugin registers and disposes both callable provider and capability limitations', () => {
  const providers = new EngineeringProviderRegistry(), capabilities = new CapabilityRegistry()
  const disposers: (() => void)[] = []
  const effect = (factory: () => () => void) => disposers.push(factory())
  apply({ engineering: { providers }, effect, inject(names: string[], callback: (ctx: unknown) => void) { assert.deepEqual(names, ['professionalCapabilities']); callback({ professionalCapabilities: capabilities, effect }) } })
  assert.equal(providers.get('rebar')?.id, 'rebar')
  assert.deepEqual(capabilities.list()[0].limitations, rebarCapability.limitations)
  for (const dispose of disposers.reverse()) dispose()
  assert.equal(providers.list().length, 0)
  assert.equal(capabilities.list().length, 0)
})

test('project rule adoption pins the inspected content and every source must be current', () => {
  const data = example('pingfa'), project = createEngineeringProject({ id: 'rules', title: 'Rules' })
  const inspected = executeRebar({ action: 'inspect_rules', data: { ruleSet: data.ruleSet } })
  assert.ok('ruleFingerprint' in inspected.details)
  if (!('ruleFingerprint' in inspected.details)) return
  assert.equal((inspected.details as any).projectAdopted, false)
  assert.ok(rebarProvider.audit({ action: 'expand_pingfa', data }, project).some(row => row.code === 'rebar_rule_unpinned'))
  const refs: any[] = []
  const visit = (value: any) => { if (!value || typeof value !== 'object') return; if (Array.isArray(value)) return value.forEach(visit); for (const [key, child] of Object.entries(value)) { if (key === 'sourceRefs') refs.push(...child as any[]); else visit(child) } }
  visit(data)
  for (const ref of refs) ref.sha256 = 'a'.repeat(64)
  project.sources = [...new Set(refs.map(ref => ref.documentId))].map(id => ({ id, title: id, sha256: 'a'.repeat(64), status: 'active' }))
  const pinned = executeRebar({ action: 'inspect_rules', data: { ruleSet: data.ruleSet } }).details as any
  project.ruleAdoptions = [{ id: 'adopted', packId: data.ruleSet.id, version: data.ruleSet.version, contentHash: pinned.ruleFingerprint, scope: { country: 'CN', discipline: 'rebar' }, adoptedAt: '2026-10-05T00:00:00Z', sources: [{ sourceId: data.ruleSet.sourceRefs[0].documentId, sourceHash: 'a'.repeat(64), locator: 'review record' }] }]
  assert.deepEqual(rebarProvider.audit({ action: 'expand_pingfa', data }, project), [])
  project.ruleAdoptions.push({ ...project.ruleAdoptions[0], id: 'adopted-second', scope: { country: 'CN', discipline: 'rebar', region: 'project-section-2' } })
  assert.doesNotThrow(() => rebarProvider.execute!({ action: 'expand_pingfa', data }, project, { previousRuns: [], dependencies: [...project.sources.map(source => ({ kind: 'source' as const, id: source.id })), { kind: 'rule', id: 'adopted-second' }] }))
  data.ruleSet.rules[0].lengths.geometry.terms[0].multiplier = '2'
  assert.ok(rebarProvider.audit({ action: 'expand_pingfa', data }, project).some(row => row.code === 'rebar_rule_unpinned'))
})

test('host calculation cannot omit sources from its invalidation dependency scope', () => {
  const input = { action: 'calculate', data: example('bbs') }, project = createEngineeringProject({ id: 'b', title: 'BBS' })
  assert.throws(() => rebarProvider.execute!(input, project, { previousRuns: [], dependencies: [] }), /dependencies/)
  assert.ok(rebarProvider.audit(input, project).some(issue => issue.code === 'rebar_source_unregistered'))
})
