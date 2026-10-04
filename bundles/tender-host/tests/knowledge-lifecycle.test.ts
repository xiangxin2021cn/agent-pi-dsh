import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'
import { createBusinessProject } from '../../../packages/business-projects/index.ts'
import { addKbContent, formatSelectedKbContext, listKbVersions, readKbChunk, removeKbEntry, saveKbMarkdown, searchKb, setKbTaskSlugs, updateKbMetadata } from '../src/kb.ts'
import { auditProjectCitations, extractCitationTokens, recordCitationSupport, verifyCitationToken } from '../src/citations.ts'
import { assessEvidence } from '../src/evidence.ts'
import { officialStageDir } from '../src/outputs.ts'
import { restoreSetupSource } from '../src/setup-restore.ts'

const hash = (value: string | Buffer) => createHash('sha256').update(value).digest('hex')
function fixture() {
  const cwd = mkdtempSync(join(tmpdir(),'ap-knowledge-lifecycle-'))
  process.env.AGENT_PI_KB_ROOT = join(cwd,'kb')
  const source = join(cwd,'原始条款.md')
  writeFileSync(source,'# 原始条款\n项目工期为 90 天。\n')
  const project = createBusinessProject({workspaceRootPath:cwd,module:'tender',projectId:'knowledge-case',name:'Knowledge case',rootPath:cwd,workflowId:'tender-main',inputPaths:[source]})
  const output = join(officialStageDir(cwd,project.projectId,'tender-document-analysis'),'report.md')
  mkdirSync(join(output,'..'),{recursive:true})
  return {cwd,source,project,output}
}

test('knowledge updates retain exact old versions and new searches respect date and region',()=>{
  const {cwd,project} = fixture()
  const old = addKbContent({fileName:'工期规范.md',slug:'time-standard',text:'# 工期\n项目工期为 120 天。\n',metadata:{sourceKind:'original',regions:['CN'],validFrom:'2020-01-01',validUntil:'2025-12-31'}})
  const oldVersion = old.entry.versionId!
  const oldRead = readKbChunk(old.entry.slug,listKbVersions(old.entry.slug)[0]!.manifest.chunks[0]!.id,oldVersion)
  const token = extractCitationTokens(oldRead.citation)[0]!
  assert.equal(token.versionId,oldVersion)
  assert.equal(verifyCitationToken(cwd,project,token),null)
  assert.equal(searchKb('120 天',{slugs:['time-standard'],region:'CN',asOf:'2026-02-06'}).length,0)
  saveKbMarkdown('time-standard','# 工期\n项目工期为 90 天。\n')
  const current = updateKbMetadata('time-standard',{sourceKind:'original',regions:['CN'],validFrom:'2026-01-01',validUntil:'2028-12-31',supersedes:[oldVersion]})
  assert.notEqual(current.versionId,oldVersion)
  assert.match(readKbChunk('time-standard',oldRead.chunkId,oldVersion).text,/120 天/)
  assert.ok(searchKb('90 天',{slugs:['time-standard'],region:'CN',asOf:'2026-02-06'}).length)
  assert.equal(searchKb('90 天',{slugs:['time-standard'],region:'ZA',asOf:'2026-02-06'}).length,0)
  assert.equal(searchKb('90 天',{slugs:['time-standard'],asOf:'2026-02-06'})[0]!.applicability!.status,'uncertain')
  removeKbEntry('time-standard')
  assert.equal(verifyCitationToken(cwd,project,token),null,'historical citations survive removal of the active entry')
  assert.match(readKbChunk('time-standard',oldRead.chunkId,oldVersion).text,/120 天/)
})

test('citation existence does not imply support and an explicit contradictory review stays visible',()=>{
  const {cwd,source,project,output} = fixture()
  const citation = '[src:原始条款.md#L2]'
  writeFileSync(output,'# 分析\n工期为 120 天。 '+citation+'\n')
  assert.equal(verifyCitationToken(cwd,project,extractCitationTokens(citation)[0]!),null)
  assert.equal(auditProjectCitations(cwd,project).support!.uncertain,1)
  recordCitationSupport(cwd,project,{id:'contradiction',artifactPath:output,claim:'工期为 120 天。',citation,verdict:'unsupported',reason:'原文给出 90 天，并非报告中的 120 天。',reviewer:'independent-human-review',independentEvidence:[{citation,quote:'项目工期为 90 天。'}]})
  const audit = auditProjectCitations(cwd,project)
  assert.equal(audit.orphans.length,0)
  assert.equal(audit.support!.unsupported,1)
  writeFileSync(source,'# 原始条款\n项目工期为 60 天。\n')
  assert.equal(auditProjectCitations(cwd,project).support!.uncertain,1,'old review does not validate a replaced source')
})

test('explicitly clearing validity creates a new version and selected context preserves returned version tokens',()=>{
  fixture()
  const added = addKbContent({fileName:'applicable.md',slug:'validity-note',text:'# Scope\nApplicable requirement.\n',metadata:{sourceKind:'original',validFrom:'2026-01-01',validUntil:'2026-12-31'}})
  const oldVersion = added.entry.versionId!
  assert.equal(updateKbMetadata(added.entry.slug,{regions:['CN']}).validUntil,'2026-12-31','omitted fields retain prior dates')
  const current = updateKbMetadata(added.entry.slug,{validFrom:'',validUntil:''})
  assert.equal(current.validFrom,undefined);assert.equal(current.validUntil,undefined)
  assert.notEqual(current.versionId,oldVersion)
  assert.equal(listKbVersions(added.entry.slug).find(row=>row.versionId===oldVersion)!.entry.validUntil,'2026-12-31')
  setKbTaskSlugs('selected-source-session',[added.entry.slug])
  const context = formatSelectedKbContext('selected-source-session')
  assert.match(context,/exact returned citation token, including @version/)
  assert.doesNotMatch(context,/Cite \[kb:slug:chunkId\]/)
})

test('generated artifacts and generated knowledge cannot support their own factual conclusions',()=>{
  const {cwd,project,output} = fixture()
  const generated = addKbContent({fileName:'生成总结.md',slug:'generated-note',text:'# 总结\n项目工期为 90 天。\n',metadata:{sourceKind:'generated'}})
  assert.equal(updateKbMetadata(generated.entry.slug,{regions:['CN']}).sourceKind,'generated')
  assert.throws(()=>updateKbMetadata(generated.entry.slug,{sourceKind:'original'}),/重标类型/)
  assert.throws(()=>addKbContent({fileName:'生成总结.md',slug:'generated-note',text:'# 总结\n项目工期为 90 天。\n',metadata:{sourceKind:'original'}}),/覆盖变成/)
  const knowledge = readKbChunk(generated.entry.slug,listKbVersions(generated.entry.slug)[0]!.manifest.chunks[0]!.id)
  const citation = extractCitationTokens(knowledge.citation)[0]!.raw
  writeFileSync(output,'工期为 90 天。 '+citation+'\n')
  assert.throws(()=>recordCitationSupport(cwd,project,{id:'loop-generated',artifactPath:output,claim:'工期为 90 天。',citation,verdict:'supported',reason:'用报告摘要自证',reviewer:'agent',independentEvidence:[{citation,quote:'项目工期为 90 天。'}]}),/生成内容/)
  const selfCitation = `[src:${output}]`
  writeFileSync(output,'工期为 90 天。 '+selfCitation+'\n')
  assert.throws(()=>recordCitationSupport(cwd,project,{id:'loop-report',artifactPath:output,claim:'工期为 90 天。',citation:selfCitation,verdict:'supported',reason:'自身报告',reviewer:'agent',independentEvidence:[{citation:selfCitation,quote:'工期为 90 天。'}]}),/报告不能反过来/)
})

test('generated keywords cannot close evidence gaps; a hash-linked parse can and becomes stale with its original',async()=>{
  const {cwd,project,output} = fixture()
  const facts = '# 项目条件\n合同条件和技术规范、工作时间、分包、施工顺序、工期与地质均有约束。\n'
  const before = assessEvidence(cwd,project.projectId).blockingGapCount
  writeFileSync(output,facts)
  assert.equal(assessEvidence(cwd,project.projectId,facts).blockingGapCount,before)
  const pdf = join(cwd,'source.pdf');writeFileSync(pdf,'%PDF independent original')
  const second = createBusinessProject({workspaceRootPath:cwd,module:'tender',projectId:'parsed-case',name:'Parsed case',rootPath:cwd,workflowId:'tender-main',inputPaths:[pdf]})
  await restoreSetupSource(cwd,second.projectId,pdf,{ingest:async()=>({markdown:facts,contentList:[],partCount:1,via:'local',route:'local',ocr:false})})
  assert.equal(assessEvidence(cwd,second.projectId).blockingGapCount,0)
  writeFileSync(pdf,'%PDF changed independent original')
  assert.equal(assessEvidence(cwd,second.projectId).blockingGapCount,6)
})

test('snapshot tampering cannot silently rewrite historical locator content',()=>{
  fixture()
  const entry = addKbContent({fileName:'spec.md',slug:'frozen-spec',text:'# 条款\n保留原文。\n'}).entry
  const version = listKbVersions(entry.slug)[0]!
  assert.equal(hash(readFileSync(version.entry.managedPath)),version.manuscriptHash)
  writeFileSync(version.entry.managedPath,'changed')
  assert.throws(()=>readKbChunk(entry.slug,version.manifest.chunks[0]!.id,entry.versionId),/版本内容/)
})
