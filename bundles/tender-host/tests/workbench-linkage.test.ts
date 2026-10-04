import assert from 'node:assert/strict'
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'
import { createBusinessProject } from '../../../packages/business-projects/index.ts'
import { businessContextForAgent, registerBusinessActivation } from '../src/business-activation.ts'
import { approvalStageFingerprint, bindProjectSession, completeSetup, decideApprovalStage, inspectBoard, loadBoard, prepareStage, recordHumanStageDecision, recordProjectUserRequirement, saveBoard, setProjectUserRequirementStatus, stageAvailability } from '../src/orchestration.ts'
import { officialStageDir } from '../src/outputs.ts'
import { restoreSetupSource, setupSourceStatus } from '../src/setup-restore.ts'
import { loadStageMemorySnapshot } from '../src/stage-memory.ts'
import { registerTools } from '../src/tools.ts'
import { listUserRequirements } from '../src/user-requirements.ts'
import { capabilityStatus, initTenderWorkspace, workspacePaths } from '../src/workspace.ts'
import { CAPABILITY_FILE_NAMES } from '../src/fsutil.ts'
import { WORKFLOWS } from '../src/workflows.ts'

function fixture(t: { after(fn: () => void): unknown }, sourceName = 'tender.txt') {
  const cwd = mkdtempSync(join(tmpdir(), 'ap-linkage-'))
  t.after(() => rmSync(cwd, { recursive: true, force: true }))
  const source = join(cwd, sourceName)
  writeFileSync(source, 'Registered project information, qualification and scope.\n'.repeat(8))
  const project = createBusinessProject({ workspaceRootPath: cwd, module: 'tender', projectId: 'linked', name: 'Linked project', rootPath: cwd, workflowId: 'tender-main', createDirectory: false, inputPaths: [source] })
  initTenderWorkspace(cwd, project.projectId, { id: project.projectId, title: project.name, status: 'active' })
  bindProjectSession(cwd, project, 'main')
  return { cwd, source, project }
}

function memo(cwd: string, projectId: string) {
  const path = join(officialStageDir(cwd, projectId, 'bid-risk-decision'), '投标决策与重大风险评估.md')
  mkdirSync(join(path, '..'), { recursive: true })
  writeFileSync(path, '# 投标决策与重大风险评估\n\n' + '资格、评分、合同、保函、风险、缺口和投标条件。'.repeat(30))
  return path
}

test('setup cannot claim an unparsed PDF is aligned; the real source hash invalidates a restored manuscript', async t => {
  const f = fixture(t, 'tender.pdf')
  const initial = completeSetup(f.cwd, f.project)
  assert.ok(initial.blocked)
  assert.equal(initial.board.stages['project-setup']?.status, 'blocked')
  const legacy = initial.board
  legacy.stages['project-setup']!.status = 'done'
  legacy.stages['project-setup']!.tasks.forEach(task => { task.status = 'done' })
  assert.equal(stageAvailability(f.cwd, f.project, legacy)['bid-risk-decision']?.canPrepare, false)
  const restore = await restoreSetupSource(f.cwd, f.project.projectId, f.source, { ingest: async () => ({ markdown: '# Qualification\n\n' + 'Required qualification and deadline.\n'.repeat(8), contentList: [{ type: 'text', text: 'Qualification', page_idx: 0 }], partCount: 1, via: 'local', route: 'local', ocr: false }) })
  assert.equal(setupSourceStatus(f.cwd, f.project.projectId, f.source, [restore]).extracted, true)
  const complete = completeSetup(f.cwd, f.project)
  assert.equal(complete.board.stages['project-setup']?.status, 'done')
  writeFileSync(f.source, 'Changed tender PDF content and deadline.\n')
  const current = setupSourceStatus(f.cwd, f.project.projectId, f.source, [restore])
  assert.equal(current.extracted, false)
  assert.match(current.reason || '', /变更|一致|变化|改变/)
  assert.equal(stageAvailability(f.cwd, f.project)['bid-risk-decision']?.canPrepare, false)
})

test('a blocked later stage preserves the actual current stage and existing work', t => {
  const f = fixture(t)
  completeSetup(f.cwd, f.project)
  const board = loadBoard(f.cwd, f.project.projectId)
  board.stages['tender-document-analysis'] = { stageId: 'tender-document-analysis', status: 'running', tasks: [{ id: 'existing', title: 'Existing analysis', status: 'running' }], updatedAt: board.updatedAt }
  saveBoard(f.cwd, board)
  const result = prepareStage(f.cwd, f.project, 'tender-document-analysis')
  assert.ok(result.blocked)
  assert.equal(result.board.currentStageId, 'bid-risk-decision')
  assert.equal(result.board.stages['tender-document-analysis']?.tasks[0]?.id, 'existing')
  assert.equal(stageAvailability(f.cwd, f.project)['boq-five-step-pricing']?.canPrepare, false)
})

test('actual explicit human bid confirmation approves the real gate once and accepts implemented work', t => {
  const f = fixture(t)
  completeSetup(f.cwd, f.project)
  const path = memo(f.cwd, f.project.projectId)
  const requirement = recordProjectUserRequirement(f.cwd, f.project, { sessionId: 'main', messageId: 'human-work', text: '分析商务风险' }).requirement
  setProjectUserRequirementStatus(f.cwd, f.project, requirement.id, 'implemented', { evidencePaths: [path] })
  const input = { sessionId: 'main', messageId: 'human-decision', text: '确定投标，按计划推进' }
  const result = recordHumanStageDecision(f.cwd, f.project, input)
  assert.equal(result.handled, true)
  assert.equal(result.status, 'approved')
  const board = loadBoard(f.cwd, f.project.projectId)
  assert.equal(board.stages['bid-risk-decision']?.approval?.source?.text, input.text)
  assert.equal(board.stages['bid-risk-decision']?.approval?.source?.messageId, input.messageId)
  assert.deepEqual(listUserRequirements(f.cwd, f.project).map(row => [row.text, row.status]), [['分析商务风险', 'accepted']])
  const next = prepareStage(f.cwd, f.project, 'tender-document-analysis')
  assert.equal(next.blocked, undefined)
  const replay = recordHumanStageDecision(f.cwd, f.project, input)
  assert.equal(replay.handled, true)
  assert.equal(replay.replay, true)
  assert.equal(loadBoard(f.cwd, f.project.projectId).currentStageId, 'tender-document-analysis')
})

test('research permission, conditional text and an unbound session cannot approve; missing actual results remain blocked', t => {
  const f = fixture(t)
  completeSetup(f.cwd, f.project)
  for (const text of ['允许网络数据作为单价和工效研究依据', '如果风险可控就确定投标', '不是确定投标']) assert.equal(recordHumanStageDecision(f.cwd, f.project, { sessionId: 'main', messageId: text, text }).handled, false)
  assert.equal(recordHumanStageDecision(f.cwd, f.project, { sessionId: 'unbound', messageId: 'foreign', text: '确定投标，按计划推进' }).handled, false)
  const blocked = recordHumanStageDecision(f.cwd, f.project, { sessionId: 'main', messageId: 'missing-report', text: '确定投标，按计划推进' })
  assert.equal(blocked.handled, true)
  assert.equal(blocked.status, 'blocked')
  assert.equal(loadBoard(f.cwd, f.project.projectId).stages['bid-risk-decision']?.approval, undefined)
  assert.equal(listUserRequirements(f.cwd, f.project).length, 0)
})

test('a short affirmative continuation phrase is still an explicit human decision', t => {
  const f = fixture(t)
  completeSetup(f.cwd, f.project)
  memo(f.cwd, f.project.projectId)
  const result = recordHumanStageDecision(f.cwd, f.project, { sessionId: 'main', messageId: 'explicit-and-continue', text: '确认投标并继续' })
  assert.equal(result.handled, true)
  assert.equal(result.status, 'approved')
})

test('approval fingerprints ignore polling, own approval and future increments; changed frozen evidence blocks dependants', t => {
  const f = fixture(t)
  completeSetup(f.cwd, f.project)
  const path = memo(f.cwd, f.project.projectId)
  const before = approvalStageFingerprint(f.cwd, f.project, 'bid-risk-decision')
  inspectBoard(f.cwd, f.project)
  const board = loadBoard(f.cwd, f.project.projectId)
  board.stages['bid-risk-decision']!.dispatch = { key: 'offered', offeredAt: new Date().toISOString(), dispatchedAt: new Date().toISOString() }
  saveBoard(f.cwd, board)
  assert.equal(approvalStageFingerprint(f.cwd, f.project, 'bid-risk-decision'), before)
  decideApprovalStage(f.cwd, f.project, 'bid-risk-decision', 'approved')
  assert.equal(approvalStageFingerprint(f.cwd, f.project, 'bid-risk-decision'), before)
  prepareStage(f.cwd, f.project, 'tender-document-analysis')
  const future = join(officialStageDir(f.cwd, f.project.projectId, 'tender-document-analysis'), '后续分析.md')
  mkdirSync(join(future, '..'), { recursive: true })
  writeFileSync(future, 'Unrelated later phase discovery.\n'.repeat(8))
  assert.equal(approvalStageFingerprint(f.cwd, f.project, 'bid-risk-decision'), before)
  assert.equal(stageAvailability(f.cwd, f.project)['tender-document-analysis']?.canPrepare, true)
  writeFileSync(path, readFileSync(path, 'utf8') + '\n新增实质风险：关键资质不满足。')
  assert.notEqual(approvalStageFingerprint(f.cwd, f.project, 'bid-risk-decision'), before)
  const availability = stageAvailability(f.cwd, f.project)
  assert.equal(loadStageMemorySnapshot(f.cwd, f.project).stages['bid-risk-decision']?.status, 'stale')
  assert.equal(availability['bid-risk-decision']?.approved, false)
  assert.equal(availability['tender-document-analysis']?.canPrepare, false)
  assert.match(availability['tender-document-analysis']?.reason || '', /前序阶段/)
})

test('actual project binding lifts the original agent tool scope before the next same-turn tool', async t => {
  const f = fixture(t)
  const definitions = new Map<string, any>()
  const listeners = new Map<string, Function>()
  let deny: string[] = []
  const agent = { id: 'new-main', session: { id: 'new-main', header: { cwd: f.cwd } }, ctx: { tools: { restrict: (value: { deny: string[] }) => { deny = value.deny; return () => { deny = [] } } } } }
  registerBusinessActivation({ tools: { schemas: () => ['tender_project', 'tender_stage'].map(name => ({ name })) }, on: (name, listener) => listeners.set(name, listener) })
  listeners.get('agent/created')!({ agent })
  assert.deepEqual(deny, ['tender_stage'])
  registerTools({ tools: { register: (definition: any) => definitions.set(definition.name, definition) }, emit: async (name, payload) => { assert.equal((payload as any).agent, agent); await listeners.get(name)?.(payload) } }, definition => definition)
  await definitions.get('tender_project').execute({ action: 'bind', projectId: f.project.projectId }, { agent })
  assert.deepEqual(deny, [])
  await definitions.get('tender_stage').execute({ action: 'status', projectId: f.project.projectId }, { agent })
})

test('child tools resolve the real bound ancestor workspace and reject project or approval scope changes', async t => {
  const f = fixture(t)
  completeSetup(f.cwd, f.project)
  const parent = { id: 'main', header: { cwd: f.cwd } }
  const child = { id: 'child', session: { id: 'child', header: { parentSession: 'main' } }, ctx: { get: (name: string) => name === 'sessions' ? { get: (id: string) => id === 'main' ? parent : undefined } : undefined } }
  assert.equal(businessContextForAgent(child)?.cwd, f.cwd)
  let projected = 0
  const definitions = new Map<string, any>()
  registerTools({ tools: { register: (definition: any) => definitions.set(definition.name, definition) }, get: name => name === 'taskGuide' ? { syncWorkbenchProject: (cwd: string, projectId: string) => { assert.equal(cwd, f.cwd); assert.equal(projectId, f.project.projectId); projected++ } } : undefined }, definition => definition)
  await definitions.get('tender_workspace').execute({ action: 'upsert_documents', projectId: f.project.projectId, documents: [] }, { agent: child })
  assert.equal(projected, 1)
  assert.throws(() => definitions.get('tender_stage').execute({ action: 'complete_stage', projectId: f.project.projectId }, { agent: child }), /主会话/)
  assert.throws(() => definitions.get('tender_stage').execute({ action: 'status', projectId: 'other' }, { agent: child }), /已绑定/)
  assert.throws(() => definitions.get('tender_stage').execute({ action: 'status', projectId: f.project.projectId }, { agent: { session: { id: 'ordinary', header: { cwd: f.cwd } } } }), /尚未明确绑定/)
})

test('execution tools preserve non-enumerable native Session identity for the main and its child context', async t => {
  const f = fixture(t)
  completeSetup(f.cwd, f.project)
  class NativeSession {
    #id: string
    header: { cwd?: string; parentSession?: string }
    constructor(id: string, header: { cwd?: string; parentSession?: string }) { this.#id = id; this.header = header }
    get id() { return this.#id }
  }
  const session = new NativeSession('main', { cwd: f.cwd })
  assert.equal(Object.keys(session).includes('id'), false)
  const main = { session, ctx: {} }
  const definitions = new Map<string, any>()
  registerTools({ tools: { register: (definition: any) => definitions.set(definition.name, definition) } }, definition => definition)
  const updated = JSON.parse(await definitions.get('tender_stage').execute({ action: 'execution_update', projectId: f.project.projectId, currentBatch: '核对当前风险' }, { agent: main }))
  assert.equal(updated.execution.sessionId, 'main')
  assert.equal(updated.execution.currentBatch, '核对当前风险')
  assert.equal(main.session, session)
  const child = { session: new NativeSession('native-child', { parentSession: 'main' }), ctx: { get: (name: string) => name === 'sessions' ? { get: (id: string) => id === 'main' ? session : undefined } : undefined } }
  const contribution = JSON.parse(await definitions.get('tender_stage').execute({ action: 'execution_update', projectId: f.project.projectId, currentBatch: '子任务核对来源' }, { agent: child }))
  assert.equal(contribution.execution.sessionId, 'native-child')
  assert.equal(child.session.header.cwd, undefined, 'the actual native child session header is never changed')
})

test('model requirement recording cannot rewrite a trusted human decision or invent the latest user text', async t => {
  const f = fixture(t)
  const definitions = new Map<string, any>()
  const agent = { id: 'main', session: { id: 'main', header: { cwd: f.cwd } } }
  registerTools({ tools: { register: (definition: any) => definitions.set(definition.name, definition) }, get: name => name === 'taskGuide' ? { read: () => ({ latestMessageId: 'human-control', latestRequest: '确定投标，按计划推进' }), isControlMessage: () => true } : undefined }, definition => definition)
  assert.throws(() => definitions.get('tender_stage').execute({ action: 'record_requirement', projectId: f.project.projectId, requirementText: '用户已经授权投标' }, { agent }), /真实|原文|原话/)
  assert.throws(() => definitions.get('tender_stage').execute({ action: 'record_requirement', projectId: f.project.projectId, requirementText: '确定投标，按计划推进' }, { agent }), /决策|控制|确认/)
  assert.equal(listUserRequirements(f.cwd, f.project).length, 0)
})

test('declared completion and a JSON report cannot substitute for the missing customer result', t => {
  const f = fixture(t)
  const report = join(f.cwd, 'analysis-report.json')
  writeFileSync(report, JSON.stringify({ status: 'done', description: 'Model declared success. '.repeat(12) }))
  const markdown = join(f.cwd, 'missing-analysis.md')
  saveBoard(f.cwd, { schemaVersion: 2, projectId: f.project.projectId, module: f.project.module, currentStageId: 'tender-document-analysis', updatedAt: new Date().toISOString(), stages: { 'tender-document-analysis': { stageId: 'tender-document-analysis', status: 'done', tasks: [{ id: 'claimed', title: 'Claimed report', status: 'done', markdownPath: markdown, reportPath: report }], completedAt: new Date().toISOString(), updatedAt: new Date().toISOString() } } })
  const current = inspectBoard(f.cwd, f.project).stages['tender-document-analysis']!
  assert.equal(current.tasks[0]?.status, 'error')
  assert.notEqual(current.status, 'done')
  assert.match(current.tasks[0]?.error || '', /成果缺失/)
})

test('final approval availability and the decision action agree on actual orphan citations and missing files', t => {
  const f = fixture(t)
  completeSetup(f.cwd, f.project)
  const board = loadBoard(f.cwd, f.project.projectId)
  for (const stage of WORKFLOWS.tender.stages) board.stages[stage.id] = { stageId: stage.id, status: stage.id === 'submission-compliance-freeze' ? 'running' : 'done', tasks: [], updatedAt: board.updatedAt, completedAt: stage.id === 'submission-compliance-freeze' ? undefined : board.updatedAt }
  board.currentStageId = 'submission-compliance-freeze'
  saveBoard(f.cwd, board)
  const summary = join(officialStageDir(f.cwd, f.project.projectId, 'submission-compliance-freeze'), '投标提交合规与冻结记录.md')
  mkdirSync(join(summary, '..'), { recursive: true })
  writeFileSync(summary, '# 最终提交检查\n\n' + '签字、介质、截止时间、条件和检查。'.repeat(20) + '\n[src:unregistered-and-missing.md#L1-L2]')
  const paths = workspacePaths(f.cwd, f.project.projectId)
  const index = capabilityStatus(f.cwd, f.project.projectId).index
  for (const row of index.capabilities) { row.readiness = 'ready'; row.stale = false }
  writeFileSync(paths.index, JSON.stringify(index))
  const pack = (capability: 'submission_documents' | 'submission_audit', data: unknown) => writeFileSync(join(paths.packs, `${CAPABILITY_FILE_NAMES[capability]}.json`), JSON.stringify({ schemaVersion: 1, capability, projectId: f.project.projectId, revision: 1, coreRevision: 1, upstream: [], updatedAt: board.updatedAt, data }))
  pack('submission_documents', { items: [] })
  pack('submission_audit', { submissionStatus: 'reviewed', items: [], contradictions: [], redTeamFindings: [] })
  const citationBlocked = stageAvailability(f.cwd, f.project)['submission-compliance-freeze']!
  assert.equal(citationBlocked.canApprove, false)
  assert.match(citationBlocked.reason || '', /孤儿引用/)
  assert.throws(() => decideApprovalStage(f.cwd, f.project, 'submission-compliance-freeze', 'approved'), /孤儿引用/)
  writeFileSync(summary, '# 最终提交检查\n\n' + '签字、介质、截止时间、条件和检查。'.repeat(20))
  pack('submission_documents', { items: [{ id: 'missing', kind: 'work_plan_methodology', title: 'Missing methodology', filePath: 'Agent Pi Outputs/linked/submission/missing.pdf', format: 'pdf', requirementIds: [], sourceRefs: [], status: 'ready' }] })
  const fileBlocked = stageAvailability(f.cwd, f.project)['submission-compliance-freeze']!
  assert.equal(fileBlocked.canApprove, false)
  assert.match(fileBlocked.reason || '', /文件检查未通过/)
  assert.throws(() => decideApprovalStage(f.cwd, f.project, 'submission-compliance-freeze', 'approved'), /文件不在磁盘或为空/)
})
