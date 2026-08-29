import { join } from 'node:path'
import { projectDir, readJson, writeJson } from './fsutil.ts'

export const TENDER_ANALYSIS_DOMAINS = [
  { id: 'qualification-risk', labelZh: '资格、投标决策与重大风险' },
  { id: 'commercial-contract', labelZh: '商务、合同、保险、保函、税费与支付' },
  { id: 'boq-pricing', labelZh: 'BOQ、价格、暂列金额与调价' },
  { id: 'scope-technical', labelZh: '范围、技术、工期、资源与现场条件' },
  { id: 'submission-compliance', labelZh: '合规、废标、签字、表单与提交要求' },
] as const

export type TenderAnalysisDomainId = typeof TENDER_ANALYSIS_DOMAINS[number]['id']

export interface AnalysisDomainCoverage {
  domain: TenderAnalysisDomainId
  labelZh: string
  readNodeIds: string[]
  unreadNodeIds: string[]
  evidenceClaimIds: string[]
  conclusion: string
  humanConfirmationRequired: boolean
  updatedAt: string
}

export interface AnalysisCoverageLedger {
  schemaVersion: 1
  projectId: string
  sourceTreeHashes: Record<string, string>
  domains: AnalysisDomainCoverage[]
  updatedAt: string
}

export interface AnalysisCoverageStatus {
  initialized: boolean
  ready: boolean
  missingDomains: TenderAnalysisDomainId[]
  unreadDomains: TenderAnalysisDomainId[]
  evidenceGaps: TenderAnalysisDomainId[]
  conclusionGaps: TenderAnalysisDomainId[]
  sourceTreeHashes: Record<string, string>
}

export function analysisCoveragePath(cwd: string, projectId: string): string {
  return join(projectDir(cwd, 'tender', projectId), 'orchestration', 'analysis-coverage.json')
}

export function loadAnalysisCoverage(cwd: string, projectId: string): AnalysisCoverageLedger | null {
  return readJson<AnalysisCoverageLedger | null>(analysisCoveragePath(cwd, projectId), null)
}

export function initializeAnalysisCoverage(
  cwd: string,
  projectId: string,
  sources: Array<{ sourceId: string; treeHash: string; nodeIds: string[] }>,
): AnalysisCoverageLedger {
  const previous = loadAnalysisCoverage(cwd, projectId)
  const hashes = Object.fromEntries(sources.map((source) => [source.sourceId, source.treeHash]))
  const allNodes = sources.flatMap((source) => source.nodeIds.map((nodeId) => `${source.sourceId}:${nodeId}`))
  const sourcesChanged = JSON.stringify(previous?.sourceTreeHashes ?? {}) !== JSON.stringify(hashes)
  const now = new Date().toISOString()
  const ledger: AnalysisCoverageLedger = {
    schemaVersion: 1,
    projectId,
    sourceTreeHashes: hashes,
    domains: TENDER_ANALYSIS_DOMAINS.map((spec) => {
      const old = previous?.domains.find((domain) => domain.domain === spec.id)
      return sourcesChanged || !old
        ? {
            domain: spec.id,
            labelZh: spec.labelZh,
            readNodeIds: [],
            unreadNodeIds: [...allNodes],
            evidenceClaimIds: [],
            conclusion: '',
            humanConfirmationRequired: spec.id === 'qualification-risk' || spec.id === 'submission-compliance',
            updatedAt: now,
          }
        : old
    }),
    updatedAt: now,
  }
  writeJson(analysisCoveragePath(cwd, projectId), ledger)
  return ledger
}

export function recordAnalysisCoverage(cwd: string, projectId: string, input: {
  domain: TenderAnalysisDomainId
  readNodeIds?: string[]
  unreadNodeIds?: string[]
  evidenceClaimIds?: string[]
  conclusion?: string
  humanConfirmationRequired?: boolean
}): AnalysisCoverageLedger {
  const current = loadAnalysisCoverage(cwd, projectId)
  if (!current) throw new Error('覆盖遍历尚未初始化；先为项目的 PageIndex 影子树建立 coverage ledger')
  const spec = TENDER_ANALYSIS_DOMAINS.find((item) => item.id === input.domain)
  if (!spec) throw new Error(`未知分析域 ${input.domain}`)
  const now = new Date().toISOString()
  const domains = current.domains.map((domain) => {
    if (domain.domain !== input.domain) return domain
    const read = new Set([...domain.readNodeIds, ...(input.readNodeIds ?? []).map(String)])
    const unread = new Set(input.unreadNodeIds === undefined
      ? domain.unreadNodeIds.filter((nodeId) => !read.has(nodeId))
      : input.unreadNodeIds.map(String).filter((nodeId) => !read.has(nodeId)))
    return {
      ...domain,
      readNodeIds: [...read].sort(),
      unreadNodeIds: [...unread].sort(),
      evidenceClaimIds: input.evidenceClaimIds === undefined
        ? domain.evidenceClaimIds
        : [...new Set(input.evidenceClaimIds.map(String).filter(Boolean))].sort(),
      conclusion: input.conclusion === undefined ? domain.conclusion : String(input.conclusion).trim(),
      humanConfirmationRequired: input.humanConfirmationRequired ?? domain.humanConfirmationRequired,
      updatedAt: now,
    }
  })
  const next = { ...current, domains, updatedAt: now }
  writeJson(analysisCoveragePath(cwd, projectId), next)
  return next
}

export function assessAnalysisCoverage(ledger: AnalysisCoverageLedger | null): AnalysisCoverageStatus {
  if (!ledger) {
    return {
      initialized: false,
      ready: false,
      missingDomains: TENDER_ANALYSIS_DOMAINS.map((domain) => domain.id),
      unreadDomains: [],
      evidenceGaps: [],
      conclusionGaps: [],
      sourceTreeHashes: {},
    }
  }
  const missingDomains = TENDER_ANALYSIS_DOMAINS
    .filter((spec) => !ledger.domains.some((domain) => domain.domain === spec.id))
    .map((domain) => domain.id)
  const unreadDomains = ledger.domains.filter((domain) => domain.unreadNodeIds.length > 0).map((domain) => domain.domain)
  const evidenceGaps = ledger.domains.filter((domain) => domain.evidenceClaimIds.length === 0).map((domain) => domain.domain)
  const conclusionGaps = ledger.domains.filter((domain) => !domain.conclusion.trim()).map((domain) => domain.domain)
  return {
    initialized: true,
    ready: missingDomains.length === 0 && unreadDomains.length === 0 && evidenceGaps.length === 0 && conclusionGaps.length === 0,
    missingDomains,
    unreadDomains,
    evidenceGaps,
    conclusionGaps,
    sourceTreeHashes: ledger.sourceTreeHashes,
  }
}

export function analysisCoverageRejectReason(status: AnalysisCoverageStatus): string {
  const gaps: string[] = []
  if (!status.initialized) gaps.push('未初始化覆盖账本')
  if (status.missingDomains.length) gaps.push(`缺分析域 ${status.missingDomains.join('、')}`)
  if (status.unreadDomains.length) gaps.push(`仍有未读节点 ${status.unreadDomains.join('、')}`)
  if (status.evidenceGaps.length) gaps.push(`缺证据包 ${status.evidenceGaps.join('、')}`)
  if (status.conclusionGaps.length) gaps.push(`缺结论 ${status.conclusionGaps.join('、')}`)
  return `招标分析覆盖遍历未完成：${gaps.join('；')}`
}
