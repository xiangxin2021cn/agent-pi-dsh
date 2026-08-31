import { isAbsolute, resolve } from 'node:path'
import {
  createBusinessProject,
  getBusinessProject,
  listBusinessProjects,
  updateBusinessProjectContract,
} from '../../../packages/business-projects/index.ts'
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
  kbPageIndexPath,
  listKbEntries,
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
  recordProjectUserRequirement,
  setProjectUserRequirementStatus,
  executionControlState,
  updateProjectExecution,
} from './orchestration.ts'
import { listUserRequirements } from './user-requirements.ts'
import {
  capabilityStatus,
  initTenderWorkspace,
  loadWorkspace,
  replaceCapability,
  summarizeCapability,
  upsertWorkspaceSection,
  validateCapability,
} from './workspace.ts'
import { capabilitySchemaHint } from './capability-schema.ts'
import { copyWorkbenchModule, listWorkbenchModules, removeUserModule, saveUserModule, saveUserSkill, setModuleDisabled, usesTenderControlProfile, workflowFor } from './modules.ts'
import { adoptWorkspace } from './adopt.ts'
import { auditProjectCitations } from './citations.ts'
import { prepareKbDocument } from './kb-prepare.ts'
import { generatePricingWorkbook } from './pricing-workbook.ts'
import { routeKnowledgeSurfaces } from './knowledge-surface-router.ts'
import { listSetupRestores } from './setup-restore.ts'
import { readPageIndexShadow, searchPageIndexShadow } from './pageindex-shadow.ts'
import { buildTenderKnowledgeGraph, traceKnowledgeGraph } from './knowledge-graph.ts'
import { loadEvidenceLedger, recordStructuredEvidence, renderStructuredEvidenceCitation } from './structured-evidence.ts'
import { assessAnalysisCoverage, loadAnalysisCoverage, recordAnalysisCoverage, type TenderAnalysisDomainId } from './analysis-coverage.ts'
import { recordKnowledgeTelemetry } from './knowledge-telemetry.ts'
import { loadWorkSurfacePolicy } from './worksurface-policy.ts'
import { refreshStageMemorySnapshot, slimStageMemorySnapshot } from './stage-memory.ts'

type DefineTool = (options: Record<string, unknown>) => unknown

export const tenderStageParameters = {
  action: { type: 'string', required: true, description: 'prepare | status | check | execution_status | execution_update | complete | complete_stage | resume | force_pass | reset | organize | record_requirement | satisfy_requirement' },
  projectId: { type: 'string', required: true },
  stageId: { type: 'string' },
  module: { type: 'string' },
  runId: { type: 'string' },
  executionStatus: { type: 'string', description: 'planning | working | waiting | blocked | completed | failed' },
  objective: { type: 'string' },
  currentBatch: { type: 'string' },
  planItems: {
    type: 'array',
    items: {
      type: 'object',
      additionalProperties: false,
      properties: {
        id: { type: 'string', required: true },
        title: { type: 'string', required: true },
        status: { type: 'string', required: true, description: 'pending | in_progress | done | blocked' },
        artifactPaths: { type: 'array', items: { type: 'string' } },
      },
    },
    description: 'Bounded live plan for the current parent session.',
  },
  assignments: {
    type: 'array',
    items: {
      type: 'object',
      additionalProperties: false,
      properties: {
        id: { type: 'string', required: true },
        title: { type: 'string', required: true },
        status: { type: 'string', required: true, description: 'queued | running | done | failed' },
        childSessionId: { type: 'string' },
        expectedOutput: { type: 'string' },
      },
    },
    description: 'Subagent assignments already dispatched by the parent session.',
  },
  blockerType: { type: 'string', description: 'none | human | evidence | tool | model' },
  blockerReason: { type: 'string' },
  blockerNeeded: { type: 'string' },
  nextAction: { type: 'string' },
  summary: { type: 'string' },
  observedRealityDigest: { type: 'string' },
  requirementId: { type: 'string' },
  requirementText: { type: 'string' },
  note: { type: 'string' },
  evidencePaths: { type: 'array' },
} as const

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
    name: 'tender_knowledge',
    description: 'Route and inspect tender knowledge across document/table/graph surfaces. PageIndex is a shadow navigator for long narrative setup manuscripts only; its preview is never evidence and it must never answer BOQ quantities. Use evidence_record to freeze claims with source hash and an immutable locator, then cite the returned [ev:claimId] token. Coverage actions record the five required analysis domains.',
    parameters: {
      action: { type: 'string', required: true, description: 'route | navigate | graph | evidence_record | evidence_status | coverage_record | coverage_status' },
      projectId: { type: 'string', required: true },
      question: { type: 'string' },
      sourceId: { type: 'string' },
      documentIds: { type: 'array' },
      tableIds: { type: 'array' },
      available: { type: 'json' },
      budget: { type: 'json' },
      from: { type: 'string' },
      maxHops: { type: 'number' },
      evidence: { type: 'array' },
      domain: { type: 'string' },
      readNodeIds: { type: 'array' },
      unreadNodeIds: { type: 'array' },
      evidenceClaimIds: { type: 'array' },
      conclusion: { type: 'string' },
      humanConfirmationRequired: { type: 'boolean' },
    },
    output: jsonOut(),
    async execute(args: Record<string, unknown>, exec: { agent?: { session?: { header?: { cwd?: string } } } }) {
      const cwd = sessionCwd(exec)
      const projectId = String(args.projectId || '')
      const project = getBusinessProject(cwd, 'tender', projectId)
      if (!project) throw new Error(`Unknown tender project ${projectId}`)
      const action = String(args.action || '')
      const startedAt = Date.now()
      const finish = (payload: unknown, operation: 'route' | 'navigate' | 'graph' | 'evidence' | 'coverage', surfaces: Array<'document' | 'table' | 'graph'>, sourceCount = 0, status: 'ok' | 'fallback' = 'ok') => {
        try {
          recordKnowledgeTelemetry(cwd, projectId, {
            operation, surfaces, sourceCount, status, elapsedMs: Date.now() - startedAt,
            modelCalls: 0, inputTokens: 0, outputTokens: 0, estimatedCostUsd: 0,
            detail: 'Agent Pi deterministic WorkSurface operation; no separate model or API credential used.',
          })
        } catch { /* telemetry must never block tender work */ }
        return textResult(payload)
      }
      if (action === 'route') {
        const route = routeKnowledgeSurfaces({
          question: String(args.question || ''),
          documentIds: Array.isArray(args.documentIds) ? args.documentIds.map(String) : undefined,
          tableIds: Array.isArray(args.tableIds) ? args.tableIds.map(String) : undefined,
          available: args.available as never,
          budget: args.budget as never,
        })
        return finish(route, 'route', route.surfaces)
      }
      if (action === 'navigate') {
        const selected = listSetupRestores(cwd, projectId)
          .filter((restore) => !args.sourceId || restore.originalName === String(args.sourceId) || restore.sourcePath === String(args.sourceId))
        const sources = selected.map((restore) => {
          const status = readPageIndexShadow({ manuscriptPath: restore.manuscriptPath, packPath: restore.packPath })
          return {
            sourceId: restore.originalName,
            state: status.state,
            reason: status.reason,
            hits: status.state === 'ready' && status.tree
              ? searchPageIndexShadow(status.tree, String(args.question || ''), Number((args.budget as { maxDocumentNodes?: number } | undefined)?.maxDocumentNodes) || 8)
              : [],
          }
        }).filter((source) => Boolean(args.sourceId) || source.state === 'ready')
        const knowledgeSources = listKbEntries()
          .filter((entry) => (!entry.parseStatus || entry.parseStatus === 'ready')
            && (args.sourceId
              ? (entry.slug === String(args.sourceId) || entry.name === String(args.sourceId))
              : entry.pageIndexStatus === 'ready'))
          .map((entry) => {
            const status = readPageIndexShadow({ manuscriptPath: entry.managedPath, outputPath: kbPageIndexPath(entry.slug) })
            return {
              sourceId: entry.slug,
              sourceName: entry.name,
              corpus: 'knowledge-base',
              state: status.state,
              reason: status.reason,
              hits: status.state === 'ready' && status.tree
                ? searchPageIndexShadow(status.tree, String(args.question || ''), Number((args.budget as { maxDocumentNodes?: number } | undefined)?.maxDocumentNodes) || 8)
                : [],
            }
          })
        const allSources = [...sources.map((source) => ({ ...source, corpus: 'project-setup' })), ...knowledgeSources]
        const policy = loadWorkSurfacePolicy()
        return finish({
          mode: policy.mode,
          defaultNavigator: policy.defaultNavigator,
          policyReason: policy.reason,
          sources: allSources,
          fallback: allSources.length === 0 || allSources.some((source) => source.state !== 'ready')
            ? 'Use existing MiniSearch/kb_find_clause/MinerU manuscript. Do not treat a missing or corrupt tree as fatal.'
            : undefined,
          evidenceRule: 'Hits are navigation only. Read the manuscript at the returned lines/pages and record exact quote + source hash before citing.',
        }, 'navigate', ['document'], allSources.length, allSources.length === 0 || allSources.some((source) => source.state !== 'ready') ? 'fallback' : 'ok')
      }
      if (action === 'graph') {
        const graph = buildTenderKnowledgeGraph(cwd, projectId, loadWorkspace(cwd, projectId))
        return finish(args.from ? { graph, trace: traceKnowledgeGraph(graph, String(args.from), Number(args.maxHops) || 4) } : graph, 'graph', ['graph'], graph.nodes.length)
      }
      if (action === 'evidence_record') {
        const ledger = recordStructuredEvidence(cwd, projectId, Array.isArray(args.evidence) ? args.evidence : [])
        return finish({ ledger, citations: ledger.claims.map((claim) => ({ claimId: claim.claimId, citation: renderStructuredEvidenceCitation(claim) })) }, 'evidence', [...new Set(ledger.claims.map((claim) => claim.surface))], ledger.claims.length)
      }
      if (action === 'evidence_status') {
        const ledger = loadEvidenceLedger(cwd, projectId)
        return finish(ledger, 'evidence', [...new Set(ledger.claims.map((claim) => claim.surface))], ledger.claims.length)
      }
      if (action === 'coverage_record') {
        const coverage = recordAnalysisCoverage(cwd, projectId, {
          domain: String(args.domain) as TenderAnalysisDomainId,
          readNodeIds: Array.isArray(args.readNodeIds) ? args.readNodeIds.map(String) : undefined,
          unreadNodeIds: Array.isArray(args.unreadNodeIds) ? args.unreadNodeIds.map(String) : undefined,
          evidenceClaimIds: Array.isArray(args.evidenceClaimIds) ? args.evidenceClaimIds.map(String) : undefined,
          conclusion: args.conclusion == null ? undefined : String(args.conclusion),
          humanConfirmationRequired: args.humanConfirmationRequired == null ? undefined : Boolean(args.humanConfirmationRequired),
        })
        return finish(coverage, 'coverage', ['document'], Object.keys(coverage.sourceTreeHashes).length)
      }
      if (action === 'coverage_status') {
        const ledger = loadAnalysisCoverage(cwd, projectId)
        return finish({ ledger, status: assessAnalysisCoverage(ledger) }, 'coverage', ['document'], Object.keys(ledger?.sourceTreeHashes ?? {}).length)
      }
      throw new Error(`Unknown tender_knowledge action ${action}`)
    },
  }))

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
        const result = replaceCapability(cwd, projectId, capability, args.data)
        return textResult({
          ...summarizeCapability(cwd, projectId, capability, result),
          written: true,
        })
      }
      if (action === 'validate' && args.data !== undefined) {
        const result = validateCapability(cwd, projectId, capability, args.data)
        return textResult({
          ...summarizeCapability(cwd, projectId, capability, { audit: result.audit, data: result.parsed }),
          ok: result.ok,
          written: result.written,
        })
      }
      if (action === 'status' || action === 'configure') {
        const status = capabilityStatus(cwd, projectId, capability)
        return textResult({
          ...summarizeCapability(cwd, projectId, capability, status),
          configured: action === 'configure',
        })
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
    description: 'Create, adopt, configure, or list Agent Pi workbench projects in the current workspace. configure persists the end-to-end project goal and terminal deliverables used by every DSH stage.',
    parameters: {
      action: { type: 'string', required: true, description: 'create | adopt | configure | list | get' },
      module: { type: 'string', description: 'Workbench module id (tender / delivery / investment / user module)' },
      projectId: { type: 'string' },
      name: { type: 'string' },
      inputPaths: { type: 'array', items: { type: 'string' } },
      projectGoal: { type: 'string' },
      terminalDeliverables: { type: 'array', items: { type: 'string' } },
    },
    output: jsonOut(),
    async execute(args: Record<string, unknown>, exec: { agent?: { session?: { header?: { cwd?: string } } } }) {
      const cwd = sessionCwd(exec)
      const module = (args.module ? String(args.module) : 'tender') as BusinessModuleId
      if (args.action === 'list') return textResult(listBusinessProjects(cwd, module))
      if (args.action === 'get') {
        return textResult(getBusinessProject(cwd, module, String(args.projectId)))
      }
      if (args.action === 'configure') {
        return textResult(updateBusinessProjectContract(cwd, module, String(args.projectId), {
          projectGoal: args.projectGoal === undefined ? undefined : String(args.projectGoal),
          terminalDeliverables: Array.isArray(args.terminalDeliverables) ? args.terminalDeliverables.map(String) : undefined,
        }))
      }
      if (args.action === 'adopt') {
        return textResult(adoptWorkspace(cwd, {
          module,
          name: args.name ? String(args.name) : undefined,
          projectId: args.projectId ? String(args.projectId) : undefined,
          inputPaths: Array.isArray(args.inputPaths) ? args.inputPaths.map(String) : undefined,
          projectGoal: args.projectGoal ? String(args.projectGoal) : undefined,
          terminalDeliverables: Array.isArray(args.terminalDeliverables) ? args.terminalDeliverables.map(String) : undefined,
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
        projectGoal: args.projectGoal ? String(args.projectGoal) : workflow.projectGoal,
        terminalDeliverables: Array.isArray(args.terminalDeliverables)
          ? args.terminalDeliverables.map(String)
          : workflow.terminalDeliverables,
      })
      if (usesTenderControlProfile(module)) {
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
    description: 'Prepare or inspect a workbench stage. DSH is the only executor; the workbench provides disk facts, light coverage checks and explicit human stops. User requirements from the bound parent chat outrank default soft gates. execution_update is optional sparse progress telemetry only, never a heartbeat or a second planner. status returns pending work plus execution/fact alignment. Does not spawn subagents.',
    parameters: tenderStageParameters,
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
      const sessionId = String(exec.agent?.session?.id || '')

      if (args.action === 'status') {
        const board = inspectBoard(cwd, project)
        return textResult({
          ...slimStageStatus(board),
          memory: slimStageMemorySnapshot(refreshStageMemorySnapshot(cwd, project)),
          userRequirements: listUserRequirements(cwd, project).filter((row) => row.status !== 'dismissed'),
          control: executionControlState(cwd, project, sessionId),
        })
      }
      if (args.action === 'check') {
        const reality = projectReality(cwd, project)
        return textResult({ reality, control: executionControlState(cwd, project, sessionId, reality) })
      }
      if (args.action === 'execution_status') {
        const control = executionControlState(cwd, project, sessionId)
        return textResult({
          execution: control.execution,
          control,
        })
      }
      if (args.action === 'execution_update') {
        const stageId = String(args.stageId ?? loadStageState(cwd, projectId)?.stageId ?? '')
        const execution = updateProjectExecution(cwd, project, {
          sessionId,
          runId: args.runId ? String(args.runId) : undefined,
          stageId,
          status: args.executionStatus ? String(args.executionStatus) : undefined,
          objective: args.objective ? String(args.objective) : undefined,
          currentBatch: args.currentBatch ? String(args.currentBatch) : undefined,
          planItems: Array.isArray(args.planItems) ? args.planItems : undefined,
          assignments: Array.isArray(args.assignments) ? args.assignments : undefined,
          blockerType: args.blockerType ? String(args.blockerType) : undefined,
          blockerReason: args.blockerReason === undefined ? undefined : String(args.blockerReason),
          blockerNeeded: args.blockerNeeded === undefined ? undefined : String(args.blockerNeeded),
          nextAction: args.nextAction === undefined ? undefined : String(args.nextAction),
          summary: args.summary === undefined ? undefined : String(args.summary),
          observedRealityDigest: args.observedRealityDigest === undefined ? undefined : String(args.observedRealityDigest),
        })
        return textResult({ execution, control: executionControlState(cwd, project, sessionId) })
      }
      if (args.action === 'force_pass') {
        return textResult(markForcePass(cwd, projectId, args.stageId ? String(args.stageId) : undefined))
      }
      if (args.action === 'record_requirement') {
        return textResult(recordProjectUserRequirement(cwd, project, {
          sessionId: String(exec.agent?.session?.id || ''),
          stageId: args.stageId ? String(args.stageId) : undefined,
          text: String(args.requirementText || ''),
        }))
      }
      if (args.action === 'satisfy_requirement') {
        return textResult(setProjectUserRequirementStatus(
          cwd,
          project,
          String(args.requirementId || ''),
          'implemented',
          {
            note: String(args.note || ''),
            evidencePaths: Array.isArray(args.evidencePaths) ? args.evidencePaths.map(String) : [],
          },
        ))
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
        return textResult(resumeUnfinished(cwd, project, selectedKnowledgeSlugs, { sessionId }))
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
    description: 'Create or replace a user-defined workbench module. You derive and pass the definition; never ask the user to paste JSON. A module is a complete workbench package (tab + stage monitor + setup + review/approval gates + skills), rendered by this app — do not invent a new UI. Shape: { schemaVersion: 1, id, labelZh, controlProfile?: "tender", setupStageId?, bindingAreaByStage?, kbPack?, stages: [{ id, labelZh, prompt, hintZh?, skillSlugs?, reviewSkillSlugs?, reviewPolicy?, approvalGate?, listsSources?, summaryDeliverable? }] }. Use controlProfile: "tender" only for a workflow copied from the built-in tender process with its canonical stage ids; it preserves deterministic BOQ/evidence/capability/final-freeze controls after the module is renamed. Built-in ids cannot be overridden. Read skill workbench-domain-builder first.',
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
