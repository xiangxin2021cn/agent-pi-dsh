/**
 * Workbench orchestration smoke test (no server, no model).
 *
 * Drives the tender business flow end to end against a temp workspace:
 * setup gate → completeSetup → resume dedupe (fingerprint + mark_dispatched) →
 * evidence gate waive → task completion → complete_stage terminal → resume done.
 *
 * Run: node scripts/smoke-workbench.ts   (Node >= 23.6, native type stripping)
 */
import assert from 'node:assert'
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { createBusinessProject } from '../packages/business-projects/index.ts'
import {
  completeSetup,
  completeStage,
  inspectBoard,
  markDispatched,
  organizeDeliverables,
  resumeUnfinished,
} from '../bundles/tender-host/src/orchestration.ts'
import { ANALYSIS_SUITE, fixtureAnalysisSuiteMarkdown } from '../bundles/tender-host/src/analysis-suite.ts'
import { writeBoqInventoryFixture } from '../bundles/tender-host/src/boq-inventory-gate.ts'
import { writePricingIntelFixtures } from '../bundles/tender-host/src/pricing-local-intel.ts'
import { evidencePolicy, forcePassEvidence } from '../bundles/tender-host/src/evidence.ts'

const cwd = mkdtempSync(join(tmpdir(), 'ap-smoke-'))
const inputA = join(cwd, 'input-a.docx')
const inputB = join(cwd, 'input-b.docx')
const inputBoq = join(cwd, 'Bill-of-Quantities.xlsx')
writeFileSync(inputA, 'smoke input '.repeat(30))
writeFileSync(inputB, 'smoke input b '.repeat(30))
writeFileSync(inputBoq, 'smoke boq '.repeat(30))

const project = createBusinessProject({
  workspaceRootPath: cwd,
  module: 'tender',
  projectId: 'smoke-1',
  name: '冒烟项目',
  rootPath: join(cwd, 'proj'),
  createDirectory: true,
  inputPaths: [inputA, inputB, inputBoq],
})

let step = ''
const ok = (name: string) => console.log('  ok', name)

// 1. resume before setup is done → blocked, no draft
step = 'setup gate'
let r = resumeUnfinished(cwd, project)
assert.ok(r.blocked, 'resume should be blocked before setup')
assert.ok(!r.draft, 'blocked resume must not return a draft')
ok(step)

// 2. completeSetup → setup done, next stage prepared with draft + dispatch key
step = 'completeSetup'
const setup = completeSetup(cwd, project)
assert.equal(setup.nextStageId, 'tender-document-analysis')
assert.ok(setup.draft && setup.draft.includes('complete_stage'), 'draft carries closing instruction')
assert.ok(setup.draft.includes('招标文件总结.md'), 'draft names the analysis-suite files')
assert.ok(setup.draft.includes('boq_reconciliation'), 'draft requires a real BOQ pack')
assert.ok(setup.dispatch && setup.dispatch.key, 'dispatch key present')
ok(step)

// 3. first resume → offers analysis draft with dispatch key
step = 'resume offers analysis'
r = resumeUnfinished(cwd, project)
assert.equal(r.stageId, 'tender-document-analysis')
assert.ok(r.draft && r.dispatch, 'draft + dispatch expected')
const analysisKey = r.dispatch!.key
ok(step)

// 4. immediate second resume → deduped by offer TTL
step = 'resume dedupe (offer TTL)'
r = resumeUnfinished(cwd, project)
assert.ok(r.alreadyDispatched, 'second resume must dedupe')
assert.ok(!r.draft, 'deduped resume returns no draft')
ok(step)

// 5. mark_dispatched → still deduped (durable, beyond TTL semantics)
step = 'mark_dispatched'
markDispatched(cwd, project, 'tender-document-analysis', analysisKey)
r = resumeUnfinished(cwd, project)
assert.ok(r.alreadyDispatched, 'resume after mark_dispatched must dedupe')
ok(step)

// 6. one deliverable lands → resume offers a recovery draft, not a full rescan
step = 'recovery skips completed workers'
let board = inspectBoard(cwd, project)
const analysis = board.stages['tender-document-analysis']!
assert.ok(analysis.tasks.length > 0, 'analysis checklist expected')
const firstTask = analysis.tasks[0]!
assert.ok(firstTask.markdownPath, 'task carries markdownPath')
writeFileSync(firstTask.markdownPath, '# 交付\n' + '内容 '.repeat(60))
board = inspectBoard(cwd, project)
assert.equal(board.stages['tender-document-analysis']!.tasks[0]!.status, 'done')
if (firstTask.reportPath) {
  mkdirSync(join(firstTask.reportPath, '..'), { recursive: true })
  writeFileSync(firstTask.reportPath, JSON.stringify({ status: 'error', error: 'should be ignored after done' }))
  board = inspectBoard(cwd, project)
  assert.equal(board.stages['tender-document-analysis']!.tasks[0]!.status, 'done', 'done tasks must not re-read JSON')
}
r = resumeUnfinished(cwd, project)
assert.ok(r.draft && r.draft.includes('恢复未递交成果'), 'partial progress must offer a recovery draft')
assert.ok(!r.draft.includes('第一步先调用 tender_stage status'), 'recovery must not restart the whole stage')
assert.ok(!r.draft.includes(`- ${firstTask.id} `), 'completed task must not appear in the pending list')
ok(step)

// 7. deliver remaining analysis markdown — tasks done is not enough; suite still blocks
step = 'analysis tasks done stay on suite'
board = inspectBoard(cwd, project)
for (const task of board.stages['tender-document-analysis']!.tasks) {
  if (task.status === 'done') continue
  assert.ok(task.markdownPath, 'task carries markdownPath')
  writeFileSync(task.markdownPath!, '# 交付\n' + '内容 '.repeat(60))
}
board = inspectBoard(cwd, project)
assert.equal(board.stages['tender-document-analysis']!.status, 'running', 'suite gap must keep analysis open')
r = resumeUnfinished(cwd, project)
assert.equal(r.stageId, 'tender-document-analysis')
assert.ok(r.draft && r.draft.includes('补齐分析深度套件'), 'suite gap must offer a patch draft, not a full rescan')
assert.ok(r.draft.includes('招标文件总结.md'))
assert.ok(!r.draft.includes('恢复未递交成果'), 'all source tasks done: do not recover workers')
assert.throws(() => completeStage(cwd, project, 'tender-document-analysis'), /总报告|深度套件|招标解析/)
ok(step)

step = 'analysis suite + summary still need a real BOQ pack'
const analysisDir = dirname(board.stages['tender-document-analysis']!.tasks[0]!.markdownPath!)
for (const spec of ANALYSIS_SUITE) {
  writeFileSync(join(analysisDir, spec.fileName), fixtureAnalysisSuiteMarkdown(spec.fileName))
}
writeFileSync(join(analysisDir, '招标文件解析总报告.md'), '# 总报告\n' + '综述 '.repeat(80))
assert.throws(() => completeStage(cwd, project, 'tender-document-analysis'), /工程量清单|boq_reconciliation|清单行/)
r = resumeUnfinished(cwd, project)
assert.equal(r.stageId, 'tender-document-analysis')
assert.ok(r.draft && (r.draft.includes('boq_reconciliation') || r.draft.includes('工程量清单')), 'BOQ gap must offer a pack draft')
ok(step)

step = 'analysis suite + summary + BOQ pack close the stage'
writeBoqInventoryFixture(cwd, project.projectId, analysisDir)
completeStage(cwd, project, 'tender-document-analysis')
board = inspectBoard(cwd, project)
assert.equal(board.stages['tender-document-analysis']!.status, 'done')
ok(step)

// 8. resume → next is pricing, but evidence gate blocks (no evidence-named files)
step = 'evidence gate blocks pricing'
r = resumeUnfinished(cwd, project)
assert.equal(r.stageId, 'boq-five-step-pricing')
assert.ok(r.blocked, 'pricing should be gate-blocked')
assert.ok(!r.draft, 'gate-blocked resume must not return a draft')
ok(step)

// 9. waive gate (no web authorization) → pricing draft offered
step = 'waive gate'
const ledger = forcePassEvidence(cwd, project.projectId)
assert.ok(ledger.gateWaivedAt, 'gateWaivedAt set')
assert.ok(!ledger.webDiligenceAuthorizedAt, 'waive must not authorize web diligence')
const policy = evidencePolicy(cwd, project.projectId)
assert.equal(policy.blocking, false)
assert.equal(policy.webDiligenceAuthorized, false)
r = resumeUnfinished(cwd, project)
assert.equal(r.stageId, 'boq-five-step-pricing')
assert.ok(r.draft && r.dispatch, 'pricing draft offered after waive')
const pricingKey = r.dispatch!.key
markDispatched(cwd, project, 'boq-five-step-pricing', pricingKey)
ok(step)

// 10. complete_stage rejects while pricing checklist is unfinished
step = 'complete_stage rejects pending tasks'
assert.throws(() => completeStage(cwd, project, 'boq-five-step-pricing'), /未完成/)
ok(step)

// 11. deliver pricing markdowns → stage done; planning has no checklist →
//     complete_stage is its only terminal signal
step = 'pricing done + planning complete_stage'
board = inspectBoard(cwd, project)
for (const task of board.stages['boq-five-step-pricing']!.tasks) {
  writeFileSync(task.markdownPath!, '# 组价\n' + '数据 '.repeat(60))
}
r = resumeUnfinished(cwd, project)
assert.equal(r.stageId, 'boq-five-step-pricing', 'supplier pack gap must keep pricing open')
assert.ok(r.draft && r.draft.includes('当地供应商尽调'), 'pricing intel gap must offer a patch draft')
const pricingDir = dirname(board.stages['boq-five-step-pricing']!.tasks[0]!.markdownPath!)
writePricingIntelFixtures(pricingDir)
r = resumeUnfinished(cwd, project)
assert.equal(r.stageId, 'planning-and-submission', 'resume should reach planning')
assert.ok(r.draft, 'planning draft offered')
completeStage(cwd, project, 'planning-and-submission')
const organizedClosed = organizeDeliverables(cwd, project, 'planning-and-submission')
assert.equal(organizedClosed.reality.stageStatus, 'done')
assert.equal(organizedClosed.reality.outputFolder, 'planning')
assert.equal(organizedClosed.closed, true)
assert.equal(organizedClosed.needsQc, false)
assert.ok(organizedClosed.draft.includes('阶段已收口'), 'closed organize must not look like pending QC')
assert.ok(!organizedClosed.draft.includes('调用 tender_stage complete_stage'), 'closed organize must not ask to complete_stage again')
assert.ok(organizedClosed.draft.includes('投标可提交'), 'closed organize must separate bid readiness from stage status')
ok(step)

// 12. resume → workflow finished
step = 'terminal state'
r = resumeUnfinished(cwd, project)
assert.ok(r.done, 'workflow should be done')
assert.ok(!r.draft, 'no draft at terminal state')
ok(step)

// 13. delivery module resume targets its first stage without any setup gate
step = 'delivery module resume'
const delivery = createBusinessProject({
  workspaceRootPath: cwd,
  module: 'delivery',
  projectId: 'smoke-d1',
  name: '交付冒烟',
  rootPath: join(cwd, 'proj-d'),
  createDirectory: true,
  inputPaths: [],
})
r = resumeUnfinished(cwd, delivery)
assert.equal(r.stageId, 'delivery-setup')
assert.ok(r.draft && r.dispatch, 'delivery first stage draft offered')
ok(step)

// 14. evidence registered OUTSIDE the workspace top level is visible to the gate
//     (registered-inputs channel; previously only cwd top-level files counted)
step = 'evidence via registered inputs'
const evidenceDir = mkdtempSync(join(tmpdir(), 'ap-evidence-'))
const specFile = join(evidenceDir, 'COTO-standard-specification.pdf')
writeFileSync(specFile, 'spec '.repeat(50))
const p3 = createBusinessProject({
  workspaceRootPath: cwd,
  module: 'tender',
  projectId: 'smoke-3',
  name: '证据冒烟',
  rootPath: join(cwd, 'proj-3'),
  createDirectory: true,
  inputPaths: [specFile],
})
completeSetup(cwd, p3)
const policy3 = evidencePolicy(cwd, p3.projectId)
assert.ok(policy3.evidenceFileNames.some((name) => /coto/i.test(name)), 'registered off-workspace evidence must be seen')
assert.equal(policy3.gaps.some((gap) => gap.chapterId === 'specs'), false, 'registered COTO must satisfy the specs chapter')
r = resumeUnfinished(cwd, p3)
assert.equal(r.stageId, 'tender-document-analysis')
assert.ok(r.draft, 'analysis draft offered without any waive')
ok(step)

console.log('\nsmoke-workbench: all checks passed —', cwd)
