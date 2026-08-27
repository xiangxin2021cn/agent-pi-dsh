/**
 * Local knowledge base: durable, user-managed store of specs, exemplars, and method
 * standards, retrievable by the model through the kb_* tools. Layout mirrors the
 * original Agent Pi file-memory design (registry + per-entry chunk manifest + lexical
 * scoring) but runs in-process on native dsh tools instead of per-file MCP servers.
 *
 * Storage root resolution: AGENT_PI_KB_ROOT (tests/overrides) → $DSH_HOME/knowledge-base
 * (packaged desktop: userData, survives upgrades) → ~/.agent-pi/knowledge-base.
 */
import { createHash } from 'node:crypto'
import { copyFileSync, existsSync, mkdirSync, readFileSync, rmSync, readdirSync, statSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { basename, dirname, extname, isAbsolute, join, resolve } from 'node:path'
import { knowledgeRoot, readJson, writeJson } from './fsutil.ts'
import { ingestDocumentForKb } from './mineru-ingest.ts'
import { MINERU_EXTENSIONS } from './mineru.ts'
import { enrichStructureUnits } from './kb-content-list.ts'
import { chunksFromPackUnits, loadPackContentList, looksLikeKbPack, resolveKbPack } from './kb-pack.ts'
import { createKbMiniSearch, persistMiniSearchIndex, searchDocumentFromChunk } from './kb-search.ts'
import { chunkByStructure, clauseRelation, measureFidelity, normalizeClauseId, type KbUnitKind, type StructureChunk } from './kb-structure.ts'
import { resolveKbCategory, userTemplateInstruction } from './kb-template.ts'
import { standardizeKbMarkdown } from './kb-md-standardize.ts'
import {
  normalizeKbFolderName,
  suggestKbFolderName,
  type KbFolder,
} from './kb-folder.ts'
import {
  KB_TRANSFER_KIND,
  KB_TRANSFER_MAX_ORIGINAL,
  KB_TRANSFER_MIME,
  looksLikeKbTransferPath,
  openKbTransfer,
  sealKbTransfer,
  transferFileName,
  type KbTransferEntryItem,
  type KbTransferPayload,
  type KbTransferSkillItem,
} from './kb-transfer.ts'
import { listUserSkills, readUserSkill, saveUserSkill } from './modules.ts'

export type { KbFolder } from './kb-folder.ts'

export interface KbChunkMetadata {
  headingPath: string[]
  clauseRefs: string[]
  tableRefs: string[]
  boqRefs: string[]
  kind?: KbUnitKind
  pageStart?: number
  pageEnd?: number
  parentId?: string
}

export interface KbChunk {
  id: string
  title: string
  startLine: number
  endLine: number
  startOffset?: number
  endOffset?: number
  /** Compact lowercase text for lexical scoring only. Never a display copy. */
  textNorm?: string
  /** Legacy manifests only. Layer 2 writes spans and reads the manuscript. */
  text?: string
  metadata: KbChunkMetadata
}

export interface KbManifest {
  schemaVersion: 1
  slug: string
  name: string
  category: string
  sourcePath: string
  indexedAt: string
  chunks: KbChunk[]
}

export interface KbEntry {
  slug: string
  name: string
  category: string
  /** Original file the user registered; may move or vanish after import. */
  sourcePath: string
  /** Managed copy inside the KB root; authoritative for reindex/read. */
  managedPath: string
  /** Managed original (PDF/Office/image) kept for reveal; markdown ingest omits this. */
  originalPath?: string
  originalName?: string
  ingest?: 'direct' | 'mineru' | 'pack'
  parseStatus?: 'ready' | 'parsing' | 'failed' | 'staged'
  parseError?: string
  parseProgress?: string
  parsePercent?: number
  sourceHash: string
  sizeBytes: number
  chunkCount: number
  clauseCount?: number
  coverage?: number
  tableCount?: number
  /** True for entries auto-imported from the bundled knowledge packs. */
  seeded?: boolean
  /** Optional collection under `category`, e.g. 规范 → COTO 2020. */
  folderId?: string
  createdAt: string
  updatedAt: string
}

export interface KbRegistry {
  schemaVersion: 1
  entries: KbEntry[]
  /** Named collections under a category. Optional so schemaVersion stays 1. */
  folders: KbFolder[]
  /** Source paths of seeded entries the user deleted; seeding skips them until re-added. */
  removedSeeds: string[]
}

export interface KbSearchHit {
  slug: string
  name: string
  category: string
  chunkId: string
  title: string
  score: number
  citation: string
  snippet: string
  headingPath: string[]
  matchedClause?: string
  matchedTable?: string
  page?: number
}

const TEXT_EXTENSIONS = new Set(['.md', '.markdown', '.txt', '.json'])
const SUPPORTED_EXTENSIONS = new Set([...TEXT_EXTENSIONS, ...MINERU_EXTENSIONS])
const UNSUPPORTED_HINT = '支持 .md / .txt / .json，以及 PDF、Word、Excel、PPT 和常见图片。Office/扫描件在本页用 MinerU 转成解析稿后入库。'
const MAX_KB_TEXT_BYTES = 32 * 1024 * 1024
const parseJobs = new Set<string>()
let parseDrain = Promise.resolve()

export function kbRoot(): string {
  const explicit = process.env.AGENT_PI_KB_ROOT
  if (explicit) return resolve(explicit)
  const dshHome = process.env.DSH_HOME
  if (dshHome) return resolve(dshHome, 'knowledge-base')
  return resolve(homedir(), '.agent-pi', 'knowledge-base')
}

function registryPath(): string {
  return join(kbRoot(), 'registry.json')
}

function manifestPath(slug: string): string {
  return join(kbRoot(), 'index', `${slug}.json`)
}

function fidelityPath(slug: string): string {
  return join(kbRoot(), 'index', `${slug}.fidelity.json`)
}

function contentListPath(slug: string): string {
  return join(kbRoot(), 'files', `${slug}.content_list.json`)
}

function minisearchPath(slug: string): string {
  return join(kbRoot(), 'index', `${slug}.minisearch.json`)
}

let searchIndexCache: { key: string, index: ReturnType<typeof createKbMiniSearch> } | null = null

function invalidateKbSearchIndex(): void {
  searchIndexCache = null
}

function parseKbFolders(raw: unknown): KbFolder[] {
  if (!Array.isArray(raw)) return []
  const out: KbFolder[] = []
  const seen = new Set<string>()
  for (const item of raw) {
    if (!item || typeof item !== 'object') continue
    const row = item as Partial<KbFolder>
    const id = String(row.id || '').trim()
    const name = normalizeKbFolderName(row.name)
    const category = String(row.category || '').trim()
    if (!id || !name || !category || seen.has(id)) continue
    seen.add(id)
    out.push({ id, name, category, createdAt: String(row.createdAt || '') })
  }
  return out
}

export function loadKbRegistry(): KbRegistry {
  const raw = readJson<Partial<KbRegistry>>(registryPath(), { schemaVersion: 1, entries: [], folders: [], removedSeeds: [] })
  return {
    schemaVersion: 1,
    entries: Array.isArray(raw.entries) ? raw.entries : [],
    folders: parseKbFolders(raw.folders),
    removedSeeds: Array.isArray(raw.removedSeeds) ? raw.removedSeeds.map(String) : [],
  }
}

function saveKbRegistry(registry: KbRegistry): void {
  writeJson(registryPath(), {
    ...registry,
    folders: Array.isArray(registry.folders) ? registry.folders : [],
  })
}

function ensureKbFolder(registry: KbRegistry, category: string, name: string): KbFolder {
  const normalized = normalizeKbFolderName(name)
  if (!normalized) throw new Error('子目录名称不能为空')
  const existing = registry.folders.find((folder) => folder.category === category && folder.name === normalized)
  if (existing) return existing
  const taken = new Set(registry.folders.map((folder) => folder.id))
  const folder: KbFolder = {
    id: uniqueSlug(slugify(normalized), taken),
    name: normalized,
    category,
    createdAt: new Date().toISOString(),
  }
  registry.folders.push(folder)
  return folder
}

function resolveEntryFolderId(
  registry: KbRegistry,
  category: string,
  hint: { folderId?: string; folderName?: string; names?: Array<string | undefined> },
): string | undefined {
  if (hint.folderId) {
    const found = registry.folders.find((folder) => folder.id === hint.folderId)
    if (!found) throw new Error('未找到子目录')
    if (found.category !== category) throw new Error('只能归入同一分类下的子目录')
    return found.id
  }
  const named = normalizeKbFolderName(hint.folderName)
  const suggested = named || suggestKbFolderName(...(hint.names || []).map((part) => String(part || '')))
  if (!suggested) return undefined
  return ensureKbFolder(registry, category, suggested).id
}

function assignSuggestedFolder(registry: KbRegistry, entry: KbEntry): boolean {
  if (entry.folderId && registry.folders.some((folder) => folder.id === entry.folderId)) return false
  const suggested = suggestKbFolderName(entry.originalName || '', entry.name || '')
  if (!suggested) return false
  entry.folderId = ensureKbFolder(registry, entry.category, suggested).id
  return true
}

/** Create or reuse a named collection under a category. */
export function createKbFolder(category: string, name: string): KbFolder {
  const registry = loadKbRegistry()
  const folder = ensureKbFolder(registry, resolveKbCategory(category, name), name)
  saveKbRegistry(registry)
  return folder
}

/** Drop a collection. Files stay in the same category. */
export function removeKbFolder(folderId: string): { removed: boolean; id: string } {
  const registry = loadKbRegistry()
  const id = String(folderId || '').trim()
  if (!registry.folders.some((folder) => folder.id === id)) throw new Error('未找到子目录')
  registry.folders = registry.folders.filter((folder) => folder.id !== id)
  for (const entry of registry.entries) {
    if (entry.folderId === id) delete entry.folderId
  }
  saveKbRegistry(registry)
  return { removed: true, id }
}

/** Move one entry into a collection in the same category, or clear the assignment. */
export function moveKbEntry(slug: string, folderId: string): { entry: KbEntry } {
  const registry = loadKbRegistry()
  const entry = registry.entries.find((item) => item.slug === slug)
  if (!entry) throw new Error(`未找到条目 ${slug}`)
  const id = String(folderId || '').trim()
  if (!id) {
    delete entry.folderId
  } else {
    const folder = registry.folders.find((item) => item.id === id)
    if (!folder) throw new Error('未找到子目录')
    if (folder.category !== entry.category) throw new Error('只能归入同一分类下的子目录')
    entry.folderId = id
  }
  entry.updatedAt = new Date().toISOString()
  saveKbRegistry(registry)
  return { entry }
}

export function listKbEntries(): KbEntry[] {
  return loadKbRegistry().entries
}

function loadManifest(slug: string): KbManifest | null {
  const path = manifestPath(slug)
  if (!existsSync(path)) return null
  try {
    const parsed = JSON.parse(readFileSync(path, 'utf8')) as KbManifest
    if (!Array.isArray(parsed.chunks)) return null
    return parsed
  } catch {
    return null
  }
}

// ---------------------------------------------------------------------------
// Lexical scoring (ported from the original Agent Pi search)
// ---------------------------------------------------------------------------

function tokenize(value: string): string[] {
  const tokens = value.split(/[\s,.;:!?()[\]{}"'`\\/|+-]+/).filter((token) => token.length >= 2)
  for (const segment of value.match(/[\u4e00-\u9fff]{2,}/g) ?? []) {
    for (let size = 2; size <= 3; size++) {
      for (let index = 0; index <= segment.length - size; index++) {
        tokens.push(segment.slice(index, index + size))
      }
    }
  }
  return Array.from(new Set(tokens))
}

function normalizeForSearch(value: string): string {
  return compactWhitespace(value).toLocaleLowerCase()
}

function compactWhitespace(value: string): string {
  return value.replace(/\s+/g, ' ').trim()
}

function countOccurrences(value: string, token: string): number {
  if (!token) return 0
  let count = 0
  let position = value.indexOf(token)
  while (position >= 0) {
    count++
    position = value.indexOf(token, position + token.length)
  }
  return count
}

function scoreChunk(chunk: KbChunk, normalizedQuery: string, tokens: string[]): number {
  const title = normalizeForSearch(chunk.title)
  const text = chunk.textNorm || normalizeForSearch(chunk.text || '')
  const metadata = normalizeForSearch([
    chunk.metadata.headingPath.join(' '),
    chunk.metadata.clauseRefs.join(' '),
    chunk.metadata.tableRefs.join(' '),
    chunk.metadata.boqRefs.join(' '),
  ].join(' '))
  const combined = `${title}\n${metadata}\n${text}`
  let score = 0
  if (combined.includes(normalizedQuery)) score += 50
  if (title.includes(normalizedQuery)) score += 20
  for (const token of tokens) {
    const titleHits = countOccurrences(title, token)
    const metadataHits = countOccurrences(metadata, token)
    const textHits = countOccurrences(text, token)
    score += Math.min(titleHits * 6 + metadataHits * 4 + textHits * 2, 24)
  }
  return score
}

function makeSnippet(text: string, normalizedQuery: string, tokens: string[]): string {
  const normalizedText = normalizeForSearch(text)
  let index = normalizedText.indexOf(normalizedQuery)
  if (index < 0) {
    for (const token of tokens) {
      index = normalizedText.indexOf(token)
      if (index >= 0) break
    }
  }
  if (index < 0) return compactWhitespace(text).slice(0, 240)
  const start = Math.max(0, index - 100)
  const end = Math.min(text.length, index + normalizedQuery.length + 160)
  const prefix = start > 0 ? '...' : ''
  const suffix = end < text.length ? '...' : ''
  return `${prefix}${compactWhitespace(text.slice(start, end))}${suffix}`
}

function citationFor(entry: KbEntry, chunk: KbChunk): string {
  const locator = chunk.metadata.kind === 'prose'
    ? `lines ${chunk.startLine}-${chunk.endLine}`
    : chunk.metadata.kind === 'table'
      ? `table ${chunk.id}`
      : `clause ${chunk.id}`
  const page = chunk.metadata.pageStart
    ? `, p.${chunk.metadata.pageStart}${chunk.metadata.pageEnd && chunk.metadata.pageEnd !== chunk.metadata.pageStart ? `-${chunk.metadata.pageEnd}` : ''}`
    : ''
  return `${entry.name} (${entry.slug}:${chunk.id}), ${locator}${page}, source: ${entry.sourcePath}`
}

function loadContentList(slug: string): unknown {
  const path = contentListPath(slug)
  if (!existsSync(path)) return undefined
  try {
    return JSON.parse(readFileSync(path, 'utf8'))
  } catch {
    return undefined
  }
}

function persistContentList(slug: string, contentList: unknown): void {
  const empty = contentList == null || (Array.isArray(contentList) && contentList.length === 0)
  if (empty) {
    if (existsSync(contentListPath(slug))) rmSync(contentListPath(slug), { force: true })
    return
  }
  writeFileSync(contentListPath(slug), `${JSON.stringify(contentList)}\n`, 'utf8')
}

function manuscriptText(entry: KbEntry): string {
  if (!entry.managedPath || !existsSync(entry.managedPath)) return ''
  return readFileSync(entry.managedPath, 'utf8').replace(/^\uFEFF/, '').replace(/\r\n/g, '\n')
}

function resolveChunkText(manuscript: string, chunk: KbChunk): string {
  if (Number.isInteger(chunk.startOffset) && Number.isInteger(chunk.endOffset) && manuscript) {
    return manuscript.slice(chunk.startOffset, chunk.endOffset)
  }
  return chunk.text || ''
}

function persistableChunk(chunk: StructureChunk): KbChunk {
  return {
    id: chunk.id,
    title: chunk.title,
    startLine: chunk.startLine,
    endLine: chunk.endLine,
    startOffset: chunk.startOffset,
    endOffset: chunk.endOffset,
    textNorm: normalizeForSearch(chunk.text),
    metadata: chunk.metadata,
  }
}

// ---------------------------------------------------------------------------
// Registry operations
// ---------------------------------------------------------------------------

function slugify(value: string): string {
  const fallbackHash = createHash('sha1').update(value).digest('hex').slice(0, 8)
  const base = value
    .toLowerCase()
    .replace(/\.[a-z0-9]+$/i, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 48)
  return base || `kb-${fallbackHash}`
}

function uniqueSlug(base: string, taken: Set<string>): string {
  if (!taken.has(base)) return base
  let counter = 2
  while (taken.has(`${base}-${counter}`)) counter++
  return `${base}-${counter}`
}

function hashText(text: string): string {
  return createHash('sha256').update(text).digest('hex')
}

function hashFile(path: string): string {
  return createHash('sha256').update(readFileSync(path)).digest('hex')
}

function originalsDir(): string {
  return join(kbRoot(), 'originals')
}

const MINERU_FOLDER_UUID = /-[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

function safeOriginalName(raw: string): string {
  const base = basename(String(raw || '').replace(/\\/g, '/'))
  const cleaned = base.replace(/[<>:"/|?*\u0000-\u001f]/g, '_').replace(/^\.+$/, '').trim()
  return cleaned || 'document.bin'
}

/** Drop MinerU's `filename.pdf-<uuid>` folder suffix so the list matches the uploaded file. */
function stripMineruArtifactName(raw: string): string {
  const base = basename(String(raw || '').replace(/\\/g, '/'))
  if (!base || /^full\.md$/i.test(base)) return base
  const stripped = base.replace(MINERU_FOLDER_UUID, '')
  return stripped || base
}

export function kbDisplayName(entry: Pick<KbEntry, 'name' | 'originalName'>): string {
  return stripMineruArtifactName(entry.originalName || entry.name)
}

function inferMineruOriginalName(dir: string): string | undefined {
  const folder = basename(dir)
  const stripped = stripMineruArtifactName(folder)
  if (stripped && stripped !== folder && extname(stripped)) return stripped
}

function findSourceInMineruDir(dir: string, inferred?: string): string | undefined {
  if (inferred) {
    const named = join(dir, inferred)
    if (existsSync(named) && statSync(named).isFile()) return named
  }
  const pdfs = readdirSync(dir).filter((name) => /\.pdf$/i.test(name) && !name.startsWith('.'))
  if (pdfs.length === 1) return join(dir, pdfs[0])
}

function upsertRegistryEntry(entry: KbEntry): void {
  const registry = loadKbRegistry()
  registry.entries = [...registry.entries.filter((item) => item.slug !== entry.slug), entry]
    .sort((a, b) => a.category.localeCompare(b.category) || a.name.localeCompare(b.name))
  saveKbRegistry(registry)
}

function patchEntry(slug: string, patch: Partial<KbEntry>): KbEntry | undefined {
  const registry = loadKbRegistry()
  const current = registry.entries.find((item) => item.slug === slug)
  if (!current) return undefined
  const next = { ...current, ...patch, updatedAt: new Date().toISOString() }
  registry.entries = registry.entries.map((item) => item.slug === slug ? next : item)
  saveKbRegistry(registry)
  return next
}

export interface KbAddInput {
  path: string
  name?: string
  category?: string
  slug?: string
  seeded?: boolean
  baseDir?: string
  folderId?: string
  folderName?: string
}

export interface KbAddContentInput {
  /** Original file name, used for extension and default display name. */
  fileName: string
  text: string
  name?: string
  category?: string
  slug?: string
  sourcePath?: string
  contentList?: unknown
  folderId?: string
  folderName?: string
}

export interface KbAddResult {
  entry: KbEntry
  chunkCount: number
  replaced: boolean
  skipped?: boolean
  staged?: boolean
  /** Original pack.json rewritten after a preview save, when the entry is a pack. */
  packPath?: string
}

function assertSupportedExt(ext: string): void {
  if (!SUPPORTED_EXTENSIONS.has(ext)) {
    throw new Error(`不支持的格式 ${ext || '(无扩展名)'}。${UNSUPPORTED_HINT}`)
  }
}

function commitKbText(input: {
  text: string
  displayName?: string
  category?: string
  slug?: string
  sourcePath: string
  seeded?: boolean
  ext: string
  copyFromPath?: boolean
  originalPath?: string
  originalName?: string
  ingest?: 'direct' | 'mineru' | 'pack'
  sourceHashOverride?: string
  force?: boolean
  contentList?: unknown
  units?: StructureChunk[]
  folderId?: string
  folderName?: string
}): KbAddResult {
  const raw = input.text.replace(/^\uFEFF/, '')
  const text = input.units && input.units.length > 0 ? raw : standardizeKbMarkdown(raw)
  if (!text.trim()) throw new Error(`文件内容为空：${input.sourcePath}`)
  const sizeBytes = Buffer.byteLength(text, 'utf8')
  if (sizeBytes > MAX_KB_TEXT_BYTES) {
    throw new Error(`解析稿过大（>${MAX_KB_TEXT_BYTES} 字节）。请先拆成较小的 Markdown 再入库。`)
  }
  const sourcePath = resolve(input.sourcePath)
  const sourceHash = input.sourceHashOverride || hashText(text)

  const registry = loadKbRegistry()
  const existing = registry.entries.find((entry) =>
    (input.slug && entry.slug === input.slug)
    || entry.sourcePath === sourcePath
    || entry.sourceHash === sourceHash)
  const sameName = !input.displayName?.trim() || input.displayName.trim() === existing?.name
  const sameCategory = !input.category?.trim() || input.category.trim() === existing?.category
  if (!input.force && existing && existing.parseStatus !== 'failed' && existing.parseStatus !== 'parsing'
    && existing.parseStatus !== 'staged'
    && existing.sourceHash === sourceHash && sameName && sameCategory) {
    if (assignSuggestedFolder(registry, existing)) saveKbRegistry(registry)
    return { entry: existing, chunkCount: existing.chunkCount, replaced: false, skipped: true }
  }

  const name = input.displayName?.trim() || existing?.name || basename(sourcePath)
  const category = resolveKbCategory(input.category || existing?.category, name)
  const taken = new Set(registry.entries.filter((entry) => entry !== existing).map((entry) => entry.slug))
  const slug = existing?.slug ?? uniqueSlug(input.slug?.trim() || slugify(name), taken)
  mkdirSync(join(kbRoot(), 'files'), { recursive: true })
  mkdirSync(join(kbRoot(), 'index'), { recursive: true })

  if (input.contentList !== undefined) persistContentList(slug, input.contentList)
  const structured = input.units && input.units.length > 0 ? input.units : chunkByStructure(text, name)
  const units = enrichStructureUnits(text, structured, input.contentList ?? loadContentList(slug))
  if (units.length === 0) throw new Error(`切块结果为空：${sourcePath}`)
  const chunks = units.map(persistableChunk)
  const fidelity = measureFidelity(text, units)

  const managedDir = join(kbRoot(), 'files')
  const managedExt = input.ingest === 'mineru' || input.ingest === 'pack' ? '.md' : input.ext
  const managedPath = join(managedDir, `${slug}${managedExt}`)
  if (input.copyFromPath && resolve(sourcePath) !== resolve(managedPath)) {
    copyFileSync(sourcePath, managedPath)
  } else {
    writeFileSync(managedPath, text, 'utf8')
  }

  const now = new Date().toISOString()
  const manifest: KbManifest = {
    schemaVersion: 1,
    slug,
    name,
    category,
    sourcePath,
    indexedAt: now,
    chunks,
  }
  writeJson(manifestPath(slug), manifest)
  writeJson(fidelityPath(slug), { schemaVersion: 1, ...fidelity })
  persistMiniSearchIndex(
    minisearchPath(slug),
    chunks.map((chunk) => searchDocumentFromChunk(slug, chunk)).filter((doc) => doc !== null),
  )
  invalidateKbSearchIndex()

  const entry: KbEntry = {
    slug,
    name,
    category,
    sourcePath,
    managedPath,
    originalPath: input.originalPath || existing?.originalPath,
    originalName: input.originalName || existing?.originalName,
    ingest: input.ingest || existing?.ingest || 'direct',
    parseStatus: 'ready',
    parseError: undefined,
    parseProgress: undefined,
    sourceHash,
    sizeBytes,
    chunkCount: chunks.length,
    clauseCount: fidelity.clauseCount,
    coverage: fidelity.coverage,
    tableCount: fidelity.tableCount,
    seeded: input.seeded || existing?.seeded,
    folderId: resolveEntryFolderId(registry, category, {
      folderId: input.folderId || existing?.folderId,
      folderName: input.folderName,
      names: [input.originalName, name, existing?.originalName, existing?.name],
    }) || existing?.folderId,
    createdAt: existing?.createdAt ?? now,
    updatedAt: now,
  }
  registry.entries = [...registry.entries.filter((item) => item.slug !== slug), entry]
    .sort((a, b) => a.category.localeCompare(b.category) || a.name.localeCompare(b.name))
  registry.removedSeeds = registry.removedSeeds.filter((path) => resolve(path) !== sourcePath)
  saveKbRegistry(registry)
  return { entry, chunkCount: chunks.length, replaced: Boolean(existing) }
}

/**
 * Index one text file into the knowledge base: copy it under the KB root, chunk it,
 * and upsert the registry entry. Re-adding the same sourcePath (or slug) rebuilds the
 * entry in place; identical content is skipped as a no-op.
 */
function keepOriginalCopy(slug: string, sourceFile: string, originalName: string): string {
  const destDir = join(originalsDir(), slug)
  mkdirSync(destDir, { recursive: true })
  const dest = join(destDir, originalName)
  if (resolve(sourceFile) !== resolve(dest)) copyFileSync(sourceFile, dest)
  return dest
}

function addMineruArtifactDir(dir: string, input: KbAddInput): KbAddResult {
  const md = join(dir, 'full.md')
  if (!existsSync(md)) {
    throw new Error('这不是 MinerU 产物文件夹（缺少 full.md）。请选原 PDF/Word，或选其中的 full.md。')
  }
  const inferred = inferMineruOriginalName(dir) || safeOriginalName(input.name || `${basename(dir)}.pdf`)
  const sourceFile = findSourceInMineruDir(dir, inferred)
  const result = commitKbText({
    text: readFileSync(md, 'utf8'),
    displayName: input.name?.trim() || inferred,
    category: input.category,
    slug: input.slug,
    sourcePath: sourceFile || md,
    ext: '.md',
    ingest: 'mineru',
    originalName: inferred,
    originalPath: sourceFile,
    folderId: input.folderId,
    folderName: input.folderName,
  })
  if (sourceFile) {
    const originalPath = keepOriginalCopy(result.entry.slug, sourceFile, inferred)
    patchEntry(result.entry.slug, { originalPath, originalName: inferred })
    result.entry.originalPath = originalPath
    result.entry.originalName = inferred
  }
  return result
}

/** Import a vision/hand-authored pack folder (pack.json + manuscript.md). Ready immediately. */
export function importKbPack(input: KbAddInput): KbAddResult {
  const sourcePath = isAbsolute(input.path) ? resolve(input.path) : resolve(input.baseDir ?? process.cwd(), input.path)
  const resolved = resolveKbPack(sourcePath)
  const text = readFileSync(resolved.manuscriptPath, 'utf8')
  const name = input.name?.trim() || resolved.pack.name || basename(resolved.dir)
  const units = chunksFromPackUnits(text, resolved.pack, name)
  return commitKbText({
    text,
    displayName: name,
    category: resolveKbCategory(input.category || resolved.pack.category, name),
    slug: input.slug || resolved.pack.slug,
    sourcePath: resolved.manuscriptPath,
    seeded: input.seeded,
    ext: '.md',
    ingest: 'pack',
    originalName: resolved.pack.originalName || basename(resolved.dir),
    originalPath: resolved.packPath,
    contentList: loadPackContentList(resolved),
    units,
    force: true,
    folderId: input.folderId,
    folderName: input.folderName,
  })
}

export function addKbFile(input: KbAddInput): KbAddResult {
  const sourcePath = isAbsolute(input.path) ? resolve(input.path) : resolve(input.baseDir ?? process.cwd(), input.path)
  if (!existsSync(sourcePath)) throw new Error(`文件不存在：${sourcePath}`)
  if (looksLikeKbPack(sourcePath)) return importKbPack({ ...input, path: sourcePath })
  if (statSync(sourcePath).isDirectory()) return addMineruArtifactDir(sourcePath, input)
  if (!statSync(sourcePath).isFile()) throw new Error(`不是文件：${sourcePath}`)
  if (basename(sourcePath).toLowerCase() === 'full.md') {
    const inferred = inferMineruOriginalName(dirname(sourcePath))
    if (inferred) return addMineruArtifactDir(dirname(sourcePath), { ...input, name: input.name || inferred })
  }
  const ext = extname(sourcePath).toLowerCase()
  assertSupportedExt(ext)
  if (MINERU_EXTENSIONS.has(ext)) {
    return beginMineruIngest({
      sourcePath,
      fileName: basename(sourcePath),
      displayName: input.name,
      category: input.category,
      slug: input.slug,
      parseNow: true,
      folderId: input.folderId,
      folderName: input.folderName,
    })
  }
  return commitKbText({
    text: readFileSync(sourcePath, 'utf8'),
    displayName: input.name,
    category: input.category,
    slug: input.slug,
    sourcePath,
    seeded: input.seeded,
    ext,
    copyFromPath: true,
    ingest: 'direct',
    originalName: basename(sourcePath),
    folderId: input.folderId,
    folderName: input.folderName,
  })
}

export function addKbBytes(input: {
  fileName: string
  bytes: Buffer
  name?: string
  category?: string
  slug?: string
  folderId?: string
  folderName?: string
}): KbAddResult {
  const fileName = basename(String(input.fileName || '').replace(/\\/g, '/'))
  if (!fileName || fileName === '.' || fileName === '..') throw new Error('需要文件名')
  const ext = extname(fileName).toLowerCase()
  assertSupportedExt(ext)
  if (TEXT_EXTENSIONS.has(ext)) {
    return addKbContent({
      fileName,
      text: input.bytes.toString('utf8'),
      name: input.name,
      category: input.category,
      slug: input.slug,
      folderId: input.folderId,
      folderName: input.folderName,
    })
  }
  mkdirSync(join(kbRoot(), 'uploads'), { recursive: true })
  const uploadPath = join(kbRoot(), 'uploads', fileName)
  writeFileSync(uploadPath, input.bytes)
  return beginMineruIngest({
    sourcePath: uploadPath,
    fileName,
    displayName: input.name,
    category: input.category,
    slug: input.slug,
    parseNow: true,
    folderId: input.folderId,
    folderName: input.folderName,
  })
}

/**
 * Copy one file into `knowledge-base/originals/<slug>/` without parsing.
 * The workbench then shows the original and waits for「解析入库」.
 */
export function stageKbFile(input: KbAddInput): KbAddResult {
  const sourcePath = isAbsolute(input.path) ? resolve(input.path) : resolve(input.baseDir ?? process.cwd(), input.path)
  if (!existsSync(sourcePath)) throw new Error(`文件不存在：${sourcePath}`)
  if (looksLikeKbPack(sourcePath)) return importKbPack({ ...input, path: sourcePath })
  if (statSync(sourcePath).isDirectory()) return addMineruArtifactDir(sourcePath, input)
  if (!statSync(sourcePath).isFile()) throw new Error(`不是文件：${sourcePath}`)
  if (basename(sourcePath).toLowerCase() === 'full.md') {
    const inferred = inferMineruOriginalName(dirname(sourcePath))
    if (inferred) return addMineruArtifactDir(dirname(sourcePath), { ...input, name: input.name || inferred })
  }
  const ext = extname(sourcePath).toLowerCase()
  assertSupportedExt(ext)
  return beginMineruIngest({
    sourcePath,
    fileName: basename(sourcePath),
    displayName: input.name,
    category: input.category,
    slug: input.slug,
    ingest: MINERU_EXTENSIONS.has(ext) ? 'mineru' : 'direct',
    parseNow: false,
    folderId: input.folderId,
    folderName: input.folderName,
  })
}

export function stageKbBytes(input: {
  fileName: string
  bytes: Buffer
  name?: string
  category?: string
  slug?: string
  folderId?: string
  folderName?: string
}): KbAddResult {
  const fileName = basename(String(input.fileName || '').replace(/\\/g, '/'))
  if (!fileName || fileName === '.' || fileName === '..') throw new Error('需要文件名')
  const ext = extname(fileName).toLowerCase()
  assertSupportedExt(ext)
  if (TEXT_EXTENSIONS.has(ext)) {
    return stageKbContent({
      fileName,
      text: input.bytes.toString('utf8'),
      name: input.name,
      category: input.category,
      slug: input.slug,
      folderId: input.folderId,
      folderName: input.folderName,
    })
  }
  mkdirSync(join(kbRoot(), 'uploads'), { recursive: true })
  const uploadPath = join(kbRoot(), 'uploads', fileName)
  writeFileSync(uploadPath, input.bytes)
  return beginMineruIngest({
    sourcePath: uploadPath,
    fileName,
    displayName: input.name,
    category: input.category,
    slug: input.slug,
    ingest: 'mineru',
    parseNow: false,
    folderId: input.folderId,
    folderName: input.folderName,
  })
}

export function stageKbContent(input: KbAddContentInput): KbAddResult {
  const fileName = basename(String(input.fileName || '').replace(/\\/g, '/'))
  if (!fileName || fileName === '.' || fileName === '..') throw new Error('需要文件名')
  const ext = extname(fileName).toLowerCase()
  if (!TEXT_EXTENSIONS.has(ext)) {
    throw new Error(`文本入库只支持 .md / .txt / .json。Office/扫描件请用文件选择。`)
  }
  const uploadDir = join(kbRoot(), 'uploads')
  mkdirSync(uploadDir, { recursive: true })
  const uploadPath = input.sourcePath && isAbsolute(input.sourcePath)
    ? resolve(input.sourcePath)
    : join(uploadDir, fileName)
  if (!input.sourcePath || resolve(uploadPath) === join(uploadDir, fileName)) {
    writeFileSync(uploadPath, input.text.replace(/^\uFEFF/, ''), 'utf8')
  }
  return beginMineruIngest({
    sourcePath: uploadPath,
    fileName,
    displayName: input.name?.trim() || fileName,
    category: input.category,
    slug: input.slug,
    ingest: 'direct',
    parseNow: false,
    folderId: input.folderId,
    folderName: input.folderName,
  })
}

function beginMineruIngest(input: {
  sourcePath: string
  fileName: string
  displayName?: string
  category?: string
  slug?: string
  ingest?: 'direct' | 'mineru' | 'pack'
  parseNow?: boolean
  folderId?: string
  folderName?: string
}): KbAddResult {
  const sourcePath = resolve(input.sourcePath)
  const sourceHash = existsSync(sourcePath) && statSync(sourcePath).isFile()
    ? hashFile(sourcePath)
    : hashText(String(input.fileName))
  const registry = loadKbRegistry()
  const existing = registry.entries.find((entry) =>
    (input.slug && entry.slug === input.slug)
    || entry.sourcePath === sourcePath
    || entry.sourceHash === sourceHash)
  if (existing && existing.parseStatus === 'ready' && existing.sourceHash === sourceHash) {
    const sameName = !input.displayName?.trim() || input.displayName.trim() === existing.name
    const sameCategory = !input.category?.trim() || input.category.trim() === existing.category
    if (sameName && sameCategory) {
      if (assignSuggestedFolder(registry, existing)) saveKbRegistry(registry)
      return { entry: existing, chunkCount: existing.chunkCount, replaced: false, skipped: true }
    }
  }
  const originalName = safeOriginalName(input.fileName)
  const name = input.displayName?.trim() || existing?.name || originalName
  const category = resolveKbCategory(input.category || existing?.category, name)
  const taken = new Set(registry.entries.filter((entry) => entry !== existing).map((entry) => entry.slug))
  const slug = existing?.slug ?? uniqueSlug(input.slug?.trim() || slugify(name), taken)
  const originalDir = join(originalsDir(), slug)
  mkdirSync(originalDir, { recursive: true })
  const originalPath = join(originalDir, originalName)
  if (resolve(sourcePath) !== resolve(originalPath)) copyFileSync(sourcePath, originalPath)
  const parseNow = input.parseNow === true
  const ingest = input.ingest || 'mineru'
  const now = new Date().toISOString()
  const entry: KbEntry = {
    slug,
    name,
    category,
    sourcePath,
    managedPath: existing?.managedPath || '',
    originalPath,
    originalName,
    ingest,
    parseStatus: parseNow ? 'parsing' : 'staged',
    parseProgress: parseNow ? '正在检测文本层…' : '已落入原始文档区，等待解析入库',
    parsePercent: parseNow ? 5 : 0,
    parseError: undefined,
    sourceHash,
    sizeBytes: statSync(originalPath).size,
    chunkCount: existing?.chunkCount ?? 0,
    folderId: resolveEntryFolderId(registry, category, {
      folderId: input.folderId || existing?.folderId,
      folderName: input.folderName,
      names: [originalName, name, input.fileName],
    }) || existing?.folderId,
    createdAt: existing?.createdAt ?? now,
    updatedAt: now,
  }
  upsertRegistryEntry(entry)
  if (parseNow) enqueueMineruJob(slug, originalPath, name, category, sourceHash, originalName, ingest)
  return { entry, chunkCount: entry.chunkCount, replaced: Boolean(existing), staged: !parseNow }
}

/** Start parse for one staged/failed entry; text files index immediately. */
export function parseKbEntry(slug: string, options?: { force?: boolean }): KbAddResult {
  const entry = listKbEntries().find((item) => item.slug === slug)
  if (!entry) throw new Error(`未找到条目 ${slug}`)
  const force = options?.force === true
  if (entry.parseStatus === 'ready' && !force) {
    return { entry, chunkCount: entry.chunkCount, replaced: false, skipped: true }
  }
  if (entry.parseStatus === 'parsing' && parseJobs.has(slug)) {
    return { entry, chunkCount: entry.chunkCount, replaced: false }
  }
  const originalPath = entry.originalPath && existsSync(entry.originalPath)
    ? entry.originalPath
    : (existsSync(entry.sourcePath) ? entry.sourcePath : '')
  if (!originalPath) throw new Error('原始文档不在存储区，请重新选择文件')
  const ext = extname(originalPath).toLowerCase()
  if (TEXT_EXTENSIONS.has(ext) && (entry.ingest !== 'mineru' || force)) {
    return commitKbText({
      text: readFileSync(originalPath, 'utf8'),
      displayName: entry.name,
      category: entry.category,
      slug: entry.slug,
      sourcePath: originalPath,
      ext,
      originalPath,
      originalName: entry.originalName || basename(originalPath),
      ingest: 'direct',
      sourceHashOverride: entry.sourceHash,
      seeded: entry.seeded,
    })
  }
  const next = patchEntry(slug, {
    parseStatus: 'parsing',
    parseProgress: force ? '改走 MinerU 重解析…' : '已排队，即将解析…',
    parsePercent: 3,
    parseError: undefined,
  }) || entry
  enqueueMineruJob(
    slug,
    originalPath,
    entry.name,
    entry.category,
    entry.sourceHash,
    entry.originalName || basename(originalPath),
    'mineru',
    { preferLocalText: !force },
  )
  return { entry: next, chunkCount: next.chunkCount, replaced: true }
}

export function parseKbEntries(slugs?: string[], options?: { force?: boolean }): { started: string[]; skipped: string[]; results: KbAddResult[] } {
  const wanted = (slugs || []).map((item) => String(item || '').trim()).filter(Boolean)
  const targets = listKbEntries().filter((entry) => {
    if (wanted.length > 0) return wanted.includes(entry.slug)
    return entry.parseStatus === 'staged' || entry.parseStatus === 'failed'
  })
  if (targets.length === 0) throw new Error(wanted.length ? '没有可解析的条目' : '没有待解析的文件。请先选择文件落入原始文档区。')
  const results: KbAddResult[] = []
  const started: string[] = []
  const skipped: string[] = []
  for (const entry of targets) {
    const result = parseKbEntry(entry.slug, options)
    results.push(result)
    if (result.skipped) skipped.push(entry.slug)
    else started.push(entry.slug)
  }
  return { started, skipped, results }
}

function enqueueMineruJob(
  slug: string,
  originalPath: string,
  name: string,
  category: string,
  sourceHash: string,
  originalName: string,
  ingest: 'direct' | 'mineru',
  options?: { preferLocalText?: boolean },
): void {
  if (parseJobs.has(slug)) return
  parseJobs.add(slug)
  parseDrain = parseDrain
    .then(() => runMineruJob(slug, originalPath, name, category, sourceHash, originalName, ingest, options))
    .catch(() => undefined)
    .finally(() => { parseJobs.delete(slug) })
}

async function runMineruJob(
  slug: string,
  originalPath: string,
  name: string,
  category: string,
  sourceHash: string,
  originalName: string,
  ingest: 'direct' | 'mineru' = 'mineru',
  options?: { preferLocalText?: boolean },
): Promise<void> {
  try {
    patchEntry(slug, {
      parseStatus: 'parsing',
      parseProgress: '正在检测文本层…',
      parsePercent: 6,
      parseError: undefined,
    })
    if (ingest === 'direct' && TEXT_EXTENSIONS.has(extname(originalPath).toLowerCase())) {
      commitKbText({
        text: readFileSync(originalPath, 'utf8'),
        displayName: name,
        category,
        slug,
        sourcePath: originalPath,
        ext: extname(originalPath).toLowerCase(),
        originalPath,
        originalName,
        ingest: 'direct',
        sourceHashOverride: sourceHash,
      })
      return
    }
    const extracted = await ingestDocumentForKb(originalPath, {
      workDir: join(kbRoot(), 'tmp', slug),
      preferLocalText: options?.preferLocalText !== false,
      onProgress: (message, percent) => {
        patchEntry(slug, {
          parseStatus: 'parsing',
          parseProgress: message,
          parsePercent: percent,
          parseError: undefined,
        })
      },
    })
    commitKbText({
      text: extracted.markdown,
      displayName: name,
      category,
      slug,
      sourcePath: originalPath,
      ext: '.md',
      originalPath,
      originalName,
      ingest: extracted.via === 'local' ? 'direct' : 'mineru',
      sourceHashOverride: sourceHash,
      contentList: extracted.contentList,
    })
  } catch (error) {
    patchEntry(slug, {
      parseStatus: 'failed',
      parseProgress: undefined,
      parsePercent: undefined,
      parseError: error instanceof Error ? error.message : String(error),
    })
  }
}

export function expireStaleKbParses(): void {
  for (const entry of listKbEntries()) {
    if (entry.parseStatus !== 'parsing' || parseJobs.has(entry.slug)) continue
    patchEntry(entry.slug, {
      parseStatus: 'failed',
      parseError: '解析中断，请重新点「解析入库」',
      parseProgress: undefined,
      parsePercent: undefined,
    })
  }
}

export function readKbMarkdown(slug: string): { slug: string; name: string; text: string; originalName?: string; hasSource: boolean } {
  const entry = listKbEntries().find((item) => item.slug === slug)
  if (!entry) throw new Error(`未找到条目 ${slug}`)
  if (entry.parseStatus === 'staged') throw new Error('文件已在原始文档区，请先点「解析入库」')
  if (entry.parseStatus === 'parsing') throw new Error('仍在解析，完成后即可预览')
  if (entry.parseStatus === 'failed') throw new Error(entry.parseError || '解析失败')
  if (!entry.managedPath || !existsSync(entry.managedPath)) throw new Error('解析稿不存在')
  return {
    slug,
    name: kbDisplayName(entry),
    text: readFileSync(entry.managedPath, 'utf8'),
    originalName: entry.originalName,
    hasSource: Boolean(entry.originalPath && existsSync(entry.originalPath)),
  }
}

function sameKbPath(left?: string, right?: string): boolean {
  if (!left || !right) return false
  return resolve(left).replace(/\\/g, '/').toLowerCase() === resolve(right).replace(/\\/g, '/').toLowerCase()
}

/** Locate a ready KB entry whose managed copy, source, or imported pack matches `path`. */
export function findKbEntryForPath(path: string): KbEntry | undefined {
  const resolved = resolve(path)
  const siblingPack = basename(resolved).toLowerCase() === 'manuscript.md'
    && existsSync(join(dirname(resolved), 'pack.json'))
    ? resolve(join(dirname(resolved), 'pack.json'))
    : (basename(resolved).toLowerCase() === 'pack.json' ? resolved : '')
  return listKbEntries().find((entry) => (
    sameKbPath(entry.managedPath, resolved)
    || sameKbPath(entry.sourcePath, resolved)
    || sameKbPath(entry.originalPath, resolved)
    || (siblingPack && (sameKbPath(entry.originalPath, siblingPack) || sameKbPath(entry.sourcePath, siblingPack)))
  ))
}

function writeBackImportedPack(entry: KbEntry, text: string): string | undefined {
  const refs = [entry.originalPath, entry.sourcePath].filter((path): path is string => Boolean(path))
  for (const ref of refs) {
    if (!existsSync(ref) || !looksLikeKbPack(ref)) continue
    let resolved
    try {
      resolved = resolveKbPack(ref)
    } catch {
      continue
    }
    if ((resolved.pack as { role?: string }).role === 'agent-pi-setup-restore') continue
    const manuscript = standardizeKbMarkdown(text)
    const body = manuscript.endsWith('\n') ? manuscript : `${manuscript}\n`
    writeFileSync(resolved.manuscriptPath, body)
    const name = resolved.pack.name || entry.name
    const units = chunkByStructure(manuscript, name).map((unit) => ({
      id: unit.id,
      title: unit.title,
      startOffset: unit.startOffset,
      endOffset: unit.endOffset,
      kind: unit.metadata.kind,
      headingPath: unit.metadata.headingPath,
      pageStart: unit.metadata.pageStart,
      pageEnd: unit.metadata.pageEnd,
      clauseRefs: unit.metadata.clauseRefs,
    }))
    writeFileSync(resolved.packPath, `${JSON.stringify({ ...resolved.pack, units }, null, 2)}\n`)
    return resolved.packPath
  }
  return undefined
}

export function saveKbMarkdown(slug: string, text: string): KbAddResult {
  const entry = listKbEntries().find((item) => item.slug === slug)
  if (!entry) throw new Error(`未找到条目 ${slug}`)
  const next = String(text || '')
  if (!next.trim()) throw new Error('解析稿不能为空')
  rmSync(manifestPath(slug), { force: true })
  const result = commitKbText({
    text: next,
    displayName: entry.name,
    category: entry.category,
    slug: entry.slug,
    sourcePath: entry.originalPath || entry.sourcePath,
    ext: '.md',
    originalPath: entry.originalPath,
    originalName: entry.originalName,
    ingest: entry.ingest || 'direct',
    sourceHashOverride: hashText(next),
    seeded: entry.seeded,
    force: true,
    folderId: entry.folderId,
  })
  const packPath = writeBackImportedPack(result.entry, next)
  return packPath ? { ...result, packPath } : result
}

/**
 * Files-rail save of a workspace manuscript that is already a KB entry:
 * rebuild the same index JSON / MiniSearch corpus as the knowledge-page preview.
 */
export function syncKbFromMarkdownSave(path: string, text: string): KbAddResult | null {
  const entry = findKbEntryForPath(path)
  if (!entry) return null
  if (entry.parseStatus && entry.parseStatus !== 'ready' && entry.parseStatus !== 'failed') return null
  return saveKbMarkdown(entry.slug, text)
}

export function kbSourcePath(slug: string): string {
  const entry = listKbEntries().find((item) => item.slug === slug)
  if (!entry) throw new Error(`未找到条目 ${slug}`)
  const path = entry.originalPath && existsSync(entry.originalPath)
    ? entry.originalPath
    : (existsSync(entry.sourcePath) ? entry.sourcePath : entry.managedPath)
  if (!path || !existsSync(path)) throw new Error('源文件不在本机')
  return path
}

/**
 * Index pasted or uploaded text when the renderer cannot supply a disk path
 * (browser file input without Electron File.path).
 */
export function addKbContent(input: KbAddContentInput): KbAddResult {
  const fileName = basename(String(input.fileName || '').replace(/\\/g, '/'))
  if (!fileName || fileName === '.' || fileName === '..') throw new Error('需要文件名')
  const ext = extname(fileName).toLowerCase()
  if (!TEXT_EXTENSIONS.has(ext)) {
    throw new Error(`文本入库只支持 .md / .txt / .json。Office/扫描件请用文件选择，由 MinerU 解析。`)
  }
  const sourcePath = input.sourcePath && isAbsolute(input.sourcePath)
    ? resolve(input.sourcePath)
    : join(kbRoot(), 'uploads', fileName)
  mkdirSync(join(kbRoot(), 'uploads'), { recursive: true })
  return commitKbText({
    text: input.text,
    displayName: input.name?.trim() || fileName,
    category: input.category,
    slug: input.slug,
    sourcePath,
    ext,
    ingest: 'direct',
    originalName: fileName,
    contentList: input.contentList,
    folderId: input.folderId,
    folderName: input.folderName,
  })
}

/** Remove one entry: registry row, chunk manifest, and managed copy. Seeded entries are tombstoned so seeding does not restore them. */
export function removeKbEntry(slug: string): { removed: boolean; slug: string } {
  const registry = loadKbRegistry()
  const entry = registry.entries.find((item) => item.slug === slug)
  if (!entry) return { removed: false, slug }
  registry.entries = registry.entries.filter((item) => item.slug !== slug)
  if (entry.seeded && !registry.removedSeeds.includes(entry.sourcePath)) {
    registry.removedSeeds.push(entry.sourcePath)
  }
  saveKbRegistry(registry)
  rmSync(manifestPath(slug), { force: true })
  rmSync(fidelityPath(slug), { force: true })
  rmSync(minisearchPath(slug), { force: true })
  rmSync(contentListPath(slug), { force: true })
  invalidateKbSearchIndex()
  if (entry.managedPath && existsSync(entry.managedPath)) rmSync(entry.managedPath, { force: true })
  if (entry.originalPath && existsSync(entry.originalPath)) rmSync(entry.originalPath, { force: true })
  const originalDir = join(originalsDir(), slug)
  if (existsSync(originalDir)) rmSync(originalDir, { recursive: true, force: true })
  dropSlugFromTaskSelections(slug)
  return { removed: true, slug }
}

/**
 * Rebuild chunk manifests. Prefers the original sourcePath when it still exists (so
 * user edits take effect), else falls back to the managed copy.
 */
export function reindexKb(slug?: string): { reindexed: string[]; missing: string[] } {
  const registry = loadKbRegistry()
  const targets = slug ? registry.entries.filter((entry) => entry.slug === slug) : registry.entries
  if (slug && targets.length === 0) throw new Error(`未找到条目 ${slug}`)
  const reindexed: string[] = []
  const missing: string[] = []
  for (const entry of targets) {
    const fromMarkdown = entry.ingest === 'mineru' || (entry.managedPath && entry.managedPath.toLowerCase().endsWith('.md'))
    const from = fromMarkdown && entry.managedPath && existsSync(entry.managedPath)
      ? entry.managedPath
      : (existsSync(entry.sourcePath) ? entry.sourcePath : entry.managedPath)
    if (!from || !existsSync(from)) {
      missing.push(entry.slug)
      continue
    }
    if (fromMarkdown && TEXT_EXTENSIONS.has(extname(from).toLowerCase())) {
      commitKbText({
        text: readFileSync(from, 'utf8'),
        displayName: entry.name,
        category: entry.category,
        slug: entry.slug,
        sourcePath: entry.originalPath || entry.sourcePath,
        ext: '.md',
        originalPath: entry.originalPath,
        originalName: entry.originalName,
        ingest: entry.ingest || 'direct',
        seeded: entry.seeded,
        force: true,
        folderId: entry.folderId,
      })
    } else {
      addKbFile({ path: from, slug: entry.slug, name: entry.name, category: entry.category, seeded: entry.seeded, folderId: entry.folderId })
    }
    reindexed.push(entry.slug)
  }
  return { reindexed, missing }
}

// ---------------------------------------------------------------------------
// Retrieval
// ---------------------------------------------------------------------------

export interface KbSearchOptions {
  limit?: number
  slugs?: string[]
  category?: string
}

function candidateEntries(options: KbSearchOptions): KbEntry[] {
  let entries = listKbEntries().filter((entry) => !entry.parseStatus || entry.parseStatus === 'ready')
  if (options.slugs && options.slugs.length > 0) {
    const wanted = new Set(options.slugs)
    entries = entries.filter((entry) => wanted.has(entry.slug))
  }
  if (options.category) {
    const needle = options.category.toLocaleLowerCase()
    entries = entries.filter((entry) => entry.category.toLocaleLowerCase().includes(needle))
  }
  return entries
}

function corpusSearchKey(): string {
  return `${kbRoot()}::${listKbEntries()
    .filter((entry) => !entry.parseStatus || entry.parseStatus === 'ready')
    .map((entry) => `${entry.slug}:${entry.updatedAt}:${entry.chunkCount}`)
    .join('|')}`
}

function getCorpusMiniSearch(): ReturnType<typeof createKbMiniSearch> {
  const key = corpusSearchKey()
  if (searchIndexCache?.key === key) return searchIndexCache.index
  const index = createKbMiniSearch()
  const documents = []
  for (const entry of listKbEntries()) {
    if (entry.parseStatus && entry.parseStatus !== 'ready') continue
    const manifest = loadManifest(entry.slug)
    if (!manifest) continue
    for (const chunk of manifest.chunks) {
      const document = searchDocumentFromChunk(entry.slug, chunk)
      if (document) documents.push(document)
    }
  }
  if (documents.length > 0) index.addAll(documents)
  searchIndexCache = { key, index }
  return index
}

function hydrateSearchHit(
  entry: KbEntry,
  chunk: KbChunk,
  manuscript: string,
  score: number,
  normalizedQuery: string,
  tokens: string[],
): KbSearchHit {
  return {
    slug: entry.slug,
    name: entry.name,
    category: entry.category,
    chunkId: chunk.id,
    title: chunk.title,
    score,
    citation: citationFor(entry, chunk),
    snippet: makeSnippet(resolveChunkText(manuscript, chunk), normalizedQuery, tokens),
    headingPath: chunk.metadata.headingPath,
    page: chunk.metadata.pageStart,
  }
}

function capSearchHits(hits: KbSearchHit[], options: KbSearchOptions, limit: number): KbSearchHit[] {
  hits.sort((a, b) => b.score - a.score || a.slug.localeCompare(b.slug) || a.chunkId.localeCompare(b.chunkId))
  const perEntryCap = options.slugs && options.slugs.length > 0 ? Number.POSITIVE_INFINITY : 3
  const taken = new Map<string, number>()
  const result: KbSearchHit[] = []
  for (const hit of hits) {
    const used = taken.get(hit.slug) ?? 0
    if (used >= perEntryCap) continue
    taken.set(hit.slug, used + 1)
    result.push(hit)
    if (result.length >= limit) break
  }
  return result
}

function searchKbLexical(normalizedQuery: string, tokens: string[], options: KbSearchOptions): KbSearchHit[] {
  const hits: KbSearchHit[] = []
  for (const entry of candidateEntries(options)) {
    const manifest = loadManifest(entry.slug)
    if (!manifest) continue
    const manuscript = manuscriptText(entry)
    for (const chunk of manifest.chunks) {
      if (chunk.metadata.kind === 'toc') continue
      const score = scoreChunk(chunk, normalizedQuery, tokens)
      if (score <= 0) continue
      hits.push(hydrateSearchHit(entry, chunk, manuscript, score, normalizedQuery, tokens))
    }
  }
  return hits
}

function searchKbMiniSearch(query: string, normalizedQuery: string, tokens: string[], options: KbSearchOptions): KbSearchHit[] {
  const allowed = new Set(candidateEntries(options).map((entry) => entry.slug))
  if (allowed.size === 0) return []
  const results = getCorpusMiniSearch().search(query, {
    filter: (result) => typeof result.slug === 'string' && allowed.has(result.slug),
  })
  const hits: KbSearchHit[] = []
  for (const result of results) {
    const slug = String(result.slug || '')
    const chunkId = String(result.chunkId || '')
    const entry = listKbEntries().find((item) => item.slug === slug)
    const manifest = entry ? loadManifest(slug) : null
    const chunk = manifest?.chunks.find((item) => item.id === chunkId)
    if (!entry || !chunk || chunk.metadata.kind === 'toc') continue
    const manuscript = manuscriptText(entry)
    const text = chunk.textNorm || normalizeForSearch(chunk.title)
    let score = result.score
    if (text.includes(normalizedQuery) || normalizeForSearch(chunk.title).includes(normalizedQuery)) score += 50
    if (normalizeForSearch(chunk.title).includes(normalizedQuery)) score += 20
    hits.push(hydrateSearchHit(entry, chunk, manuscript, score, normalizedQuery, tokens))
  }
  return hits
}

export function searchKb(query: string, options: KbSearchOptions = {}): KbSearchHit[] {
  const normalizedQuery = normalizeForSearch(query)
  if (!normalizedQuery) return []
  const tokens = tokenize(normalizedQuery)
  const limit = Math.max(1, Math.min(options.limit ?? 8, 20))
  const ranked = searchKbMiniSearch(query, normalizedQuery, tokens, options)
  const hits = ranked.length > 0 ? ranked : tokens.length > 0 ? searchKbLexical(normalizedQuery, tokens, options) : []
  return capSearchHits(hits, options, limit)
}

/** Locate units whose clause id or extracted references match `value` (e.g. "A1.2.3"). */
export function findKbClause(value: string, options: KbSearchOptions = {}): KbSearchHit[] {
  const needle = normalizeClauseId(value)
  if (!needle) return []
  const normalizedQuery = normalizeForSearch(value)
  const tokens = tokenize(normalizedQuery)
  const limit = Math.max(1, Math.min(options.limit ?? 8, 20))
  const hits: KbSearchHit[] = []
  for (const entry of candidateEntries(options)) {
    const manifest = loadManifest(entry.slug)
    if (!manifest) continue
    const manuscript = manuscriptText(entry)
    for (const chunk of manifest.chunks) {
      if (chunk.metadata.kind === 'toc') continue
      const candidates = [chunk.id, ...chunk.metadata.clauseRefs]
      let matched: string | undefined
      let relation: ReturnType<typeof clauseRelation> = null
      for (const ref of candidates) {
        const next = clauseRelation(ref, needle)
        if (!next) continue
        if (next === 'exact' || !relation) {
          matched = ref
          relation = next
        }
        if (next === 'exact') break
      }
      if (!relation || !matched) continue
      const base = tokens.length > 0 ? scoreChunk(chunk, normalizedQuery, tokens) : 0
      const bonus = relation === 'exact' ? 200 : relation === 'child' ? 120 : 40
      const score = bonus + base
      hits.push({
        slug: entry.slug,
        name: entry.name,
        category: entry.category,
        chunkId: chunk.id,
        title: chunk.title,
        score,
        citation: citationFor(entry, chunk),
        snippet: makeSnippet(resolveChunkText(manuscript, chunk), normalizedQuery, tokens),
        headingPath: chunk.metadata.headingPath,
        matchedClause: matched,
        page: chunk.metadata.pageStart,
      })
    }
  }
  return hits.sort((a, b) => b.score - a.score || a.slug.localeCompare(b.slug) || a.chunkId.localeCompare(b.chunkId)).slice(0, limit)
}

/** Locate chunks whose Markdown table headers or BOQ item codes match `value`. */
export function findKbTable(value: string, options: KbSearchOptions = {}): KbSearchHit[] {
  const needle = value.trim().toLocaleLowerCase()
  if (!needle) return []
  const normalizedQuery = normalizeForSearch(value)
  const tokens = tokenize(normalizedQuery)
  const limit = Math.max(1, Math.min(options.limit ?? 8, 20))
  const hits: KbSearchHit[] = []
  for (const entry of candidateEntries(options)) {
    const manifest = loadManifest(entry.slug)
    if (!manifest) continue
    const manuscript = manuscriptText(entry)
    for (const chunk of manifest.chunks) {
      const matchedTable = chunk.metadata.tableRefs.find((ref) => ref.toLocaleLowerCase().includes(needle))
      const matchedBoq = chunk.metadata.boqRefs.find((ref) => ref.toLocaleLowerCase() === needle)
      const base = tokens.length > 0 ? scoreChunk(chunk, normalizedQuery, tokens) : 0
      const score = (matchedTable || matchedBoq ? 100 : 0) + base
      if (score <= 0) continue
      hits.push({
        slug: entry.slug,
        name: entry.name,
        category: entry.category,
        chunkId: chunk.id,
        title: chunk.title,
        score,
        citation: citationFor(entry, chunk),
        snippet: makeSnippet(resolveChunkText(manuscript, chunk), normalizedQuery, tokens),
        headingPath: chunk.metadata.headingPath,
        matchedTable: matchedTable ?? matchedBoq,
        page: chunk.metadata.pageStart,
      })
    }
  }
  return hits.sort((a, b) => b.score - a.score || a.slug.localeCompare(b.slug) || a.chunkId.localeCompare(b.chunkId)).slice(0, limit)
}

/**
 * Cheap existence check for a `[kb:slug:chunkId]` citation without reading chunk text.
 * Returns null when the chunk resolves, otherwise a human-readable reason.
 */
export function kbChunkStatus(slug: string, chunkId: string): string | null {
  const entry = listKbEntries().find((item) => item.slug === slug)
  if (!entry) return `知识库无条目 ${slug}`
  const manifest = loadManifest(slug)
  if (!manifest) return `条目 ${slug} 索引缺失（需 reindex）`
  if (!manifest.chunks.some((item) => item.id === chunkId)) return `条目 ${slug} 无分块 ${chunkId}`
  return null
}

export function readKbChunk(slug: string, chunkId: string): {
  slug: string
  name: string
  chunkId: string
  title: string
  citation: string
  headingPath: string[]
  clauseRefs: string[]
  text: string
  pageStart?: number
  pageEnd?: number
} {
  const entry = listKbEntries().find((item) => item.slug === slug)
  if (!entry) throw new Error(`未找到条目 ${slug}。先用 kb_list 查看可用条目。`)
  const manifest = loadManifest(slug)
  if (!manifest) throw new Error(`条目 ${slug} 的索引缺失。请执行 kb_add/reindex 重建。`)
  const chunk = manifest.chunks.find((item) => item.id === chunkId)
  if (!chunk) throw new Error(`条目 ${slug} 没有分块 ${chunkId}（共 ${manifest.chunks.length} 块）。`)
  const text = resolveChunkText(manuscriptText(entry), chunk)
  if (!text) throw new Error(`条目 ${slug} 分块 ${chunkId} 无法从解析稿切片。请执行 kb_add/reindex 重建。`)
  return {
    slug,
    name: entry.name,
    chunkId,
    title: chunk.title,
    citation: citationFor(entry, chunk),
    headingPath: chunk.metadata.headingPath,
    clauseRefs: chunk.metadata.clauseRefs,
    text,
    pageStart: chunk.metadata.pageStart,
    pageEnd: chunk.metadata.pageEnd,
  }
}

interface KbTaskSelection {
  schemaVersion: 1
  bySession: Record<string, string[]>
}

function taskSelectionPath(): string {
  return join(kbRoot(), 'task-selection.json')
}

function loadTaskSelection(): KbTaskSelection {
  const raw = readJson<Partial<KbTaskSelection>>(taskSelectionPath(), { schemaVersion: 1, bySession: {} })
  return {
    schemaVersion: 1,
    bySession: raw.bySession && typeof raw.bySession === 'object' ? raw.bySession : {},
  }
}

function sessionKey(sessionId?: string): string {
  return String(sessionId || '').trim() || 'active'
}

function knownSlugs(): Set<string> {
  return new Set(listKbEntries().map((entry) => entry.slug))
}

/** Slugs the user checked as in-scope for this conversation / task. */
export function getKbTaskSlugs(sessionId?: string): string[] {
  const known = knownSlugs()
  const stored = loadTaskSelection().bySession[sessionKey(sessionId)] || []
  return stored.map(String).filter((slug) => known.has(slug))
}

export function setKbTaskSlugs(sessionId: string | undefined, slugs: string[]): string[] {
  const known = knownSlugs()
  const next = [...new Set(slugs.map(String))].filter((slug) => known.has(slug))
  const stored = loadTaskSelection()
  stored.bySession[sessionKey(sessionId)] = next
  writeJson(taskSelectionPath(), stored)
  return next
}

/** Add one indexed entry to this conversation's in-scope set. Live on the next assemble. */
export function selectKbSlugForSession(sessionId: string | undefined, slug: string): string[] {
  const id = String(slug || '').trim()
  if (!id) return getKbTaskSlugs(sessionId)
  return setKbTaskSlugs(sessionId, [...getKbTaskSlugs(sessionId), id])
}

function dropSlugFromTaskSelections(slug: string): void {
  const stored = loadTaskSelection()
  let changed = false
  for (const [key, slugs] of Object.entries(stored.bySession)) {
    const next = slugs.filter((item) => item !== slug)
    if (next.length !== slugs.length) {
      stored.bySession[key] = next
      changed = true
    }
  }
  if (changed) writeJson(taskSelectionPath(), stored)
}

/** Inject only user-checked entries. Empty string = nothing in this conversation. */
export function formatSelectedKbContext(sessionId?: string): string {
  const slugs = getKbTaskSlugs(sessionId)
  if (slugs.length === 0) return ''
  const entries = listKbEntries().filter((entry) => slugs.includes(entry.slug) && entry.parseStatus !== 'parsing' && entry.parseStatus !== 'failed' && entry.parseStatus !== 'staged')
  if (entries.length === 0) return ''
  const rows = entries.map((entry) => `- [${entry.category}] ${kbDisplayName(entry)} — ${entry.slug}`)
  const templateNote = userTemplateInstruction(entries)
  return [
    'User-selected knowledge entries for THIS task only. Do not treat other knowledge-base entries as in-scope unless the user asks.',
    rows.join('\n'),
    'Retrieve these slugs with kb_search({ slugs }) / kb_find_clause / kb_find_table then kb_read_chunk. Cite [kb:slug:chunkId]. Do not invent spec/contract/method facts from memory.',
    templateNote,
  ].filter(Boolean).join('\n')
}

export function kbOverview(): {
  root: string
  entryCount: number
  chunkCount: number
  categories: Array<{ category: string; entries: number }>
  entries: KbEntry[]
  folders: KbFolder[]
  skills: ReturnType<typeof listUserSkills>
} {
  expireStaleKbParses()
  const registry = loadKbRegistry()
  let changed = false
  for (const entry of registry.entries) {
    if (assignSuggestedFolder(registry, entry)) changed = true
  }
  if (changed) saveKbRegistry(registry)
  const entries = registry.entries
  const byCategory = new Map<string, number>()
  for (const entry of entries) {
    byCategory.set(entry.category, (byCategory.get(entry.category) ?? 0) + 1)
  }
  return {
    root: kbRoot(),
    entryCount: entries.length,
    chunkCount: entries.reduce((sum, entry) => sum + entry.chunkCount, 0),
    categories: [...byCategory.entries()].map(([category, count]) => ({ category, entries: count })),
    entries,
    folders: registry.folders,
    skills: (() => {
      try {
        return listUserSkills()
      } catch {
        return []
      }
    })(),
  }
}

export interface KbTransferImportResult {
  entries: Array<{ slug: string; name: string; category: string; folderName?: string; chunkCount: number }>
  skills: Array<{ slug: string; created: boolean }>
}

function folderNameOf(entry: KbEntry, folders: KbFolder[]): string | undefined {
  if (!entry.folderId) return undefined
  return folders.find((folder) => folder.id === entry.folderId)?.name
}

function collectTransferEntries(input: { slugs?: string[]; folderId?: string }): KbEntry[] {
  const registry = loadKbRegistry()
  const wantedSlugs = (input.slugs || []).map((item) => String(item || '').trim()).filter(Boolean)
  const folderId = String(input.folderId || '').trim()
  let list = registry.entries
  if (folderId) list = list.filter((entry) => entry.folderId === folderId)
  if (wantedSlugs.length) list = list.filter((entry) => wantedSlugs.includes(entry.slug))
  if (!folderId && wantedSlugs.length === 0) list = []
  return list
}

function buildEntryTransferItem(entry: KbEntry, folders: KbFolder[]): KbTransferEntryItem {
  if (entry.parseStatus === 'staged') throw new Error(`「${kbDisplayName(entry)}」还在原始文档区，请先解析入库再导出`)
  if (entry.parseStatus === 'parsing') throw new Error(`「${kbDisplayName(entry)}」仍在解析，完成后才能导出`)
  if (entry.parseStatus === 'failed') throw new Error(`「${kbDisplayName(entry)}」解析失败，无法导出`)
  if (!entry.managedPath || !existsSync(entry.managedPath)) throw new Error(`「${kbDisplayName(entry)}」没有解析稿`)
  const manuscript = readFileSync(entry.managedPath, 'utf8')
  if (!manuscript.trim()) throw new Error(`「${kbDisplayName(entry)}」解析稿为空`)
  const item: KbTransferEntryItem = {
    type: 'entry',
    slug: entry.slug,
    name: entry.name,
    category: entry.category,
    folderName: folderNameOf(entry, folders),
    originalName: entry.originalName,
    ingest: entry.ingest,
    manuscript,
    contentList: loadContentList(entry.slug),
  }
  const original = entry.originalPath && existsSync(entry.originalPath) ? entry.originalPath : ''
  if (original) {
    const size = statSync(original).size
    if (size > 0 && size <= KB_TRANSFER_MAX_ORIGINAL) {
      item.originalBase64 = readFileSync(original).toString('base64')
    }
  }
  return item
}

/**
 * Pack ready KB entries and/or user skills into an app-only .apkb file.
 */
export function exportKbTransfer(input: {
  slugs?: string[]
  folderId?: string
  skillSlugs?: string[]
}): { body: Buffer; filename: string; mime: string } {
  const registry = loadKbRegistry()
  const skillSlugs = (input.skillSlugs || []).map((item) => String(item || '').trim()).filter(Boolean)
  const entries = collectTransferEntries(input)
  const items: KbTransferPayload['items'] = []
  for (const entry of entries) items.push(buildEntryTransferItem(entry, registry.folders))
  for (const slug of skillSlugs) {
    const skill = readUserSkill(slug)
    items.push({ type: 'skill', slug: skill.slug, markdown: skill.markdown })
  }
  if (items.length === 0) throw new Error('请选择已入库的条目、子目录或本机技能再导出')
  const payload: KbTransferPayload = {
    kind: KB_TRANSFER_KIND,
    schemaVersion: 1,
    exportedAt: new Date().toISOString(),
    items,
  }
  const label = items.length === 1
    ? (items[0]!.type === 'skill' ? `技能-${items[0]!.slug}` : kbDisplayName(entries[0]!))
    : items[0]!.type === 'entry' && items[0]!.folderName
      ? items[0]!.folderName
      : `知识传递-${items.length}`
  return { body: sealKbTransfer(payload), filename: transferFileName(label), mime: KB_TRANSFER_MIME }
}

function importTransferEntry(item: KbTransferEntryItem): KbAddResult {
  const originalName = item.originalName || `${item.slug}.bin`
  let originalPath: string | undefined
  if (item.originalBase64) {
    const raw = Buffer.from(item.originalBase64, 'base64')
    if (raw.length > 0) {
      const uploadDir = join(kbRoot(), 'uploads')
      mkdirSync(uploadDir, { recursive: true })
      const uploadPath = join(uploadDir, originalName)
      writeFileSync(uploadPath, raw)
      originalPath = uploadPath
    }
  }
  const result = commitKbText({
    text: item.manuscript,
    displayName: item.name,
    category: item.category,
    slug: item.slug,
    sourcePath: originalPath || join(kbRoot(), 'uploads', `${item.slug}.md`),
    ext: '.md',
    ingest: item.ingest || 'pack',
    originalName,
    originalPath,
    contentList: item.contentList,
    folderName: item.folderName,
    force: true,
  })
  if (originalPath) {
    const kept = keepOriginalCopy(result.entry.slug, originalPath, originalName)
    patchEntry(result.entry.slug, { originalPath: kept, originalName })
    result.entry.originalPath = kept
    result.entry.originalName = originalName
  }
  return result
}

/** Open an .apkb buffer and write entries/skills into this machine's stores. */
export function importKbTransfer(bytes: Buffer): KbTransferImportResult {
  const payload = openKbTransfer(bytes)
  const entries: KbTransferImportResult['entries'] = []
  const skills: KbTransferImportResult['skills'] = []
  for (const item of payload.items) {
    if (item && item.type === 'skill') {
      const skill = item as KbTransferSkillItem
      const saved = saveUserSkill(skill.slug, skill.markdown)
      skills.push({ slug: saved.slug, created: saved.created })
      continue
    }
    if (!item || item.type !== 'entry') continue
    const added = importTransferEntry(item)
    entries.push({
      slug: added.entry.slug,
      name: added.entry.name,
      category: added.entry.category,
      folderName: item.folderName,
      chunkCount: added.chunkCount,
    })
  }
  if (entries.length === 0 && skills.length === 0) throw new Error('传递包里没有可导入的条目或技能')
  return { entries, skills }
}

export function importKbTransferFromPath(path: string): KbTransferImportResult {
  const sourcePath = isAbsolute(path) ? resolve(path) : resolve(path)
  if (!looksLikeKbTransferPath(sourcePath)) throw new Error('不是 Agent Pi 传递包')
  return importKbTransfer(readFileSync(sourcePath))
}

// ---------------------------------------------------------------------------
// Bundled knowledge pack seeding
// ---------------------------------------------------------------------------

const SEED_CATEGORY_BY_PACK: Record<string, string> = {
  'tender-generic': '预置·通用方法标准',
  'tender-sa-sanral': '预置·南非SANRAL范文',
}

let seededThisProcess = false

/** Drop extra seeded rows that are the same file reached via a second pack path. */
function collapseDuplicateHashes(): void {
  const registry = loadKbRegistry()
  const keepByHash = new Map<string, KbEntry>()
  const drop: string[] = []
  for (const entry of registry.entries) {
    const kept = keepByHash.get(entry.sourceHash)
    if (!kept) {
      keepByHash.set(entry.sourceHash, entry)
      continue
    }
    const newExists = existsSync(entry.sourcePath)
    const keptExists = existsSync(kept.sourcePath)
    const preferNew = (newExists && !keptExists)
      || (newExists && entry.sourcePath.includes('Programs') && !kept.sourcePath.includes('Programs'))
    if (preferNew) {
      drop.push(kept.slug)
      keepByHash.set(entry.sourceHash, entry)
    } else {
      drop.push(entry.slug)
    }
  }
  for (const slug of drop) removeKbEntry(slug)
}

/**
 * Idempotently import the bundled knowledge packs (Markdown only, excluding READMEs)
 * as seeded entries. Hash-identical files are skipped, so repeated calls are cheap;
 * runs at most once per process unless `force` is set.
 */
export function seedBundledKnowledge(force = false): { seeded: string[]; skipped: number } {
  if (seededThisProcess && !force) return { seeded: [], skipped: 0 }
  seededThisProcess = true
  collapseDuplicateHashes()
  const seeded: string[] = []
  let skipped = 0
  const root = knowledgeRoot()
  const tombstones = new Set(loadKbRegistry().removedSeeds.map((path) => resolve(path)))
  for (const [pack, category] of Object.entries(SEED_CATEGORY_BY_PACK)) {
    const dir = join(root, pack)
    if (!existsSync(dir)) continue
    let names: string[] = []
    try {
      names = readdirSync(dir)
    } catch {
      continue
    }
    for (const fileName of names) {
      if (!/\.md$/i.test(fileName) || /^readme\.md$/i.test(fileName)) continue
      const path = join(dir, fileName)
      if (tombstones.has(resolve(path))) {
        skipped++
        continue
      }
      try {
        const result = addKbFile({ path, category, seeded: true })
        if (result.skipped) skipped++
        else seeded.push(result.entry.slug)
      } catch {
        // Unreadable/empty pack file: leave it out of the KB rather than failing boot.
        skipped++
      }
    }
  }
  return { seeded, skipped }
}
