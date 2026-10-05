import assert from 'node:assert/strict'
import { mkdtempSync, mkdirSync, readFileSync, rmSync, statSync, utimesSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { test } from 'node:test'
import { createBusinessProject, listBusinessProjects } from '../../../packages/business-projects/index.ts'
import { WorkbenchRegistry } from '../../../packages/business-projects/workbench-registry.ts'
import { bindProjectSession } from '../../tender-host/src/orchestration.ts'
import { workflowFor, workflowForCreation } from '../../tender-host/src/modules.ts'
import { registerTaskGuide } from '../../task-guide/src/plugin.ts'
import { registerEngineering } from '../src/plugin.ts'
import { createEngineeringStore, hash } from '../src/store.ts'
import { engineeringWorkflow } from '../src/workflow.ts'
import type { EngineeringDependency, EngineeringProvider } from '../../../packages/engineering-core/index.ts'
import { validateJsonSchemaValue } from '../../../vendor/deepseek-harness/packages/core/tools/src/json-schema.ts'

function fixture(t: any) {
  const cwd = mkdtempSync(join(tmpdir(), 'engineering-host-'))
  t.after(() => rmSync(cwd, { recursive: true, force: true }))
  const sessions = new Map<string, any>([['main', { id: 'main', header: { cwd } }]]), agents = new Map<string, any>(), services = new Map<string, any>(), definitions = new Map<string, any>(), routes: any[] = [], events: any[] = []
  const fs = { resolve: async (path: string, options: any) => ({ targetKey: resolve(options?.cwd || cwd, path), displayPath: path }), processPath: (target: any) => target.targetKey, stat: async (target: any) => { try { return { type: statSync(target.targetKey).isFile() ? 'file' : 'directory' } } catch { return undefined } }, readBytes: async (target: any) => readFileSync(target.targetKey) }
  const ctx: any = {
    tools: { register: (value: any) => definitions.set(value.name, value), schemas: () => [] }, provide: (name: string, value: any) => services.set(name, value), get: (name: string) => services.get(name),
    systemPrompt: { section: () => {} }, on: () => {}, emit: (name: string, payload: any) => events.push({ name, payload }),
    inject: (_deps: any, callback: any) => callback({ effect: (install: any) => install(), webServer: { register: (route: any) => { routes.push(route); return () => {} } } }),
  }
  services.set('sessions', { get: (id: string) => sessions.get(id) })
  services.set('agents', { get: (id: string) => agents.get(id), list: () => [...agents.values()] })
  services.set('sessionProjections', { stateOf: () => ({ questions: { active: [], settled: [] } }) })
  const main = { session: sessions.get('main'), ctx: { get: (name: string) => name === 'fs' ? fs : services.get(name) } }
  agents.set('main', main)
  const taskGuide = registerTaskGuide(ctx, value => value, cwd), engineering = registerEngineering(ctx, value => value)
  const call = (args: any, agent = main) => definitions.get('engineering_project').execute(args, { agent, signal: new AbortController().signal })
  let calls = 0
  const provider: EngineeringProvider = { id: 'test.engine', title: '工程范围核算', version: '1.0.0', dependencies: [], limitations: ['仅声明范围'], inputDescription: '{value:number}', parse: input => input, audit: () => [], execute: input => { calls++; return { summary: '已检查当前输入，仍需原图复核。', issues: [], details: input } } }
  const unregister = engineering.providers.register(provider)
  const http = async (query = '', method = 'GET') => {
    let status = 0, value: any
    await routes.find(row => row.path === '/api/agent-pi/engineering').handler({ method, url: `/api/agent-pi/engineering?sessionId=main${query}` }, { writeHead: (code: number) => { status = code }, end: (body: string) => { value = JSON.parse(body) } })
    return { status, value }
  }
  const setup = async () => {
    writeFileSync(join(cwd, 'drawing.txt'), 'drawing v1')
    const sourceHash = hash('drawing v1'), sources = [{ id: 'drawing', title: '图纸', path: 'drawing.txt', sha256: sourceHash, status: 'active' }]
    const sourcesRef = [{ sourceId: 'drawing', sourceHash, locator: '剖面 A' }]
    return call({ action: 'update', revision: 0, operationId: 'setup', patch: { sources, objects: [{ id: 'beam', type: 'beam', title: 'KL1', sources: sourcesRef, parameters: { width: { value: 300, unit: 'mm', status: 'confirmed', sources: sourcesRef }, height: { value: 600, unit: 'mm', status: 'confirmed', sources: sourcesRef } } }] } })
  }
  const run = (dependencies: EngineeringDependency[], operationId: string, input = { value: 10 }) => call({ action: 'run', revision: engineering.status('main').revision, operationId, providerId: provider.id, input, dependencies })
  return { cwd, sessions, agents, main, engineering, taskGuide, call, run, setup, http, provider, unregister, calls: () => calls, events }
}
const width: EngineeringDependency[] = [{ kind: 'parameter', id: 'beam', parameter: 'width' }]
const height: EngineeringDependency[] = [{ kind: 'parameter', id: 'beam', parameter: 'height' }]

test('unbound conversation status and calculation results cross the actual DSH lossless JSON boundary', async t => {
  const f = fixture(t)
  const initial = await f.call({ action: 'status' })
  assert.deepEqual(initial.scope, { sessionId: 'main' })
  assert.deepEqual(validateJsonSchemaValue({}, initial), [])
  await f.setup()
  const result = await f.run(width, 'lossless-result')
  assert.deepEqual(validateJsonSchemaValue({}, result), [])
})

test('drawing observation replays only the latest unchanged source and records a restored old version', async t => {
  const f = fixture(t), path = join(f.cwd, 'drawing.dxf')
  const observation = (value: string) => ({ kind: 'cad' as const, source: { path, sha256: hash(value) }, summary: 'CAD inventory', inventory: [{ id: 'layer:0', title: '图层0', locator: 'layer:0' }], observedIds: ['layer:0'] })
  writeFileSync(path, 'A')
  const first = f.engineering.recordObservation('main', observation('A'))
  assert.equal(f.engineering.recordObservation('main', observation('A')).revision, first.revision)
  await f.call({ action: 'update', revision: first.revision, operationId: 'unrelated-title', patch: { title: 'Updated title' } })
  const unrelated = f.engineering.status('main').revision
  assert.equal(f.engineering.recordObservation('main', observation('A')).revision, unrelated)
  writeFileSync(path, 'B')
  // Even a repeated payload must check the real file instead of trusting replay.
  assert.throws(() => f.engineering.recordObservation('main', observation('A')), /变化/)
  assert.equal(f.engineering.status('main').revision, unrelated)
  const second = f.engineering.recordObservation('main', observation('B'))
  writeFileSync(path, 'A')
  const restored = f.engineering.recordObservation('main', observation('A'))
  assert.equal(restored.revision, second.revision + 1)
  const state = f.engineering.status('main')
  assert.equal(state.project.sources[0].sha256, hash('A'))
  assert.equal(state.sourceChecks[0].status, 'current')
  assert.equal(state.runs.length, 3)
  assert.equal(state.runs[1].status, 'stale')
  assert.equal(f.engineering.recordObservation('main', observation('A')).revision, restored.revision)
  assert.deepEqual(validateJsonSchemaValue({}, await f.call({ action: 'status' })), [])
})

test('observation returns the same lossless source identity after equivalent relative-path edits', async t => {
  const f = fixture(t), path = join(f.cwd, 'drawing.pdf')
  writeFileSync(path, 'A')
  const observation = { kind: 'pdf' as const, source: { path, sha256: hash('A') }, summary: 'PDF inventory', inventory: [{ id: 'page:1', title: '第1页', locator: 'page:1' }], observedIds: ['page:1'] }
  const first = f.engineering.recordObservation('main', observation), state = f.engineering.status('main')
  const changed = await f.call({ action: 'update', revision: state.revision, operationId: 'relative-source-path', patch: { sources: [
    { id: 'missing-unrelated', title: 'Unrelated missing file', path: 'missing.pdf', sha256: hash('missing'), status: 'active' },
    ...state.project.sources.map((row: any) => ({ ...row, path: 'drawing.pdf' })),
  ] } })
  const repeated = f.engineering.recordObservation('main', observation)
  assert.equal(repeated.sourceId, first.sourceId)
  assert.equal(repeated.revision, changed.revision, 'equivalent path spelling does not create a new read')
  assert.deepEqual(validateJsonSchemaValue({}, repeated), [])
  assert.deepEqual(validateJsonSchemaValue({}, { engineeringSync: { status: 'synced', sourceId: repeated.sourceId, revision: repeated.revision } }), [])
})

test('actual drawing reads share complete pending inventory, task evidence and version invalidation', async t => {
  const f = fixture(t)
  await f.setup(); await f.run(width, 'quantity-before-read')
  const observation = { kind: 'pdf' as const, source: { path: join(f.cwd, 'drawing.txt'), sha256: hash('drawing v1') }, summary: '第 1 页完成局部渲染，仍需专业复核', inventory: [{ id: 'page:1', title: '第1页', locator: 'page=1' }, { id: 'page:2', title: '第2页', locator: 'page=2' }], observedIds: ['page:1'], parameterFingerprint: 'roi-v1', details: { professionalReview: 'pending' } }
  const result = f.engineering.recordObservation('main', observation)
  assert.equal(result.recorded, true)
  assert.equal(result.sourceId, 'drawing')
  const first = f.engineering.status('main')
  assert.equal(first.project.sources.length, 1)
  assert.equal(first.project.coverage.length, 2)
  assert.ok(first.project.coverage.every((row: any) => row.status === 'pending'))
  assert.equal(first.runs.length, 2)
  assert.equal(f.taskGuide.read('main').findings.length, 2)
  assert.equal(f.engineering.recordObservation('main', observation).revision, first.revision)
  writeFileSync(join(f.cwd, 'drawing.txt'), 'drawing v2')
  f.engineering.recordObservation('main', { ...observation, source: { ...observation.source, sha256: hash('drawing v2') } })
  const next = f.engineering.status('main')
  assert.equal(next.runs[0].status, 'stale')
  assert.equal(next.runs[1].status, 'stale')
  assert.equal(next.runs[2].status, 'current')
  assert.ok(next.project.coverage.every((row: any) => row.status === 'stale'))
  assert.equal(createEngineeringStore(f.cwd, 'session:main', 'Restored').read().runs.length, 3)
})

test('drawing observation rejects false hashes, invalid inventory and unbound external paths atomically', async t => {
  const f = fixture(t)
  await f.setup()
  const before = f.engineering.status('main').revision
  const data = { kind: 'cad' as const, source: { path: join(f.cwd, 'drawing.txt'), sha256: hash('not the file') }, summary: 'CAD directory', inventory: [{ id: 'model', title: '模型空间', locator: 'Model' }], observedIds: ['model'] }
  assert.throws(() => f.engineering.recordObservation('main', data), /变化/)
  assert.throws(() => f.engineering.recordObservation('main', { ...data, observedIds: ['other'] }), /目录/)
  const outside = mkdtempSync(join(tmpdir(), 'engineering-outside-'))
  t.after(() => rmSync(outside, { recursive: true, force: true }))
  writeFileSync(join(outside, 'outside.dxf'), 'outside')
  assert.throws(() => f.engineering.recordObservation('main', { ...data, source: { path: join(outside, 'outside.dxf'), sha256: hash('outside') } }), /范围/)
  assert.equal(f.engineering.status('main').revision, before)
})

test('engineering workbench creates a bound project and preserves its workflow after plugin disposal', async t => {
  const f = fixture(t), workbench = new WorkbenchRegistry()
  const dispose = workbench.registerModule({ owner: 'dsh-agent-pi-engineering', workflow: engineeringWorkflow })
  const workflow = workbench.run(() => workflowForCreation('engineering'))
  assert.equal(workflow.labelZh, '工程图纸与算量')
  assert.equal(workflow.stages.length, 4)
  const project = createBusinessProject({ workspaceRootPath: f.cwd, rootPath: f.cwd, createDirectory: false, module: workflow.module, projectId: 'engineering', name: 'Engineering', workflowId: workflow.id, workflowSnapshot: workflow, projectGoal: workflow.projectGoal, terminalDeliverables: workflow.terminalDeliverables })
  bindProjectSession(f.cwd, project, 'main', workflow.setupStageId!)
  await f.setup(); await f.run(width, 'engineering-run')
  assert.equal(f.engineering.status('main').project.id, 'engineering:engineering')
  assert.equal(f.taskGuide.read('main').findings.length, 1)
  dispose()
  assert.equal(workbench.list().length, 0)
  assert.throws(() => workbench.run(() => workflowForCreation('engineering')), /disabled or unavailable/)
  const retained = listBusinessProjects(f.cwd, 'engineering')
  assert.equal(retained.length, 1)
  assert.deepEqual(workbench.run(() => workflowFor(retained[0]!)), engineeringWorkflow)
  assert.equal(f.engineering.status('main').runs.length, 1)
})

test('real taskGuide receives persisted run evidence and history survives provider unload', async t => {
  const f = fixture(t)
  await f.setup()
  const result = await f.run(width, 'run-width')
  assert.equal(result.runs[0].executionStatus, 'executed')
  assert.equal(result.providers[0].inputDescription, '{value:number}')
  const task = f.taskGuide.read('main')
  assert.equal(task.findings.length, 1)
  const evidence = task.evidence.find((row: any) => row.id === task.findings[0].evidenceIds[0])!
  assert.ok(evidence.sourcePath)
  assert.equal(evidence.sourceHash, hash(readFileSync(evidence.sourcePath, 'utf8')))
  assert.equal(JSON.parse(readFileSync(evidence.sourcePath, 'utf8')).runs[0].id, result.runs[0].id)
  assert.equal(evidence.status, 'unverified')
  f.unregister()
  const after = await f.call({ action: 'status' })
  assert.equal(after.runs.length, 1)
  assert.equal(after.runs[0].providerAvailable, false)
  assert.match(f.taskGuide.read('main').findings[0].summary, /未启用/)
})

test('run retries do not execute twice and different payloads cannot reuse an operation id', async t => {
  const f = fixture(t)
  await f.setup()
  const args = { action: 'run', revision: 1, operationId: 'run', providerId: f.provider.id, input: { value: 10 }, dependencies: width }
  await f.call(args)
  f.unregister()
  const retried = await f.call(args)
  assert.equal(f.calls(), 1)
  assert.equal(retried.runs.length, 1)
  await assert.rejects(f.call({ ...args, input: { value: 11 } }), /operationId/)
  await assert.rejects(f.call({ ...args, operationId: 'different' }), /最新版本/)
})

test('parameter changes invalidate only related runs and preserve unrelated task evidence', async t => {
  const f = fixture(t)
  await f.setup(); await f.run(width, 'width'); const before = await f.run(height, 'height')
  const taskBefore = f.taskGuide.read('main'), heightFinding = taskBefore.findings.find((row: any) => row.source?.toolCallId === before.runs[1].id)!
  const objects = structuredClone(before.project.objects); objects[0].parameters.width.value = 350
  const after = await f.call({ action: 'update', revision: before.revision, operationId: 'wider', patch: { objects } })
  assert.deepEqual(after.runs.map((row: any) => row.status), ['stale', 'current'])
  assert.equal(after.sourceChecks[0].status, 'current')
  const heightAfter = f.taskGuide.read('main').findings.find((row: any) => row.id === heightFinding.id)!
  assert.deepEqual(heightAfter, heightFinding)
  assert.equal(f.taskGuide.read('main').findings.length, 2)
})

test('actual file changes are detected without silently replacing registered hashes', async t => {
  const f = fixture(t)
  await f.setup(); await f.run(width, 'bound'); await f.run([], 'standalone')
  writeFileSync(join(f.cwd, 'drawing.txt'), 'drawing v2')
  const state = await f.call({ action: 'status' })
  assert.equal(state.project.sources[0].sha256, hash('drawing v1'))
  assert.equal(state.sourceChecks[0].actualHash, hash('drawing v2'))
  assert.deepEqual(state.runs.map((row: any) => row.status), ['stale', 'current'])
  const blocked = await f.run(width, 'changed-source')
  assert.equal(blocked.runs.at(-1).executionStatus, 'blocked')
  assert.ok(blocked.runs.at(-1).output.issues.some((row: any) => row.code === 'engineering_source_changed'))
  assert.equal(f.calls(), 2)
})

test('unknown dependencies block only their scope and standalone runs disclose coverage limitations', async t => {
  const f = fixture(t), state = await f.setup(), objects = structuredClone(state.project.objects)
  objects[0].parameters.width = { value: null, unit: 'mm', status: 'provisional', sources: [] }
  await f.call({ action: 'update', revision: state.revision, operationId: 'unknown', patch: { objects } })
  const blocked = await f.run(width, 'missing-width')
  assert.equal(blocked.runs[0].executionStatus, 'blocked')
  assert.equal(f.calls(), 0)
  await f.run(height, 'known-height')
  const standalone = await f.run([], 'free-input')
  assert.equal(f.calls(), 2)
  assert.equal(standalone.runs.at(-1).sourceCoverage, 'standalone')
  assert.ok(standalone.runs.at(-1).output.issues.some((row: any) => row.code === 'engineering_standalone_input'))
})

test('concurrent engineering update rejects an older in-flight calculation at commit', async t => {
  const f = fixture(t); await f.setup(); f.unregister()
  let release!: () => void, started!: () => void
  const ready = new Promise<void>(resolve => { started = resolve }), wait = new Promise<void>(resolve => { release = resolve })
  f.engineering.providers.register({ ...f.provider, execute: async () => { started(); await wait; return { summary: '慢计算', issues: [], details: {} } } })
  const pending = f.run(width, 'slow')
  await ready
  await f.call({ action: 'update', revision: 1, operationId: 'update-during-run', patch: { title: '已调整任务' } })
  release()
  await assert.rejects(pending, /最新版本/)
  assert.equal(f.engineering.status('main').runs.length, 0)
})

test('project binding and child sessions cannot redirect writes or panel reads', async t => {
  const f = fixture(t)
  const project = createBusinessProject({ workspaceRootPath: f.cwd, rootPath: f.cwd, createDirectory: false, module: 'tender', projectId: 'first', name: 'First', workflowId: 'tender' })
  bindProjectSession(f.cwd, project, 'main', 'project-setup')
  await f.setup(); await f.run(width, 'first-run')
  assert.equal((await f.http('&projectId=wrong&module=tender')).status, 409)
  assert.equal((await f.http('&projectId=first&module=tender')).status, 200)
  assert.equal((await f.http('', 'POST')).status, 405)
  const child = { id: 'child', header: { cwd: f.cwd, parentSession: 'main' } }; f.sessions.set('child', child)
  const childAgent = { ...f.main, session: child }
  assert.equal((await f.call({ action: 'status' }, childAgent)).project.id, 'tender:first')
  await assert.rejects(f.call({ action: 'update', revision: 2, operationId: 'child-write', patch: {} }, childAgent), /主执行者/)
  const other = createBusinessProject({ workspaceRootPath: f.cwd, rootPath: f.cwd, createDirectory: false, module: 'tender', projectId: 'second', name: 'Second', workflowId: 'tender' })
  bindProjectSession(f.cwd, other, 'main', 'project-setup')
  const after = await f.call({ action: 'status' })
  assert.equal(after.runs.length, 0)
  assert.equal(f.taskGuide.read('main').findings.filter((row: any) => row.id.startsWith('engineering:')).length, 0)
  assert.equal(createEngineeringStore(f.cwd, 'tender:first', 'First').read().runs.length, 1)
})

test('snapshot recovery ignores a corrupt head cache and incomplete staging directories', async t => {
  const f = fixture(t); await f.setup(); await f.run(width, 'run')
  const store = createEngineeringStore(f.cwd, 'session:main', 'Test')
  writeFileSync(store.path, '{interrupted cache')
  mkdirSync(join(dirname(store.path), 'interrupted.tmp')); writeFileSync(join(dirname(store.path), 'interrupted.tmp', 'project.json'), '{incomplete')
  const recovered = createEngineeringStore(f.cwd, 'session:main', 'Test').read()
  assert.equal(recovered.revision, 2)
  assert.equal(recovered.runs.length, 1)
  assert.equal(JSON.parse(readFileSync(store.snapshotPath(1), 'utf8')).runs.length, 0)
})

test('unregistered outside paths are not hashed and provider history is a frozen independent copy', async t => {
  const f = fixture(t); await f.setup()
  const state = f.engineering.status('main')
  await f.call({ action: 'update', revision: state.revision, operationId: 'outside', patch: { sources: [...state.project.sources, { id: 'outside', title: 'Outside', path: resolve(f.cwd, '..', 'unregistered.txt'), sha256: 'a'.repeat(64), status: 'active' }] } })
  assert.equal(f.engineering.status('main').sourceChecks.find((row: any) => row.sourceId === 'outside')!.status, 'outside_scope')
  await f.run([], 'history'); f.unregister()
  f.engineering.providers.register({ ...f.provider, execute: (_data, _project, context) => {
    assert.equal(context!.cwd, f.cwd)
    assert.ok(context!.signal instanceof AbortSignal)
    assert.equal(Object.isFrozen(context!.signal), false)
    assert.ok(Object.isFrozen(context!.dependencies))
    assert.equal(context!.previousRuns.length, 1)
    assert.ok(Object.isFrozen(context!.previousRuns[0].output))
    assert.throws(() => { (context!.previousRuns[0].output as any).details = 'tampered' }, TypeError)
    return { summary: '历史已核对', issues: [], details: {} }
  } })
  await f.run([], 'history-check')
  assert.deepEqual(f.engineering.status('main').runs[0].output.details, { value: 10 })
})

test('source hash cache survives store instances, notices same-size edits and supports forced verification', async t => {
  const f = fixture(t); await f.setup()
  const store = createEngineeringStore(f.cwd, 'session:main', 'Test'), state = store.read()
  assert.equal(store.sourceChecks(state, { force: true })[0].verification, 'fresh')
  assert.equal(createEngineeringStore(f.cwd, 'session:main', 'Test').sourceChecks(state)[0].verification, 'cached')
  const path = join(f.cwd, 'drawing.txt'), before = statSync(path)
  writeFileSync(path, 'drawing v2'); utimesSync(path, before.atime, before.mtime)
  const changed = store.sourceChecks(state)[0]
  assert.equal(changed.verification, 'fresh')
  assert.equal(changed.status, 'changed')
  assert.equal(changed.actualHash, hash('drawing v2'))
  assert.equal(store.sourceChecks(state)[0].verification, 'cached')
  assert.equal(store.sourceChecks(state, { force: true })[0].verification, 'fresh')
  assert.deepEqual(store.sourceChecks(state, { force: true, sourceIds: [] }), [])
})

test('source hash cache is bounded and evicts older file entries', async t => {
  const f = fixture(t), state = await f.setup(), store = createEngineeringStore(f.cwd, 'session:main', 'Test')
  const sources = Array.from({ length: 257 }, (_, index) => {
    const path = join(f.cwd, `source-${index}.txt`); writeFileSync(path, `source ${index}`)
    return { id: `source-${index}`, title: `source-${index}`, path, sha256: hash(`source ${index}`), status: 'active' as const }
  })
  const all = { ...state, project: { ...state.project, sources } }
  assert.equal(store.sourceChecks(all).length, 257)
  assert.equal(store.sourceChecks(all, { sourceIds: ['source-256'] })[0].verification, 'cached')
  assert.equal(store.sourceChecks(all, { sourceIds: ['source-0'] })[0].verification, 'fresh')
})
