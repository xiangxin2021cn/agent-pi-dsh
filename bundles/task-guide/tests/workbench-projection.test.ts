import assert from 'node:assert/strict'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'
import { createBusinessProject } from '../../../packages/business-projects/index.ts'
import { createTaskStore } from '../../../packages/professional-tasks/task.ts'
import { initTenderWorkspace, upsertWorkspaceSection } from '../../tender-host/src/workspace.ts'
import { chinaTenderWorkflow } from '../../china-tender/src/workflow.ts'
import { WORKFLOWS } from '../../tender-host/src/workflows.ts'
import { projectTaskPatch } from '../src/workbench.ts'

test('China and international projects with the same id project their own requirements and criteria', t => {
  const cwd = mkdtempSync(join(tmpdir(), 'tender-task-projection-'))
  t.after(() => rmSync(cwd, { recursive: true, force: true }))
  const projects = [WORKFLOWS.tender, chinaTenderWorkflow].map(workflow => {
    const module = workflow.module as 'tender' | 'china-tender'
    const project = createBusinessProject({ workspaceRootPath: cwd, rootPath: join(cwd, module), createDirectory: true, projectId: 'same-id', module, name: module, workflowId: workflow.id, workflowSnapshot: workflow })
    initTenderWorkspace(cwd, project.projectId, { id: project.projectId, title: project.name }, module)
    const source = join(project.rootPath, 'scope.txt')
    writeFileSync(source, module + ' scope')
    upsertWorkspaceSection(cwd, project.projectId, { documents: [{ id: 'scope', name: 'Scope', path: source, kind: 'scope', status: 'active' }], requirements: [{ id: 'same-clause', title: module + ' clause', text: module + ' period', type: 'mandatory', criticality: 'critical', source: { documentId: 'scope' }, evidenceNeeded: [], status: 'open' }], criteria: [{ id: 'same-score', title: module + ' score', method: 'weighted', weight: 20, source: { documentId: 'scope' }, requirementIds: ['same-clause'], evidenceNeeded: [], status: 'planned' }] }, { module })
    return project
  })
  const state = createTaskStore(cwd).read('test-session')
  const patches = projects.map(project => projectTaskPatch(state, cwd, project) as any)
  for (const [index, project] of projects.entries()) {
    assert.ok(patches[index].requirements.some((row: any) => row.title.startsWith(project.module + ' clause')))
    assert.ok(patches[index].requirements.some((row: any) => row.title === project.module + ' score'))
    assert.ok(!patches[index].requirements.some((row: any) => row.title.startsWith(projects[1 - index].module + ' clause')))
  }
  assert.notEqual(patches[0].requirements[0].id, patches[1].requirements[0].id)
})
