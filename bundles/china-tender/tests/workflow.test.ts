import assert from 'node:assert/strict'
import { mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import test from 'node:test'
import { apply } from '../src/index.ts'
import { chinaTenderWorkflow } from '../src/workflow.ts'
import { WorkbenchRegistry } from '../../../packages/business-projects/workbench-registry.ts'
import { createBusinessProject, listBusinessProjects } from '../../../packages/business-projects/index.ts'
import { CapabilityRegistry } from '../../../packages/professional-tasks/capabilities.ts'
import { bindProjectSession, completeStage } from '../../tender-host/src/orchestration.ts'
import { workflowForCreation, workflowFor } from '../../tender-host/src/modules.ts'
import { registerEngineering } from '../../engineering/src/plugin.ts'
import { hash } from '../../engineering/src/store.ts'
import { registerTaskGuide } from '../../task-guide/src/plugin.ts'

test('China workflow is independent, sequential, and requires actual review deliverables', () => {
  const registry = new WorkbenchRegistry()
  registry.registerModule({ owner: 'dsh-agent-pi-china-tender', workflow: chinaTenderWorkflow })
  const workflow = registry.run(() => workflowForCreation('china-tender'))
  assert.equal(workflow.stages.length, 7)
  assert.equal(workflow.controlProfile, undefined)
  assert.equal(workflow.setupStageId, undefined, 'first stage is conversational analysis, not a setup form')
  assert.deepEqual(workflow.kbPack, { analysis: [], pricing: [], planning: [] })
  assert.ok(workflow.stages.every(stage => stage.summaryDeliverable))
  assert.deepEqual(workflow.stages[6].consumes, [{ kind: 'handoff', stageId: 'cn-response-writing', required: true }])
  assert.equal(workflow.stages[6].approvalGate?.approveLabelZh, '确认材料已人工复核')
  assert.doesNotMatch(JSON.stringify(workflow), /SANRAL|COTO|FIDIC|ZAR/)
})

test('real lifecycle creates a China project, links provider findings and retains both workflow and history after unload', async t => {
  const cwd = mkdtempSync(join(tmpdir(), 'china-workbench-'))
  t.after(() => rmSync(cwd, { recursive: true, force: true }))
  const workbench = new WorkbenchRegistry(), professionalCapabilities = new CapabilityRegistry()
  const sessions = new Map([['main', { id: 'main', header: { cwd } }]])
  const services = new Map<string, any>(), definitions = new Map<string, any>(), agents = new Map<string, any>()
  const disposers: (() => void)[] = [], effect = (install: () => () => void) => disposers.push(install())
  const fs = { resolve: async (path: string, options: any) => ({ targetKey: resolve(options?.cwd || cwd, path), displayPath: path }), processPath: (target: any) => target.targetKey, stat: async (target: any) => { try { return { type: statSync(target.targetKey).isFile() ? 'file' : 'directory' } } catch { return undefined } }, readBytes: async (target: any) => readFileSync(target.targetKey) }
  const ctx: any = {
    tools: { register: (tool: any) => definitions.set(tool.name, tool), schemas: () => [] },
    provide: (name: string, service: any) => services.set(name, service), get: (name: string) => services.get(name),
    systemPrompt: { section() {} }, on() {}, emit() {},
    inject: (_deps: string[], callback: (scope: any) => void) => callback({ effect: (install: () => unknown) => install(), webServer: { register: () => () => {} } }),
  }
  services.set('sessions', { get: (id: string) => sessions.get(id) })
  services.set('agents', { get: (id: string) => agents.get(id), list: () => [...agents.values()] })
  services.set('sessionProjections', { stateOf: () => ({ questions: { active: [], settled: [] } }) })
  const agent = { session: sessions.get('main'), ctx: { get: (name: string) => name === 'fs' ? fs : services.get(name) } }
  agents.set('main', agent)
  const taskGuide = registerTaskGuide(ctx, value => value, cwd), engineering = registerEngineering(ctx, value => value)
  apply({ engineering, effect, inject: (_deps: string[], callback: (scope: any) => void) => callback({ workbench, professionalCapabilities, effect }) })
  const workflow = workbench.run(() => workflowForCreation('china-tender'))
  const project = createBusinessProject({ workspaceRootPath: cwd, rootPath: cwd, createDirectory: false, module: workflow.module, projectId: 'cn-project', name: '中国工程采购', workflowId: workflow.id, workflowSnapshot: workflow, projectGoal: workflow.projectGoal, terminalDeliverables: workflow.terminalDeliverables })
  bindProjectSession(cwd, project, 'main', workflow.stages[0].id)
  assert.throws(() => completeStage(cwd, project, workflow.stages[0].id), /缺阶段总报告/)
  writeFileSync(join(cwd, 'requirements.txt'), '资格证明要求，实际核验尚缺')
  const sourceHash = hash('资格证明要求，实际核验尚缺')
  const call = (args: any) => definitions.get('engineering_project').execute(args, { agent, signal: new AbortController().signal })
  await call({ action: 'update', revision: 0, operationId: 'source', patch: { sources: [{ id: 'requirements', title: '资格要求', path: 'requirements.txt', sha256: sourceHash, status: 'active' }] } })
  const result = await call({ action: 'run', revision: 1, operationId: 'cn-analyze', providerId: 'china-tender', dependencies: [{ kind: 'source', id: 'requirements' }], input: { action: 'analyze', data: {
    profile: { context: 'unknown', subject: 'construction', method: 'unknown' },
    requirements: [{ id: 'r1', title: '资格证明', category: 'qualification', source: { documentId: 'requirements', sha256: sourceHash, status: 'active' } }],
  } } })
  assert.equal(result.project.id, 'china-tender:cn-project')
  assert.equal(result.runs[0].executionStatus, 'executed')
  assert.ok(result.runs[0].output.issues.some((issue: any) => issue.code === 'procedure-review'))
  assert.equal(result.runs[0].output.details.responseMatrix[0].status, 'needs_evidence')
  assert.equal(taskGuide.read('main').findings.length, 1)
  assert.equal(taskGuide.read('main').evidence[0].status, 'unverified')
  for (const dispose of disposers.reverse()) dispose()
  assert.equal(workbench.list().length, 0)
  assert.equal(professionalCapabilities.list().length, 0)
  assert.throws(() => workbench.run(() => workflowForCreation('china-tender')), /disabled or unavailable/)
  const retained = listBusinessProjects(cwd, 'china-tender')
  assert.equal(retained.length, 1)
  assert.deepEqual(workbench.run(() => workflowFor(retained[0]!)), chinaTenderWorkflow)
  const after = await call({ action: 'status' })
  assert.equal(after.runs.length, 1)
  assert.equal(after.runs[0].providerAvailable, false)
  assert.match(taskGuide.read('main').findings[0].summary, /未启用/)
})
