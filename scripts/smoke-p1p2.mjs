// Smoke test for P1 (citation chain) + P2 (module extensibility).
// Run: node --experimental-strip-types --no-warnings scripts/smoke-p1p2.mjs
import { existsSync, mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const scratch = mkdtempSync(join(tmpdir(), 'ap-smoke-'))
process.env.AGENT_PI_MODULES_ROOT = join(scratch, 'modules')
process.env.AGENT_PI_KB_ROOT = join(scratch, 'kb')
process.env.DSH_HOME = join(scratch, 'dsh-home')

process.env.AGENT_PI_SKILLS_ROOT = join(scratch, 'skills')

const { listWorkbenchModules, saveUserModule, workflowFor, setModuleDisabled, removeUserModule, validateModuleFile, saveUserSkill, userSkillsRoot, copyWorkbenchModule, suggestCopyModuleId, workflowToModuleFile } =
  await import('../bundles/tender-host/src/modules.ts')
const { extractCitationTokens, verifyCitationToken, auditProjectCitations, loadCitationAudit } =
  await import('../bundles/tender-host/src/citations.ts')
const { addKbFile, searchKb, kbChunkStatus } = await import('../bundles/tender-host/src/kb.ts')
const { createBusinessProject, listBusinessProjects } = await import('../packages/business-projects/index.ts')
const { buildStageDraft } = await import('../bundles/tender-host/src/orchestration.ts')
const { adoptPreview, adoptWorkspace, suggestAdoptProjectId } = await import('../bundles/tender-host/src/adopt.ts')

let failures = 0
function check(name, ok, detail) {
  if (ok) console.log('PASS ' + name)
  else { failures += 1; console.error('FAIL ' + name + (detail ? ' — ' + detail : '')) }
}

// ── P2: module registry ──────────────────────────────────────────────────────
const base = listWorkbenchModules({ includeDisabled: true })
check('builtin modules listed', base.modules.filter(m => m.builtin).length === 3)

let threw = ''
try { validateModuleFile({ schemaVersion: 1, id: 'tender', labelZh: 'x', stages: [{ id: 's1', labelZh: 'a', prompt: 'p' }] }) } catch (e) { threw = e.message }
check('builtin id rejected', threw.includes('内置模块'))

threw = ''
try { validateModuleFile({ schemaVersion: 1, id: 'ok-mod', labelZh: 'x', stages: [{ id: 's1', labelZh: 'a', prompt: '' }] }) } catch (e) { threw = e.message }
check('empty stage prompt rejected', threw.includes('prompt'))

const saved = saveUserModule({
  schemaVersion: 1,
  id: 'safety-audit',
  labelZh: '安全审计',
  icon: '🛡️',
  setupStageId: 'audit-setup',
  stages: [
    { id: 'audit-setup', labelZh: '资料登记', prompt: '登记审计输入资料。' },
    { id: 'audit-run', labelZh: '现场审计', prompt: '按清单逐项审计并出报告。', reviewSkillSlugs: ['deliverable-reviewer'], listsSources: true },
  ],
})
check('user module saved', saved.id === 'safety-audit' && saved.stageCount === 2 && !saved.builtin)

const wf = workflowFor('safety-audit')
check('workflowFor resolves user module', wf.module === 'safety-audit' && wf.setupStageId === 'audit-setup' && wf.stages.length === 2)
check('review slugs survive into workflow', (wf.stages[1].reviewSkillSlugs || []).includes('deliverable-reviewer'))

setModuleDisabled('safety-audit', true)
check('disabled hidden from default list', !listWorkbenchModules().modules.some(m => m.id === 'safety-audit'))
check('disabled visible with includeDisabled', listWorkbenchModules({ includeDisabled: true }).modules.find(m => m.id === 'safety-audit')?.disabled === true)
check('disabled module still resolves workflow', workflowFor('safety-audit').stages.length === 2)
setModuleDisabled('safety-audit', false)

const copied = copyWorkbenchModule('tender', { id: 'tender-acme', labelZh: '投标全流程（某某）' })
check('copy tender is user module', copied.id === 'tender-acme' && copied.builtin === false && copied.labelZh === '投标全流程（某某）')
check('copy keeps analysis summary gate', Boolean(copied.workflow.stages.find((s) => s.id === 'tender-document-analysis')?.summaryDeliverable?.fileName.includes('解析总报告')))
check('copy keeps listsSources', copied.workflow.stages.find((s) => s.id === 'tender-document-analysis')?.listsSources === true)
check('builtin tender still present', listWorkbenchModules().modules.some((m) => m.id === 'tender' && m.builtin))
check('copy appears in live list', listWorkbenchModules().modules.some((m) => m.id === 'tender-acme'))
check('auto copy id', suggestCopyModuleId('tender') === 'tender-copy')
const autoCopy = copyWorkbenchModule('tender')
check('auto copy saved', autoCopy.id === 'tender-copy' && autoCopy.labelZh.includes('副本'))
threw = ''
try { copyWorkbenchModule('tender', { id: 'tender' }) } catch (e) { threw = e.message }
check('copy cannot reuse builtin id', threw.includes('已存在'))
threw = ''
try { copyWorkbenchModule('missing-mod') } catch (e) { threw = e.message }
check('copy unknown source rejected', threw.includes('未知模块'))
const editSource = copyWorkbenchModule('delivery', { id: 'delivery-editme', labelZh: '实施控制（可改）' })
const editFile = workflowToModuleFile(editSource.workflow, 'delivery-editme', '实施控制（精简）')
editFile.stages = editFile.stages.filter((stage) => stage.id !== 'delivery-controls')
editFile.stages.push({ id: 'extra-check', labelZh: '额外核对', prompt: '核对现场口径。' })
const edited = saveUserModule(editFile)
check('editor save drops a stage', !edited.workflow.stages.some((stage) => stage.id === 'delivery-controls'))
check('editor save adds a stage', edited.workflow.stages.some((stage) => stage.id === 'extra-check'))
removeUserModule('delivery-editme')
removeUserModule('tender-acme')
removeUserModule('tender-copy')

// broken file surfaces as error, does not brick listing
writeFileSync(join(process.env.AGENT_PI_MODULES_ROOT, 'broken.json'), '{"schemaVersion":1,"id":"broken"')
const withBroken = listWorkbenchModules({ includeDisabled: true })
check('broken module file reported', withBroken.errors.length === 1 && withBroken.modules.some(m => m.id === 'safety-audit'))

// ── stage draft for a user module carries review rule + citation contract ────
const projectRoot = join(scratch, 'proj')
mkdirSync(projectRoot, { recursive: true })
const cwd = join(scratch, 'ws')
mkdirSync(cwd, { recursive: true })
const project = createBusinessProject({
  workspaceRootPath: cwd,
  module: 'safety-audit',
  projectId: 'sa-001',
  name: '测试安审',
  rootPath: projectRoot,
  workflowId: wf.id,
  inputPaths: [],
  createDirectory: true,
})
const draft = buildStageDraft(project, wf.stages[1])
check('draft includes review loop', draft.includes('deliverable-reviewer') && draft.includes('ACCEPT_AND_PROCEED'))
check('draft requires review return channel', draft.includes('run_in_background: false') && draft.includes('report'))
check('draft includes citation tokens rule', draft.includes('[kb:slug:chunkId]') || draft.includes('kb:slug:chunkId'))

// ── P1: citation extraction + verification ──────────────────────────────────
const specPath = join(scratch, 'spec.md')
writeFileSync(specPath, ['# 规范', '', '## 4.1 初凝时间', '不小于 45 分钟。', '细节见附表。'].join('\n'))
const kbEntry = addKbFile({ path: specPath, category: '规范', name: '测试规范' })
const hit = searchKb('初凝时间')[0]
check('kb_search hits the seeded spec', Boolean(hit) && hit.slug === kbEntry.entry.slug, JSON.stringify(hit))
const packedFile = {
  schemaVersion: 1,
  id: 'spec-pack-mod',
  labelZh: '规范包模块',
  setupStageId: 'pack-setup',
  bindingAreaByStage: { 'pack-run': 'analysis' },
  kbPack: { analysis: [kbEntry.entry.slug] },
  stages: [
    { id: 'pack-setup', labelZh: '登记', prompt: '登记资料。' },
    { id: 'pack-run', labelZh: '解析', prompt: '按规范解析。' },
  ],
}
const packed = saveUserModule(packedFile)
check('kbPack survives save', (packed.workflow.kbPack?.analysis || []).includes(kbEntry.entry.slug))
const packedDraft = buildStageDraft({
  module: 'spec-pack-mod',
  projectId: 'pack-1',
  name: '规范包项目',
  rootPath: projectRoot,
  inputPaths: ['C:/tmp/a.pdf', 'C:/tmp/b.pdf', 'C:/tmp/c.pdf', 'C:/tmp/d.pdf', 'C:/tmp/e.pdf'],
  createdAt: new Date().toISOString(),
}, packed.workflow.stages[1])
check('kbPack draft names slug not path', packedDraft.includes(kbEntry.entry.slug) && packedDraft.includes('方法标准与范文模板'))
check('draft omits full input paths', !packedDraft.includes('C:/tmp/a.pdf') && packedDraft.includes('共 5 份'))
removeUserModule('spec-pack-mod')
const chunkId = hit.chunkId
check('kbChunkStatus resolves the hit', kbChunkStatus(kbEntry.entry.slug, chunkId) === null)

const tokens = extractCitationTokens([
  `初凝时间不小于45分钟 [kb:${kbEntry.entry.slug}:${chunkId}]`,
  '费率取自登记清单 [src:inputs/boq.md#L3-L5]',
  '孤儿一 [kb:no-such:c0001]',
  '孤儿二 [src:missing-file.md]',
].join('\n'))
check('extract finds 4 tokens', tokens.length === 4, 'got ' + tokens.length)
check('kb token parsed', tokens[0].kind === 'kb' && tokens[0].slug === kbEntry.entry.slug)
check('src range parsed', tokens[1].kind === 'src' && tokens[1].lineStart === 3 && tokens[1].lineEnd === 5)

check('valid kb token verifies', verifyCitationToken(cwd, project, tokens[0]) === null)
check('unknown kb slug is orphan', verifyCitationToken(cwd, project, tokens[2]) !== null)
check('missing src is orphan', verifyCitationToken(cwd, project, tokens[3]) !== null)

// full audit over Official Outputs
const officialDir = join(cwd, 'Agent Pi Outputs', 'sa-001', 'audit-run')
mkdirSync(officialDir, { recursive: true })
mkdirSync(join(projectRoot, 'inputs'), { recursive: true })
writeFileSync(join(projectRoot, 'inputs', 'boq.md'), 'l1\nl2\nl3\nl4\nl5\nl6\n')
writeFileSync(join(officialDir, 'report.md'), [
  '# 审计报告',
  `合格判据引用规范 [kb:${kbEntry.entry.slug}:${chunkId}]`,
  '数量对账见清单 [src:inputs/boq.md#L2-L4]',
  '这个是编造引用 [kb:ghost:c0009]',
  '行号越界 [src:inputs/boq.md#L2-L400]',
].join('\n'))

const audit = auditProjectCitations(cwd, project)
check('audit total 4', audit.totalCitations === 4, JSON.stringify(audit))
check('audit orphans 2', audit.orphans.length === 2, JSON.stringify(audit.orphans))
check('audit persisted + reloadable', loadCitationAudit(cwd, 'sa-001', 'safety-audit')?.orphans.length === 2)
check('orphan reasons are precise', audit.orphans.some(o => o.reason.includes('知识库无条目')) && audit.orphans.some(o => o.reason.includes('行号超出范围')))

// ── skill distillation (workbench_skill_save backend) ───────────────────────
const skillMd = [
  '---',
  'name: safety-audit-method',
  'description: 安全审计成果的写作方法与硬规则。写审计成果前必读。',
  '---',
  '',
  '# 安全审计方法',
  '',
  '1. 先读范文再动笔。',
  '2. 结论必须给引用令牌。',
].join('\n')
const savedSkill = saveUserSkill('safety-audit-method', skillMd)
check('user skill saved + created', savedSkill.created === true && savedSkill.path.endsWith('SKILL.md'))
check('skill lands under skills root', savedSkill.path.startsWith(userSkillsRoot()))
const savedAgain = saveUserSkill('safety-audit-method', skillMd + '\n更新一行。\n')
check('skill overwrite reports created=false', savedAgain.created === false)
threw = ''
try { saveUserSkill('Bad Slug', skillMd) } catch (e) { threw = e.message }
check('bad skill slug rejected', threw.includes('slug'))
threw = ''
try { saveUserSkill('no-front', '# 没有 frontmatter') } catch (e) { threw = e.message }
check('missing frontmatter rejected', threw.includes('frontmatter'))
threw = ''
try { saveUserSkill('name-mismatch', '---\nname: other-name\ndescription: x\n---\n\nbody') } catch (e) { threw = e.message }
check('frontmatter name mismatch rejected', threw.includes('一致'))
threw = ''
try { saveUserSkill('empty-body', '---\nname: empty-body\ndescription: x\n---\n\n   ') } catch (e) { threw = e.message }
check('empty skill body rejected', threw.includes('正文'))

// ── evidence gate: content channel + CJK/plural patterns ────────────────────
const { assessEvidence, evidencePolicy, EVIDENCE_ASSESSOR_VERSION } =
  await import('../bundles/tender-host/src/evidence.ts')
const evProjectRoot = join(scratch, 'evi')
mkdirSync(evProjectRoot, { recursive: true })
const evProject = createBusinessProject({
  workspaceRootPath: cwd,
  module: 'tender',
  projectId: 'evi-001',
  name: '证据门禁测试',
  rootPath: evProjectRoot,
  workflowId: 'tender-za',
  inputPaths: [],
  createDirectory: true,
})
// The earlier KB test seeded a "规范" entry, which legitimately satisfies specs via
// the name channel; the other 5 chapters have no source of any kind yet.
const ev1 = assessEvidence(cwd, 'evi-001')
check('no sources => 5 chapters gap (specs covered by KB entry)',
  ev1.blockingGapCount === 5 && !ev1.gaps.some(g => g.chapterId === 'specs'),
  JSON.stringify(ev1.gaps.map(g => g.chapterId)))
check('assessor version stamped', ev1.assessorVersion === EVIDENCE_ASSESSOR_VERSION)

// Deliverable content (numbered volume names, keywords only INSIDE the text) satisfies chapters.
const evOfficial = join(cwd, 'Agent Pi Outputs', 'evi-001', 'document-analysis')
mkdirSync(evOfficial, { recursive: true })
writeFileSync(join(evOfficial, 'doc-src-book-1-of-volume-3.md'), [
  '# Book 1 of Volume 3 解析',
  '合同采用 FIDIC Red Book 加专用条款。',
  '技术规范按 COTO Standard Specifications 执行，含条文修订。',
  '本项目工作时间为每周 45 小时，节假日按当地日历。',
  '分包比例限制 30%，属地化要求 local content 达标。',
  '施工顺序要求分段交工，占道审批另行约定。',
  '工期 24 个月，地点位于 KwaZulu-Natal，气候为亚热带。',
].join('\n'))
const ev2 = assessEvidence(cwd, 'evi-001')
check('deliverable content clears all gaps', ev2.blockingGapCount === 0, JSON.stringify(ev2.gaps.map(g => g.chapterId)))
check('content evidence names the file', Object.keys(ev2.contentEvidence ?? {}).length === 6
  && ev2.contentEvidence.contract.some(n => n.includes('volume-3')), JSON.stringify(ev2.contentEvidence))

// CJK keyword alone (no ASCII neighbors) must match — the old \b-wrapped patterns could not.
writeFileSync(join(evOfficial, 'doc-src-book-1-of-volume-3.md'), '规范如下：工期两年。工作时间正常。分包禁止。施工顺序自定。合同制式标准。\n')
const evCjk = assessEvidence(cwd, 'evi-001')
check('pure-CJK keywords satisfy chapters', evCjk.blockingGapCount === 0, JSON.stringify(evCjk.gaps.map(g => g.chapterId)))

// Old-assessor ledgers are re-assessed by evidencePolicy (upgrade path for running projects).
const { readFileSync: rfs, writeFileSync: wfs } = await import('node:fs')
const ledgerFile = join(cwd, '.agent-pi', 'business', 'tender', 'evi-001', 'orchestration', 'project-characteristics-evidence.json')
const staleLedger = JSON.parse(rfs(ledgerFile, 'utf8'))
delete staleLedger.assessorVersion
staleLedger.gaps = [{ chapterId: 'contract', title: 'x', reason: 'missing_source_file', blocking: true, detail: 'stale', suggestedUpload: 'y' }]
staleLedger.blockingGapCount = 1
wfs(ledgerFile, JSON.stringify(staleLedger))
const policy = evidencePolicy(cwd, 'evi-001')
check('stale ledger auto re-assessed', policy.blocking === false && policy.ledger.assessorVersion === EVIDENCE_ASSESSOR_VERSION, JSON.stringify({ blocking: policy.blocking, v: policy.ledger.assessorVersion }))

// ── organize: stage reality reconciliation + control draft ──────────────────
const { organizeDeliverables } = await import('../bundles/tender-host/src/orchestration.ts')
const organized = organizeDeliverables(cwd, project, 'audit-run')
check('organize returns reality', organized.reality && organized.reality.stageId === 'audit-run')
check('reality counts citations', organized.reality.citations.total === 4 && organized.reality.citations.orphans === 2)
check('non-tender module omits evidence', organized.reality.evidence === undefined)
check('organize draft carries reconciliation', organized.draft.includes('盘面对账') && organized.draft.includes('掌控与裁决'))
check('organize draft carries review discipline', organized.draft.includes('2 轮修订'))
check('open-stage organize is not closed', organized.closed === false && organized.needsQc === true)
check('organize draft separates bid readiness', organized.draft.includes('投标可提交'))
check('reality names output folder', Boolean(organized.reality.outputFolder))

// ── unified output tree: source naming, sweep, summary gate, project reality ─
const {
  prepareStage, completeSetup, completeStage, alignDeliverableNames, projectReality, loadBoard, saveBoard, sourcePackIdentity,
} = await import('../bundles/tender-host/src/orchestration.ts')
const { registerProjectSources } = await import('../bundles/tender-host/src/workspace.ts')
const { listOfficialOutputs, syncProjectOutputs } = await import('../bundles/tender-host/src/outputs.ts')
const { updateBusinessProjectInputs } = await import('../packages/business-projects/index.ts')

// Same book in two formats is one worker; a different book stays separate.
const srcA = join(projectRoot, 'N.003-010-2017-3R Book 1 of Volume 3.pdf')
const srcB = join(projectRoot, 'N.003-010-2017-3R Book 1 of Volume 3.docx')
const srcC = join(projectRoot, 'N.003-010-2017-3R Book 2 of Volume 3.pdf')
writeFileSync(srcA, 'pdf-bytes')
writeFileSync(srcB, 'docx-bytes')
writeFileSync(srcC, 'pdf2-bytes')
check('pack identity merges book+volume', sourcePackIdentity(srcA).key === sourcePackIdentity(srcB).key && sourcePackIdentity(srcA).key !== sourcePackIdentity(srcC).key)
registerProjectSources(cwd, 'sa-001', { title: '测试安审', inputPaths: [srcA, srcB, srcC] })
const saProject = updateBusinessProjectInputs(cwd, 'safety-audit', 'sa-001', [srcA, srcB, srcC])
completeSetup(cwd, saProject)
const preparedStage = prepareStage(cwd, saProject, 'audit-run')
const mdPaths = (preparedStage.state.tasks || []).map(t => t.markdownPath || '')
check('same book packed to one task', preparedStage.state.tasks.length === 2, JSON.stringify(preparedStage.state.tasks.map((task) => task.title)))
check('deliverable named after pack title', mdPaths.some(p => p.endsWith('Book 1 of Volume 3.md')), JSON.stringify(mdPaths))
check('second book stays its own pack', mdPaths.some(p => p.endsWith('Book 2 of Volume 3.md')), JSON.stringify(mdPaths))
check('stage draft pins unified output dir', preparedStage.draft.includes('Agent Pi Outputs/sa-001/'))
check('fresh stage draft omits skill tags', !preparedStage.draft.includes('<tender_writing_contract>') && !preparedStage.draft.includes('[skill:tender-') && preparedStage.draft.includes('不要重述写作合同'))

// Legacy slug-named deliverables and loose root files migrate into the stage tree.
const boardSa = loadBoard(cwd, 'sa-001', 'safety-audit')
const legacyPath = join(officialDir, 'doc-legacy-1.md')
writeFileSync(legacyPath, '旧命名成果')
writeFileSync(join(officialDir, 'doc-legacy-1-part2.md'), '旧命名续篇')
boardSa.stages['audit-run'].tasks[0].markdownPath = legacyPath
saveBoard(cwd, boardSa)
writeFileSync(join(cwd, 'Agent Pi Outputs', 'sa-001', '散落专章.md'), '# 散落在项目根')
const alignedRes = alignDeliverableNames(cwd, saProject, 'audit-run')
check('legacy deliverable + part renamed', alignedRes.renamed === 2, JSON.stringify(alignedRes))
check('loose root md swept into stage dir', alignedRes.moved === 1 && existsSync(join(officialDir, '散落专章.md')))
check('renamed file carries source stem', existsSync(join(officialDir, 'Book 1 of Volume 3.md')))
check('board points at renamed path', loadBoard(cwd, 'sa-001', 'safety-audit').stages['audit-run'].tasks[0].markdownPath.endsWith('Book 1 of Volume 3.md'))

// Summary deliverable is a hard gate on complete_stage (tender stage 2).
completeSetup(cwd, updateBusinessProjectInputs(cwd, 'tender', 'evi-001', [srcA]))
// completeSetup auto-prepared stage 2 tasks; deliver them so only the summary gate remains.
const evBoard = loadBoard(cwd, 'evi-001', 'tender')
for (const task of evBoard.stages['tender-document-analysis']?.tasks ?? []) {
  if (task.markdownPath) writeFileSync(task.markdownPath, '# 解析稿\n')
  task.status = 'done'
}
saveBoard(cwd, evBoard)
threw = ''
try { completeStage(cwd, evProject, 'tender-document-analysis') } catch (e) { threw = e.message }
check('complete_stage blocked without summary report', threw.includes('招标文件解析总报告'), threw)
writeFileSync(join(evOfficial, '招标文件解析总报告.md'), '# 招标文件解析总报告\n项目特征、合同、规范、BOQ、评分、日期、风险。\n')
const completedEv = completeStage(cwd, evProject, 'tender-document-analysis')
check('complete_stage passes with summary present', completedEv.state.status === 'done')

// Harvest routes 项目特征 into the stage folder; scratch files never publish.
const evReportsDir = join(cwd, '.agent-pi', 'business', 'tender', 'evi-001', 'orchestration', 'reports')
mkdirSync(evReportsDir, { recursive: true })
writeFileSync(join(evReportsDir, '项目特征.md'), '# 项目特征\n')
writeFileSync(join(evReportsDir, '_probe_size.txt'), '123')
writeFileSync(join(evOfficial, '_part4_md_size.txt'), '999')
syncProjectOutputs(cwd, 'evi-001', 'tender', 'tender-document-analysis')
check('项目特征 harvested into stage folder', existsSync(join(evOfficial, '项目特征.md')))
check('project root stays clean of 项目特征', !existsSync(join(cwd, 'Agent Pi Outputs', 'evi-001', '项目特征.md')))
const outs = listOfficialOutputs(cwd, 'evi-001', 'tender')
check('scratch files filtered from official outputs', outs.items.length > 0 && outs.items.every(i => !i.relativePath.split('/').pop().startsWith('_')), JSON.stringify(outs.items.map(i => i.relativePath)))

// Sweeping from a later stage still routes 项目特征 to document-analysis.
writeFileSync(join(cwd, 'Agent Pi Outputs', 'evi-001', '项目特征专章.md'), '# 特征（散落在根）')
alignDeliverableNames(cwd, evProject, 'boq-five-step-pricing')
check('root 项目特征 routed to document-analysis, not current stage',
  existsSync(join(evOfficial, '项目特征专章.md'))
  && !existsSync(join(cwd, 'Agent Pi Outputs', 'evi-001', 'boq-pricing', '项目特征专章.md'))
  && !existsSync(join(cwd, 'Agent Pi Outputs', 'evi-001', '项目特征专章.md')))

// Whole-project reality for the check panel.
const realityAll = projectReality(cwd, evProject)
check('projectReality covers all stages', realityAll.stages.length === workflowFor('tender').stages.length)
const stage2Reality = realityAll.stages.find(s => s.stageId === 'tender-document-analysis')
check('projectReality sees summary in place', Boolean(stage2Reality && stage2Reality.summary && stage2Reality.summary.exists))

// Later stages get explicit read paths for prior-stage outputs.
const boqStage = workflowFor('tender').stages.find(s => s.id === 'boq-five-step-pricing')
const boqDraft = buildStageDraft(evProject, boqStage)
check('later stage draft lists prior read paths', boqDraft.includes('前序阶段成果读取路径') && boqDraft.includes('document-analysis/'))
check('later stage draft pins its own summary', boqDraft.includes('BOQ 组价总报告'))

// ── adopt ordinary workspace into a workbench module ─────────────────────────
check('adopt id keeps dated folder names', suggestAdoptProjectId('260813-grand-coyote') === '260813-grand-coyote')
check('adopt id slugs spaces', suggestAdoptProjectId('N3 Upgrade') === 'n3-upgrade')

const adoptRoot = join(scratch, 'ordinary-task')
mkdirSync(join(adoptRoot, 'Agent Pi Outputs', 'ordinary-task', 'published'), { recursive: true })
mkdirSync(join(adoptRoot, 'Agent Pi Uploads'), { recursive: true })
writeFileSync(join(adoptRoot, 'Agent Pi Outputs', 'ordinary-task', 'published', '纳米比亚调研.md'), '# hi\n')
writeFileSync(join(adoptRoot, 'Agent Pi Uploads', '招标文件.pdf'), 'x')

const preview = adoptPreview(adoptRoot, 'investment')
check('adopt preview uses folder id', preview.projectId === 'ordinary-task')
check('adopt preview counts official files', preview.officialCount >= 1)
check('adopt preview suggests uploads', preview.suggestedInputs.some((path) => path.replace(/\\/g, '/').endsWith('招标文件.pdf')))

const adopted = adoptWorkspace(adoptRoot, { module: 'investment' })
check('adopt registers investment project', adopted.project.module === 'investment' && adopted.project.projectId === 'ordinary-task')
check('adopt keeps workspace as root', adopted.project.rootPath === adoptRoot || adopted.project.rootPath.replace(/\\/g, '/').endsWith('/ordinary-task'))
check('adopt sees existing official outputs', (adopted.outputs && adopted.outputs.items ? adopted.outputs.items : listOfficialOutputs(adoptRoot, 'ordinary-task', 'investment').items).length >= 1)
check('adopt listed under investment', listBusinessProjects(adoptRoot, 'investment').some((project) => project.projectId === 'ordinary-task'))

threw = ''
try { adoptWorkspace(adoptRoot, { module: 'investment' }) } catch (e) { threw = e.message }
check('adopt same module rejected', threw.includes('已是'))

const adoptedTender = adoptWorkspace(adoptRoot, { module: 'tender' })
check('adopt other module allowed', adoptedTender.project.module === 'tender' && adoptedTender.project.projectId === 'ordinary-task')

const looseRoot = join(scratch, 'loose-outputs')
mkdirSync(join(looseRoot, 'published'), { recursive: true })
writeFileSync(join(looseRoot, 'published', '尽调报告.md'), '# x\n')
const looseAdopt = adoptWorkspace(looseRoot, { module: 'investment' })
check('loose published folder counted', listOfficialOutputs(looseRoot, looseAdopt.project.projectId, 'investment').items.length >= 1)

// ── module removal ───────────────────────────────────────────────────────────
const removal = removeUserModule('safety-audit')
check('user module removed', removal.removed === true)
threw = ''
try { removeUserModule('tender') } catch (e) { threw = e.message }
check('builtin removal rejected', threw.includes('不可删除'))
threw = ''
try { workflowFor('safety-audit') } catch (e) { threw = e.message }
check('removed module no longer resolves', threw.includes('Unknown module'))

rmSync(scratch, { recursive: true, force: true })
console.log(failures === 0 ? '\nALL PASS' : `\n${failures} FAILURES`)
process.exit(failures === 0 ? 0 : 1)
