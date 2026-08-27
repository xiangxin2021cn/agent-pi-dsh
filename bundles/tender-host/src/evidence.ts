import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs'
import { basename, extname, join } from 'node:path'
import { getBusinessProject } from '../../../packages/business-projects/index.ts'
import { readJson, writeJson, tenderDir, ensureDir } from './fsutil.ts'
import { listKbEntries } from './kb.ts'
import { officialProjectDir } from './outputs.ts'
import { loadWorkspace } from './workspace.ts'

export const PROJECT_CHARACTERISTICS_EVIDENCE_GATE = 'project-characteristics:evidence-gap'

/**
 * Bumped when the assessment algorithm changes; evidencePolicy re-assesses ledgers
 * written by an older assessor so fixes take effect without a manual re-assess.
 */
export const EVIDENCE_ASSESSOR_VERSION = 2

export interface ProjectCharacteristicsEvidenceGap {
  chapterId: string
  title: string
  reason: 'missing_source_file' | 'empty_chapter' | 'mentioned_standard_without_file'
  blocking: boolean
  detail: string
  suggestedUpload: string
}

export interface ProjectCharacteristicsEvidenceLedger {
  schemaVersion: 1
  projectId: string
  generatedAt: string
  /** Assessment algorithm version that produced this ledger; see EVIDENCE_ASSESSOR_VERSION. */
  assessorVersion?: number
  characteristicsPath?: string
  evidenceFileNames: string[]
  /** Per chapter: source files whose CONTENT satisfied the chapter (basenames, capped). */
  contentEvidence?: Record<string, string[]>
  gaps: ProjectCharacteristicsEvidenceGap[]
  blockingGapCount: number
  /** Gate waived by the user: stages proceed with remaining gaps kept as gaps. */
  gateWaivedAt?: string
  /** Web diligence on characteristic gaps explicitly authorized (implies waiving the gate). */
  webDiligenceAuthorizedAt?: string
  /**
   * BOQ pricing supplier / productivity pack waived: planning may proceed on
   * web quotes and derived outputs if 《组价依据说明.md》 records that basis.
   */
  pricingIntelWaivedAt?: string
}

const EMPTY_CHAPTERS: Array<{ id: string; title: string; suggestedUpload: string }> = [
  { id: 'contract', title: '合同制式与专用条款', suggestedUpload: '合同条件 / 专用条款 / FIDIC 或其它制式文本' },
  { id: 'specs', title: '技术规范与条文修订', suggestedUpload: '项目规范 PDF、标准规范（如 COTO）或企业知识库规范条目' },
  { id: 'calendar', title: '工作时间与节假日', suggestedUpload: '招标文件中的工时、日历或节假日说明' },
  { id: 'subcontract', title: '分包限定与属地化', suggestedUpload: '分包限制、属地化或当地含量条款' },
  { id: 'sequence', title: '施工顺序及其他招标限定', suggestedUpload: '招标文件对施工顺序、占道或分段交工的限定' },
  { id: 'site', title: '工期、地点与自然条件', suggestedUpload: '工期、地点、地质或气候资料' },
]

// CJK keywords sit OUTSIDE \b groups: \b is ASCII-word-based, so \b工期\b can never
// match inside Chinese text. English stems take \w* where suffixes vary.
const CHAPTER_PATTERNS: Record<string, RegExp> = {
  contract: /\b(fidic|gcc|nec3|nec4|jbcc|particular conditions?|red book|yellow book|conditions of contract|contract data)\b|专用条款|合同条件|合同制式/i,
  specs: /\b(coto|colto|specifications?|sabs|bs en)\b|技术规范|条文修订|规范/i,
  calendar: /\b(working hours?|calendar|public holidays?)\b|工时|节假日|工作时间/i,
  subcontract: /\b(subcontract\w*|local content)\b|属地化|分包/i,
  sequence: /\b(sequence|phasing)\b|占道|分段交工|施工顺序/i,
  site: /\b(geolog\w*|climate|duration|boreholes?)\b|工期|地点|地质|气候|岩土/i,
}

const EVIDENCE_NAME_PATTERN = /(specification|\bspec\b|coto|colto|fidic|gcc\b|nec[34]|particular condition|standard specification|合同条件|专用条款|规范|标准|地质|岩土|geotech|borehole|soil report|知识库)/i
const NAMED_STANDARD_PATTERN = /\b(coto|colto|fidic|sabs|bs en|nec[34]|jbcc|gcc\b)\b|规范|合同条件/i

export const PROJECT_CHARACTERISTICS_EVIDENCE_POLICY_RULE = [
  'Project-characteristic facts (contract form, spec clauses, geology, climate, calendar, subcontracting, sequence) require a registered source file, knowledge-base entry, or user-authorized web diligence.',
  'Do not fill gaps from model memory.',
  'Market-rate web_search / web_fetch is always required for key unit rates (fuel, wages, plant hire, cement, aggregates, asphalt, subcontract). Write each hit to itemBuildUps[].costComponents[].rateBasis.webEvidence (url + accessedAt). That path is independent of this authorization — never skip rate search because webDiligenceAuthorized is false. South African civil wages additionally require anysearch_batch_search with zone=intl and language=en against the current BCCEI determination and gazetted National Minimum Wage; do not copy the bundled C5.1 路床 wage table. Pricing also calls anysearch_capabilities then site-bound supplier search, and writes 当地供应商尽调.md plus bilingual RFQs.',
  'If webDiligenceAuthorized is false: do not use the web to invent missing specs, geology, or other characteristic facts; mark them unverified and ask for an upload or force-pass.',
  'If webDiligenceAuthorized is true: diligence only the listed gaps and record url + accessedAt; still never fabricate.',
  'Supplier RFQs and the local productivity memo are a separate pricing hard gate. If they cannot be completed, tender_evidence waive_pricing (or tender_stage force_pass on boq-five-step-pricing) plus 《组价依据说明.md》 lets planning use web quotes and derived outputs; that note must stay visible. Characteristic waive/force_pass does not unlock the pricing pack.',
].join(' ')

export function ledgerPath(cwd: string, projectId: string): string {
  return join(tenderDir(cwd, projectId), 'orchestration', 'project-characteristics-evidence.json')
}

const CONTENT_FILE_MAX_BYTES = 4 * 1024 * 1024
const CONTENT_SLICE_CHARS = 512 * 1024
const CONTENT_TOTAL_BUDGET_CHARS = 24 * 1024 * 1024
const CONTENT_EXTENSIONS = new Set(['.md', '.txt', '.json'])

/**
 * Content evidence channel: the text the project has actually produced or registered.
 * Registered volume names rarely contain keywords (e.g. "Book 1 of Volume 3" IS the
 * spec volume), so chapter checks must also look at parse deliverables and registered
 * text sources, not just file names.
 * @returns readable text samples, each tagged with its source basename.
 */
function collectContentEvidence(cwd: string, projectId: string): Array<{ name: string; text: string }> {
  const samples: Array<{ name: string; text: string }> = []
  let budget = CONTENT_TOTAL_BUDGET_CHARS
  const seen = new Set<string>()
  const pushFile = (path: string) => {
    if (budget <= 0 || seen.has(path)) return
    seen.add(path)
    if (!CONTENT_EXTENSIONS.has(extname(path).toLowerCase())) return
    try {
      const stat = statSync(path)
      if (!stat.isFile() || stat.size > CONTENT_FILE_MAX_BYTES) return
      const text = readFileSync(path, 'utf8')
      const slice = text.length > CONTENT_SLICE_CHARS ? text.slice(0, CONTENT_SLICE_CHARS) : text
      budget -= slice.length
      samples.push({ name: basename(path), text: slice })
    } catch { /* unreadable file: content channel is best-effort */ }
  }
  const walk = (dir: string, depth: number) => {
    if (depth > 6 || budget <= 0 || !existsSync(dir)) return
    let entries: string[]
    try {
      entries = readdirSync(dir)
    } catch { /* unreadable dir: skip subtree */ return }
    for (const entry of entries) {
      if (budget <= 0) return
      const path = join(dir, entry)
      try {
        if (statSync(path).isDirectory()) walk(path, depth + 1)
        else pushFile(path)
      } catch { /* transient fs race: skip entry */ }
    }
  }
  // Parse deliverables: Official Outputs Markdown + structured stage reports.
  walk(officialProjectDir(cwd, projectId), 0)
  walk(join(tenderDir(cwd, projectId), 'orchestration', 'reports'), 0)
  // Registered text sources (workspace documents + project inputPaths).
  try {
    for (const doc of loadWorkspace(cwd, projectId).documents) {
      if (doc.status && doc.status !== 'active') continue
      if (doc.path) pushFile(doc.path)
    }
  } catch { /* workspace not initialized yet */ }
  try {
    const project = getBusinessProject(cwd, 'tender', projectId)
    for (const inputPath of project?.inputPaths ?? []) pushFile(inputPath)
  } catch { /* registry unreadable */ }
  return samples
}

export function assessEvidence(cwd: string, projectId: string, text = ''): ProjectCharacteristicsEvidenceLedger {
  const dir = tenderDir(cwd, projectId)
  const evidenceNames: string[] = []
  const consider = (name: string | undefined) => {
    if (name && EVIDENCE_NAME_PATTERN.test(name)) evidenceNames.push(name)
  }
  // Primary evidence channel: what the user explicitly registered (workspace documents
  // and project inputPaths). Files can live anywhere on disk, so match by name.
  try {
    for (const doc of loadWorkspace(cwd, projectId).documents) {
      if (doc.status && doc.status !== 'active') continue
      consider(doc.name)
      consider(doc.path ? basename(doc.path) : undefined)
    }
  } catch { /* workspace not initialized yet */ }
  try {
    const project = getBusinessProject(cwd, 'tender', projectId)
    for (const inputPath of project?.inputPaths ?? []) consider(basename(inputPath))
  } catch { /* registry unreadable */ }
  // Knowledge-base entries (specs, contract conditions, standards the user has indexed)
  // count as evidence sources: name and category both participate in matching.
  try {
    for (const entry of listKbEntries()) {
      consider(`${entry.name} ${entry.category}`)
      consider(basename(entry.sourcePath))
    }
  } catch { /* KB root unreadable */ }
  // Secondary channel: files physically present in the project sources dir or the
  // workspace top level.
  const scanRoots = [
    join(dir, 'sources'),
    join(cwd),
  ]
  for (const root of scanRoots) {
    if (!existsSync(root)) continue
    try {
      for (const name of readdirSync(root)) {
        consider(name)
      }
    } catch { /* skip unreadable */ }
  }

  // Content channel: what the registered sources and parse deliverables actually SAY.
  // A chapter with real content in the project's own text is satisfied even when no
  // file NAME matches (tender volumes are usually named by number, not by content).
  const contentSamples = collectContentEvidence(cwd, projectId)
  const contentEvidence: Record<string, string[]> = {}

  const gaps: ProjectCharacteristicsEvidenceGap[] = []
  for (const chapter of EMPTY_CHAPTERS) {
    const pattern = CHAPTER_PATTERNS[chapter.id]
    const mentioned = pattern.test(text)
    // Chapter-specific match only: a generic "spec-looking" name must not satisfy
    // unrelated chapters (contract evidence does not cover geology, etc.).
    const hasFile = evidenceNames.some((name) => pattern.test(name))
    const contentHits = contentSamples.filter((sample) => pattern.test(sample.text))
    if (contentHits.length > 0) {
      contentEvidence[chapter.id] = [...new Set(contentHits.map((hit) => hit.name))].slice(0, 5)
    }
    if (!hasFile && contentHits.length === 0) {
      const namedStandard = mentioned && NAMED_STANDARD_PATTERN.test(text)
      gaps.push({
        chapterId: chapter.id,
        title: chapter.title,
        reason: namedStandard ? 'mentioned_standard_without_file' : (mentioned ? 'empty_chapter' : 'missing_source_file'),
        blocking: true,
        detail: mentioned
          ? `${chapter.title} is discussed in analysis text but no matching source file is registered.`
          : `${chapter.title} has no registered source file or matching content in registered sources/deliverables.`,
        suggestedUpload: chapter.suggestedUpload,
      })
    }
  }

  const existing = readJson<Partial<ProjectCharacteristicsEvidenceLedger>>(ledgerPath(cwd, projectId), {})
  const ledger: ProjectCharacteristicsEvidenceLedger = {
    schemaVersion: 1,
    projectId,
    generatedAt: new Date().toISOString(),
    assessorVersion: EVIDENCE_ASSESSOR_VERSION,
    evidenceFileNames: [...new Set(evidenceNames)],
    contentEvidence,
    gaps,
    blockingGapCount: gaps.filter((gap) => gap.blocking).length,
    gateWaivedAt: existing.gateWaivedAt,
    webDiligenceAuthorizedAt: existing.webDiligenceAuthorizedAt,
    pricingIntelWaivedAt: existing.pricingIntelWaivedAt,
  }
  ensureDir(join(ledgerPath(cwd, projectId), '..'))
  writeJson(ledgerPath(cwd, projectId), ledger)
  return ledger
}

/**
 * Waive the evidence gate; with `authorizeWeb` also authorize web diligence on the
 * listed characteristic gaps. Waiving alone keeps web diligence forbidden — gaps stay
 * gaps and the model must keep them marked unverified.
 */
export function forcePassEvidence(
  cwd: string,
  projectId: string,
  options: { authorizeWeb?: boolean } = {},
): ProjectCharacteristicsEvidenceLedger {
  const ledger = assessEvidence(cwd, projectId)
  ledger.gateWaivedAt = new Date().toISOString()
  if (options.authorizeWeb) ledger.webDiligenceAuthorizedAt = ledger.gateWaivedAt
  writeJson(ledgerPath(cwd, projectId), ledger)
  return ledger
}

/**
 * Unlock the BOQ pricing supplier / productivity pack so planning can use web
 * quotes and derived outputs. Does not waive characteristic evidence.
 */
export function forcePassPricingIntel(
  cwd: string,
  projectId: string,
): ProjectCharacteristicsEvidenceLedger {
  const ledger = assessEvidence(cwd, projectId)
  ledger.pricingIntelWaivedAt = new Date().toISOString()
  writeJson(ledgerPath(cwd, projectId), ledger)
  return ledger
}

export function evidencePolicy(cwd: string, projectId: string) {
  let ledger = existsSync(ledgerPath(cwd, projectId))
    ? readJson<ProjectCharacteristicsEvidenceLedger>(ledgerPath(cwd, projectId), assessEvidence(cwd, projectId))
    : assessEvidence(cwd, projectId)
  // Ledgers from an older assessor predate the content-evidence channel; re-assess so
  // gate verdicts reflect the current algorithm (waivers are preserved by assessEvidence).
  if ((ledger.assessorVersion ?? 1) < EVIDENCE_ASSESSOR_VERSION) {
    ledger = assessEvidence(cwd, projectId)
  }
  const waived = Boolean(ledger.gateWaivedAt || ledger.webDiligenceAuthorizedAt)
  return {
    gate: PROJECT_CHARACTERISTICS_EVIDENCE_GATE,
    gateWaived: waived,
    webDiligenceAuthorized: Boolean(ledger.webDiligenceAuthorizedAt),
    pricingIntelWaived: Boolean(ledger.pricingIntelWaivedAt),
    blocking: ledger.blockingGapCount > 0 && !waived,
    evidenceFileNames: ledger.evidenceFileNames,
    gaps: ledger.gaps,
    rule: PROJECT_CHARACTERISTICS_EVIDENCE_POLICY_RULE,
    ledger,
  }
}
