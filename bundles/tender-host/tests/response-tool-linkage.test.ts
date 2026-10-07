import assert from 'node:assert/strict'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'
import { createBusinessProject } from '../../../packages/business-projects/index.ts'
import { initTenderWorkspace, loadWorkspace } from '../src/workspace.ts'
import { bindProjectSession, projectSnapshot } from '../src/orchestration.ts'
import { registerTools } from '../src/tools.ts'
import { toolOwner } from '../src/plugin-ownership.ts'
import { chinaTenderWorkflow } from '../../china-tender/src/workflow.ts'

test('shared workbench tool writes chapter plans, exposes schema and rejects invalid writes without revision churn', async t => {
  const cwd = mkdtempSync(join(tmpdir(), 'response-tool-'))
  t.after(() => rmSync(cwd, { recursive: true, force: true }))
  const project = createBusinessProject({ workspaceRootPath: cwd, rootPath: cwd, createDirectory: false, module: 'tender', projectId: 'road', name: '道路项目', workflowId: 'tender-main' })
  initTenderWorkspace(cwd, 'road', { id: 'road', title: '道路项目' })
  bindProjectSession(cwd, project, 'main')
  writeFileSync(join(cwd, 'source.md'), '# 招标文件\n施工方法必须说明交通组织。')
  const tools = new Map<string, any>()
  registerTools({ tools: { register: (value: any) => tools.set(value.name, value) } }, value => value, 'workbench')
  assert.equal(toolOwner('tender_workspace'), 'workbench', 'China workbench does not depend on South Africa plugin for response records')
  const call = (args: any) => tools.get('tender_workspace').execute({ projectId: 'road', ...args }, { agent: { session: { id: 'main', header: { cwd } } } })
  assert.ok(await call({ action: 'schema' }))
  const before = loadWorkspace(cwd, 'road').revision
  await assert.rejects(() => call({ action: 'not-an-action' }), /Unknown tender_workspace/)
  await assert.rejects(() => call({ action: 'upsert_responses' }), /collection array/)
  assert.equal(loadWorkspace(cwd, 'road').revision, before)
  await call({ action: 'upsert_documents', documents: [{ id: 'source', name: '招标文件', path: 'source.md', kind: 'scope', status: 'active' }] })
  await call({ action: 'upsert_requirements', requirements: [{ id: 'r1', title: '交通组织', text: '说明交通组织', type: 'mandatory', criticality: 'critical', source: { documentId: 'source', section: '施工方法' }, status: 'open' }] })
  await call({ action: 'upsert_responses', responses: [{ id: 'r1-response', title: '施工方法', requirementIds: ['r1'], status: 'planned', chapter: { id: 'ch1', title: '施工方法', generationMode: 'generate' } }] })
  const state = projectSnapshot(cwd, project).responseCoverage
  assert.ok(state && !('error' in state))
  assert.equal(state.summary.planned, 1)
  assert.equal(state.summary.reviewed, 0)
  assert.equal(loadWorkspace(cwd, 'road').responses[0].chapter?.id, 'ch1')
})

test('a bound China project uses its own response ledger and cannot call South Africa capability tools', async t => {
  const cwd = mkdtempSync(join(tmpdir(), 'response-tool-module-'))
  t.after(() => rmSync(cwd, { recursive: true, force: true }))
  const project = createBusinessProject({ workspaceRootPath: cwd, rootPath: cwd, createDirectory: false, module: 'china-tender', projectId: 'road', name: '中国道路', workflowId: chinaTenderWorkflow.id, workflowSnapshot: chinaTenderWorkflow })
  initTenderWorkspace(cwd, 'road', { id: 'road', title: 'South Africa ledger' })
  const original = loadWorkspace(cwd, 'road')
  bindProjectSession(cwd, project, 'cn-main')
  const tools = new Map<string, any>()
  registerTools({ tools: { register: (value: any) => tools.set(value.name, value) } }, value => value)
  const call = (name: string, args: any) => tools.get(name).execute({ projectId: 'road', ...args }, { agent: { session: { id: 'cn-main', header: { cwd } } } })
  await call('tender_workspace', { action: 'init', project: { id: 'road', title: '中国道路' } })
  const status = JSON.parse(await call('tender_workspace', { action: 'status' }))
  assert.equal(status.capabilities, null, 'China response status must not advertise mandatory South Africa capability packs')
  assert.equal(status.responseCoverage.module, 'china-tender')
  await call('tender_workspace', { action: 'upsert_responses', responses: [{ id: 'cn-response', title: '施工方案', status: 'planned', chapter: { id: 'cn-chapter', title: '施工方案', generationMode: 'generate' } }] })
  assert.equal(loadWorkspace(cwd, 'road', 'china-tender').responses[0].id, 'cn-response')
  assert.deepEqual(loadWorkspace(cwd, 'road'), original)
  const projection = projectSnapshot(cwd, project).responseCoverage
  assert.ok(projection && !('error' in projection))
  assert.equal(projection.module, 'china-tender')
  for (const name of ['tender_capability', 'tender_knowledge', 'tender_evidence', 'tender_pricing_workbook']) {
    assert.throws(() => call(name, { action: 'status', capability: 'document_analysis' }), /南非投标工作流/)
  }
  assert.throws(() => call('tender_workspace', { action: 'status', module: 'tender' }), /已绑定/)
})
