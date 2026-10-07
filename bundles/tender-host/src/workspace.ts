import { createHash } from 'node:crypto'
import { existsSync, readFileSync, statSync } from 'node:fs'
import { basename, extname, join, resolve } from 'node:path'
import { isDeepStrictEqual } from 'node:util'
import {
  auditTenderWorkspace,
  parseTenderWorkspace,
  parseTenderCapabilityEnvelope,
  parseTenderCapabilityIndex,
  parseTenderDocumentAnalysisData,
  parseTenderEvaluationStrategyData,
  parseTenderBoqReconciliationData,
  parseTenderProjectBoundaryPack,
  parseTenderBoqFiveStepPricingData,
  parseTenderConstructionResourceScheduleData,
  parseTenderBidderCommitmentsData,
  parseTenderExecutionPlanData,
  parseTenderScheduleResourceData,
  parseTenderCostCashFlowData,
  parseTenderSubmissionDocumentsData,
  parseTenderSubmissionAuditData,
  auditTenderDocumentAnalysis,
  auditTenderEvaluationStrategy,
  auditTenderBoqReconciliation,
  auditTenderProjectBoundary,
  auditTenderBoqFiveStepPricing,
  auditTenderConstructionResourceSchedule,
  auditTenderBidderCommitments,
  auditTenderExecutionPlan,
  auditTenderScheduleResources,
  auditTenderCostCashFlow,
  auditTenderSubmissionDocuments,
  auditTenderSubmission,
  getTenderCapabilityDependencies,
  isTenderCapabilityStale,
  type TenderCapabilityId,
  type TenderCapabilityIndex,
  type TenderCapabilityReadiness,
  type TenderDocument,
  type TenderDocumentKind,
  type TenderWorkspace,
} from '../../../packages/business-core/src/tender/index.ts'
import { wrapCapabilityParseError } from './capability-schema.ts'
import { CAPABILITY_FILE_NAMES, SAFE_PROJECT_ID, ensureDir, projectDir, readJson, writeJson } from './fsutil.ts'
import { looksLikeProductivityFile, registerEnterpriseProductivity } from './productivity-source.ts'
import { applyReviewedOverlay, readReviewedRates } from './pricing-review.ts'

const ALL_CAPABILITIES = Object.keys(CAPABILITY_FILE_NAMES) as TenderCapabilityId[]

export type TenderWorkspaceModule = 'tender' | 'china-tender'

export function workspacePaths(cwd: string, projectId: string, module: TenderWorkspaceModule = 'tender') {
  if (!SAFE_PROJECT_ID.test(projectId)) throw new Error('Invalid projectId')
  if (module !== 'tender' && module !== 'china-tender') throw new Error('Invalid tender workspace module')
  const dir = projectDir(cwd, module, projectId)
  return {
    dir,
    model: join(dir, 'tender-workspace.json'),
    audit: join(dir, 'readiness-audit.json'),
    index: join(dir, 'capability-index.json'),
    packs: join(dir, 'packs'),
  }
}

function emptyIndex(projectId: string, coreRevision: number): TenderCapabilityIndex {
  return {
    schemaVersion: 1,
    projectId,
    coreRevision,
    capabilities: ALL_CAPABILITIES.map((capability) => ({
      capability,
      enabled: true,
      required: capability !== 'evaluation_strategy' && capability !== 'project_boundary',
      revision: 0,
      readiness: 'not_ready' as const,
      issueCount: 0,
      stale: false,
      updatedAt: new Date().toISOString(),
    })),
  }
}

function refreshCapabilityStaleness(
  cwd: string,
  projectId: string,
  workspace: TenderWorkspace,
  index: TenderCapabilityIndex,
  module: TenderWorkspaceModule = 'tender',
): TenderCapabilityIndex {
  const revisions = Object.fromEntries(index.capabilities.map((entry) => [entry.capability, entry.revision]))
  return {
    ...index,
    coreRevision: workspace.revision,
    capabilities: index.capabilities.map((entry) => {
      if (entry.revision === 0) return { ...entry, stale: false }
      const path = join(workspacePaths(cwd, projectId, module).packs, `${CAPABILITY_FILE_NAMES[entry.capability]}.json`)
      if (!existsSync(path)) return { ...entry, stale: true }
      try {
        const envelope = parseTenderCapabilityEnvelope(JSON.parse(readFileSync(path, 'utf8')))
        return {
          ...entry,
          stale: isTenderCapabilityStale(envelope, workspace.revision, revisions),
        }
      } catch {
        return { ...entry, stale: true }
      }
    }),
  }
}

export function initTenderWorkspace(cwd: string, projectId: string, project: {
  id: string
  title: string
  reference?: string
  employer?: string
  jurisdiction?: string
  currency?: string
  closingAt?: string
  status?: 'active' | 'submitted' | 'awarded' | 'lost' | 'archived'
}, module: TenderWorkspaceModule = 'tender') {
  if (!SAFE_PROJECT_ID.test(projectId)) throw new Error('Invalid projectId')
  if (project.id !== projectId) throw new Error('project.id must match projectId')
  const paths = workspacePaths(cwd, projectId, module)
  if (existsSync(paths.model)) throw new Error(`Tender workspace ${projectId} already exists`)
  ensureDir(paths.dir)
  ensureDir(paths.packs)
  const workspace = parseTenderWorkspace({
    schemaVersion: 1,
    revision: 1,
    project: { ...project, status: project.status ?? 'active' },
    documents: [],
    requirements: [],
    criteria: [],
    deliverables: [],
    responses: [],
  })
  writeJson(paths.model, workspace)
  const audit = auditTenderWorkspace(workspace)
  writeJson(paths.audit, audit)
  writeJson(paths.index, emptyIndex(projectId, workspace.revision))
  return { workspace, audit }
}

export function loadWorkspace(cwd: string, projectId: string, module: TenderWorkspaceModule = 'tender'): TenderWorkspace {
  const paths = workspacePaths(cwd, projectId, module)
  if (!existsSync(paths.model)) throw new Error(`Tender workspace ${projectId} does not exist. Call tender_workspace init first.`)
  return parseTenderWorkspace(JSON.parse(readFileSync(paths.model, 'utf8')))
}

export function upsertWorkspaceSection(
  cwd: string,
  projectId: string,
  patch: Partial<Pick<TenderWorkspace, 'documents' | 'requirements' | 'criteria' | 'deliverables' | 'responses' | 'project'>>,
  options: { trustedResponseState?: boolean; module?: TenderWorkspaceModule } = {},
) {
  const module = options.module ?? 'tender'
  const paths = workspacePaths(cwd, projectId, module)
  const current = loadWorkspace(cwd, projectId, module)
  // Only the host's byte-level verification entry point may create review receipts.
  if (patch.responses && !options.trustedResponseState) {
    patch = { ...patch, responses: patch.responses.map(response => {
      const existing = current.responses.find(row => row.id === response.id)
      return { ...response, dependencySnapshot: existing?.dependencySnapshot, artifactReview: existing?.artifactReview }
    }) }
  }
  const next = parseTenderWorkspace({
    ...current,
    ...patch,
    revision: current.revision + 1,
  })
  if (options.trustedResponseState) {
    const businessResponses = (workspace: TenderWorkspace) => workspace.responses.map(({ artifactReview, dependencySnapshot, ...response }) => response)
    // Receipts observe an existing plan; recording one must not invalidate BOQ/strategy packs.
    // Even trusted callers still advance the core revision when any business field changes.
    if (isDeepStrictEqual(
      { ...current, responses: businessResponses(current) },
      { ...next, revision: current.revision, responses: businessResponses(next) },
    )) next.revision = current.revision
  }
  writeJson(paths.model, next)
  const audit = auditTenderWorkspace(next)
  writeJson(paths.audit, audit)
  const storedIndex = readJson<TenderCapabilityIndex>(paths.index, emptyIndex(projectId, next.revision))
  const index = refreshCapabilityStaleness(cwd, projectId, next, storedIndex, module)
  writeJson(paths.index, index)
  return { workspace: next, audit }
}

function parseCapabilityData(capability: TenderCapabilityId, data: unknown) {
  switch (capability) {
    case 'document_analysis': return parseTenderDocumentAnalysisData(data)
    case 'evaluation_strategy': return parseTenderEvaluationStrategyData(data)
    case 'boq_reconciliation': return parseTenderBoqReconciliationData(data)
    case 'project_boundary': return parseTenderProjectBoundaryPack(data)
    case 'boq_five_step_pricing': return parseTenderBoqFiveStepPricingData(data)
    case 'construction_resource_schedule': return parseTenderConstructionResourceScheduleData(data)
    case 'bidder_commitments': return parseTenderBidderCommitmentsData(data)
    case 'execution_plan': return parseTenderExecutionPlanData(data)
    case 'schedule_resources': return parseTenderScheduleResourceData(data)
    case 'cost_cashflow': return parseTenderCostCashFlowData(data)
    case 'submission_documents': return parseTenderSubmissionDocumentsData(data)
    case 'submission_audit': return parseTenderSubmissionAuditData(data)
    default: throw new Error(`Unknown capability ${capability}`)
  }
}

function auditCapability(
  capability: TenderCapabilityId,
  workspace: TenderWorkspace,
  data: unknown,
  index: TenderCapabilityIndex,
  upstream: Partial<Record<TenderCapabilityId, unknown>>,
) {
  switch (capability) {
    case 'document_analysis': return auditTenderDocumentAnalysis(workspace, data)
    case 'evaluation_strategy': return auditTenderEvaluationStrategy(workspace, data)
    case 'boq_reconciliation': return auditTenderBoqReconciliation(workspace, data)
    case 'project_boundary': return auditTenderProjectBoundary(workspace, data)
    case 'boq_five_step_pricing': return auditTenderBoqFiveStepPricing(workspace, upstream.boq_reconciliation, data)
    case 'construction_resource_schedule':
      return auditTenderConstructionResourceSchedule(workspace, data as ReturnType<typeof parseTenderConstructionResourceScheduleData>, index)
    case 'bidder_commitments': return auditTenderBidderCommitments(workspace, upstream.boq_five_step_pricing, data)
    case 'execution_plan': return auditTenderExecutionPlan(workspace, upstream.boq_reconciliation, data)
    case 'schedule_resources': return auditTenderScheduleResources(workspace, upstream.execution_plan, data)
    case 'cost_cashflow': return auditTenderCostCashFlow(workspace, upstream.boq_reconciliation, upstream.schedule_resources, data)
    case 'submission_documents': return auditTenderSubmissionDocuments(workspace, data)
    case 'submission_audit': return auditTenderSubmission(workspace, index, data)
    default: throw new Error(`Unknown capability ${capability}`)
  }
}

function loadPack(cwd: string, projectId: string, capability: TenderCapabilityId, module: TenderWorkspaceModule = 'tender'): unknown | undefined {
  const path = join(workspacePaths(cwd, projectId, module).packs, `${CAPABILITY_FILE_NAMES[capability]}.json`)
  if (!existsSync(path)) return undefined
  return parseTenderCapabilityEnvelope(JSON.parse(readFileSync(path, 'utf8'))).data
}

export function replaceCapability(
  cwd: string,
  projectId: string,
  capability: TenderCapabilityId,
  data: unknown,
  module: TenderWorkspaceModule = 'tender',
) {
  const paths = workspacePaths(cwd, projectId, module)
  const workspace = loadWorkspace(cwd, projectId, module)
  let index = existsSync(paths.index)
    ? parseTenderCapabilityIndex(JSON.parse(readFileSync(paths.index, 'utf8')))
    : emptyIndex(projectId, workspace.revision)
  index = refreshCapabilityStaleness(cwd, projectId, workspace, index, module)

  let parsed
  try {
    parsed = parseCapabilityData(capability, data)
    if (capability === 'boq_five_step_pricing' && module === 'tender') {
      const ledger = readReviewedRates(cwd, projectId)
      if (ledger.items.length > 0) {
        parsed = applyReviewedOverlay(parsed as ReturnType<typeof parseTenderBoqFiveStepPricingData>, ledger)
      }
    }
  } catch (error) {
    throw wrapCapabilityParseError(capability, error)
  }
  const upstream: Partial<Record<TenderCapabilityId, unknown>> = {
    boq_reconciliation: loadPack(cwd, projectId, 'boq_reconciliation', module),
    boq_five_step_pricing: loadPack(cwd, projectId, 'boq_five_step_pricing', module),
    execution_plan: loadPack(cwd, projectId, 'execution_plan', module),
    schedule_resources: loadPack(cwd, projectId, 'schedule_resources', module),
  }
  const audit = auditCapability(capability, workspace, parsed, index, upstream)
  const current = index.capabilities.find((entry) => entry.capability === capability)
  const envelope = parseTenderCapabilityEnvelope({
    schemaVersion: 1,
    capability,
    projectId,
    revision: (current?.revision ?? 0) + 1,
    coreRevision: workspace.revision,
    upstream: getTenderCapabilityDependencies(capability, index.capabilities.filter((e) => e.enabled).map((e) => e.capability))
      .map((dep) => ({
        capability: dep,
        revision: dep === 'core'
          ? workspace.revision
          : index.capabilities.find((e) => e.capability === dep)?.revision ?? 0,
      })),
    updatedAt: new Date().toISOString(),
    data: parsed,
  })
  const issueCount = Array.isArray((audit as { issues?: unknown[] }).issues)
    ? (audit as { issues: unknown[] }).issues.length
    : 0
  const auditedReadiness = (audit as { readiness?: TenderCapabilityReadiness }).readiness
  const readiness: TenderCapabilityReadiness = auditedReadiness
    ?? (issueCount === 0 ? 'ready' : 'needs_review')
  index = {
    ...index,
    coreRevision: workspace.revision,
    capabilities: index.capabilities.map((entry) => entry.capability === capability
      ? {
        ...entry,
        revision: envelope.revision,
        readiness,
        issueCount,
        stale: false,
        updatedAt: envelope.updatedAt,
      }
      : entry),
  }
  writeJson(join(paths.packs, `${CAPABILITY_FILE_NAMES[capability]}.json`), envelope)
  writeJson(join(paths.packs, `${CAPABILITY_FILE_NAMES[capability]}.audit.json`), audit)
  index = refreshCapabilityStaleness(cwd, projectId, workspace, index, module)
  writeJson(paths.index, index)
  return { envelope, audit, index }
}

export function validateCapability(
  cwd: string,
  projectId: string,
  capability: TenderCapabilityId,
  data: unknown,
  module: TenderWorkspaceModule = 'tender',
) {
  const paths = workspacePaths(cwd, projectId, module)
  const workspace = loadWorkspace(cwd, projectId, module)
  const storedIndex = existsSync(paths.index)
    ? parseTenderCapabilityIndex(JSON.parse(readFileSync(paths.index, 'utf8')))
    : emptyIndex(projectId, workspace.revision)
  const index = refreshCapabilityStaleness(cwd, projectId, workspace, storedIndex, module)
  let parsed
  try {
    parsed = parseCapabilityData(capability, data)
  } catch (error) {
    throw wrapCapabilityParseError(capability, error)
  }
  const upstream: Partial<Record<TenderCapabilityId, unknown>> = {
    boq_reconciliation: loadPack(cwd, projectId, 'boq_reconciliation', module),
    boq_five_step_pricing: loadPack(cwd, projectId, 'boq_five_step_pricing', module),
    execution_plan: loadPack(cwd, projectId, 'execution_plan', module),
    schedule_resources: loadPack(cwd, projectId, 'schedule_resources', module),
  }
  const audit = auditCapability(capability, workspace, parsed, index, upstream)
  return { ok: true, parsed, audit, written: false }
}

export function capabilityStatus(cwd: string, projectId: string, capability?: TenderCapabilityId, module: TenderWorkspaceModule = 'tender') {
  const paths = workspacePaths(cwd, projectId, module)
  const workspace = loadWorkspace(cwd, projectId, module)
  const storedIndex = existsSync(paths.index)
    ? parseTenderCapabilityIndex(JSON.parse(readFileSync(paths.index, 'utf8')))
    : emptyIndex(projectId, workspace.revision)
  const index = refreshCapabilityStaleness(cwd, projectId, workspace, storedIndex, module)
  writeJson(paths.index, index)
  if (!capability) return { workspaceRevision: workspace.revision, index }
  const packPath = join(paths.packs, `${CAPABILITY_FILE_NAMES[capability]}.json`)
  return {
    workspaceRevision: workspace.revision,
    index,
    envelope: existsSync(packPath)
      ? parseTenderCapabilityEnvelope(JSON.parse(readFileSync(packPath, 'utf8')))
      : null,
  }
}

type CapabilitySummarySource = {
  index?: TenderCapabilityIndex
  envelope?: { revision: number; data: unknown } | null
  audit?: unknown
  data?: unknown
}

function capabilityIssueCounts(audit: unknown) {
  const record = audit && typeof audit === 'object' && !Array.isArray(audit)
    ? audit as Record<string, unknown>
    : undefined
  const issues = Array.isArray(record?.issues) ? record.issues : []
  const bySeverity: Record<string, number> = { error: 0, warning: 0 }
  const byCode: Record<string, number> = {}
  for (const issue of issues) {
    if (!issue || typeof issue !== 'object' || Array.isArray(issue)) continue
    const row = issue as Record<string, unknown>
    if (typeof row.severity === 'string') bySeverity[row.severity] = (bySeverity[row.severity] ?? 0) + 1
    if (typeof row.code === 'string') byCode[row.code] = (byCode[row.code] ?? 0) + 1
  }
  return {
    total: issues.length,
    bySeverity,
    byCode: Object.fromEntries(Object.entries(byCode).sort(([left], [right]) => left < right ? -1 : left > right ? 1 : 0)),
  }
}

function capabilityDataCounts(data: unknown) {
  if (!data || typeof data !== 'object' || Array.isArray(data)) return {}
  return Object.fromEntries(
    Object.entries(data as Record<string, unknown>)
      .filter((entry): entry is [string, unknown[]] => Array.isArray(entry[1]))
      .sort(([left], [right]) => left < right ? -1 : left > right ? 1 : 0)
      .slice(0, 8)
      .map(([key, value]) => [key, value.length]),
  )
}

/** Compact tool-facing projection; canonical pack and audit files remain unchanged. */
export function summarizeCapability(
  cwd: string,
  projectId: string,
  capability: TenderCapabilityId,
  source: CapabilitySummarySource = {},
  module: TenderWorkspaceModule = 'tender',
) {
  const paths = workspacePaths(cwd, projectId, module)
  const workspace = loadWorkspace(cwd, projectId, module)
  const storedIndex = source.index ?? (existsSync(paths.index)
    ? parseTenderCapabilityIndex(JSON.parse(readFileSync(paths.index, 'utf8')))
    : emptyIndex(projectId, workspace.revision))
  const index = source.index ?? refreshCapabilityStaleness(cwd, projectId, workspace, storedIndex, module)
  const entry = index.capabilities.find((item) => item.capability === capability)
  const packPath = join(paths.packs, `${CAPABILITY_FILE_NAMES[capability]}.json`)
  const auditPath = join(paths.packs, `${CAPABILITY_FILE_NAMES[capability]}.audit.json`)
  const envelope = source.envelope === undefined
    ? existsSync(packPath)
      ? parseTenderCapabilityEnvelope(JSON.parse(readFileSync(packPath, 'utf8')))
      : null
    : source.envelope
  const audit = source.audit === undefined && envelope && existsSync(auditPath)
    ? JSON.parse(readFileSync(auditPath, 'utf8'))
    : source.audit
  const auditRecord = audit && typeof audit === 'object' && !Array.isArray(audit)
    ? audit as Record<string, unknown>
    : undefined
  const auditReadiness = auditRecord?.readiness
  const readiness = auditReadiness === 'ready' || auditReadiness === 'needs_review' || auditReadiness === 'not_ready'
    ? auditReadiness
    : entry?.readiness ?? 'not_ready'
  const data = source.data === undefined ? envelope?.data : source.data
  return {
    capability,
    revision: envelope?.revision ?? entry?.revision ?? 0,
    readiness,
    stale: entry?.stale ?? false,
    issueCounts: capabilityIssueCounts(audit),
    packPath,
    auditPath,
    dataCounts: capabilityDataCounts(data),
  }
}

export function sourceDocumentId(path: string): string {
  const stem = basename(path, extname(path)).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'source'
  const hash = createHash('sha256').update(path.toLowerCase()).digest('hex').slice(0, 12)
  return `src-${stem.slice(0, 58)}-${hash}`
}

export function inferDocumentKind(path: string): TenderDocumentKind {
  const name = basename(path).toLowerCase()
  if (looksLikeProductivityFile(path)) return 'supporting_evidence'
  if (/\bboq\b|bill[ _-]*of[ _-]*quantit|pricing[ _-]*schedule|工程量/.test(name)) return 'boq'
  if (/drawing|\bdwg\b|layout|plan[ _-]*sheet|图纸/.test(name)) return 'drawing'
  if (/specification|\bspec\b|coto|colto|规范/.test(name)) return 'specification'
  if (/addendum|clarification|bulletin|corrigendum|补遗/.test(name)) return 'addendum'
  if (/contract|conditions[ _-]*of[ _-]*contract|合同/.test(name)) return 'contract_data'
  if (/returnable|return[ _-]*schedule|form[ _-]*b\d/.test(name)) return 'returnable_schedule'
  if (/template|proforma/.test(name)) return 'template'
  if (/tender|bid[ _-]*data|request[ _-]*for[ _-]*proposal|\brfp\b|招标/.test(name)) return 'tender_data'
  return 'other'
}

export function documentsFromInputPaths(inputPaths: string[]): TenderDocument[] {
  return inputPaths.map((inputPath) => {
    const path = resolve(inputPath)
    return {
      id: sourceDocumentId(path),
      name: basename(path),
      path,
      kind: inferDocumentKind(path),
      status: existsSync(path) && statSync(path).isFile() ? 'active' as const : 'withdrawn' as const,
    }
  })
}

export function registerProjectSources(
  cwd: string,
  projectId: string,
  input: { title: string; inputPaths: string[] },
  module: TenderWorkspaceModule = 'tender',
) {
  try {
    initTenderWorkspace(cwd, projectId, { id: projectId, title: input.title, status: 'active' }, module)
  } catch {
    // already initialized
  }
  const current = loadWorkspace(cwd, projectId, module)
  const byPath = new Map(current.documents.map((doc) => [resolve(doc.path).toLowerCase(), doc]))
  for (const doc of documentsFromInputPaths(input.inputPaths)) {
    byPath.set(resolve(doc.path).toLowerCase(), doc)
  }
  if (module === 'tender') registerEnterpriseProductivity(cwd, projectId, input.inputPaths)
  return upsertWorkspaceSection(cwd, projectId, { documents: [...byPath.values()] }, { module })
}
