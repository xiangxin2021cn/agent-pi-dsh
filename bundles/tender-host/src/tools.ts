import { isAbsolute, resolve } from 'node:path'
import { createBusinessProject, getBusinessProject, listBusinessProjects } from '../../../packages/business-projects/index.ts'
import type { BusinessModuleId } from '../../../packages/business-projects/types.ts'
import { sessionCwd, textResult } from './cwd.ts'
import { evidencePolicy, forcePassEvidence, forcePassPricingIntel, assessEvidence } from './evidence.ts'
import {
  addKbFile,
  findKbClause,
  findKbTable,
  importKbTransferFromPath,
  getKbTaskSlugs,
  kbOverview,
  readKbChunk,
  reindexKb,
  removeKbEntry,
  searchKb,
  seedBundledKnowledge,
} from './kb.ts'
import { looksLikeKbTransferPath } from './kb-transfer.ts'
import { listOfficialOutputs, publishOfficialOutput } from './outputs.ts'
import {
  loadStageState,
  markForcePass,
  prepareStage,
  inspectBoard,
  completeSetup,
  completeStage,
  resetOrchestration,
  organizeDeliverables,
  projectReality,
  resumeUnfinished,
  slimStageStatus,
} from './orchestration.ts'
import {
  capabilityStatus,
  initTenderWorkspace,
  loadWorkspace,
  replaceCapability,
  upsertWorkspaceSection,
  validateCapability,
} from './workspace.ts'
import { capabilitySchemaHint } from './capability-schema.ts'
import { copyWorkbenchModule, listWorkbenchModules, removeUserModule, saveUserModule, saveUserSkill, setModuleDisabled, workflowFor } from './modules.ts'
import { adoptWorkspace } from './adopt.ts'
import { auditProjectCitations } from './citations.ts'
import { prepareKbDocument } from './kb-prepare.ts'
import { generatePricingWorkbook } from './pricing-workbook.ts'

type DefineTool = (options: Record<string, unknown>) => unknown

function jsonOut() {
  return {
    schema: { type: 'json' },
    render: (_args: unknown, value: unknown) => [{
      type: 'text',
      text: typeof value === 'string' ? value : JSON.stringify(value, null, 2),
    }],
  }
}

export function registerTools(ctx: {
  tools: { register: (definition: unknown) => unknown }
}, defineTool: DefineTool): void {

  ctx.tools.register(defineTool({
    name: 'tender_workspace',
    description: 'Create or update the tender workspace JSON (documents, requirements, criteria, deliverables) and run a deterministic readiness audit. Use init first, then upsert_documents after registering bid files.',
    parameters: {
      action: { type: 'string', required: true, description: 'init | upsert_documents | upsert_requirements | upsert_criteria | upsert_deliverables | status' },
      projectId: { type: 'string', required: true },
      project: { type: 'json', description: 'Required for init: { id, title, employer?, jurisdiction?, currency?, status? }' },
      documents: { type: 'array' },
      requirements: { type: 'array' },
      criteria: { type: 'array' },
      deliverables: { type: 'array' },
    },
    output: jsonOut(),
    async execute(args: Record<string, unknown>, exec: { agent?: { session?: { header?: { cwd?: string } } } }) {
      const cwd = sessionCwd(exec)
      const projectId = String(args.projectId)
      const action = String(args.action)
      if (action === 'init') {
        return textResult(initTenderWorkspace(cwd, projectId, args.project as never))
      }
      if (action === 'status') {
        const workspace = loadWorkspace(cwd, projectId)
        return textResult({ workspace, capabilities: capabilityStatus(cwd, projectId) })
      }
      const patch: Record<string, unknown> = {}
      if (action === 'upsert_documents') patch.documents = args.documents
      if (action === 'upsert_requirements') patch.requirements = args.requirements
      if (action === 'upsert_criteria') patch.criteria = args.criteria
      if (action === 'upsert_deliverables') patch.deliverables = args.deliverables
      return textResult(upsertWorkspaceSection(cwd, projectId, patch))
    },
  }))

  ctx.tools.register(defineTool({
    name: 'tender_capability',
    description: 'Write or validate a tender capability pack (document_analysis, boq_reconciliation, boq_five_step_pricing, etc.) using business-core schema/audit. init is an alias of replace; configure confirms the already-enabled capability and returns status. Call action=schema before the first boq_five_step_pricing replace — top-level keys are currency/pricingStatus/itemBuildUps/assumptions (plus optional pricingStandard/vatTreatment/indirectCostPolicy/resourceSummary). Do not invent missing specs.',
    parameters: {
      action: { type: 'string', required: true, description: 'replace | init | configure | status | validate | schema' },
      projectId: { type: 'string', required: true },
      capability: { type: 'string', required: true },
      data: { type: 'json', description: 'Capability payload for replace or validate' },
    },
    output: jsonOut(),
    async execute(args: Record<string, unknown>, exec: { agent?: { session?: { header?: { cwd?: string } } } }) {
      const cwd = sessionCwd(exec)
      const projectId = String(args.projectId)
      const capability = String(args.capability) as Parameters<typeof replaceCapability>[2]
      const action = String(args.action)
      if (action === 'schema') {
        return textResult(capabilitySchemaHint(capability))
      }
      if (action === 'replace' || action === 'init') {
        return textResult(replaceCapability(cwd, projectId, capability, args.data))
      }
      if (action === 'validate' && args.data !== undefined) {
        return textResult(validateCapability(cwd, projectId, capability, args.data))
      }
      if (action === 'status' || action === 'configure') {
        return textResult({ configured: action === 'configure', ...capabilityStatus(cwd, projectId, capability) })
      }
      throw new Error(`Unknown tender_capability action ${action}`)
    },
  }))

  ctx.tools.register(defineTool({
    name: 'tender_pricing_workbook',
    description: 'Generate the formula BOQ unit-cost workbook (xlsx) from the packed boq_five_step_pricing data. Call after chapter Markdown and 《BOQ 组价总报告.md》. Layout matches the factory template: Summary + Rates + one sheet per item; F=D*E, block SUM, header RATE formulas. Blue/yellow cells are inputs.',
    parameters: {
      action: { type: 'string', required: true, description: 'generate' },
      projectId: { type: 'string', required: true },
    },
    output: jsonOut(),
    async execute(args: Record<string, unknown>, exec: { agent?: { session?: { header?: { cwd?: string } } } }) {
      const cwd = sessionCwd(exec)
      const projectId = String(args.projectId)
      if (String(args.action) !== 'generate') {
        throw new Error('tender_pricing_workbook 目前只支持 action=generate')
      }
      const project = getBusinessProject(cwd, 'tender', projectId)
      return textResult(generatePricingWorkbook({
        cwd,
        projectId,
        projectTitle: project?.name,
      }))
    },
  }))

  ctx.tools.register(defineTool({
    name: 'tender_evidence',
    description: 'Project-characteristic evidence gate: assess gaps, read policy, waive the gate, or force-pass (waive + authorize web diligence on the listed gaps). waive_pricing / force_pass_pricing unlock the BOQ supplier-productivity pack so planning may use web quotes and derived outputs after 《组价依据说明.md》. Never fill characteristic facts from model memory.',
    parameters: {
      action: { type: 'string', required: true, description: 'assess | status | waive | force_pass | waive_pricing | force_pass_pricing' },
      projectId: { type: 'string', required: true },
      text: { type: 'string', description: 'Optional analysis text to scan for named standards' },
    },
    output: jsonOut(),
    async execute(args: Record<string, unknown>, exec: { agent?: { session?: { header?: { cwd?: string } } } }) {
      const cwd = sessionCwd(exec)
      const projectId = String(args.projectId)
      if (args.action === 'force_pass') return textResult(forcePassEvidence(cwd, projectId, { authorizeWeb: true }))
      if (args.action === 'waive') return textResult(forcePassEvidence(cwd, projectId))
      if (args.action === 'waive_pricing' || args.action === 'force_pass_pricing') {
        return textResult(forcePassPricingIntel(cwd, projectId))
      }
      if (args.action === 'assess') return textResult(assessEvidence(cwd, projectId, String(args.text ?? '')))
      return textResult(evidencePolicy(cwd, projectId))
    },
  }))

  ctx.tools.register(defineTool({
    name: 'tender_outputs',
    description: 'Optionally copy a customer-facing file into Agent Pi Outputs/<projectId>/. Prefer writing Markdown directly to brief.markdownPath. JSON ledgers stay in orchestration/reports. action=list scans Official Outputs plus the catalog.',
    parameters: {
      action: { type: 'string', required: true, description: 'publish | list' },
      projectId: { type: 'string', required: true },
      sourcePath: { type: 'string' },
      kind: { type: 'string', description: 'json | markdown | other' },
    },
    output: jsonOut(),
    async execute(args: Record<string, unknown>, exec: { agent?: { session?: { header?: { cwd?: string } } } }) {
      const cwd = sessionCwd(exec)
      const projectId = String(args.projectId)
      if (args.action === 'list') return textResult(listOfficialOutputs(cwd, projectId))
      return textResult(publishOfficialOutput(
        cwd,
        projectId,
        String(args.sourcePath),
        (args.kind as 'json' | 'markdown' | 'other') ?? 'other',
      ))
    },
  }))

  ctx.tools.register(defineTool({
    name: 'kb_list',
    description: 'List local knowledge-base entries grouped by category (slug, name, clauseCount, coverage, source). Seeds the bundled method-standard/exemplar packs on first use. Start here when unsure what the KB contains.',
    parameters: {
      category: { type: 'string', description: 'Optional category substring filter' },
    },
    output: jsonOut(),
    async execute(args: Record<string, unknown>) {
      seedBundledKnowledge()
      const overview = kbOverview()
      if (args.category) {
        const needle = String(args.category).toLocaleLowerCase()
        overview.entries = overview.entries.filter((entry) => entry.category.toLocaleLowerCase().includes(needle))
      }
      return textResult(overview)
    },
  }))

  ctx.tools.register(defineTool({
    name: 'kb_search',
    description: 'Search the local knowledge base (specs, method standards, exemplars) with MiniSearch BM25. Field boost is clause id, then title, heading path, then body. Returns scored units with citations (slug:chunkId); read the manuscript with kb_read_chunk. Cross-corpus searches keep at most 3 hits per entry so results span documents; pass slugs to search one document exhaustively. Locate a known clause number with kb_find_clause, not this tool. When a spec/standard fact matters, search here and cite the unit instead of quoting from memory.',
    parameters: {
      query: { type: 'string', required: true },
      limit: { type: 'number', description: 'Max hits, default 8, cap 20' },
      slugs: { type: 'array', items: { type: 'string' }, description: 'Restrict to specific entries (also lifts the 3-per-entry cap)' },
      category: { type: 'string', description: 'Restrict to a category substring' },
    },
    output: jsonOut(),
    async execute(args: Record<string, unknown>) {
      seedBundledKnowledge()
      const hits = searchKb(String(args.query ?? ''), {
        limit: args.limit ? Number(args.limit) : undefined,
        slugs: Array.isArray(args.slugs) ? args.slugs.map(String) : undefined,
        category: args.category ? String(args.category) : undefined,
      })
      return textResult({ query: String(args.query ?? ''), hits, hint: hits.length === 0 ? '无命中。可先 kb_list 查看条目，或换关键词/条款号重试。' : '用 kb_read_chunk(slug, chunkId) 读全文并引用 citation。' })
    },
  }))

  ctx.tools.register(defineTool({
    name: 'kb_find_clause',
    description: 'Locate a clause/section number (e.g. "A1.2.3", "5.2.3") by structured unit id. Exact id first, then child subclauses. Follow with kb_read_chunk for the complete unit text.',
    parameters: {
      value: { type: 'string', required: true, description: 'Clause or section number' },
      slugs: { type: 'array', items: { type: 'string' } },
      limit: { type: 'number' },
    },
    output: jsonOut(),
    async execute(args: Record<string, unknown>) {
      seedBundledKnowledge()
      return textResult(findKbClause(String(args.value ?? ''), {
        limit: args.limit ? Number(args.limit) : undefined,
        slugs: Array.isArray(args.slugs) ? args.slugs.map(String) : undefined,
      }))
    },
  }))

  ctx.tools.register(defineTool({
    name: 'kb_find_table',
    description: 'Locate tables or BOQ item codes inside knowledge-base entries by caption, header keyword, or item number (e.g. "51.02"). MinerU tables are whole units; cite [kb:slug:table-…].',
    parameters: {
      value: { type: 'string', required: true, description: 'Table header keyword or BOQ item code' },
      slugs: { type: 'array', items: { type: 'string' } },
      limit: { type: 'number' },
    },
    output: jsonOut(),
    async execute(args: Record<string, unknown>) {
      seedBundledKnowledge()
      return textResult(findKbTable(String(args.value ?? ''), {
        limit: args.limit ? Number(args.limit) : undefined,
        slugs: Array.isArray(args.slugs) ? args.slugs.map(String) : undefined,
      }))
    },
  }))

  ctx.tools.register(defineTool({
    name: 'kb_read_chunk',
    description: 'Read one knowledge-base unit by slicing the parse manuscript at the stored span. Use after kb_search / kb_find_clause / kb_find_table. Cite [kb:slug:clauseId].',
    parameters: {
      slug: { type: 'string', required: true },
      chunkId: { type: 'string', required: true },
    },
    output: jsonOut(),
    async execute(args: Record<string, unknown>) {
      return textResult(readKbChunk(String(args.slug ?? ''), String(args.chunkId ?? '')))
    },
  }))

  ctx.tools.register(defineTool({
    name: 'kb_prepare_document',
    description: 'You call this. The host does not convert a PDF until you do. Official read/read_image cannot open PDF. When the user uploads a PDF and asks to 准确整理/整理完整内容/全文转录, or to build a knowledge pack, call this on the PDF path first. It writes <stem>-知识包/, a draft manuscript.md when a text layer exists, and by default rasterizes up to 20 pages to PNG. Then you read_image those PNGs (Flash Vision Exp) and rewrite manuscript.md as readable Markdown that mirrors the printed page (ATX headings, TOC, tables) — do not import the raw extract. Pass images:false only to skip PNGs. Use startPage/endPage for later batches. Never call vision_*. Never ask the user to export pages.',
    parameters: {
      path: { type: 'string', required: true, description: 'PDF path (absolute preferred)' },
      startPage: { type: 'number', description: '1-based inclusive start page for rasterizing' },
      endPage: { type: 'number', description: '1-based inclusive end page; default first 20 pages' },
      images: { type: 'boolean', description: 'Default on. Pass false to skip page PNGs and keep only the text-layer draft.' },
      category: { type: 'string', description: 'Knowledge-pack category; 用户模板 when cloning format/outline/depth. Defaults 规范 unless the file name ends with 模板/template.' },
    },
    output: jsonOut(),
    async execute(args: Record<string, unknown>, exec: { agent?: { session?: { header?: { cwd?: string } } } }) {
      const cwd = sessionCwd(exec)
      return textResult(await prepareKbDocument({
        path: String(args.path ?? ''),
        cwd,
        startPage: args.startPage != null ? Number(args.startPage) : undefined,
        endPage: args.endPage != null ? Number(args.endPage) : undefined,
        images: typeof args.images === 'boolean' ? args.images : undefined,
        category: args.category ? String(args.category) : undefined,
      }))
    },
  }))

  ctx.tools.register(defineTool({
    name: 'kb_add',
    description: 'Register a file or knowledge pack into the local knowledge base. A pack folder (pack.json + manuscript.md) indexes immediately with the pack units. Text (.md/.txt/.json) indexes immediately. To transcribe a PDF in chat, call kb_prepare_document first, then import the pack folder. Raw PDF/Word/Excel/PPT/images can also be parsed on the Knowledge Base page (local text layer or MinerU). Re-adding the same file rebuilds the entry.',
    parameters: {
      path: { type: 'string', required: true, description: 'File path, a knowledge-pack folder / pack.json / manuscript.md, or an Agent Pi .apkb transfer pack (absolute preferred)' },
      name: { type: 'string', description: 'Display name; defaults to file name' },
      category: { type: 'string', description: 'e.g. 规范/合同/范文/方法标准/用户模板. A user-owned writing template uses 用户模板. Defaults 未分类, or 用户模板 when the file name looks like one.' },
      slug: { type: 'string', description: 'Stable id override' },
      folder: { type: 'string', description: 'Optional collection under the category, e.g. COTO 2020. Inferred from COTO/COLTO/FIDIC chapter file names when omitted.' },
    },
    output: jsonOut(),
    async execute(args: Record<string, unknown>, exec: { agent?: { session?: { header?: { cwd?: string } } } }) {
      const cwd = sessionCwd(exec)
      const path = String(args.path ?? '')
      const resolved = path && (isAbsolute(path) ? resolve(path) : resolve(cwd || process.cwd(), path))
      if (resolved && looksLikeKbTransferPath(resolved)) return textResult(importKbTransferFromPath(resolved))
      return textResult(addKbFile({
        path,
        name: args.name ? String(args.name) : undefined,
        category: args.category ? String(args.category) : undefined,
        slug: args.slug ? String(args.slug) : undefined,
        folderName: args.folder ? String(args.folder) : undefined,
        baseDir: cwd,
      }))
    },
  }))

  ctx.tools.register(defineTool({
    name: 'kb_remove',
    description: 'Remove one knowledge-base entry (registry row, index, managed copy). Removed seeded entries stay removed until explicitly re-added.',
    parameters: {
      slug: { type: 'string', required: true },
    },
    output: jsonOut(),
    async execute(args: Record<string, unknown>) {
      return textResult(removeKbEntry(String(args.slug ?? '')))
    },
  }))

  ctx.tools.register(defineTool({
    name: 'kb_reindex',
    description: 'Rebuild unit indexes for one entry or all entries, even when the manuscript hash is unchanged. MinerU entries rebuild from the managed Markdown parse, not the original PDF/Office file.',
    parameters: {
      slug: { type: 'string', description: 'Omit to reindex everything' },
    },
    output: jsonOut(),
    async execute(args: Record<string, unknown>) {
      return textResult(reindexKb(args.slug ? String(args.slug) : undefined))
    },
  }))

  ctx.tools.register(defineTool({
    name: 'tender_project',
    description: 'Create, adopt, or list Agent Pi workbench projects in the current workspace. adopt registers the existing conversation folder under a chosen module without creating a new directory.',
    parameters: {
      action: { type: 'string', required: true, description: 'create | adopt | list | get' },
      module: { type: 'string', description: 'Workbench module id (tender / delivery / investment / user module)' },
      projectId: { type: 'string' },
      name: { type: 'string' },
      inputPaths: { type: 'array', items: { type: 'string' } },
    },
    output: jsonOut(),
    async execute(args: Record<string, unknown>, exec: { agent?: { session?: { header?: { cwd?: string } } } }) {
      const cwd = sessionCwd(exec)
      const module = (args.module ? String(args.module) : 'tender') as BusinessModuleId
      if (args.action === 'list') return textResult(listBusinessProjects(cwd, module))
      if (args.action === 'get') {
        return textResult(getBusinessProject(cwd, module, String(args.projectId)))
      }
      if (args.action === 'adopt') {
        return textResult(adoptWorkspace(cwd, {
          module,
          name: args.name ? String(args.name) : undefined,
          projectId: args.projectId ? String(args.projectId) : undefined,
          inputPaths: Array.isArray(args.inputPaths) ? args.inputPaths.map(String) : undefined,
        }))
      }
      const projectId = String(args.projectId ?? `p${Date.now()}`)
      const workflow = workflowFor(module)
      const project = createBusinessProject({
        workspaceRootPath: cwd,
        projectId,
        module,
        name: String(args.name ?? projectId),
        rootPath: cwd,
        workflowId: workflow.id,
        createDirectory: true,
        inputPaths: Array.isArray(args.inputPaths) ? args.inputPaths.map(String) : [],
      })
      if (module === 'tender') {
        try {
          initTenderWorkspace(cwd, projectId, { id: projectId, title: project.name, status: 'active' })
        } catch {
          // already initialized
        }
      }
      return textResult(project)
    },
  }))

  ctx.tools.register(defineTool({
    name: 'tender_stage',
    description: 'Prepare or inspect a workbench stage. Writes per-file briefs under orchestration/briefs for analysis/pricing. status returns the pending checklist only — completed workers are not re-scanned. Call complete_stage after every deliverable of the current stage is finished so the workbench stops auto-resuming. force_pass on boq-five-step-pricing also waives the supplier/productivity pack (still write 组价依据说明.md). Does not spawn subagents — use dsh native subagent/workflow if you need parallelism.',
    parameters: {
      action: { type: 'string', required: true, description: 'prepare | status | check | complete | complete_stage | resume | force_pass | reset | organize' },
      projectId: { type: 'string', required: true },
      stageId: { type: 'string' },
      module: { type: 'string' },
    },
    output: jsonOut(),
    execute(args: Record<string, unknown>, exec: {
      agent?: { session?: { id?: string; header?: { cwd?: string } } }
    }) {
      const cwd = sessionCwd(exec)
      const projectId = String(args.projectId)
      const module = (args.module ? String(args.module) : 'tender') as BusinessModuleId
      const project = getBusinessProject(cwd, module, projectId)
      if (!project) throw new Error(`Unknown project ${module}/${projectId}. Call tender_project create first.`)
      const selectedKnowledgeSlugs = getKbTaskSlugs(exec.agent?.session?.id)

      if (args.action === 'status') {
        return textResult(slimStageStatus(inspectBoard(cwd, project)))
      }
      if (args.action === 'check') {
        return textResult(projectReality(cwd, project))
      }
      if (args.action === 'force_pass') {
        return textResult(markForcePass(cwd, projectId, args.stageId ? String(args.stageId) : undefined))
      }
      if (args.action === 'complete') {
        return textResult(completeSetup(cwd, project, selectedKnowledgeSlugs))
      }
      if (args.action === 'complete_stage') {
        const stageId = String(args.stageId ?? loadStageState(cwd, projectId)?.stageId ?? '')
        if (!stageId) throw new Error('complete_stage 需要 stageId（当前没有进行中的阶段）。')
        return textResult(completeStage(cwd, project, stageId))
      }
      if (args.action === 'resume') {
        return textResult(resumeUnfinished(cwd, project, selectedKnowledgeSlugs))
      }
      const stageId = String(args.stageId ?? workflowFor(module).stages[0]?.id)
      if (args.action === 'reset' || args.action === 'reset_orchestration') {
        return textResult(resetOrchestration(cwd, project, stageId))
      }
      if (args.action === 'organize' || args.action === 'organize_deliverables') {
        return textResult(organizeDeliverables(cwd, project, stageId))
      }
      return textResult(prepareStage(cwd, project, stageId, selectedKnowledgeSlugs))
    },
  }))

  ctx.tools.register(defineTool({
    name: 'tender_citations',
    description: 'Verify every citation token ([kb:slug:chunkId], [src:path#L10-L25]) inside the project\'s Official Outputs Markdown. Returns totals plus orphans (unresolvable tokens) with file, line, and reason. Run before claiming a stage QA-clean; fix orphans, then re-run.',
    parameters: {
      projectId: { type: 'string', required: true },
      module: { type: 'string', description: 'Defaults tender' },
    },
    output: jsonOut(),
    async execute(args: Record<string, unknown>, exec: { agent?: { session?: { header?: { cwd?: string } } } }) {
      const cwd = sessionCwd(exec)
      const module = args.module ? String(args.module) : 'tender'
      const project = getBusinessProject(cwd, module, String(args.projectId))
      if (!project) throw new Error(`Unknown project ${module}/${String(args.projectId)}.`)
      return textResult(auditProjectCitations(cwd, project))
    },
  }))

  ctx.tools.register(defineTool({
    name: 'workbench_module_list',
    description: 'List workbench business modules: built-ins (tender/delivery/investment) and user-created domain modules, including disabled ones and load errors from broken module files.',
    parameters: {},
    output: jsonOut(),
    async execute() {
      return textResult(listWorkbenchModules({ includeDisabled: true }))
    },
  }))

  ctx.tools.register(defineTool({
    name: 'workbench_module_save',
    description: 'Create or replace a user-defined workbench module. You derive and pass the definition; never ask the user to paste JSON. A module is a complete workbench package (tab + stage monitor + setup + process gates + skills), rendered by this app — do not invent a new UI. Shape: { schemaVersion: 1, id, labelZh, setupStageId?, bindingAreaByStage?, kbPack?, stages: [{ id, labelZh, prompt, hintZh?, skillSlugs?, reviewSkillSlugs?, listsSources?, summaryDeliverable? }] }. Built-in ids cannot be overridden. Read skill workbench-domain-builder first.',
    parameters: {
      definition: { type: 'json', required: true, description: 'Complete module definition object' },
    },
    output: jsonOut(),
    async execute(args: Record<string, unknown>) {
      return textResult(saveUserModule(args.definition))
    },
  }))

  ctx.tools.register(defineTool({
    name: 'workbench_module_copy',
    description: 'Clone a built-in or user workbench module into a new user-module file. Built-ins stay untouched. Pass source id; optional newId and labelZh (defaults: <id>-copy and 「原名（副本）」). The copy is live immediately.',
    parameters: {
      id: { type: 'string', required: true, description: 'Source module id to copy' },
      newId: { type: 'string', description: 'Destination user-module id; must not be a built-in id' },
      labelZh: { type: 'string', description: 'Chinese display name for the copy' },
    },
    output: jsonOut(),
    async execute(args: Record<string, unknown>) {
      return textResult(copyWorkbenchModule(String(args.id ?? ''), {
        id: args.newId ? String(args.newId) : undefined,
        labelZh: args.labelZh ? String(args.labelZh) : undefined,
      }))
    },
  }))

  ctx.tools.register(defineTool({
    name: 'workbench_module_remove',
    description: 'Delete a user-created workbench module definition file. Built-ins cannot be removed (disable instead). Existing projects of that module keep their data but lose workflow resolution — warn the user first.',
    parameters: {
      id: { type: 'string', required: true },
    },
    output: jsonOut(),
    async execute(args: Record<string, unknown>) {
      return textResult(removeUserModule(String(args.id ?? '')))
    },
  }))

  ctx.tools.register(defineTool({
    name: 'workbench_module_set_enabled',
    description: 'Enable or disable a workbench module (built-in or user). Disabled modules disappear from the workbench module bar and project creation; existing projects keep working.',
    parameters: {
      id: { type: 'string', required: true },
      enabled: { type: 'boolean', required: true },
    },
    output: jsonOut(),
    async execute(args: Record<string, unknown>) {
      return textResult(setModuleDisabled(String(args.id ?? ''), args.enabled !== true))
    },
  }))

  ctx.tools.register(defineTool({
    name: 'workbench_skill_save',
    description: 'Persist a domain method skill to the user skill root ($DSH_HOME/skills/<slug>/SKILL.md). Hot-loads without restart and survives upgrades. Use when distilling a finished piece of work into a reusable workbench module: write the method, structure, and the user\'s hard rules learned during revisions into the skill, then reference the slug from the module stages\' skillSlugs. Frontmatter name must equal the slug and description must say when to use it.',
    parameters: {
      slug: { type: 'string', required: true, description: 'kebab-case slug, e.g. method-statement-za-method' },
      markdown: { type: 'string', required: true, description: 'Full SKILL.md content: --- name/description frontmatter --- then the method body' },
    },
    output: jsonOut(),
    async execute(args: Record<string, unknown>) {
      return textResult(saveUserSkill(args.slug, args.markdown))
    },
  }))

}
