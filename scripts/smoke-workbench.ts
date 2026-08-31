/**
 * Tender workbench orchestration smoke test (no server, no model).
 *
 * Drives the seven-stage tender flow, including all three user-owned approval
 * gates and the durable capability/output gates.
 *
 * Run: node scripts/smoke-workbench.ts   (Node >= 23.6, native type stripping)
 */
import assert from 'node:assert/strict'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { createBusinessProject } from '../packages/business-projects/index.ts'
import type { TenderCapabilityId, TenderCapabilityIndex } from '../packages/business-core/src/tender/index.ts'
import {
  completeSetup,
  completeStage,
  decideApprovalStage,
  inspectBoard,
  markDispatched,
  organizeDeliverables,
  resumeUnfinished,
} from '../bundles/tender-host/src/orchestration.ts'
import { fixtureAnalysisSuiteMarkdown } from '../bundles/tender-host/src/analysis-suite.ts'
import { writeBoqInventoryFixture } from '../bundles/tender-host/src/boq-inventory-gate.ts'
import { evidencePolicy, forcePassEvidence } from '../bundles/tender-host/src/evidence.ts'
import { CAPABILITY_FILE_NAMES } from '../bundles/tender-host/src/fsutil.ts'
import { officialStageDir } from '../bundles/tender-host/src/outputs.ts'
import { writePricingIntelFixtures } from '../bundles/tender-host/src/pricing-local-intel.ts'
import { demoPricingData, generatePricingWorkbook } from '../bundles/tender-host/src/pricing-workbook.ts'
import { workspacePaths } from '../bundles/tender-host/src/workspace.ts'

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

const ok = (name: string) => console.log('  ok', name)
const substantial = (title: string) => '# ' + title + '\n\n' + '已核对项目资料、风险、依据、缺口与责任人。'.repeat(30)

function writeSummary(stageId: string, fileName: string, body = substantial(fileName.replace(/\.md$/, ''))): string {
  const dir = officialStageDir(cwd, project.projectId, stageId)
  mkdirSync(dir, { recursive: true })
  const path = join(dir, fileName)
  writeFileSync(path, body)
  return path
}

function finishSourceTasks(stageId: string, label: string): void {
  const board = inspectBoard(cwd, project)
  for (const task of board.stages[stageId]?.tasks ?? []) {
    assert.ok(task.markdownPath, label + ' task must carry markdownPath')
    if (!existsSync(task.markdownPath!)) {
      writeFileSync(task.markdownPath!, '# ' + task.title + '\n\n' + (label + ' verified content. ').repeat(30))
    }
  }
}

function markCapabilitiesReady(capabilities: TenderCapabilityId[]): void {
  const paths = workspacePaths(cwd, project.projectId)
  const index = JSON.parse(readFileSync(paths.index, 'utf8')) as TenderCapabilityIndex
  const now = new Date().toISOString()
  mkdirSync(paths.packs, { recursive: true })
  for (const capability of capabilities) {
    const entry = index.capabilities.find((item) => item.capability === capability)
    assert.ok(entry, 'capability index entry missing: ' + capability)
    Object.assign(entry, { revision: 1, readiness: 'ready', issueCount: 0, stale: false, updatedAt: now })
    const packPath = join(paths.packs, CAPABILITY_FILE_NAMES[capability] + '.json')
    if (!existsSync(packPath)) {
      writeFileSync(packPath, JSON.stringify({
        schemaVersion: 1,
        capability,
        projectId: project.projectId,
        revision: 1,
        coreRevision: index.coreRevision,
        upstream: [],
        updatedAt: now,
        data: {},
      }, null, 2) + '\n')
    }
  }
  for (const capability of capabilities) {
    const packPath = join(paths.packs, CAPABILITY_FILE_NAMES[capability] + '.json')
    const pack = JSON.parse(readFileSync(packPath, 'utf8')) as {
      revision: number
      coreRevision: number
      upstream: Array<{ capability: 'core' | TenderCapabilityId; revision: number }>
    }
    pack.revision = index.capabilities.find((item) => item.capability === capability)!.revision
    pack.coreRevision = index.coreRevision
    pack.upstream = pack.upstream.map((reference) => ({
      ...reference,
      revision: reference.capability === 'core'
        ? index.coreRevision
        : index.capabilities.find((item) => item.capability === reference.capability)?.revision ?? reference.revision,
    }))
    writeFileSync(packPath, JSON.stringify(pack, null, 2) + '\n')
  }
  writeFileSync(paths.index, JSON.stringify(index, null, 2) + '\n')
}

let r = resumeUnfinished(cwd, project)
assert.ok(r.blocked && !r.draft, 'setup must block before source confirmation')
ok('project registration gate')

const setup = completeSetup(cwd, project)
assert.equal(setup.nextStageId, 'bid-risk-decision')
assert.match(setup.draft ?? '', /投标决策与重大风险评估/)
ok('setup enters bid decision')

writeSummary('bid-risk-decision', '投标决策与重大风险评估.md')
r = resumeUnfinished(cwd, project)
assert.equal(r.stageId, 'bid-risk-decision')
assert.match(r.blocked ?? '', /工作台.*确认投标/)
const bidApproved = decideApprovalStage(cwd, project, 'bid-risk-decision', 'approved')
assert.equal(bidApproved.state.approval?.decision, 'approved')
ok('bid decision requires explicit user approval')

r = resumeUnfinished(cwd, project)
assert.equal(r.stageId, 'tender-document-analysis')
assert.ok(r.draft && r.dispatch)
const analysisKey = r.dispatch!.key
r = resumeUnfinished(cwd, project)
assert.ok(r.alreadyDispatched && !r.draft, 'offered analysis draft must dedupe')
markDispatched(cwd, project, 'tender-document-analysis', analysisKey)
ok('analysis dispatch is durable and deduped')

let board = inspectBoard(cwd, project)
const firstAnalysisTask = board.stages['tender-document-analysis']!.tasks[0]!
assert.ok(firstAnalysisTask.markdownPath)
writeFileSync(firstAnalysisTask.markdownPath!, '# source analysis\n' + 'verified source '.repeat(30))
r = resumeUnfinished(cwd, project)
assert.match(r.draft ?? '', /恢复未递交成果/)
assert.ok(!r.draft!.includes(firstAnalysisTask.id), 'completed source must not be re-dispatched')
finishSourceTasks('tender-document-analysis', 'analysis')
r = resumeUnfinished(cwd, project)
assert.match(r.draft ?? '', /补齐投标分析底稿/)
ok('analysis recovery only resumes missing work')

const analysisDir = officialStageDir(cwd, project.projectId, 'tender-document-analysis')
writeFileSync(join(analysisDir, '投标分析底稿.md'), fixtureAnalysisSuiteMarkdown('投标分析底稿.md'))
writeBoqInventoryFixture(cwd, project.projectId, analysisDir)
markCapabilitiesReady(['document_analysis', 'boq_reconciliation'])
completeStage(cwd, project, 'tender-document-analysis')
ok('canonical analysis base and full BOQ provenance close analysis')

r = resumeUnfinished(cwd, project)
assert.equal(r.stageId, 'pricing-basis-freeze')
assert.ok(r.blocked, 'pricing basis must respect evidence gate')
const ledger = forcePassEvidence(cwd, project.projectId)
assert.ok(ledger.gateWaivedAt)
assert.equal(evidencePolicy(cwd, project.projectId).blocking, false)
r = resumeUnfinished(cwd, project)
assert.equal(r.stageId, 'pricing-basis-freeze')
assert.ok(r.draft)
writeSummary('pricing-basis-freeze', '组价基准冻结单.md')
decideApprovalStage(cwd, project, 'pricing-basis-freeze', 'approved')
ok('pricing basis freeze requires explicit user approval')

r = resumeUnfinished(cwd, project)
assert.equal(r.stageId, 'boq-five-step-pricing')
finishSourceTasks('boq-five-step-pricing', 'pricing')
const pricingDir = officialStageDir(cwd, project.projectId, 'boq-five-step-pricing')
writeSummary('boq-five-step-pricing', 'BOQ 组价总报告.md')
writePricingIntelFixtures(pricingDir)
generatePricingWorkbook({
  cwd,
  projectId: project.projectId,
  projectTitle: project.name,
  data: demoPricingData(),
})
markCapabilitiesReady(['boq_five_step_pricing'])
completeStage(cwd, project, 'boq-five-step-pricing')
ok('detailed pricing keeps workbook, local diligence and capability gates')

r = resumeUnfinished(cwd, project)
assert.equal(r.stageId, 'planning-and-submission')
const planningDir = officialStageDir(cwd, project.projectId, 'planning-and-submission')
mkdirSync(planningDir, { recursive: true })
for (const fileName of [
  '施工与技术方案总控.md',
  '施工策划报告.md',
  'tender-programme.msp.xml',
  'tender-programme.p6.xml',
  'S-Curve_Cash_Flow_Chart.html',
  'Work_Plan_and_Proposed_Methodology.docx',
]) {
  writeFileSync(join(planningDir, fileName), fileName + '\n' + 'verified planning output '.repeat(20))
}
markCapabilitiesReady(['execution_plan', 'schedule_resources', 'construction_resource_schedule', 'cost_cashflow'])
completeStage(cwd, project, 'planning-and-submission')
const organized = organizeDeliverables(cwd, project, 'planning-and-submission')
assert.equal(organized.reality.stageStatus, 'done')
assert.equal(organized.reality.outputFolder, 'planning')
assert.ok(organized.closed && !organized.needsQc)
ok('construction and technical proposal closes independently of submission')

r = resumeUnfinished(cwd, project)
assert.equal(r.stageId, 'submission-compliance-freeze')
assert.ok(r.draft)
writeSummary('submission-compliance-freeze', '投标提交合规与冻结记录.md')
markCapabilitiesReady(['submission_documents', 'bidder_commitments'])
const finalApproved = decideApprovalStage(cwd, project, 'submission-compliance-freeze', 'approved')
assert.equal(finalApproved.state.approval?.decision, 'approved')
r = resumeUnfinished(cwd, project)
assert.ok(r.done && !r.draft)
ok('final compliance freeze requires explicit user approval')

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
assert.ok(r.draft && r.dispatch)
ok('other workbench modules remain unaffected')

const evidenceDir = mkdtempSync(join(tmpdir(), 'ap-evidence-'))
const specFile = join(evidenceDir, 'COTO-standard-specification.pdf')
writeFileSync(specFile, 'spec '.repeat(50))
const evidenceProject = createBusinessProject({
  workspaceRootPath: cwd,
  module: 'tender',
  projectId: 'smoke-3',
  name: '证据冒烟',
  rootPath: join(cwd, 'proj-3'),
  createDirectory: true,
  inputPaths: [specFile],
})
completeSetup(cwd, evidenceProject)
const evidencePolicyResult = evidencePolicy(cwd, evidenceProject.projectId)
assert.ok(evidencePolicyResult.evidenceFileNames.some((name) => /coto/i.test(name)))
assert.equal(evidencePolicyResult.gaps.some((gap) => gap.chapterId === 'specs'), false)
r = resumeUnfinished(cwd, evidenceProject)
assert.equal(r.stageId, 'bid-risk-decision')
assert.ok(r.draft)
ok('registered external evidence enters the user-owned bid gate')

console.log('\nsmoke-workbench: all checks passed —', cwd)
