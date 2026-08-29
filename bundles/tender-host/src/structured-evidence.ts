import { createHash } from 'node:crypto'
import { existsSync, readFileSync } from 'node:fs'
import { basename, isAbsolute, join, resolve } from 'node:path'
import { projectDir, readJson, writeJson } from './fsutil.ts'

export type EvidenceSurface = 'document' | 'table' | 'graph'

export interface StructuredEvidenceClaim {
  claimId: string
  claim: string
  surface: EvidenceSurface
  sourceId: string
  section?: string
  page?: number
  quote: string
  internalLocator: string
  sourceHash: string
}

export interface EvidenceLedger {
  schemaVersion: 1
  projectId: string
  module: string
  updatedAt: string
  claims: StructuredEvidenceClaim[]
}

const CLAIM_ID = /^[A-Za-z0-9][A-Za-z0-9._-]{2,127}$/
const SHA256 = /^[a-f0-9]{64}$/i

export function evidenceLedgerPath(cwd: string, projectId: string, module = 'tender'): string {
  return join(projectDir(cwd, module, projectId), 'orchestration', 'evidence-packages.json')
}

export function loadEvidenceLedger(cwd: string, projectId: string, module = 'tender'): EvidenceLedger {
  return readJson<EvidenceLedger>(evidenceLedgerPath(cwd, projectId, module), {
    schemaVersion: 1,
    projectId,
    module,
    updatedAt: '',
    claims: [],
  })
}

export function parseStructuredEvidence(value: unknown): StructuredEvidenceClaim {
  if (!value || typeof value !== 'object') throw new Error('证据包必须是对象')
  const row = value as Partial<StructuredEvidenceClaim>
  const claim: StructuredEvidenceClaim = {
    claimId: String(row.claimId || '').trim(),
    claim: String(row.claim || '').trim(),
    surface: row.surface as EvidenceSurface,
    sourceId: String(row.sourceId || '').trim(),
    section: row.section == null ? undefined : String(row.section).trim(),
    page: row.page == null ? undefined : Number(row.page),
    quote: String(row.quote || '').trim(),
    internalLocator: String(row.internalLocator || '').trim(),
    sourceHash: String(row.sourceHash || '').trim().toLowerCase(),
  }
  if (!CLAIM_ID.test(claim.claimId)) throw new Error('claimId 只能使用 3-128 位字母、数字、点、下划线或连字符')
  if (!claim.claim) throw new Error('claim 不能为空')
  if (!['document', 'table', 'graph'].includes(claim.surface)) throw new Error('surface 必须是 document/table/graph')
  if (!claim.sourceId) throw new Error('sourceId 不能为空')
  if (!claim.quote) throw new Error('quote 不能为空；PageIndex 摘要不能作为证据')
  if (!claim.internalLocator) throw new Error('internalLocator 不能为空')
  if (!SHA256.test(claim.sourceHash)) throw new Error('sourceHash 必须是 64 位 SHA-256')
  if (claim.page !== undefined && (!Number.isInteger(claim.page) || claim.page < 1)) throw new Error('page 必须是正整数')
  if (claim.surface === 'table' && !/[^!]+![A-Z]+\d+(?::[A-Z]+\d+)?$/i.test(claim.internalLocator)) {
    throw new Error('表格证据 internalLocator 必须包含 sheet!A1 或 sheet!A1:B2')
  }
  if (claim.surface === 'graph' && !/(?:->|→)/.test(claim.internalLocator)) {
    throw new Error('关系证据 internalLocator 必须记录 node->node 路径')
  }
  return claim
}

/** Upsert is immutable per claimId: changing evidence requires a new claim id. */
export function recordStructuredEvidence(
  cwd: string,
  projectId: string,
  values: unknown[],
  module = 'tender',
): EvidenceLedger {
  const ledger = loadEvidenceLedger(cwd, projectId, module)
  const byId = new Map(ledger.claims.map((claim) => [claim.claimId, claim]))
  for (const value of values) {
    const claim = parseStructuredEvidence(value)
    const previous = byId.get(claim.claimId)
    if (previous && JSON.stringify(previous) !== JSON.stringify(claim)) {
      throw new Error(`证据 ${claim.claimId} 已冻结；变更主张或定位器时请使用新的 claimId`)
    }
    byId.set(claim.claimId, claim)
  }
  const next: EvidenceLedger = {
    schemaVersion: 1,
    projectId,
    module,
    updatedAt: new Date().toISOString(),
    claims: [...byId.values()].sort((a, b) => a.claimId.localeCompare(b.claimId)),
  }
  writeJson(evidenceLedgerPath(cwd, projectId, module), next)
  return next
}

export function findStructuredEvidence(cwd: string, projectId: string, claimId: string, module = 'tender'): StructuredEvidenceClaim | undefined {
  return loadEvidenceLedger(cwd, projectId, module).claims.find((claim) => claim.claimId === claimId)
}

export function renderStructuredEvidenceCitation(claim: StructuredEvidenceClaim): string {
  const source = basename(claim.sourceId) || claim.sourceId
  const section = claim.section ? `，${claim.section}` : ''
  if (claim.surface === 'document') {
    const page = claim.page ? `，第 ${claim.page} 页` : ''
    return `（《${source}》${section}${page}）[ev:${claim.claimId}]`
  }
  if (claim.surface === 'table') return `（${source}，${claim.internalLocator}）[ev:${claim.claimId}]`
  return `（${source}，关系路径 ${claim.internalLocator}）[ev:${claim.claimId}]`
}

export function sha256File(path: string): string {
  return createHash('sha256').update(readFileSync(path)).digest('hex')
}

/** Verify immutable locator/hash without trusting a rendered label. */
export function verifyStructuredEvidence(
  cwd: string,
  claim: StructuredEvidenceClaim,
  sourceResolver?: (sourceId: string) => string | null,
): string | null {
  const explicit = sourceResolver?.(claim.sourceId)
  const candidate = explicit || (isAbsolute(claim.sourceId) ? resolve(claim.sourceId) : resolve(cwd, claim.sourceId))
  if (claim.surface === 'graph' && !existsSync(candidate)) {
    // Graph sourceIds may be logical capability-index identifiers. The path itself
    // remains auditable in the project ledger even when not a filesystem path.
    return SHA256.test(claim.sourceHash) ? null : '关系证据哈希无效'
  }
  if (!existsSync(candidate)) return `找不到证据源 ${claim.sourceId}`
  if (sha256File(candidate) !== claim.sourceHash) return `证据源已变更（SHA-256 不一致）：${claim.sourceId}`
  return null
}
