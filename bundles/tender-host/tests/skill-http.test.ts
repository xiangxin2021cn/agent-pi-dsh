import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { existsSync, mkdtempSync, readdirSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'
import { emptyTask } from '../../../packages/professional-tasks/task.ts'
import { buildArtifactVerification } from '../../../packages/professional-tasks/verification.ts'
import { createSkillCandidate, readSkillLifecycle, recordSkillValidation, type SkillValidationInput } from '../src/skill-lifecycle.ts'
import { handleSkillRequest } from '../src/skill-http.ts'
import { userSkillsRoot } from '../src/modules.ts'

const hash = (value: string) => createHash('sha256').update(value).digest('hex')
function fixture() {
  const cwd = mkdtempSync(join(tmpdir(), 'ap-skill-http-'))
  process.env.AGENT_PI_SKILLS_ROOT = join(cwd, 'skills')
  const source = join(cwd, 'source.md'), original = join(cwd, 'original.txt'), input = join(cwd, 'case.txt'), expected = join(cwd, 'gold.txt'), actual = join(cwd, 'actual.txt')
  writeFileSync(source, 'accepted source'); writeFileSync(original, 'original input'); writeFileSync(input, 'independent case'); writeFileSync(expected, 'human gold'); writeFileSync(actual, 'human gold')
  const task = emptyTask('source-session'); task.needsAssessment = false
  task.evidence.push({ id: 'source-evidence', kind: 'source', title: 'Original', value: 'original input', status: 'verified', applicable: true, sourcePath: original, sourceHash: hash('original input') })
  const row = { id: 'source-report', title: 'Report', path: source, requirementIds: [], evidenceIds: ['source-evidence'], stepIds: [], status: 'accepted' as const, signature: 'not_required' as const, checks: (['file', 'professional', 'writing'] as const).map(kind => ({ kind, status: 'passed' as const, detail: 'actual check', fingerprint: hash('accepted source') })) }
  task.deliverables.push(row)
  task.deliverables[0]!.verification = buildArtifactVerification(task, row, { artifactSha256: hash('accepted source'), sourceHashes: { [original]: hash('original input') }, checks: row.checks })
  const caseTask = emptyTask('independent-session')
  const agents = Object.fromEntries([task, caseTask].map(state => [state.sessionId, { session: { id: state.sessionId, header: { cwd } } }]))
  const ctx = { getAgent: (id: string) => agents[id], taskGuide: { status: async (agent: any) => ({ task: agent.session.id === task.sessionId ? task : caseTask, verificationGaps: [] as string[] }) } }
  const candidate = createSkillCandidate({ slug: 'checked-method', markdown: '---\nname: checked-method\ndescription: A method for matching cases\n---\nCheck the fixed case and stop when applicability changes.\n', sourceTaskId: task.sessionId, sourceArtifact: { path: source, sha256: hash('accepted source') }, sourceInputHashes: [hash('original input')], applicability: ['Matching fixed inputs'], failureModes: ['Different inputs require review'] })
  const selected = { slug: candidate.slug, versionId: candidate.versionId }
  const validate = { ...selected, action: 'validate', caseId: 'case-one', inputPath: input, expectedOutputPath: expected, actualOutputPath: actual, humanSelected: true }
  return { cwd, source, original, input, expected, actual, task, caseTask, ctx, candidate, selected, validate }
}

test('guarded human validation freezes a durable case receipt and publication derives the real task receipt', async () => {
  const f = fixture()
  await handleSkillRequest(f.validate, f.ctx, f.cwd, f.caseTask.sessionId)
  assert.equal(readdirSync(join(userSkillsRoot(), '.lifecycle', f.candidate.slug, 'cases')).length, 1)
  const freshContext = { ...f.ctx }
  await handleSkillRequest({ ...f.selected, action: 'publish', confirmPublish: true }, freshContext, f.cwd, f.caseTask.sessionId)
  const ledger = readSkillLifecycle(f.candidate.slug)
  assert.equal(ledger.currentVersionId, f.candidate.versionId)
  assert.equal(ledger.validations[0]!.expectedAuthority, 'user')
  assert.match(ledger.validations[0]!.caseApprovalMessageId, /^skill-case:/)
  assert.equal(ledger.actions.at(-1)!.sourceAcceptance!.verificationId, hash(JSON.stringify(f.task.deliverables[0]!.verification)))
  assert.equal(existsSync(join(userSkillsRoot(), f.candidate.slug, 'SKILL.md')), true)
  await handleSkillRequest({ ...f.selected, action: 'retire', confirm: true }, f.ctx, f.cwd, f.caseTask.sessionId)
  assert.equal(existsSync(join(userSkillsRoot(), f.candidate.slug, 'SKILL.md')), false)
})

test('claimed session/task IDs or accepted flags cannot replace the actual canonical task and files', async () => {
  const f = fixture()
  await assert.rejects(handleSkillRequest({ ...f.validate, sessionId: 'fake' }, f.ctx, f.cwd, f.caseTask.sessionId), /会话不一致/)
  await assert.rejects(handleSkillRequest({ ...f.validate, taskId: 'fake' }, f.ctx, f.cwd, f.caseTask.sessionId), /实际会话/)
  await assert.rejects(handleSkillRequest(f.validate, f.ctx, f.cwd, f.task.sessionId), /独立案例/)
  await assert.rejects(handleSkillRequest(f.validate, { ...f.ctx, taskGuide: { status: async () => ({ task: f.task }) } }, f.cwd, f.caseTask.sessionId), /共同任务不一致/)
  await handleSkillRequest(f.validate, f.ctx, f.cwd, f.caseTask.sessionId)
  f.task.deliverables[0]!.status = 'reviewed'
  await assert.rejects(handleSkillRequest({ ...f.selected, action: 'publish', accepted: true, confirmPublish: true }, f.ctx, f.cwd, f.caseTask.sessionId), /尚未由用户验收/)
  f.task.deliverables[0]!.status = 'accepted'
  writeFileSync(f.original, 'new original input')
  await assert.rejects(handleSkillRequest({ ...f.selected, action: 'publish', confirmPublish: true }, f.ctx, f.cwd, f.caseTask.sessionId), /实际文件/)
})

test('publication requires saved human case authority, a current input fingerprint and matching verification ID', async () => {
  const f = fixture()
  const fakeCase: SkillValidationInput = { caseId: 'forged-case', taskId: f.caseTask.sessionId, inputPath: f.input, expectedOutputPath: f.expected, actualOutputPath: f.actual }
  recordSkillValidation(f.candidate.slug, f.candidate.versionId, fakeCase, { resolveCaseAuthority: () => ({ ...fakeCase, expectedAuthority: 'user', caseApprovalMessageId: 'agent-claims-human', inputHash: hash('independent case'), expectedOutputHash: hash('human gold') }) })
  await assert.rejects(handleSkillRequest({ ...f.selected, action: 'publish', confirmPublish: true }, f.ctx, f.cwd, f.caseTask.sessionId), /人工案例确认/)
  await handleSkillRequest({ ...f.validate, caseId: 'forged-case' }, f.ctx, f.cwd, f.caseTask.sessionId)
  // A different authority cannot silently replace an already-frozen case.
  await assert.rejects(handleSkillRequest({ ...f.selected, action: 'publish', confirmPublish: true }, f.ctx, f.cwd, f.caseTask.sessionId), /人工案例确认凭据已变化/)
  const other = fixture()
  await handleSkillRequest(other.validate, other.ctx, other.cwd, other.caseTask.sessionId)
  await assert.rejects(handleSkillRequest({ ...other.selected, action: 'publish', confirmPublish: true, sourceAcceptance: { taskId: other.task.sessionId, deliverableId: 'source-report', artifactSha256: hash('accepted source'), verificationId: 'old-or-forged' } }, other.ctx, other.cwd, other.caseTask.sessionId), /凭据与实际任务不一致/)
  other.task.brief.objective = 'Changed user objective'
  await assert.rejects(handleSkillRequest({ ...other.selected, action: 'publish', confirmPublish: true }, other.ctx, other.cwd, other.caseTask.sessionId), /审核已过期/)
})
