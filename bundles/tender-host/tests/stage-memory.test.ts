import assert from 'node:assert/strict'
import { existsSync, mkdtempSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'
import { createBusinessProject, listBusinessProjects, type BusinessProjectRecord } from '../../../packages/business-projects/index.ts'
import { bindProjectSession, inspectBoard, projectMemoryContextForSession, saveBoard, type StageSlice } from '../src/orchestration.ts'
import { officialStageDir } from '../src/outputs.ts'
import { registerPrompt } from '../src/prompt.ts'
import { saveWorkspaceText } from '../src/preview-export.ts'
import {
  commitStageHandoff,
  invalidateWorkspaceStageMemoryForPath,
  loadStageMemorySnapshot,
  refreshStageMemorySnapshot,
  stageHandoffDir,
  validateStageHandoff,
  workspaceMemoryImpactForPath,
} from '../src/stage-memory.ts'
import { WORKFLOWS } from '../src/workflows.ts'
import { initTenderWorkspace, workspacePaths } from '../src/workspace.ts'
import { CAPABILITY_FILE_NAMES } from '../src/fsutil.ts'

function projectFixture(id = 'memory-bid'): { cwd: string; project: BusinessProjectRecord } {
  const cwd = mkdtempSync(join(tmpdir(), 'ap-stage-memory-'))
  const source = join(cwd, 'tender-source.md')
  writeFileSync(source, '# Tender source\nEmployer facts stay in this project.')
  const project = createBusinessProject({
    workspaceRootPath: cwd,
    projectId: id,
    module: 'tender',
    name: 'Memory bid',
    rootPath: cwd,
    workflowId: 'tender-main',
    inputPaths: [source],
    createDirectory: false,
  })
  initTenderWorkspace(cwd, id, { id, title: 'Memory bid', status: 'active' })
  return { cwd, project }
}

function doneSlice(stageId: string): StageSlice {
  const now = '2026-08-30T12:00:00.000Z'
  const stage = WORKFLOWS.tender.stages.find((item) => item.id === stageId)
  return {
    stageId,
    status: 'done',
    tasks: [],
    updatedAt: now,
    completedAt: now,
    approval: stage?.approvalGate ? { decision: 'approved', decidedAt: now } : undefined,
  }
}

function writeStageSummary(cwd: string, project: BusinessProjectRecord, stageId: string, suffix = ''): string {
  const stage = WORKFLOWS.tender.stages.find((item) => item.id === stageId)!
  const dir = officialStageDir(cwd, project.projectId, stageId)
  mkdirSync(dir, { recursive: true })
  const name = stage.summaryDeliverable?.fileName ?? `${stageId}-baseline.md`
  const path = join(dir, name)
  writeFileSync(path, `# ${stage.labelZh}\n\n- 冻结结论 ${suffix}\n- 证据与缺口保持可追溯。\n- 后续阶段按本版本读取。\n`)
  return path
}

function commitTenderChain(cwd: string, project: BusinessProjectRecord): Record<string, string> {
  const paths: Record<string, string> = {}
  for (const stage of WORKFLOWS.tender.stages) {
    paths[stage.id] = writeStageSummary(cwd, project, stage.id)
    commitStageHandoff(cwd, project, stage.id, doneSlice(stage.id))
  }
  return paths
}

function writeReadyDocumentCapability(cwd: string, projectId: string): string {
  const paths = workspacePaths(cwd, projectId)
  const index = JSON.parse(readFileSync(paths.index, 'utf8'))
  const entry = index.capabilities.find((item: { capability: string }) => item.capability === 'document_analysis')
  Object.assign(entry, { revision: 1, readiness: 'ready', issueCount: 0, stale: false, updatedAt: new Date().toISOString() })
  writeFileSync(paths.index, `${JSON.stringify(index, null, 2)}\n`)
  const packPath = join(paths.packs, `${CAPABILITY_FILE_NAMES.document_analysis}.json`)
  writeFileSync(packPath, JSON.stringify({ schemaVersion: 1, capability: 'document_analysis', revision: 1, data: { clauses: 20 } }))
  return packPath
}

test('stage completion writes a validated immutable handoff and reuses an identical basis', () => {
  const { cwd, project } = projectFixture('atomic-memory')
  const output = writeStageSummary(cwd, project, 'project-setup')
  const first = commitStageHandoff(cwd, project, 'project-setup', doneSlice('project-setup'))
  const parsed = validateStageHandoff(JSON.parse(readFileSync(first.path, 'utf8')))
  assert.equal(parsed.revision, 1)
  assert.match(first.path.replace(/\\/g, '/'), /\.agent-pi\/business\/tender\/atomic-memory\/orchestration\/handoffs/)

  const repeated = commitStageHandoff(cwd, project, 'project-setup', doneSlice('project-setup'))
  assert.equal(repeated.path, first.path)
  assert.equal(readdirSync(stageHandoffDir(cwd, project, 'project-setup')).length, 1)

  writeFileSync(output, '# 项目资料登记\n\n- 用户明确修订后的第二版基线。\n')
  const second = commitStageHandoff(cwd, project, 'project-setup', doneSlice('project-setup'))
  assert.equal(second.revision, 2)
  assert.notEqual(second.digest, first.digest)
  assert.equal(validateStageHandoff(JSON.parse(readFileSync(first.path, 'utf8'))).digest, first.digest)
  assert.equal(readdirSync(stageHandoffDir(cwd, project, 'project-setup')).filter((name) => name.endsWith('.tmp')).length, 0)
  assert.equal(existsSync(join(cwd, 'knowledge')), false)
})

test('a required upstream handoff blocks a downstream memory commit', () => {
  const { cwd, project } = projectFixture('missing-input')
  writeStageSummary(cwd, project, 'bid-risk-decision')
  assert.throws(
    () => commitStageHandoff(cwd, project, 'bid-risk-decision', doneSlice('bid-risk-decision')),
    /handoff:project-setup=missing/,
  )
})

test('editing a frozen pricing basis precisely invalidates its transitive consumers', () => {
  const { cwd, project } = projectFixture('cascade-memory')
  const paths = commitTenderChain(cwd, project)
  const impact = workspaceMemoryImpactForPath(cwd, paths['pricing-basis-freeze'])
  assert.equal(impact.affected, true)
  assert.equal(impact.requiresReapproval, true)
  assert.deepEqual(impact.stageIds, [
    'pricing-basis-freeze',
    'boq-five-step-pricing',
    'planning-and-submission',
    'submission-compliance-freeze',
  ])

  writeFileSync(paths['pricing-basis-freeze'], '# 组价基准冻结\n\n- 汇率与工资基准已由用户修订。\n')
  const invalidated = invalidateWorkspaceStageMemoryForPath(cwd, paths['pricing-basis-freeze'])
  assert.equal(invalidated.affected, true)
  const snapshot = loadStageMemorySnapshot(cwd, project)
  assert.equal(snapshot.stages['tender-document-analysis']?.status, 'current')
  for (const stageId of impact.stageIds) assert.equal(snapshot.stages[stageId]?.status, 'stale')
})

test('preview save returns the affected stage chain and invalidates on the backend', () => {
  const { cwd, project } = projectFixture('preview-memory')
  const paths = commitTenderChain(cwd, project)
  const saved = saveWorkspaceText(cwd, paths['pricing-basis-freeze'], '# 组价基准冻结\n\n- 后台保存的新冻结基准。\n')
  assert.equal(saved.memoryImpact?.affected, true)
  assert.deepEqual(saved.memoryImpact?.stageIds, [
    'pricing-basis-freeze',
    'boq-five-step-pricing',
    'planning-and-submission',
    'submission-compliance-freeze',
  ])
  assert.equal(loadStageMemorySnapshot(cwd, project).stages['planning-and-submission']?.status, 'stale')
})

test('out-of-band Official Output drift is detected after restart', () => {
  const { cwd, project } = projectFixture('restart-memory')
  const paths = commitTenderChain(cwd, project)
  const before = loadStageMemorySnapshot(cwd, project)
  assert.equal(before.stages['tender-document-analysis']?.status, 'current')
  writeFileSync(paths['tender-document-analysis'], '# 投标分析底稿\n\n- 外部编辑器改写。\n')

  const reloadedProject = listBusinessProjects(cwd)[0]!
  const after = refreshStageMemorySnapshot(cwd, reloadedProject)
  assert.equal(after.stages['bid-risk-decision']?.status, 'current')
  assert.equal(after.stages['tender-document-analysis']?.status, 'stale')
  assert.equal(after.stages['submission-compliance-freeze']?.status, 'stale')
})

test('a capability pack edited without an index revision still invalidates its consuming chain', () => {
  const { cwd, project } = projectFixture('capability-memory')
  const packPath = writeReadyDocumentCapability(cwd, project.projectId)
  commitTenderChain(cwd, project)
  writeFileSync(packPath, JSON.stringify({ schemaVersion: 1, capability: 'document_analysis', revision: 1, data: { clauses: 21 } }))
  const snapshot = refreshStageMemorySnapshot(cwd, project)
  assert.equal(snapshot.stages['bid-risk-decision']?.status, 'current')
  assert.equal(snapshot.stages['tender-document-analysis']?.status, 'stale')
  assert.equal(snapshot.stages['submission-compliance-freeze']?.status, 'stale')
})

test('workbench inspection reopens the first stale stage and clears frozen approvals', () => {
  const { cwd, project } = projectFixture('board-memory')
  const paths = commitTenderChain(cwd, project)
  saveBoard(cwd, {
    schemaVersion: 2,
    projectId: project.projectId,
    module: project.module,
    currentStageId: 'submission-compliance-freeze',
    updatedAt: new Date().toISOString(),
    stages: Object.fromEntries(WORKFLOWS.tender.stages.map((stage) => [stage.id, doneSlice(stage.id)])),
  })
  writeFileSync(paths['pricing-basis-freeze'], '# 组价基准冻结\n\n- 新价格时点。\n')
  const board = inspectBoard(cwd, project)
  assert.equal(board.currentStageId, 'pricing-basis-freeze')
  assert.equal(board.stages['pricing-basis-freeze']?.status, 'blocked')
  assert.equal(board.stages['pricing-basis-freeze']?.approval, undefined)
  assert.equal(board.stages['boq-five-step-pricing']?.status, 'blocked')
  assert.equal(board.stages['tender-document-analysis']?.status, 'done')
})

test('N3-scale source volume stays out of the dynamic prompt and survives compaction reassembly', () => {
  const { cwd, project } = projectFixture('n3-memory')
  const setupDir = officialStageDir(cwd, project.projectId, 'project-setup')
  mkdirSync(setupDir, { recursive: true })
  const fourMiB = Buffer.alloc(4 * 1024 * 1024, 120)
  for (let index = 0; index < 6; index += 1) writeFileSync(join(setupDir, `n3-volume-${index + 1}.bin`), fourMiB)
  commitStageHandoff(cwd, project, 'project-setup', doneSlice('project-setup'))
  writeStageSummary(cwd, project, 'bid-risk-decision')

  saveBoard(cwd, {
    schemaVersion: 2,
    projectId: project.projectId,
    module: project.module,
    currentStageId: 'bid-risk-decision',
    updatedAt: new Date().toISOString(),
    stages: {
      'project-setup': doneSlice('project-setup'),
      'bid-risk-decision': { ...doneSlice('bid-risk-decision'), status: 'running', completedAt: undefined, approval: undefined },
    },
  })
  bindProjectSession(cwd, project, 'session-after-compaction', 'bid-risk-decision')

  const contexts: Array<{ name: string; text: unknown }> = []
  registerPrompt({
    systemPrompt: {
      section: () => undefined,
      context: (entry) => { contexts.push(entry); return undefined },
    },
  })
  const dynamic = contexts.find((entry) => entry.name === 'agent-pi:project-memory')
  assert.ok(dynamic && typeof dynamic.text === 'function')
  const text = (dynamic.text as (assemble: unknown) => string)({
    agent: { session: { id: 'session-after-compaction', header: { cwd } } },
  })
  assert.ok(text.length > 0 && text.length <= 12_000)
  assert.match(text, /前序基线 project-setup@1/)
  assert.match(text, /orchestration[\\/]handoffs[\\/]project-setup/)
  assert.doesNotMatch(text, /x{1000}/)
  assert.equal(projectMemoryContextForSession(cwd, 'session-after-compaction'), text)
})
