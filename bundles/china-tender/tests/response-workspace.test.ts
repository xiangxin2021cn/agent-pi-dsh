import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'
import { createBusinessProject } from '../../../packages/business-projects/index.ts'
import { createEngineeringProject } from '../../../packages/engineering-core/index.ts'
import { syncChinaResponseWorkspace } from '../src/response-workspace.ts'
import { chinaTenderProvider } from '../src/index.ts'
import { initTenderWorkspace, loadWorkspace, upsertWorkspaceSection } from '../../tender-host/src/workspace.ts'
import { getTenderResponseCoverage, verifyTenderResponse } from '../../tender-host/src/tender-responses.ts'
import { chinaTenderWorkflow } from '../src/workflow.ts'

test('China source analysis populates the shared response workspace without invented scores or review', t => {
  const cwd = mkdtempSync(join(tmpdir(), 'cn-response-link-'))
  t.after(() => rmSync(cwd, { recursive: true, force: true }))
  createBusinessProject({ workspaceRootPath: cwd, rootPath: cwd, createDirectory: false, module: 'china-tender', projectId: 'road', name: '道路技术标', workflowId: chinaTenderWorkflow.id, workflowSnapshot: chinaTenderWorkflow })
  const text = '施工方案应说明交通组织与资源安排。'
  writeFileSync(join(cwd, '招标要求.txt'), text)
  const sha256 = createHash('sha256').update(text).digest('hex')
  const project = { ...createEngineeringProject({ id: 'china-tender:road', title: '道路技术标' }), sources: [{ id: 'source', title: '招标要求', path: '招标要求.txt', sha256, status: 'active' as const }] }
  const requirements = [{ id: 'technical-method', title: '施工方案', category: 'scored' as const, source: { documentId: 'source', status: 'active' as const, sha256, page: 1, excerpt: text } }]
  const result = chinaTenderProvider.execute!({ action: 'analyze', syncWorkspace: true, data: { profile: { context: 'unknown', subject: 'construction', method: 'tender' }, requirements } }, project, { cwd, previousRuns: [] }) as any
  assert.equal(result.details.responseWorkspace.projectId, 'road')
  const workspace = loadWorkspace(cwd, 'road', 'china-tender')
  assert.equal(workspace.requirements[0].id, 'technical-method')
  assert.equal(workspace.criteria.length, 0, 'scored classification cannot invent grading rules')
  assert.equal(workspace.responses.length, 0, 'analysis cannot invent a completed response')
  assert.equal(getTenderResponseCoverage(cwd, 'road', 'china-tender').rows[0].id, 'technical-method')
  const repeat = syncChinaResponseWorkspace(cwd, project, requirements)
  assert.equal(repeat.changed, false)
  assert.equal(repeat.revision, workspace.revision)
  assert.throws(() => syncChinaResponseWorkspace(cwd, project, [{ ...requirements[0], source: { ...requirements[0].source, sha256: 'f'.repeat(64) } }]), /版本不同/)
  assert.equal(loadWorkspace(cwd, 'road', 'china-tender').revision, workspace.revision, 'failed source binding must not modify workspace')
  assert.throws(() => syncChinaResponseWorkspace(cwd, { ...project, id: 'session:ordinary' }, requirements), /绑定项目/)
})

test('China response sync isolates identical project IDs and propagates retired sources without new requirements', t => {
  const cwd = mkdtempSync(join(tmpdir(), 'cn-response-lifecycle-'))
  t.after(() => rmSync(cwd, { recursive: true, force: true }))
  createBusinessProject({ workspaceRootPath: cwd, rootPath: cwd, createDirectory: false, module: 'china-tender', projectId: 'road', name: '中国道路', workflowId: chinaTenderWorkflow.id, workflowSnapshot: chinaTenderWorkflow })
  initTenderWorkspace(cwd, 'road', { id: 'road', title: 'Existing South African workspace' })
  const original = loadWorkspace(cwd, 'road')
  const text = '施工方案应说明交通组织。'
  writeFileSync(join(cwd, 'source.md'), text)
  writeFileSync(join(cwd, 'bid.md'), '# 施工方案\n施工期间保持分阶段交通导行。')
  const sha256 = createHash('sha256').update(text).digest('hex')
  const project = { ...createEngineeringProject({ id: 'china-tender:road', title: '中国道路' }), sources: [{ id: 'source', title: '招标要求', path: 'source.md', sha256, status: 'active' as const }] }
  syncChinaResponseWorkspace(cwd, project, [{ id: 'traffic', title: '交通组织', category: 'mandatory', source: { documentId: 'source', status: 'active', sha256, clause: '施工方案', excerpt: text } }])
  upsertWorkspaceSection(cwd, 'road', { deliverables: [{ id: 'technical', title: '技术标', requirementIds: ['traffic'], status: 'drafting' }], responses: [{ id: 'traffic-response', title: '施工方案', requirementIds: ['traffic'], deliverableId: 'technical', evidenceRefs: [{ documentId: 'source', clause: '施工方案', excerpt: text }], status: 'planned', chapter: { id: 'traffic-chapter', title: '施工方案', generationMode: 'generate', requiredContent: ['交通组织'] } }] }, { module: 'china-tender' })
  verifyTenderResponse(cwd, 'road', 'traffic-response', { artifactPath: 'bid.md', location: { section: '施工方案', excerpt: '施工期间保持分阶段交通导行。' }, contentReview: { verdict: 'supported', reviewer: 'Test reviewer', note: 'Compared current source and located response.' } }, 'china-tender')
  assert.equal(getTenderResponseCoverage(cwd, 'road', 'china-tender').summary.reviewed, 1)
  const retired = { ...project, sources: [{ ...project.sources[0], status: 'superseded' as const }] }
  assert.equal(syncChinaResponseWorkspace(cwd, retired, []).changed, true)
  assert.equal(loadWorkspace(cwd, 'road', 'china-tender').documents[0].status, 'superseded')
  assert.equal(getTenderResponseCoverage(cwd, 'road', 'china-tender').summary.reviewed, 0, 'an old review cannot survive explicit source retirement')
  assert.equal(syncChinaResponseWorkspace(cwd, retired, []).changed, false, 'repeated retirement does not churn revisions')
  assert.equal(syncChinaResponseWorkspace(cwd, { ...project, sources: [] }, []).changed, false, 'absence is not an instruction to reactivate or delete')
  syncChinaResponseWorkspace(cwd, { ...project, sources: [{ ...project.sources[0], status: 'unreadable' }] }, [])
  assert.equal(loadWorkspace(cwd, 'road', 'china-tender').documents[0].status, 'unreadable')
  assert.equal(getTenderResponseCoverage(cwd, 'road', 'china-tender').summary.reviewed, 0)
  assert.deepEqual(loadWorkspace(cwd, 'road'), original, 'China lifecycle changes never touch the identically named legacy workspace')
})
