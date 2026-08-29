import { createBusinessProject, listBusinessProjects } from '../packages/business-projects/index.ts'
import { knowledgeStatus } from '../bundles/tender-host/src/knowledge.ts'
import { officialStageDir, publishOfficialOutput, listOfficialOutputs } from '../bundles/tender-host/src/outputs.ts'
import { assessEvidence, forcePassEvidence, evidencePolicy } from '../bundles/tender-host/src/evidence.ts'
import { prepareStage, workbenchSnapshot, completeSetup, decideApprovalStage } from '../bundles/tender-host/src/orchestration.ts'
import { initTenderWorkspace, replaceCapability, capabilityStatus, upsertWorkspaceSection } from '../bundles/tender-host/src/workspace.ts'
import { registerTools } from '../bundles/tender-host/src/tools.ts'
import { importDsh } from '../bundles/tender-host/src/dsh.ts'
import { workflowFor } from '../bundles/tender-host/src/modules.ts'
import { importExternalPaths, listWorkspaceFiles, promoteFile, saveUpload } from '../bundles/tender-host/src/files.ts'
import { exportMarkdownFile, markdownToHtml, renderMarkdownBlocksForExport } from '../bundles/tender-host/src/preview-export.ts'
import { buildPromptOptimizationInstruction, normalizeOptimizedPrompt, optimizePrompt, optimizePromptWithLlm } from '../bundles/tender-host/src/prompt-optimize.ts'
import { currentDefaultModel, peekPendingVisionContext, readVisionImages } from '../bundles/tender-host/src/attachment-context.ts'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'

const cwd = mkdtempSync(join(tmpdir(), 'agent-pi-dsh-'))
const project = createBusinessProject({
  workspaceRootPath: cwd,
  projectId: 'demo1',
  module: 'tender',
  name: 'Demo Tender',
  rootPath: cwd,
  workflowId: 'tender-main',
  createDirectory: true,
  inputPaths: [],
})
initTenderWorkspace(cwd, 'demo1', { id: 'demo1', title: 'Demo Tender', status: 'active' })
const prepared = prepareStage(cwd, project, 'project-setup')
const evidence = assessEvidence(cwd, 'demo1', 'FIDIC Red Book mentioned without a file')
forcePassEvidence(cwd, 'demo1', { authorizeWeb: true })
const snap = workbenchSnapshot(cwd, 'tender')
const knowledge = knowledgeStatus()
const note = join(cwd, 'note.md')
writeFileSync(note, '# demo\n')
publishOfficialOutput(cwd, 'demo1', note, 'markdown')

const analysis = replaceCapability(cwd, 'demo1', 'document_analysis', {
  sections: [{
    id: 'sec-1',
    documentId: 'doc-placeholder',
    title: 'Project information',
    kind: 'project_information',
    summary: 'Placeholder section for smoke.',
    sourceRefs: [],
    status: 'draft',
  }],
})

createBusinessProject({
  workspaceRootPath: cwd,
  projectId: 'del1',
  module: 'delivery',
  name: 'Demo Delivery',
  rootPath: cwd,
  workflowId: workflowFor('delivery').id,
  createDirectory: true,
  inputPaths: [],
})
createBusinessProject({
  workspaceRootPath: cwd,
  projectId: 'inv1',
  module: 'investment',
  name: 'Demo Investment',
  rootPath: cwd,
  workflowId: workflowFor('investment').id,
  createDirectory: true,
  inputPaths: [],
})

if (listBusinessProjects(cwd).length !== 3) throw new Error('project registry failed')
if (prepared.state.stageId !== 'project-setup') throw new Error('stage prepare failed')
if (evidence.blockingGapCount < 1) throw new Error('evidence gaps expected')
if (evidencePolicy(cwd, 'demo1').webDiligenceAuthorized !== true) throw new Error('force_pass failed')
if (snap.projects.length !== 1) throw new Error('tender snapshot failed')
if (!knowledge.packExists) throw new Error('knowledge pack missing')
if (listOfficialOutputs(cwd, 'demo1').items.length !== 1) throw new Error('official output failed')
if (!analysis.envelope) throw new Error('capability replace failed')
if (capabilityStatus(cwd, 'demo1', 'document_analysis').envelope == null) throw new Error('capability status failed')
for (const moduleId of ['tender', 'delivery', 'investment'] as const) {
  const stages = workflowFor(moduleId).stages
  if (stages.some((stage) => 'dispatchPolicy' in stage || 'maxConcurrent' in stage)) {
    throw new Error(`${moduleId} must not declare dispatchPolicy/maxConcurrent`)
  }
}
const analysisStage = workflowFor('tender').stages.find((stage) => stage.id === 'tender-document-analysis')
if (!analysisStage?.listsSources) throw new Error('analysis should list sources without spawning')
if (analysisStage.prompt.includes('4 并发') || analysisStage.prompt.includes('最多 4')) {
  throw new Error('analysis prompt must not invent a concurrency cap')
}

const { defineTool } = await importDsh<{ defineTool: (options: Record<string, unknown>) => unknown }>('packages/core/tools/src/index.ts')
const registered: string[] = []
registerTools({
  tools: {
    register(definition: { name?: string }) {
      if (!definition?.name) throw new Error('tool missing name')
      registered.push(definition.name)
      return () => undefined
    },
  },
}, defineTool)
const expected = ['tender_workspace', 'tender_capability', 'tender_evidence', 'tender_outputs', 'kb_search', 'kb_add', 'tender_project', 'tender_stage', 'tender_citations', 'workbench_module_save', 'workbench_skill_save']
if (registered.includes('view_image')) {
  throw new Error('view_image must stay removed; images go through official deepseek-v4-flash-vision-exp')
}
if (expected.some((name) => !registered.includes(name))) {
  throw new Error(`tool registration incomplete: ${registered.join(',')}`)
}

writeFileSync(join(cwd, 'ok.txt'), 'ok')
const listed = listWorkspaceFiles(cwd)
if (listed[0]?.source !== 'official-output' || listed[0]?.name !== 'Official Outputs') {
  throw new Error('official output tree must lead the file rail')
}
const findName = (nodes: { name: string; children?: unknown[] }[] | undefined, name: string): boolean =>
  (nodes || []).some((node) => node.name === name || findName(node.children as { name: string; children?: unknown[] }[] | undefined, name))
if (!findName(listed[0]?.children, 'note.md')) {
  throw new Error('official output tree must include published work products')
}
if (!listed.some((node) => (node.children || []).some((child) => child.name === 'ok.txt'))) {
  throw new Error('working folder tree missing ok.txt')
}
writeFileSync(join(cwd, '纳米比亚矿产资源专业调研报告.md'), '# namibia\n')
writeFileSync(join(cwd, 'namibia-political-map.svg'), '<svg xmlns="http://www.w3.org/2000/svg"></svg>\n')
const sessionHarvest = listWorkspaceFiles(cwd)
if (!findName(sessionHarvest[0]?.children, '纳米比亚矿产资源专业调研报告.md')) {
  throw new Error('edited session report must be copied into Official Outputs')
}
if (!findName(sessionHarvest[0]?.children, 'namibia-political-map.svg')) {
  throw new Error('session map must be copied into Official Outputs')
}
if (!existsSync(join(cwd, 'Agent Pi Outputs', 'demo1', '纳米比亚矿产资源专业调研报告.md'))) {
  throw new Error('session report should sit at the Official Outputs project root')
}
const emptyRail = listWorkspaceFiles(mkdtempSync(join(tmpdir(), 'agent-pi-empty-')))
if (emptyRail[0]?.source !== 'official-output' || emptyRail[0]?.name !== 'Official Outputs') {
  throw new Error('empty workspace must still show Official Outputs')
}
const uploaded = saveUpload(cwd, 'pack/note.txt', Buffer.from('hello'))
if (!existsSync(uploaded.path)) throw new Error('upload failed')
const outside = join(tmpdir(), `agent-pi-import-${Date.now()}.md`)
writeFileSync(outside, '# import me')
const imported = importExternalPaths(cwd, [outside])
if (imported.length !== 1 || !existsSync(imported[0]!.path) || !imported[0]!.relativePath.replace(/\\/g, '/').includes('Agent Pi Uploads/')) {
  throw new Error('importExternalPaths should copy outside files into uploads')
}
const afterUpload = listWorkspaceFiles(cwd)
if (!afterUpload.some((node) => node.source === 'attachment')) throw new Error('upload tree missing')
promoteFile(cwd, uploaded.path, 'demo1')
const promoted = promoteFile(cwd, uploaded.path)
if (!promoted.dest.replace(/\\/g, '/').includes('Agent Pi Outputs/demo1/inbox/')) {
  throw new Error('promote should land in the first project Official Outputs inbox')
}

upsertWorkspaceSection(cwd, 'demo1', {
  documents: [{
    id: 'book-1',
    name: 'Tender Book 1',
    path: join(cwd, 'book.pdf'),
    kind: 'tender_data',
    status: 'active',
  }],
})
writeFileSync(join(cwd, 'book.pdf'), 'pdf')
completeSetup(cwd, { ...project, inputPaths: [join(cwd, 'book.pdf')] })
const bidDecisionDir = officialStageDir(cwd, project.projectId, 'bid-risk-decision')
mkdirSync(bidDecisionDir, { recursive: true })
writeFileSync(
  join(bidDecisionDir, '投标决策与重大风险评估.md'),
  '# 投标决策与重大风险评估\n\n' + '已核对资格、评分、合同、保函、保险、风险、缺口和投标条件。'.repeat(20),
)
decideApprovalStage(cwd, project, 'bid-risk-decision', 'approved')
const analysisPrepared = prepareStage(cwd, project, 'tender-document-analysis')
const briefMd = analysisPrepared.state.tasks[0]?.markdownPath?.replace(/\\/g, '/') ?? ''
const briefJson = analysisPrepared.state.tasks[0]?.reportPath?.replace(/\\/g, '/') ?? ''
if (!briefMd.includes('Agent Pi Outputs/demo1/document-analysis/') || !briefMd.endsWith('.md')) {
  throw new Error(`stage brief markdownPath must be Official Outputs: ${briefMd}`)
}
if (!briefJson.includes('.agent-pi/business/tender/demo1/orchestration/reports/') || !briefJson.endsWith('.json')) {
  throw new Error(`stage brief reportPath must stay in orchestration: ${briefJson}`)
}

const reportsDir = join(cwd, '.agent-pi', 'business', 'tender', 'demo1', 'orchestration', 'reports')
mkdirSync(join(reportsDir, 'nested'), { recursive: true })
writeFileSync(join(reportsDir, 'leftover-analysis.md'), '# leftover\n')
writeFileSync(join(reportsDir, 'boq-chapter.md'), '# boq\n')
writeFileSync(join(reportsDir, '施工策划报告.md'), '# plan\n')
writeFileSync(join(reportsDir, '项目特征.md'), '# chars\n')
writeFileSync(join(reportsDir, 'keep.json'), '{"ok":true}\n')
writeFileSync(join(reportsDir, 'nested', 'inner.md'), '# inner\n')
const harvested = listWorkspaceFiles(cwd)
if (!findName(harvested[0]?.children, 'leftover-analysis.md') || !findName(harvested[0]?.children, 'boq-chapter.md')) {
  throw new Error('files rail must harvest leftover workbench Markdown into Official Outputs')
}
if (!existsSync(join(cwd, 'Agent Pi Outputs', 'demo1', 'document-analysis', 'leftover-analysis.md'))) {
  throw new Error('analysis leftover should land in document-analysis')
}
if (!existsSync(join(cwd, 'Agent Pi Outputs', 'demo1', 'boq-pricing', 'boq-chapter.md'))) {
  throw new Error('boq leftover should land in boq-pricing')
}
if (!existsSync(join(cwd, 'Agent Pi Outputs', 'demo1', 'planning', '施工策划报告.md'))) {
  throw new Error('planning leftover should land in planning')
}
if (!existsSync(join(cwd, 'Agent Pi Outputs', 'demo1', 'document-analysis', '项目特征.md'))) {
  throw new Error('项目特征.md should land in document-analysis (unified official tree)')
}
if (!existsSync(join(cwd, 'Agent Pi Outputs', 'demo1', 'published', 'inner.md'))) {
  throw new Error('unnamed leftover Markdown should land in published')
}
if (existsSync(join(cwd, 'Agent Pi Outputs', 'demo1', 'document-analysis', 'keep.json'))
  || existsSync(join(cwd, 'Agent Pi Outputs', 'demo1', 'published', 'keep.json'))) {
  throw new Error('JSON ledgers must not be harvested into Official Outputs')
}
try {
  publishOfficialOutput(cwd, 'demo1', join(reportsDir, 'keep.json'), 'json')
  throw new Error('json-publish-should-have-failed')
} catch (error) {
  if (String(error).includes('json-publish-should-have-failed')) throw error
}
const polished = optimizePrompt({ input: '帮我看这个招标文件里的工期' })
if (!polished.optimizedPrompt.includes('任务目标')) throw new Error('prompt polish fallback failed')
if (!buildPromptOptimizationInstruction({ input: '帮我看工期' }).includes('发送前指令优化器')) {
  throw new Error('prompt optimizer instruction drifted from Agent Pi')
}
if (normalizeOptimizedPrompt('```\n只输出这句\n```') !== '只输出这句') {
  throw new Error('normalizeOptimizedPrompt should unwrap a single fence')
}
const polishedModel = await optimizePromptWithLlm({
  input: '帮我看这个招标文件里的工期',
  provider: 'deepseek-official',
  model: 'deepseek-v4-pro',
}, {
  stream: async function* () {
    yield { type: 'text-delta', index: 0, text: '请先读取招标文件，核对并列出工期条款。' }
    yield { type: 'finish', reason: { kind: 'stop' } }
  },
})
if (polishedModel.fallback || !polishedModel.optimizedPrompt.includes('招标文件')) {
  throw new Error('prompt polish should use the current model stream when available')
}
const polishedNoLlm = await optimizePromptWithLlm({ input: '帮我看工期' })
if (!polishedNoLlm.fallback || !polishedNoLlm.optimizedPrompt.includes('任务目标')) {
  throw new Error('prompt polish should fall back when no model runtime is injected')
}
const brandDir = join(import.meta.dirname, '../bundles/tender-web/lib/brand')
if (!existsSync(join(brandDir, 'logo.png')) || !existsSync(join(brandDir, 'hero.png')) || !existsSync(join(brandDir, 'symbol.png')) || !existsSync(join(brandDir, 'favicon.svg')) || !existsSync(join(brandDir, 'company.png')) || !existsSync(join(brandDir, 'company-mark.png'))) {
  throw new Error('Agent Pi brand assets missing')
}

const exportSource = join(cwd, 'analysis.md')
const exportMarkdown = '# 分析报告\n\n**结论**：可行。\n\n- 工期：30 天\n- 依据：招标文件第 5 页\n\n| A | B |\n| - | - |\n| 1 | 2 |\n'
writeFileSync(exportSource, exportMarkdown)
if (JSON.stringify(renderMarkdownBlocksForExport('# Title\n\n- **Bold** item')) !== JSON.stringify([
  { type: 'heading', depth: 1, text: 'Title' },
  { type: 'listItem', ordered: false, index: 1, text: 'Bold item' },
])) {
  throw new Error('markdown export blocks drifted from Agent Pi')
}
const exportedMd = exportMarkdownFile(cwd, exportSource, 'md', exportMarkdown)
if (exportedMd.filename !== 'analysis.md' || exportedMd.body.toString('utf8') !== exportMarkdown) {
  throw new Error('markdown download should keep source content without writing a -2 copy')
}
if (existsSync(join(cwd, 'analysis-2.md'))) throw new Error('export must not pollute the workspace with analysis-2.md')
const exportedDocx = exportMarkdownFile(cwd, exportSource, 'docx', exportMarkdown)
const docxXml = exportedDocx.body.toString('utf8')
if (exportedDocx.body.subarray(0, 2).toString() !== 'PK') throw new Error('docx is not a zip')
if (!docxXml.includes('分析报告') || !docxXml.includes('结论：可行。') || !docxXml.includes('• 工期：30 天')) {
  throw new Error('docx lost structured markdown')
}
if (docxXml.includes('# 分析报告') || docxXml.includes('**结论**') || docxXml.includes('- 工期')) {
  throw new Error('docx leaked raw markdown syntax')
}
const exportedHtml = markdownToHtml(exportMarkdown)
if (!exportedHtml.includes('<h1>') || !exportedHtml.includes('<strong>') || !exportedHtml.includes('<ul>') || !exportedHtml.includes('<table>')) {
  throw new Error('html export lost structured markdown')
}
if (exportedHtml.includes('# 分析报告') || exportedHtml.includes('**结论**') || exportedHtml.includes('- 工期')) {
  throw new Error('html leaked raw markdown syntax')
}
const exportedPdf = exportMarkdownFile(cwd, exportSource, 'pdf', exportMarkdown)
if (!exportedPdf.body.toString('utf8').startsWith('%PDF') || exportedPdf.body.length < 500) {
  throw new Error('pdf export failed')
}
const pdfText = [...exportedPdf.body.toString('latin1').matchAll(/<([0-9A-F]+)> Tj/g)]
  .map((match) => {
    const bytes = Buffer.from(match[1], 'hex')
    let offset = bytes[0] === 0xFE && bytes[1] === 0xFF ? 2 : 0
    let text = ''
    for (; offset + 1 < bytes.length; offset += 2) {
      text += String.fromCharCode((bytes[offset]! << 8) | bytes[offset + 1]!)
    }
    return text
  })
  .join('\n')
if (pdfText) {
  if (!pdfText.includes('分析报告') || !pdfText.includes('结论：可行。') || !pdfText.includes('工期：30 天')) {
    throw new Error('pdf lost structured markdown')
  }
  if (pdfText.includes('# 分析报告') || pdfText.includes('**结论**') || pdfText.includes('- 工期')) {
    throw new Error('pdf leaked raw markdown syntax')
  }
}
if (exportedPdf.body.length < 8000 && !pdfText) {
  throw new Error('pdf fallback produced an empty document')
}

const visionHome = mkdtempSync(join(tmpdir(), 'agent-pi-vision-'))
writeFileSync(join(visionHome, 'settings.yaml'), `agent-default-model:
  provider: deepseek-official
  model: deepseek-v4-pro
  reasoningEffort: max
llm-pi-ai:
  providers:
    kimi-coding:
      baseURL: https://api.kimi.com/coding
      models:
        - id: k3
          name: Kimi K3
          contextWindow: 1048576
          maxTokens: 131072
`)
const current = currentDefaultModel(visionHome)
if (!current || current.provider !== 'deepseek-official' || current.id !== 'deepseek-v4-pro') {
  throw new Error('currentDefaultModel must read agent-default-model from settings.yaml')
}
const namedModel = (() => {
  writeFileSync(join(visionHome, 'settings.yaml'), `agent-default-model:
  provider: kimi-coding
  model: k3
llm-pi-ai:
  providers:
    kimi-coding:
      baseURL: https://api.kimi.com/coding
      models:
        - id: k3
          name: Kimi K3
`)
  return currentDefaultModel(visionHome)
})()
if (!namedModel || namedModel.name !== 'Kimi K3') {
  throw new Error('currentDefaultModel must resolve the display name from llm-pi-ai providers')
}
await readVisionImages({
  sessionId: 'smoke-files',
  cwd: visionHome,
  files: [{ name: '纳米比亚矿产资源专业调研报告.md', relativePath: 'docs/namibia.md', kind: 'file' }],
})
const pendingFiles = peekPendingVisionContext('smoke-files')
if (!pendingFiles.replace(/\\/g, '/').includes('docs/namibia.md') || pendingFiles.includes('聚焦核电') || pendingFiles.includes('【附件】')) {
  throw new Error('pending vision context must list file paths instead of folding file bodies into chat')
}
const png = join(visionHome, 'pixel.png')
writeFileSync(png, Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64'))
await readVisionImages({
  sessionId: 'smoke-images',
  images: [{ name: 'pixel.png', path: png }],
  cwd: visionHome,
})
const pendingImages = peekPendingVisionContext('smoke-images')
if (!pendingImages.includes('pixel.png') || pendingImages.includes('<attached-image') || pendingImages.includes('faithful visual')) {
  throw new Error('readVisionImages must list native image paths, not captions in chat')
}

console.log('smoke ok', cwd)
console.log('tools', registered.join(','))
console.log('knowledge', knowledge.profileId, knowledge.packDir)
