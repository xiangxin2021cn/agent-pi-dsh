import { createHash, randomUUID } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { isAbsolute, join, resolve } from 'node:path'
import { verificationCurrent } from '../../../packages/professional-tasks/verification.ts'
import type { ProfessionalTask } from '../../../packages/professional-tasks/types.ts'
import { readJson, writeNewJsonAtomic } from './fsutil.ts'
import { listUserSkills, userSkillsRoot } from './modules.ts'
import { listSkillLifecycles, publishSkillVersion, readSkillLifecycle, readSkillVersion, recordSkillValidation, retireSkillVersion, rollbackSkillVersion, type SkillCaseAuthority, type SkillSourceAcceptance, type SkillValidationInput, type SkillVersion } from './skill-lifecycle.ts'

export interface SkillHttpContext {
  taskGuide?: { status: (agent: any) => Promise<{ task: ProfessionalTask; verificationGaps?: string[] }> }
  getAgent?: (sessionId: string) => any | Promise<any>
}
const hash = (value: string | Buffer) => createHash('sha256').update(value).digest('hex')
const fileHash = (path: string) => hash(readFileSync(path))
const pathKey = (path: string) => resolve(path).replace(/\\/g, '/').toLowerCase()
const inCwd = (cwd: string, path: string) => isAbsolute(path) ? resolve(path) : resolve(cwd, path)
const proofId = (value: unknown) => hash(JSON.stringify(value))
const sameReceipt = (left: SkillSourceAcceptance, right: SkillSourceAcceptance) => ['taskId', 'deliverableId', 'artifactSha256', 'verificationId'].every(key => left[key as keyof SkillSourceAcceptance] === right[key as keyof SkillSourceAcceptance])

async function taskContext(ctx: SkillHttpContext, sessionId: string, expectedCwd?: string) {
  if (!sessionId || !ctx.taskGuide || !ctx.getAgent) throw new Error('技能审核需要可读取的原生任务会话。')
  const agent = await ctx.getAgent(sessionId)
  if (agent?.session?.id !== sessionId) throw new Error('所选会话与实际执行者不一致。')
  const cwd = agent.session.header?.cwd
  if (!cwd || expectedCwd && pathKey(cwd) !== pathKey(expectedCwd)) throw new Error('所选会话与当前工作目录不一致。')
  const status = await ctx.taskGuide.status(agent)
  if (status.task.sessionId !== sessionId) throw new Error('所选会话与共同任务不一致，请使用主会话。')
  return { ...status, agent, cwd }
}

async function sourceProof(ctx: SkillHttpContext, version: SkillVersion) {
  const status = await taskContext(ctx, version.sourceTaskId)
  const row = status.task.deliverables.find(row => pathKey(inCwd(status.cwd, row.path)) === pathKey(version.sourceArtifact.path))
  if (!row?.verification || row.status !== 'accepted') throw new Error('来源成果尚未由用户验收。')
  const actualHashes: Record<string, string | null> = {}
  for (const path of [row.path, ...Object.keys(row.verification.sourceHashes)]) {
    try { actualHashes[path] = fileHash(inCwd(status.cwd, path)) } catch { actualHashes[path] = null }
  }
  const current = verificationCurrent(status.task, row, actualHashes)
  if (!current.ready || status.verificationGaps?.length) throw new Error('来源成果审核已过期或实际文件无法确认：' + current.reasons.join('；'))
  const receipt: SkillSourceAcceptance = { taskId: status.task.sessionId, deliverableId: row.id, artifactSha256: row.verification.artifactSha256!, verificationId: proofId(row.verification) }
  if (receipt.artifactSha256 !== version.sourceArtifact.sha256) throw new Error('候选技能与来源成果当前版本不一致。')
  if (version.sourceAcceptance && !sameReceipt(receipt, version.sourceAcceptance)) throw new Error('候选技能绑定的来源验收凭据已变化，请创建新候选版本。')
  return { receipt, accepted: true, artifactSha256: receipt.artifactSha256, inputHashes: Object.values(row.verification.sourceHashes).filter((value): value is string => !!value) }
}

function casePath(slug: string, versionId: string, caseId: string) {
  readSkillVersion(slug, versionId)
  return join(userSkillsRoot(), '.lifecycle', slug, 'cases', proofId({ versionId, caseId }) + '.json')
}
function resolveCase(slug: string, versionId: string, input: SkillValidationInput): SkillCaseAuthority {
  const authority = readJson<SkillCaseAuthority | null>(casePath(slug, versionId, input.caseId), null)
  if (!authority) throw new Error('没有已保存的人工案例确认记录。')
  return authority
}

/** Called only by the guarded human module-management HTTP route, never by model tools. */
export async function handleSkillRequest(body: Record<string, any>, ctx: SkillHttpContext, cwd: string, sessionId: string) {
  const action = String(body.action || 'list'), slug = String(body.slug || ''), versionId = String(body.versionId || '')
  if (body.sessionId && body.sessionId !== sessionId) throw new Error('请求会话不一致。')
  if (action === 'list') return { skills: listUserSkills(), lifecycles: listSkillLifecycles(), sessionId }
  if (action === 'read') {
    const lifecycle = readSkillLifecycle(slug), version = readSkillVersion(slug, versionId)
    let sourceReady = false, sourceReason = ''
    try { await sourceProof(ctx, version); sourceReady = true } catch (error) { sourceReason = String((error as Error).message || error) }
    return { lifecycle, version, sourceReady, sourceReason }
  }
  await taskContext(ctx, sessionId, cwd)
  if (body.sourceTaskId && body.sourceTaskId !== readSkillVersion(slug, versionId).sourceTaskId) throw new Error('请求的来源任务与候选版本不一致。')
  if (action === 'validate') {
    if (body.humanSelected !== true) throw new Error('请明确确认这些文件来自人工选定的独立案例和预期。')
    if (body.taskId && body.taskId !== sessionId) throw new Error('案例任务必须是当前实际会话。')
    const input: SkillValidationInput = { caseId: String(body.caseId || '').trim(), taskId: sessionId, inputPath: inCwd(cwd, String(body.inputPath || '')), expectedOutputPath: inCwd(cwd, String(body.expectedOutputPath || '')), actualOutputPath: inCwd(cwd, String(body.actualOutputPath || '')) }
    const existing = readJson<SkillCaseAuthority | null>(casePath(slug, versionId, input.caseId), null)
    const authority: SkillCaseAuthority = existing || { ...input, expectedAuthority: 'user', caseApprovalMessageId: `skill-case:${randomUUID()}`, inputHash: fileHash(input.inputPath), expectedOutputHash: fileHash(input.expectedOutputPath) }
    const validation = recordSkillValidation(slug, versionId, input, { resolveCaseAuthority: () => authority })
    if (!existing) writeNewJsonAtomic(casePath(slug, versionId, input.caseId), authority)
    return { validation, lifecycle: readSkillLifecycle(slug) }
  }
  if (action === 'publish') {
    if (body.confirmPublish !== true) throw new Error('请明确批准发布，并确认固定案例验证的适用范围。')
    const proof = await sourceProof(ctx, readSkillVersion(slug, versionId))
    if (body.sourceAcceptance && !sameReceipt(body.sourceAcceptance, proof.receipt)) throw new Error('客户端提供的验收凭据与实际任务不一致。')
    const lifecycle = await publishSkillVersion(slug, versionId, { approvalMessageId: `skill-publish:${randomUUID()}`, sourceAcceptance: proof.receipt,
      resolveSourceAcceptance: async receipt => {
        const current = await sourceProof(ctx, readSkillVersion(slug, versionId))
        if (!sameReceipt(receipt, current.receipt)) throw new Error('发布期间来源审核凭据已变化。')
        return current
      }, resolveCaseAuthority: input => resolveCase(slug, versionId, input) })
    return { lifecycle }
  }
  if (action === 'rollback' || action === 'retire') {
    if (body.confirm !== true) throw new Error('请明确确认这次技能版本操作。')
    const approvalId = `skill-${action}:${randomUUID()}`
    return { lifecycle: action === 'rollback' ? rollbackSkillVersion(slug, versionId, approvalId) : retireSkillVersion(slug, versionId, approvalId) }
  }
  throw new Error('不支持的技能操作。')
}
