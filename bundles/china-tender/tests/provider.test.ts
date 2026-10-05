import assert from 'node:assert/strict'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, relative, resolve } from 'node:path'
import { test } from 'node:test'
import { apply, chinaTenderProvider } from '../src/index.ts'
import { EngineeringProviderRegistry, createEngineeringProject, engineeringInputFingerprint } from '../../../packages/engineering-core/index.ts'
import { CapabilityRegistry } from '../../../packages/professional-tasks/capabilities.ts'
import { createEngineeringStore } from '../../engineering/src/store.ts'
import { createChinaBoqBaseline } from '../../../packages/china-tender/index.ts'
import type { ChinaBoqBaseline } from '../../../packages/china-tender/index.ts'
import { WorkbenchRegistry } from '../../../packages/business-projects/workbench-registry.ts'

const source = { documentId: 'boq-original', sha256: 'a'.repeat(64), revision: 'R1' }
const rows = [{ id: 'row-1', code: '010515001001', description: '现浇构件钢筋', unit: 't', quantity: '100.10' }]
const createInput = { action: 'create_baseline', data: { baselineId: 'original-r1', source, rows } }
const profile = { context: 'government_procurement', subject: 'construction', method: 'tender', mandatoryTender: 'yes', province: 'CN-44', industry: 'highway', projectDate: '2026-10-05' }
const project = createEngineeringProject({ id: 'project-test', title: 'Provider test' })
const execute = (input: unknown, history: unknown[] = []) => chinaTenderProvider.execute!(
  chinaTenderProvider.parse(input), project, { previousRuns: history as never[] },
) as { summary: string; issues: { code: string; severity: string; message: string }[]; details: any }

test('actual registry provider parses and executes the three-argument baseline factory', () => {
  const registry = new EngineeringProviderRegistry()
  registry.register(chinaTenderProvider)
  const actual = registry.get('china-tender')
  const result: any = actual.execute!(actual.parse(createInput), project, { previousRuns: [] })
  assert.equal(result.details.rows.length, 1)
  assert.equal(result.details.baselineId, 'original-r1')
  assert.match(result.details.fingerprint, /^[a-f0-9]{64}$/)
  assert.match(result.summary, /不构成招标人批准/)
})

test('baseline operations require host history and do not trust history in tool input', () => {
  assert.throws(() => chinaTenderProvider.execute!({ ...createInput, previousRuns: [] }, project), /宿主提供本项目历史/)
  assert.throws(() => chinaTenderProvider.parse({ action: 'analyze', data: { profile, requirements: {} } }), /requirements 必须是数组/)
  assert.throws(() => chinaTenderProvider.parse({ action: 'create_baseline', data: { source, rows: {} } }), /rows 数组/)
})

test('same baseline ID is idempotent only for the same fingerprint', () => {
  const result = execute(createInput)
  const history = [{ providerId: 'china-tender', output: result }]
  assert.equal(execute(createInput, history).details.fingerprint, result.details.fingerprint)
  assert.throws(() => execute({ ...createInput, data: { ...createInput.data, rows: [{ ...rows[0], quantity: '200' }] } }, history), /已绑定另一指纹/)
  const addendum = execute({ ...createInput, data: { ...createInput.data, baselineId: 'addendum-r2', source: { ...source, sha256: 'b'.repeat(64), revision: 'R2' }, rows: [{ ...rows[0], quantity: '200' }] } }, history)
  assert.notEqual(addendum.details.fingerprint, result.details.fingerprint)
  assert.equal(result.details.rows[0].quantity, '100.10')
})

test('analysis cannot import or replace a baseline by supplying a new valid fingerprint', () => {
  const baseline = execute(createInput).details as ChinaBoqBaseline
  const input = { action: 'analyze', data: { profile, boq: { baseline, comparedRows: rows, kind: 'recalculation' } } }
  assert.throws(() => execute(input), /尚未在本项目登记/)
  const history = [{ providerId: 'china-tender', output: { details: baseline } }]
  assert.equal(execute(input, history).details.boqComparison.status, 'unchanged')
  const replaced = createChinaBoqBaseline('original-r1', source, [{ ...rows[0], quantity: '200' }])
  assert.throws(() => execute({ ...input, data: { ...input.data, boq: { ...input.data.boq, baseline: replaced } } }, history), /已绑定另一指纹/)
})

test('source linkage discrepancies are visible in actual provider audit', () => {
  assert.equal(chinaTenderProvider.audit(createInput, project)[0].code, 'baseline-source-unregistered')
  const linked = { ...project, sources: [{ id: source.documentId, title: '清单', sha256: source.sha256, status: 'active' as const }] }
  assert.deepEqual(chinaTenderProvider.audit(createInput, linked), [])
  assert.equal(chinaTenderProvider.audit(createInput, { ...linked, sources: [{ ...linked.sources[0], sha256: 'b'.repeat(64) }] })[0].code, 'baseline-source-version')
})

test('empty coverage and procedure conflicts remain visible rather than zero-issue success', () => {
  const empty = execute({ action: 'analyze', data: { profile } })
  assert.ok(empty.issues.some(issue => issue.code === 'requirements-empty'))
  const contradictory = execute({ action: 'analyze', data: { profile: { ...profile, method: 'non_tender' } } })
  assert.ok(contradictory.issues.some(issue => issue.code === 'procedure-review'))
  assert.match(empty.summary, /不是资格或评标结论/)
})

test('not-found evidence remains an unresolved response in real provider output', () => {
  const result = execute({ action: 'analyze', data: {
    profile,
    requirements: [{ id: 'r1', title: '资格证明', category: 'qualification', source: { documentId: 'tender', status: 'active' } }],
    evidence: [{ id: 'e1', source: { documentId: 'query', status: 'active' }, verification: 'not_found' }],
    responses: [{ requirementId: 'r1', evidenceIds: ['e1'], assessment: 'contradicts' }],
  } })
  assert.equal(result.details.responseMatrix[0].status, 'needs_evidence')
  assert.ok(result.issues.some(issue => issue.code === 'response-needs_evidence'))
  assert.equal(result.issues.some(issue => issue.code === 'response-conflict'), false)
})

test('baseline identity survives real engineering store persistence and provider reload', async (t) => {
  const root = resolve(tmpdir())
  const cwd = mkdtempSync(join(root, 'agent-pi-china-tender-'))
  t.after(() => {
    const child = relative(root, resolve(cwd))
    assert.ok(child.startsWith('agent-pi-china-tender-') && !child.includes('..'))
    rmSync(cwd, { recursive: true, force: true })
  })
  const store = createEngineeringStore(cwd, 'session:test', '基线持久化测试')
  store.patch({ sources: [{ id: source.documentId, title: 'BOQ R1', sha256: source.sha256, status: 'active' }] }, 0, 'source-1')
  const before = store.read()
  const output: any = await chinaTenderProvider.execute!(chinaTenderProvider.parse(createInput), before.project, { previousRuns: before.runs })
  const dependencies = [{ kind: 'source' as const, id: source.documentId }]
  store.record({
    id: 'run-1', title: '中国清单快照', providerId: 'china-tender', providerVersion: '5.8.0',
    createdAt: '2026-10-05T00:00:00.000Z', input: createInput, dependencies,
    dependencyFingerprint: engineeringInputFingerprint(before.project, dependencies), output,
  }, before.revision, 'create-1')
  const reopened = createEngineeringStore(cwd, 'session:test', '基线持久化测试').read()
  const reloaded = new EngineeringProviderRegistry()
  reloaded.register(chinaTenderProvider)
  assert.throws(() => reloaded.get('china-tender').execute!({
    ...createInput, data: { ...createInput.data, rows: [{ ...rows[0], quantity: '999' }] },
  }, reopened.project, { previousRuns: reopened.runs }), /已绑定另一指纹/)
  assert.equal(reopened.runs.length, 1)
  assert.equal((reopened.runs[0].output.details as ChinaBoqBaseline).rows[0].quantity, '100.10')
  const otherProject = createEngineeringStore(cwd, 'session:other', '另一项目').read()
  assert.equal(otherProject.runs.length, 0)
})

test('Cordis lifecycle contributes and removes both provider and professional capability', () => {
  const providers = new EngineeringProviderRegistry()
  const professionalCapabilities = new CapabilityRegistry()
  const workbench = new WorkbenchRegistry()
  const disposers: (() => void)[] = []
  const effect = (install: () => () => void) => disposers.push(install())
  apply({ engineering: { providers }, effect, inject: (_names: string[], callback: (scope: unknown) => void) => callback({ professionalCapabilities, workbench, effect }) })
  assert.equal(providers.list()[0].id, 'china-tender')
  const capability = professionalCapabilities.list()[0]
  assert.deepEqual(capability.tools, ['engineering_project'])
  assert.deepEqual(capability.applicability?.countries, ['CN'])
  assert.equal(workbench.list()[0].workflow.module, 'china-tender')
  for (const dispose of disposers.reverse()) dispose()
  assert.equal(providers.list().length, 0)
  assert.equal(professionalCapabilities.list().length, 0)
  assert.equal(workbench.list().length, 0)
})
