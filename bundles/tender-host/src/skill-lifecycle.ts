import { createHash } from 'node:crypto'
import { existsSync, readFileSync, readdirSync, rmSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { userSkillsRoot, validateUserSkill, saveUserSkill } from './modules.ts'
import { readJson, writeJson, writeNewJsonAtomic } from './fsutil.ts'

export interface SkillSourceAcceptance {
  taskId: string
  deliverableId: string
  artifactSha256: string
  verificationId: string
}
export interface SkillCandidateInput {
  slug: string
  markdown: string
  sourceTaskId: string
  sourceArtifact: {path: string; sha256: string}
  sourceInputHashes: string[]
  sourceAcceptance?: SkillSourceAcceptance
  applicability: string[]
  failureModes: string[]
}
export interface SkillVersion extends SkillCandidateInput {
  versionId: string
  markdownHash: string
  createdAt: string
}
export interface SkillValidationInput {
  caseId: string
  taskId: string
  inputPath: string
  expectedOutputPath: string
  actualOutputPath: string
}
export interface SkillValidation extends SkillValidationInput {
  expectedAuthority: 'user'
  caseApprovalMessageId: string
  versionId: string
  inputHash: string
  expectedOutputHash: string
  actualOutputHash: string
  passed: boolean
  verificationMethod: 'independent-case-exact-bytes'
  limitation: string
  at: string
}
export interface SkillCaseAuthority extends SkillValidationInput {
  expectedAuthority: 'user'
  caseApprovalMessageId: string
  inputHash: string
  expectedOutputHash: string
}
function verifyCaseAuthority(input: SkillValidationInput, authority: SkillCaseAuthority, inputHash: string, expectedOutputHash: string): void {
  if (!authority || authority.expectedAuthority!=='user' || !authority.caseApprovalMessageId?.trim() || authority.caseId!==input.caseId || authority.taskId!==input.taskId || ['inputPath','expectedOutputPath','actualOutputPath'].some(key=>resolve(authority[key as keyof SkillValidationInput])!==resolve(input[key as keyof SkillValidationInput])) || authority.inputHash!==inputHash || authority.expectedOutputHash!==expectedOutputHash) throw new Error('验证案例或独立预期缺少可信人工确认，或所选文件已变化')
}
export interface SkillLifecycle {
  schemaVersion: 1
  slug: string
  currentVersionId?: string
  versions: Array<{versionId:string;markdownHash:string;status:'candidate'|'published'|'retired'|'legacy_unvalidated'}>
  validations: SkillValidation[]
  actions: Array<{action:string;versionId:string;at:string;approvalMessageId?:string;sourceAcceptance?:SkillSourceAcceptance}>
}
const hash = (value: string | Buffer) => createHash('sha256').update(value).digest('hex')
const fileHash = (path: string) => hash(readFileSync(path))
function lifecycleDir(slug: string): string {
  if (!/^[a-z][a-z0-9-]{1,63}$/.test(slug)) throw new Error('skill slug 非法')
  return join(userSkillsRoot(),'.lifecycle',slug)
}
function versionPath(slug: string, versionId: string): string {
  if (!/^[a-f0-9]{64}$/.test(versionId)) throw new Error('技能版本非法')
  return join(lifecycleDir(slug),'versions',versionId+'.json')
}
export function readSkillLifecycle(slug: string): SkillLifecycle {
  const dir = lifecycleDir(slug)
  return readJson<SkillLifecycle>(join(dir,'ledger.json'),{schemaVersion:1,slug,versions:[],validations:[],actions:[]})
}
export function listSkillLifecycles(): SkillLifecycle[] {
  const root = join(userSkillsRoot(),'.lifecycle')
  return existsSync(root) ? readdirSync(root).filter(slug=>/^[a-z][a-z0-9-]{1,63}$/.test(slug)).map(readSkillLifecycle) : []
}
export function readSkillVersion(slug: string, versionId: string): SkillVersion {
  const version = readJson<SkillVersion | null>(versionPath(slug,versionId),null)
  if (!version || version.markdownHash!==hash(version.markdown)) throw new Error('技能版本缺失或正文已变化')
  const {versionId: _id,createdAt: _at,...payload} = version
  if (version.sourceTaskId!=='legacy-user-authored'&&hash(JSON.stringify(payload))!==versionId) throw new Error('技能版本来源或适用条件已变化')
  return version
}
function saveLedger(ledger: SkillLifecycle) { writeJson(join(lifecycleDir(ledger.slug),'ledger.json'),ledger) }
function retainLegacy(ledger: SkillLifecycle) {
  const path = join(userSkillsRoot(),ledger.slug,'SKILL.md')
  if (!existsSync(path)) return
  const markdown = readFileSync(path,'utf8'), markdownHash = hash(markdown)
  if (ledger.versions.some(row=>row.markdownHash===markdownHash)) return
  const versionId = markdownHash
  const version: SkillVersion = {slug:ledger.slug,versionId,markdown,markdownHash,createdAt:new Date().toISOString(),sourceTaskId:'legacy-user-authored',sourceArtifact:{path,sha256:markdownHash},sourceInputHashes:[],applicability:[],failureModes:[]}
  if (!existsSync(versionPath(ledger.slug,versionId))) writeNewJsonAtomic(versionPath(ledger.slug,versionId),version)
  ledger.versions.push({versionId,markdownHash,status:'legacy_unvalidated'})
  ledger.currentVersionId = versionId
}
export function createSkillCandidate(input: SkillCandidateInput): SkillVersion {
  const validated = validateUserSkill(input.slug,input.markdown)
  if (!input.sourceTaskId?.trim() || !input.applicability?.length || !input.failureModes?.length || [...input.applicability,...input.failureModes].some(row=>!String(row).trim())) throw new Error('候选技能需要来源任务、适用前提及失败条件')
  if (!/^[a-f0-9]{64}$/.test(input.sourceArtifact.sha256) || fileHash(input.sourceArtifact.path)!==input.sourceArtifact.sha256) throw new Error('候选技能来源成果指纹不符')
  if (!input.sourceInputHashes?.length || input.sourceInputHashes.some(row=>!/^[a-f0-9]{64}$/.test(row))) throw new Error('候选技能需要原任务输入指纹')
  const payload = {...input,...validated,sourceArtifact:{path:resolve(input.sourceArtifact.path),sha256:input.sourceArtifact.sha256},markdownHash:hash(validated.markdown)}
  const versionId = hash(JSON.stringify(payload)), version: SkillVersion = {...payload,versionId,createdAt:new Date().toISOString()}
  const ledger = readSkillLifecycle(input.slug)
  retainLegacy(ledger)
  if (!existsSync(versionPath(input.slug,versionId))) writeNewJsonAtomic(versionPath(input.slug,versionId),version)
  if (!ledger.versions.some(row=>row.versionId===versionId)) ledger.versions.push({versionId,markdownHash:version.markdownHash,status:'candidate'})
  saveLedger(ledger)
  return readSkillVersion(input.slug,versionId)
}
export function recordSkillValidation(slug: string, versionId: string, input: SkillValidationInput, options: {resolveCaseAuthority: (input: SkillValidationInput)=>SkillCaseAuthority}): SkillValidation {
  const version = readSkillVersion(slug,versionId), ledger = readSkillLifecycle(slug)
  if (!input.caseId?.trim() || !input.taskId?.trim() || input.taskId===version.sourceTaskId || input.caseId===version.sourceTaskId) throw new Error('验证必须使用独立案例及其他任务')
  const inputHash = fileHash(input.inputPath), expectedOutputHash = fileHash(input.expectedOutputPath), actualOutputHash = fileHash(input.actualOutputPath)
  if (typeof options?.resolveCaseAuthority!=='function') throw new Error('案例验证仅允许宿主确认的人工案例')
  const authority = options.resolveCaseAuthority(input)
  verifyCaseAuthority(input,authority,inputHash,expectedOutputHash)
  if (version.sourceInputHashes.includes(inputHash) || inputHash===version.sourceArtifact.sha256 || inputHash===version.markdownHash) throw new Error('验证案例不能复用原任务输入或候选成果')
  if (resolve(input.expectedOutputPath)===resolve(input.actualOutputPath)) throw new Error('实际输出和独立预期不能是同一文件')
  const existing = ledger.validations.find(row=>row.versionId===versionId&&row.caseId===input.caseId)
  if (existing) {
    if (existing.inputHash===inputHash&&existing.expectedOutputHash===expectedOutputHash&&existing.actualOutputHash===actualOutputHash) return existing
    throw new Error('案例验证记录已冻结；重试需要新的 caseId')
  }
  const record: SkillValidation = {...input,versionId,expectedAuthority:'user',caseApprovalMessageId:authority.caseApprovalMessageId,inputPath:resolve(input.inputPath),expectedOutputPath:resolve(input.expectedOutputPath),actualOutputPath:resolve(input.actualOutputPath),inputHash,expectedOutputHash,actualOutputHash,passed:expectedOutputHash===actualOutputHash,verificationMethod:'independent-case-exact-bytes',limitation:'只证明登记的固定案例输出与人工选定的独立预期字节一致；不证明任意任务的语义质量或自动执行效果。',at:new Date().toISOString()}
  ledger.validations.push(record);saveLedger(ledger)
  return record
}
export async function publishSkillVersion(slug: string, versionId: string, options: {
  approvalMessageId: string
  sourceAcceptance?: SkillSourceAcceptance
  /** Host-owned lookup; never an agent-provided accepted=true flag. */
  resolveSourceAcceptance: (receipt: SkillSourceAcceptance) => Promise<{accepted:boolean;artifactSha256:string;inputHashes:string[]}> | {accepted:boolean;artifactSha256:string;inputHashes:string[]}
  resolveCaseAuthority: (validation: SkillValidation)=>SkillCaseAuthority
}): Promise<SkillLifecycle> {
  if (!options.approvalMessageId?.trim() || typeof options.resolveSourceAcceptance!=='function' || typeof options.resolveCaseAuthority!=='function') throw new Error('发布技能需要明确人工批准、人工案例及宿主验收查询')
  const version = readSkillVersion(slug,versionId)
  const receipt = options.sourceAcceptance || version.sourceAcceptance
  if (!receipt || receipt.taskId!==version.sourceTaskId || receipt.artifactSha256!==version.sourceArtifact.sha256 || !receipt.verificationId || !receipt.deliverableId) throw new Error('来源任务验收凭据不完整或版本不符')
  const acceptance = await options.resolveSourceAcceptance(receipt)
  if (!acceptance.accepted || acceptance.artifactSha256!==version.sourceArtifact.sha256 || fileHash(version.sourceArtifact.path)!==version.sourceArtifact.sha256 || !acceptance.inputHashes?.length) throw new Error('源任务成果尚未由用户验收，或输入/成果已变化')
  const ledger = readSkillLifecycle(slug), row = ledger.versions.find(row=>row.versionId===versionId)
  if (!row || !['candidate','published'].includes(row.status)) throw new Error('候选版本不存在或已退役')
  const cases = ledger.validations.filter(item=>item.versionId===versionId)
  if (!cases.length || cases.some(item=>!item.passed || fileHash(item.inputPath)!==item.inputHash || fileHash(item.expectedOutputPath)!==item.expectedOutputHash || fileHash(item.actualOutputPath)!==item.actualOutputHash || acceptance.inputHashes.includes(item.inputHash))) throw new Error('独立案例未通过、与原任务重复或验证文件已变化')
  for (const item of cases) {
    const authority = options.resolveCaseAuthority(item)
    verifyCaseAuthority(item,authority,item.inputHash,item.expectedOutputHash)
    if (authority.caseApprovalMessageId!==item.caseApprovalMessageId) throw new Error('人工案例确认凭据已变化')
  }
  retainLegacy(ledger)
  saveUserSkill(slug,version.markdown)
  row.status='published';ledger.currentVersionId=versionId
  ledger.actions.push({action:'publish',versionId,approvalMessageId:options.approvalMessageId,sourceAcceptance:receipt,at:new Date().toISOString()});saveLedger(ledger)
  return ledger
}
export function rollbackSkillVersion(slug: string, versionId: string, approvalMessageId: string): SkillLifecycle {
  if (!approvalMessageId?.trim()) throw new Error('回滚需要明确人工决定')
  const ledger = readSkillLifecycle(slug), row = ledger.versions.find(row=>row.versionId===versionId)
  if (!row || !['published','legacy_unvalidated'].includes(row.status)) throw new Error('只能回滚到既有发布版或旧用户版本')
  retainLegacy(ledger)
  saveUserSkill(slug,readSkillVersion(slug,versionId).markdown);ledger.currentVersionId=versionId
  ledger.actions.push({action:'rollback',versionId,approvalMessageId,at:new Date().toISOString()});saveLedger(ledger)
  return ledger
}
export function retireSkillVersion(slug: string, versionId: string, approvalMessageId: string): SkillLifecycle {
  if (!approvalMessageId?.trim()) throw new Error('退役需要明确人工决定')
  const ledger = readSkillLifecycle(slug), row = ledger.versions.find(row=>row.versionId===versionId)
  if (!row) throw new Error('技能版本不存在')
  if (ledger.currentVersionId===versionId) {
    const path = join(userSkillsRoot(),slug,'SKILL.md')
    if (existsSync(path)&&fileHash(path)===row.markdownHash) rmSync(path)
    ledger.currentVersionId=undefined
  }
  row.status='retired';ledger.actions.push({action:'retire',versionId,approvalMessageId,at:new Date().toISOString()});saveLedger(ledger)
  return ledger
}
