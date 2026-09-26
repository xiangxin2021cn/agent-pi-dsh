import assert from 'node:assert/strict'
import { test } from 'node:test'
import { WorkbenchRegistry, currentWorkbench } from '../../../packages/business-projects/workbench-registry.ts'
import { listWorkbenchModules, workflowFor } from '../src/modules.ts'
import { WORKFLOWS } from '../src/workflows.ts'
import { workbenchPluginDefaults, WORKBENCH_PLUGIN_DEFAULTS } from '../../../scripts/workbench-plugin-defaults.mjs'
import { registerTools } from '../src/tools.ts'
import { routeOwner } from '../src/plugin-ownership.ts'

test('plugin contributions have ownership, reversible removal and isolated async contexts', async () => {
  const first = new WorkbenchRegistry()
  const second = new WorkbenchRegistry()
  const dispose = first.registerModule({ owner: 'test/tender', workflow: WORKFLOWS.tender })
  assert.throws(() => first.registerModule({ owner: 'collision', workflow: WORKFLOWS.tender }), /already registered/)
  second.registerModule({ owner: 'test/delivery', workflow: WORKFLOWS.delivery })
  const [a, b] = await Promise.all([
    first.run(async () => { await Promise.resolve(); return currentWorkbench()!.list().map(x => x.workflow.module) }),
    second.run(async () => { await Promise.resolve(); return currentWorkbench()!.list().map(x => x.workflow.module) }),
  ])
  assert.deepEqual(a, ['tender'])
  assert.deepEqual(b, ['delivery'])
  assert.equal(currentWorkbench(), undefined)
  assert.equal(first.run(() => workflowFor('tender').module), 'tender')
  dispose()
  assert.throws(() => first.run(() => workflowFor('tender')), /Unknown module/)
  assert.equal(first.run(() => listWorkbenchModules().modules.some(x => x.id === 'tender')), false)
  const replace = first.registerModule({ owner: 'test/new', workflow: WORKFLOWS.tender })
  dispose() // an old disposer cannot unregister a replacement contribution
  assert.equal(first.list().length, 1)
  replace()
})

test('native plugin uninstall survives profile reinitialization', () => {
  const all = WORKBENCH_PLUGIN_DEFAULTS.map(([name]) => name)
  assert.equal(workbenchPluginDefaults({}, []).length, all.length)
  assert.deepEqual(workbenchPluginDefaults({}, all), [])
  assert.deepEqual(workbenchPluginDefaults({ 'dsh-agent-pi-knowledge': 'link:custom' }, all), [['dsh-agent-pi-knowledge', 'knowledge']])
})

test('tools have exactly one native owner and generic file routes remain independent', () => {
  const all = new Set<string>()
  registerTools({ tools: { register: (tool) => { all.add(tool.name) } } }, (tool) => tool)
  const owned = new Set<string>()
  const byOwner = new Map<string, Set<string>>()
  for (const owner of ['workbench', 'tender', 'knowledge'] as const) {
    const names = new Set<string>()
    registerTools({ tools: { register: (tool) => {
      assert.equal(owned.has(tool.name), false, 'duplicate tool owner: ' + tool.name)
      owned.add(tool.name)
      names.add(tool.name)
    } } }, (tool) => tool, owner)
    byOwner.set(owner, names)
  }
  assert.deepEqual(owned, all)
  assert.ok(byOwner.get('tender')!.has('tender_pricing_workbook'))
  assert.ok(byOwner.get('workbench')!.has('tender_stage'))
  assert.ok([...byOwner.get('knowledge')!].every(name => name.startsWith('kb_')))
  assert.equal(routeOwner('/api/agent-pi/files'), 'host')
  assert.equal(routeOwner('/api/agent-pi/kb/search'), 'knowledge')
  assert.equal(routeOwner('/api/agent-pi/stage'), 'workbench')
})
