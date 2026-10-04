import assert from 'node:assert/strict'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'
import { createBusinessProject } from '../../../packages/business-projects/index.ts'
import { approvalStageFingerprint, bindProjectSession, decideApprovalStage, loadBoard, projectForBoundSession, recordProjectUserRequirement, saveBoard } from '../src/orchestration.ts'
import { businessProjectForAgent } from '../src/business-activation.ts'
import { listUserRequirements, loadUserRequirementLedger, setPendingTaskSync, updateUserRequirement } from '../src/user-requirements.ts'

function fixture(t: any) {
  const cwd = mkdtempSync(join(tmpdir(), 'task-project-sync-'))
  t.after(() => rmSync(cwd, { recursive: true, force: true }))
  const source = join(cwd, 'source.md')
  writeFileSync(source, '# 项目输入\n工期为 120 天。')
  const workflow = { id: 'inspection-main', module: 'inspection', label: 'Inspection', labelZh: '项目检查', projectGoal: '形成可靠的实施决策', terminalDeliverables: ['决策报告'], stages: [{ id: 'decision', label: 'Decision', labelZh: '人工决策', hintZh: '', prompt: '审阅当前项目材料后提交用户决策。', skillSlugs: [], approvalGate: { promptZh: '是否采用当前建议？', approveLabelZh: '采用', rejectLabelZh: '退回' } }] }
  const project = createBusinessProject({ workspaceRootPath: cwd, rootPath: cwd, createDirectory: false, module: workflow.module, projectId: 'inspection', name: '当前项目', workflowId: workflow.id, workflowSnapshot: workflow, inputPaths: [source] })
  saveBoard(cwd, { schemaVersion: 2, projectId: project.projectId, module: project.module, currentStageId: 'decision', stages: { decision: { stageId: 'decision', status: 'running', tasks: [], updatedAt: '2026-10-04T12:00:00Z' } }, updatedAt: '2026-10-04T12:00:00Z' })
  return { cwd, source, project }
}

test('a pending common-task sync blocks both approval and rejection before an empty old ledger can pass', (t) => {
  const f = fixture(t)
  bindProjectSession(f.cwd, f.project, 'main', 'decision')
  setPendingTaskSync(f.cwd, f.project, 'main', { id: 'change-one', text: '变更工期条件', messageId: 'human-one', stageId: 'decision' })
  assert.deepEqual(listUserRequirements(f.cwd, f.project), [])
  for (const decision of ['approved', 'rejected'] as const) assert.throws(() => decideApprovalStage(f.cwd, f.project, 'decision', decision), /尚未同步到项目要求/)
  assert.equal(loadBoard(f.cwd, f.project.projectId, f.project.module).stages.decision.status, 'running')
  setPendingTaskSync(f.cwd, f.project, 'main')
  assert.deepEqual(loadUserRequirementLedger(f.cwd, f.project).pendingTaskSync, {})
  assert.equal(decideApprovalStage(f.cwd, f.project, 'decision', 'rejected', '用户决定退回修订').state.status, 'blocked')
})

test('replaying the same admitted human message does not reactivate an accepted requirement or reset a frozen stage', (t) => {
  const f = fixture(t)
  const input = { sessionId: 'main', stageId: 'decision', text: '补充现场资源限制。', messageId: 'human-change-one' }
  const first = recordProjectUserRequirement(f.cwd, f.project, input)
  updateUserRequirement(f.cwd, f.project, first.requirement.id, 'accepted', { note: '用户确认该修改已落实。' })
  const board = loadBoard(f.cwd, f.project.projectId, f.project.module)
  board.stages.decision.status = 'done'
  board.stages.decision.approval = { decision: 'approved', decidedAt: '2026-10-04T13:00:00Z' }
  saveBoard(f.cwd, board)
  const repeated = recordProjectUserRequirement(f.cwd, f.project, input)
  assert.equal(repeated.requirement.status, 'accepted')
  assert.deepEqual(repeated.board, board)
  assert.equal(listUserRequirements(f.cwd, f.project).length, 1)
  const newMessage = recordProjectUserRequirement(f.cwd, f.project, { ...input, messageId: 'human-change-two' })
  assert.equal(newMessage.requirement.status, 'active', 'a distinct later human request still creates actual work')
  assert.equal(listUserRequirements(f.cwd, f.project).length, 2)
})

test('a cwd containing a project leaves ordinary chat unbound while explicitly bound children inherit the project', (t) => {
  const f = fixture(t)
  const parent = { id: 'main', header: { cwd: f.cwd } }
  assert.equal(projectForBoundSession(f.cwd, parent.id), null)
  assert.equal(businessProjectForAgent({ session: parent }), null)
  bindProjectSession(f.cwd, f.project, parent.id, 'decision')
  const child = { id: 'child', header: { cwd: f.cwd, parentSession: parent.id } }
  assert.equal(businessProjectForAgent({ session: child })?.projectId, f.project.projectId)
  assert.equal(businessProjectForAgent({ session: { id: 'unrelated', header: { cwd: f.cwd } } }), null)
})

test('stage approval fingerprint binds real source and report bytes to the displayed stage decision', (t) => {
  const f = fixture(t)
  const report = join(f.cwd, 'report.md')
  writeFileSync(report, '# 当前建议\n尚需补足资源。')
  const board = loadBoard(f.cwd, f.project.projectId, f.project.module)
  board.stages.decision.tasks = [{ id: 'review-report', title: '报告审阅', status: 'done', reportPath: report }]
  saveBoard(f.cwd, board)
  const original = approvalStageFingerprint(f.cwd, f.project, 'decision')
  assert.equal(approvalStageFingerprint(f.cwd, f.project, 'decision'), original)
  writeFileSync(report, '# 修改后的建议\n资源已补足。')
  const reportChanged = approvalStageFingerprint(f.cwd, f.project, 'decision')
  assert.notEqual(reportChanged, original)
  writeFileSync(f.source, '# 新补遗\n工期为 90 天。')
  assert.notEqual(approvalStageFingerprint(f.cwd, f.project, 'decision'), reportChanged)
})
