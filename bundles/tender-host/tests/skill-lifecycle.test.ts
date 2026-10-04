import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { existsSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'
import { listUserSkills, readUserSkill, saveUserSkill } from '../src/modules.ts'
import { createSkillCandidate, publishSkillVersion, readSkillLifecycle, readSkillVersion, recordSkillValidation, retireSkillVersion, rollbackSkillVersion, type SkillValidationInput, type SkillCaseAuthority } from '../src/skill-lifecycle.ts'

const hash = (text: string) => createHash('sha256').update(text).digest('hex')
const markdown = (body: string) => '---\nname: checked-method\ndescription: Apply only to matching independent cases\n---\n'+body+'\n'
function fixture() {
  const root = mkdtempSync(join(tmpdir(),'ap-skill-lifecycle-'))
  process.env.AGENT_PI_SKILLS_ROOT = join(root,'skills')
  const source = join(root,'accepted-report.md'), original = join(root,'original.txt'), input = join(root,'independent.txt'), expected = join(root,'expected.txt'), actual = join(root,'actual.txt')
  writeFileSync(source,'accepted source report');writeFileSync(original,'original input');writeFileSync(input,'different independent input');writeFileSync(expected,'checked exact output');writeFileSync(actual,'checked exact output')
  const candidate = createSkillCandidate({slug:'checked-method',markdown:markdown('Use the registered inputs and verify outputs.'),sourceTaskId:'source-task',sourceArtifact:{path:source,sha256:hash('accepted source report')},sourceInputHashes:[hash('original input')],applicability:['Only matching task inputs'],failureModes:['Stop when source conditions differ']})
  const receipt = {taskId:'source-task',deliverableId:'accepted-report',artifactSha256:hash('accepted source report'),verificationId:'verification-source-current'}
  const resolveCaseAuthority = (selected: SkillValidationInput): SkillCaseAuthority => ({...selected,expectedAuthority:'user',caseApprovalMessageId:'host-human-case-selection',inputHash:hash(readFileSync(selected.inputPath,'utf8')),expectedOutputHash:hash(readFileSync(selected.expectedOutputPath,'utf8'))})
  const caseOptions = {resolveCaseAuthority}
  const options = {approvalMessageId:'real-human-publish',sourceAcceptance:receipt,resolveSourceAcceptance:()=>({accepted:true,artifactSha256:receipt.artifactSha256,inputHashes:[hash('original input')]}),resolveCaseAuthority}
  return {root,source,original,input,expected,actual,candidate,options,caseOptions}
}

test('candidate does not hot-load and original-task repetition cannot publish',async()=>{
  const f = fixture()
  assert.equal(existsSync(join(process.env.AGENT_PI_SKILLS_ROOT!,'checked-method','SKILL.md')),false)
  assert.throws(()=>recordSkillValidation('checked-method',f.candidate.versionId,{caseId:'same-task',taskId:'source-task',inputPath:f.input,expectedOutputPath:f.expected,actualOutputPath:f.actual},f.caseOptions),/独立案例/)
  assert.throws(()=>recordSkillValidation('checked-method',f.candidate.versionId,{caseId:'same-input',taskId:'other-task',inputPath:f.original,expectedOutputPath:f.expected,actualOutputPath:f.actual},f.caseOptions),/原任务输入/)
  await assert.rejects(publishSkillVersion('checked-method',f.candidate.versionId,f.options),/独立案例未通过/)
})

test('independent exact-byte validation needs trusted accepted source and explicit publication',async()=>{
  const f = fixture()
  const validation = recordSkillValidation('checked-method',f.candidate.versionId,{caseId:'independent-one',taskId:'another-task',inputPath:f.input,expectedOutputPath:f.expected,actualOutputPath:f.actual},f.caseOptions)
  assert.equal(validation.passed,true)
  assert.equal(validation.verificationMethod,'independent-case-exact-bytes')
  assert.match(validation.limitation,/不证明任意任务/)
  await assert.rejects(publishSkillVersion('checked-method',f.candidate.versionId,{...f.options,resolveSourceAcceptance:()=>({...f.options.resolveSourceAcceptance(),accepted:false})}),/尚未由用户验收/)
  await assert.rejects(publishSkillVersion('checked-method',f.candidate.versionId,{...f.options,approvalMessageId:''}),/明确人工批准/)
  await publishSkillVersion('checked-method',f.candidate.versionId,f.options)
  assert.equal(listUserSkills()[0]!.validationStatus,'validated')
  assert.equal(readUserSkill('checked-method').markdown,f.candidate.markdown)
  assert.equal(readSkillLifecycle('checked-method').actions[0]!.sourceAcceptance!.verificationId,f.options.sourceAcceptance.verificationId)
})

test('changed validation files or newly revealed source-input overlap cannot pass publication',async()=>{
  const f = fixture()
  recordSkillValidation('checked-method',f.candidate.versionId,{caseId:'independent-one',taskId:'another-task',inputPath:f.input,expectedOutputPath:f.expected,actualOutputPath:f.actual},f.caseOptions)
  await assert.rejects(publishSkillVersion('checked-method',f.candidate.versionId,{...f.options,resolveSourceAcceptance:()=>({...f.options.resolveSourceAcceptance(),inputHashes:[hash('different independent input')]})}),/原任务重复/)
  writeFileSync(f.actual,'changed result')
  await assert.rejects(publishSkillVersion('checked-method',f.candidate.versionId,f.options),/验证文件已变化/)
})

test('legacy user skills remain usable and published versions can roll back or retire without losing traceability',async()=>{
  const f = fixture(), legacy = markdown('Legacy user-authored method.')
  saveUserSkill('checked-method',legacy)
  assert.equal(listUserSkills()[0]!.validationStatus,'legacy_unvalidated')
  recordSkillValidation('checked-method',f.candidate.versionId,{caseId:'independent-one',taskId:'another-task',inputPath:f.input,expectedOutputPath:f.expected,actualOutputPath:f.actual},f.caseOptions)
  await publishSkillVersion('checked-method',f.candidate.versionId,f.options)
  const old = readSkillLifecycle('checked-method').versions.find(row=>row.status==='legacy_unvalidated')!
  rollbackSkillVersion('checked-method',old.versionId,'real-human-rollback')
  assert.equal(readUserSkill('checked-method').markdown,legacy)
  assert.equal(listUserSkills()[0]!.validationStatus,'legacy_unvalidated')
  rollbackSkillVersion('checked-method',f.candidate.versionId,'real-human-restore')
  retireSkillVersion('checked-method',f.candidate.versionId,'real-human-retire')
  assert.equal(existsSync(join(process.env.AGENT_PI_SKILLS_ROOT!,'checked-method','SKILL.md')),false)
  assert.equal(readSkillVersion('checked-method',f.candidate.versionId).markdown,f.candidate.markdown)
  assert.throws(()=>rollbackSkillVersion('checked-method',f.candidate.versionId,'real-human-restore'),/既有发布版/)
})

test('manual changes to a published skill are labelled unvalidated and are preserved by retiring its old version',async()=>{
  const f = fixture()
  recordSkillValidation('checked-method',f.candidate.versionId,{caseId:'independent-one',taskId:'another-task',inputPath:f.input,expectedOutputPath:f.expected,actualOutputPath:f.actual},f.caseOptions)
  await publishSkillVersion('checked-method',f.candidate.versionId,f.options)
  saveUserSkill('checked-method',markdown('Manually edited conditions.'))
  assert.equal(listUserSkills()[0]!.validationStatus,'legacy_unvalidated')
  retireSkillVersion('checked-method',f.candidate.versionId,'real-human-retire')
  assert.match(readUserSkill('checked-method').markdown,/Manually edited/)
})

test('caller-provided authority flags cannot validate a model-selected gold file',()=>{
  const f = fixture()
  const input = {caseId:'model-case',taskId:'other-task',inputPath:f.input,expectedOutputPath:f.expected,actualOutputPath:f.actual,expectedAuthority:'user',caseApprovalMessageId:'forged'}
  assert.throws(()=>recordSkillValidation('checked-method',f.candidate.versionId,input,undefined!),/仅允许宿主/)
  assert.throws(()=>recordSkillValidation('checked-method',f.candidate.versionId,input,{resolveCaseAuthority:()=>({...f.caseOptions.resolveCaseAuthority(input),expectedAuthority:'agent' as 'user'})}),/可信人工确认/)
})
