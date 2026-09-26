import assert from 'node:assert/strict'
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'
import { createBusinessProject, getBusinessProject } from '../../../packages/business-projects/index.ts'
import { saveUserModule, removeUserModule, workflowFor, listWorkbenchModules, type ModuleFile } from '../src/modules.ts'
import { workbenchSnapshot } from '../src/orchestration.ts'
import { WorkbenchRegistry } from '../../../packages/business-projects/workbench-registry.ts'

test('user edits and deletion preserve project snapshots and legacy definitions', () => {
  const cwd = mkdtempSync(join(tmpdir(), 'ap-workflow-snapshot-'))
  const previousRoot = process.env.AGENT_PI_MODULES_ROOT
  process.env.AGENT_PI_MODULES_ROOT = join(cwd, 'modules')
  try {
    const definition: ModuleFile = { schemaVersion: 1, id: 'inspection', labelZh: '现场检查', stages: [
      { id: 'inspect', labelZh: '现场检查', prompt: '按用户指定的规范检查并记录。', skillSlugs: [] },
    ] }
    // Simulate a project and module created before workflow snapshots existed.
    mkdirSync(process.env.AGENT_PI_MODULES_ROOT, { recursive: true })
    writeFileSync(join(process.env.AGENT_PI_MODULES_ROOT, 'inspection.json'), JSON.stringify(definition))
    const legacy = createBusinessProject({ workspaceRootPath: cwd, rootPath: cwd, createDirectory: false,
      module: 'inspection', projectId: 'legacy', name: 'Legacy', workflowId: 'inspection-main' })
    legacy.createdAt = '2020-01-01T00:00:00.000Z'
    const workflow = workflowFor('inspection')
    const pinned = createBusinessProject({ workspaceRootPath: cwd, rootPath: cwd, createDirectory: false,
      module: 'inspection', projectId: 'pinned', name: 'Pinned', workflowId: workflow.id, workflowSnapshot: workflow })
    workflow.stages[0].prompt = 'Mutating the source must not alter the project'
    const originalRevision = listWorkbenchModules().modules.find((row) => row.id === 'inspection')!.revision
    const saved = saveUserModule({ ...definition, stages: [{ ...definition.stages[0], prompt: '新的检查规则' }] }, { expectedRevision: originalRevision })
    assert.notEqual(saved.revision, originalRevision)
    assert.throws(() => saveUserModule(definition, { expectedRevision: originalRevision }), /changed since/)
    assert.throws(() => saveUserModule(definition, { createOnly: true }), /already exists/)
    assert.equal(workflowFor('inspection').stages[0].prompt, '新的检查规则')
    assert.equal(workflowFor(legacy).stages[0].prompt, definition.stages[0].prompt)
    assert.equal(workflowFor(getBusinessProject(cwd, 'inspection', 'pinned')!).stages[0].prompt, definition.stages[0].prompt)
    removeUserModule('inspection')
    assert.throws(() => workflowFor('inspection'), /Unknown module/)
    assert.equal(workflowFor(legacy).stages[0].prompt, definition.stages[0].prompt)
    assert.equal(workflowFor(pinned).stages[0].prompt, definition.stages[0].prompt)
    const snapshot = workbenchSnapshot(cwd)
    assert.equal(snapshot.modules.find(row => row.id === 'inspection')?.available, false)
    assert.equal(snapshot.projects.find(row => row.project.projectId === 'pinned')!.workflow.stages[0].prompt, definition.stages[0].prompt)
    assert.throws(() => removeUserModule('../outside'), /Invalid module id/)
  } finally {
    if (previousRoot === undefined) delete process.env.AGENT_PI_MODULES_ROOT
    else process.env.AGENT_PI_MODULES_ROOT = previousRoot
  }
})

test('legacy built-in projects remain readable with their native provider uninstalled', () => {
  const cwd = mkdtempSync(join(tmpdir(), 'ap-legacy-provider-'))
  const project = createBusinessProject({ workspaceRootPath: cwd, rootPath: cwd, createDirectory: false,
    module: 'delivery', projectId: 'old-delivery', name: 'Existing delivery', workflowId: 'delivery-main' })
  const registry = new WorkbenchRegistry()
  registry.run(() => {
    assert.throws(() => workflowFor('delivery'), /Unknown module/)
    assert.equal(workflowFor(project).module, 'delivery')
    assert.equal(workbenchSnapshot(cwd).modules.find(row => row.id === 'delivery')?.available, false)
  })
})
