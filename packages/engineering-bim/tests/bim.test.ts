import assert from 'node:assert/strict'
import { test } from 'node:test'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createHash } from 'node:crypto'
import { runBim } from '../index.ts'
import { createBimProvider } from '../../../bundles/engineering-bim/src/provider.ts'
import { createEngineeringStore, hash } from '../../../bundles/engineering/src/store.ts'
import { engineeringInputFingerprint } from '../../engineering-core/index.ts'

const pythonPath = process.env.AGENT_PI_BIM_PYTHON_PATH || 'python'
const options = { pythonPath }
const components = [
  { id: 'slab', type: 'IfcSlab' as const, name: '道路混凝土板', sizeMeters: [10, 2, 0.3] as [number, number, number], positionMeters: [0, 0, 0] as [number, number, number] },
  { id: 'beam', type: 'IfcBeam' as const, name: '梁', sizeMeters: [5, 0.3, 0.6] as [number, number, number], positionMeters: [100, 20, 3] as [number, number, number], rotationDegrees: 90 },
]
function workspace(t: any) {
  const cwd = mkdtempSync(join(tmpdir(), 'engineering-bim-'))
  t.after(() => rmSync(cwd, { recursive: true, force: true }))
  return cwd
}

test('real IFC generation, inventory, paging, SI geometry and preview round trip', async t => {
  const cwd = workspace(t)
  const health = await runBim(cwd, { action: 'health' }, options)
  assert.equal(health.engine.available, true, JSON.stringify(health.issues))
  assert.ok(health.engine.pythonExecutable)
  assert.ok(health.engine.pythonVersion)
  const generated = await runBim(cwd, { action: 'generate', outputPath: 'model.ifc', projectName: '道路工程', components }, options)
  assert.equal(generated.source!.sha256, createHash('sha256').update(readFileSync(join(cwd, 'model.ifc'))).digest('hex'))
  const source = { sourcePath: 'model.ifc', expectedSha256: generated.source!.sha256 }
  const inventory: any = await runBim(cwd, { action: 'inventory', ...source }, options)
  assert.equal(inventory.elementCount, 2)
  assert.equal(inventory.types.IfcSlab, 1)
  assert.equal(inventory.units.lengthToMeters, 1)
  assert.equal(inventory.spatialHierarchy.length, 3)
  const first: any = await runBim(cwd, { action: 'query', ...source, limit: 1 }, options)
  assert.equal(first.page.nextOffset, 1)
  assert.equal(first.elements[0].name, '道路混凝土板')
  const second: any = await runBim(cwd, { action: 'query', ...source, offset: 1, limit: 1 }, options)
  assert.deepEqual(second.elements[0].positionMeters, [100, 20, 3])
  const measured: any = await runBim(cwd, { action: 'geometry', ...source }, options)
  assert.equal(measured.coverage.measured, 2, JSON.stringify(measured.issues))
  assert.ok(Math.abs(measured.elements[0].netVolumeM3 - 6) < 1e-8)
  assert.ok(Math.abs(measured.elements[1].netVolumeM3 - 0.9) < 1e-8)
  assert.equal(measured.elements[0].origin, 'triangulated_geometry')
  assert.equal(measured.elements[0].sourceSha256, generated.source!.sha256)
  assert.equal(measured.elements[0].reviewStatus, 'needs_review')
  const preview: any = await runBim(cwd, { action: 'preview', ...source, types: ['IfcBeam'] }, options)
  assert.ok(preview.elements[0].mesh.vertices.length > 0)
  assert.ok(preview.elements[0].mesh.triangles.length > 0)
  const limited: any = await runBim(cwd, { action: 'preview', ...source, maxTriangles: 1, globalIds: [second.elements[0].globalId, 'missing'] }, options)
  assert.equal(limited.elements[0].netVolumeM3, null)
  assert.equal(limited.coverage.failed, 1)
  assert.deepEqual(limited.coverage.missingGlobalIds, ['missing'])
  await assert.rejects(runBim(cwd, { action: 'generate', outputPath: 'model.ifc', projectName: 'no overwrite', components }, options), /禁止覆盖/)
  writeFileSync(join(cwd, 'model.ifc'), `${readFileSync(join(cwd, 'model.ifc'), 'utf8')}\n`)
  await assert.rejects(runBim(cwd, { action: 'query', ...source }, options), /SHA-256/)
})

test('engine absence, path boundaries, timeout and cancellation are explicit', async t => {
  const cwd = workspace(t), outside = workspace(t)
  const missing = await runBim(cwd, { action: 'health' }, { pythonPath: join(cwd, 'no-python.exe') })
  assert.equal(missing.engine.available, false)
  const previous = process.env.AGENT_PI_BIM_PYTHON_PATH
  process.env.AGENT_PI_BIM_PYTHON_PATH = join(cwd, 'environment-python-missing.exe')
  try {
    assert.equal((await runBim(cwd, { action: 'health' })).engine.available, false)
    assert.equal((await runBim(cwd, { action: 'health' }, options)).engine.available, true)
  } finally { if (previous === undefined) delete process.env.AGENT_PI_BIM_PYTHON_PATH; else process.env.AGENT_PI_BIM_PYTHON_PATH = previous }
  writeFileSync(join(outside, 'outside.ifc'), 'untrusted')
  await assert.rejects(runBim(cwd, { action: 'inventory', sourcePath: join(outside, 'outside.ifc'), expectedSha256: 'a'.repeat(64) }, options), /超出当前工作目录/)
  await assert.rejects(runBim(cwd, { action: 'generate', outputPath: join(outside, 'new.ifc'), projectName: 'x', components }, options), /工作目录内/)
  await assert.rejects(runBim(cwd, { action: 'health' }, { ...options, timeoutMs: 1 }), /预算/)
  const controller = new AbortController()
  const pending = runBim(cwd, { action: 'health' }, { ...options, signal: controller.signal })
  controller.abort()
  await assert.rejects(pending, /取消/)
})

test('actual IFC provider requires source dependency and saves an independently readable engineering run', async t => {
  const cwd = workspace(t)
  const generated = await runBim(cwd, { action: 'generate', outputPath: 'model.ifc', projectName: 'Ledger model', components: components.slice(0, 1) }, options)
  const store = createEngineeringStore(cwd, 'bim:test', 'BIM'), provider = createBimProvider(options)
  const state = store.patch({ sources: [{ id: 'ifc', title: 'IFC', path: 'model.ifc', sha256: generated.source!.sha256, status: 'active' }] }, 0, 'source')
  const input = { action: 'geometry', sourceId: 'ifc' }, dependencies = [{ kind: 'source' as const, id: 'ifc' }]
  assert.deepEqual(provider.audit(input, state.project), [])
  await assert.rejects(Promise.resolve().then(() => provider.execute!(input, state.project, { cwd, previousRuns: [], dependencies: [] })), /source 依赖/)
  const output: any = await provider.execute!(input, state.project, { cwd, previousRuns: [], dependencies })
  store.record({ id: 'calculation', providerId: provider.id, providerVersion: provider.version, title: provider.title, createdAt: new Date().toISOString(), dependencies, dependencyFingerprint: engineeringInputFingerprint(state.project, dependencies), input, output }, 1, 'run')
  const restored = createEngineeringStore(cwd, 'bim:test', 'BIM').read()
  assert.equal((restored.runs[0].output.details as any).elements[0].netVolumeM3, 6)
  assert.equal(store.runStatus(restored, restored.runs[0]), 'current')
  writeFileSync(join(cwd, 'model.ifc'), 'changed')
  assert.equal(store.runStatus(restored, restored.runs[0]), 'stale')
  assert.equal(restored.project.sources[0].sha256, generated.source!.sha256)
  assert.notEqual(hash('changed'), restored.project.sources[0].sha256)
})
