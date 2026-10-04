import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { basename, join } from 'node:path'
import type { KbEntry, KbManifest } from './kb.ts'
import { readJson, writeNewJsonAtomic } from './fsutil.ts'

export interface KnowledgeMetadata {
  sourceKind?: 'original' | 'parsed' | 'generated'
  regions?: string[]
  validFrom?: string
  validUntil?: string
  supersedes?: string[]
  /** Immutable citation tokens of the original sources, never a claim of semantic support. */
  derivedFrom?: string[]
}
export interface KnowledgeVersion {
  schemaVersion: 1
  versionId: string
  createdAt: string
  manuscriptHash: string
  originalHash?: string
  entry: KbEntry
  manifest: KbManifest
}
const hash = (value: string | Buffer) => createHash('sha256').update(value).digest('hex')
const slugPattern = /^[a-z0-9][a-z0-9-]*$/
function versionDir(root: string, slug: string, versionId: string): string {
  if (!slugPattern.test(slug) || !/^[a-f0-9]{64}$/.test(versionId)) throw new Error('知识来源版本标识非法')
  return join(root, 'versions', slug, versionId)
}
export function normalizeKnowledgeMetadata(value: KnowledgeMetadata): KnowledgeMetadata {
  if (value.sourceKind && !['original','parsed','generated'].includes(value.sourceKind)) throw new Error('知识来源类型非法')
  const result: KnowledgeMetadata = { sourceKind: value.sourceKind || 'original', regions: [...new Set((value.regions || []).map(row=>String(row).trim()).filter(Boolean))], supersedes: [...new Set(value.supersedes || [])], derivedFrom: [...new Set(value.derivedFrom || [])] }
  for (const field of ['validFrom','validUntil'] as const) {
    if (!value[field]) continue
    const date = String(value[field])
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !Number.isFinite(Date.parse(date)) || new Date(date).toISOString().slice(0,10) !== date) throw new Error('有效期必须是有效的 YYYY-MM-DD 日期')
    result[field] = date
  }
  if (result.validFrom && result.validUntil && result.validFrom > result.validUntil) throw new Error('知识来源有效期倒置')
  return result
}
export function knowledgeApplicability(metadata: KnowledgeMetadata, context: { region?: string; asOf?: string } = {}): { status: 'applicable' | 'inapplicable' | 'uncertain'; reason?: string } {
  const asOf = context.asOf || new Date().toISOString().slice(0,10)
  normalizeKnowledgeMetadata({validFrom:asOf})
  if (metadata.validFrom && asOf < metadata.validFrom) return {status:'inapplicable',reason:'来源尚未生效'}
  if (metadata.validUntil && asOf > metadata.validUntil) return {status:'inapplicable',reason:'来源已超出有效期'}
  if (metadata.regions?.length) {
    if (!context.region) return {status:'uncertain',reason:'尚未确定任务适用地区'}
    if (!metadata.regions.some(row=>row.toLocaleLowerCase()===context.region!.trim().toLocaleLowerCase())) return {status:'inapplicable',reason:'来源不适用于任务地区'}
  }
  return {status:'applicable'}
}
function identity(entry: KbEntry, manifest: KbManifest, manuscriptHash: string, originalHash?: string) {
  return {slug:entry.slug,name:entry.name,category:entry.category,sourceHash:entry.sourceHash,metadata:normalizeKnowledgeMetadata(entry),chunks:manifest.chunks,manuscriptHash,originalHash}
}
/** Keep the exact manuscript, locator map and original before any replacement. */
export function retainKnowledgeVersion(root: string, entry: KbEntry, manifest: KbManifest | null): string | undefined {
  if (!manifest || !entry.managedPath || !existsSync(entry.managedPath)) return undefined
  const manuscript = readFileSync(entry.managedPath)
  const original = entry.originalPath && existsSync(entry.originalPath) ? readFileSync(entry.originalPath) : undefined
  const manuscriptHash = hash(manuscript), originalHash = original && hash(original)
  const versionId = hash(JSON.stringify(identity(entry,manifest,manuscriptHash,originalHash)))
  const dir = versionDir(root,entry.slug,versionId), path = join(dir,'version.json')
  if (!existsSync(path)) {
    mkdirSync(dir,{recursive:true})
    const managedPath = join(dir,'manuscript.txt')
    writeFileSync(managedPath,manuscript,{flag:'wx'})
    const originalPath = original ? join(dir,'original'+(entry.originalName ? '-'+basename(entry.originalName) : '.bin')) : undefined
    if (originalPath) writeFileSync(originalPath,original!,{flag:'wx'})
    writeNewJsonAtomic(path,{schemaVersion:1,versionId,createdAt:new Date().toISOString(),manuscriptHash,originalHash,entry:{...entry,...normalizeKnowledgeMetadata(entry),versionId,managedPath,originalPath},manifest} satisfies KnowledgeVersion)
  }
  return versionId
}
export function readKnowledgeVersion(root: string, slug: string, versionId: string): KnowledgeVersion {
  const row = readJson<KnowledgeVersion | null>(join(versionDir(root,slug,versionId),'version.json'),null)
  if (!row || row.versionId !== versionId) throw new Error('知识来源版本不存在')
  if (hash(readFileSync(row.entry.managedPath)) !== row.manuscriptHash || hash(JSON.stringify(identity(row.entry,row.manifest,row.manuscriptHash,row.originalHash))) !== versionId) throw new Error('知识来源版本内容或定位已变化')
  if (row.originalHash && (!row.entry.originalPath || hash(readFileSync(row.entry.originalPath)) !== row.originalHash)) throw new Error('知识原件版本内容已变化')
  return row
}
export function listKnowledgeVersions(root: string, slug: string): KnowledgeVersion[] {
  if (!slugPattern.test(slug)) throw new Error('知识条目标识非法')
  const dir = join(root,'versions',slug)
  if (!existsSync(dir)) return []
  return readdirSync(dir).filter(row=>/^[a-f0-9]{64}$/.test(row)).map(row=>readKnowledgeVersion(root,slug,row)).sort((a,b)=>a.createdAt.localeCompare(b.createdAt))
}
