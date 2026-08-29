/**
 * Phase-1 source alignment: the same manuscript + pack.json pair as the
 * knowledge base, written under Official Outputs setup/ so bid files never
 * enter the reusable KB. Saving the manuscript rebuilds pack units.
 */
import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs'
import { basename, dirname, extname, isAbsolute, join, resolve } from 'node:path'
import { KB_PACK_KIND, type KbPackManifest, type KbPackUnit } from './kb-pack.ts'
import { standardizeKbMarkdown } from './kb-md-standardize.ts'
import { chunkByStructure, type StructureChunk } from './kb-structure.ts'
import { ingestDocumentForKb, type MineruIngestResult } from './mineru-ingest.ts'
import { MINERU_EXTENSIONS } from './mineru.ts'
import { officialStageDir } from './outputs.ts'
import { createPageIndexShadow, readPageIndexShadow, type PageIndexShadowStatus } from './pageindex-shadow.ts'
import { initializeAnalysisCoverage } from './analysis-coverage.ts'
import { recordKnowledgeTelemetry } from './knowledge-telemetry.ts'

export const SETUP_RESTORE_KIND = 'agent-pi-setup-restore'

export interface SetupRestore {
  sourcePath: string
  originalName: string
  packDir: string
  packPath: string
  manuscriptPath: string
  via?: string
  unitCount: number
  /** Long narrative navigation sidecar; never authoritative evidence. */
  pageIndex?: PageIndexShadowStatus
}

export interface SetupRestoreSkip {
  sourcePath: string
  reason: string
}

export interface SetupRestoreBatch {
  restored: SetupRestore[]
  skipped: SetupRestoreSkip[]
}

export interface SetupPackManifest extends KbPackManifest {
  originalPath?: string
  sourceFileHash?: string
  via?: string
  role?: typeof SETUP_RESTORE_KIND
}

function samePath(left: string, right: string): boolean {
  return resolve(left).replace(/\\/g, '/').toLowerCase() === resolve(right).replace(/\\/g, '/').toLowerCase()
}

function hashBytes(bytes: Buffer | string): string {
  return createHash('sha256').update(bytes).digest('hex')
}

function compactPageIndex(status: PageIndexShadowStatus): PageIndexShadowStatus {
  return { state: status.state, path: status.path, reason: status.reason }
}

/** PDF / Office / images MinerU already accepts on the knowledge-base page. */
export function isSetupAlignablePath(path: string): boolean {
  return MINERU_EXTENSIONS.has(extname(path).toLowerCase())
}

function displayStem(sourcePath: string): string {
  const base = basename(sourcePath)
  const ext = extname(base)
  const stem = isSetupAlignablePath(sourcePath) ? base.slice(0, -ext.length) : base
  return stem || 'document'
}

function packStem(sourcePath: string): string {
  return displayStem(sourcePath).replace(/[<>:"/\\|?*]/g, '_').replace(/\s+/g, ' ').trim().slice(0, 80) || 'document'
}

function unitsFromManuscript(text: string, title: string): KbPackUnit[] {
  return chunkByStructure(text, title).map((unit: StructureChunk) => ({
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
}

function writePack(packPath: string, pack: SetupPackManifest): void {
  writeFileSync(packPath, `${JSON.stringify(pack, null, 2)}\n`)
}

function readPack(packPath: string): SetupPackManifest | null {
  try {
    return JSON.parse(readFileSync(packPath, 'utf8')) as SetupPackManifest
  } catch {
    return null
  }
}

function restoreFromPack(packPath: string): SetupRestore | null {
  const pack = readPack(packPath)
  if (!pack || !pack.originalPath) return null
  const packDir = dirname(packPath)
  const manuscriptPath = join(packDir, pack.manuscript || 'manuscript.md')
  if (!existsSync(manuscriptPath)) return null
  const restored: SetupRestore = {
    sourcePath: pack.originalPath,
    originalName: pack.originalName || basename(pack.originalPath),
    packDir,
    packPath,
    manuscriptPath,
    via: pack.via,
    unitCount: Array.isArray(pack.units) ? pack.units.length : 0,
  }
  restored.pageIndex = compactPageIndex(readPageIndexShadow({ manuscriptPath, packPath }))
  return restored
}

/** Scan Official Outputs setup/ for restore packs that still have a manuscript. */
export function listSetupRestores(cwd: string, projectId: string): SetupRestore[] {
  const root = officialStageDir(cwd, projectId, 'project-setup')
  if (!existsSync(root)) return []
  const found: SetupRestore[] = []
  let entries
  try {
    entries = readdirSync(root, { withFileTypes: true })
  } catch {
    return []
  }
  for (const entry of entries) {
    if (!entry.isDirectory()) continue
    const packPath = join(root, entry.name, 'pack.json')
    if (!existsSync(packPath)) continue
    const restore = restoreFromPack(packPath)
    if (restore) found.push(restore)
  }
  return found
}

/** Locate the setup restore pack for one registered source path. */
export function findSetupRestore(cwd: string, projectId: string, sourcePath: string): SetupRestore | undefined {
  const resolved = isAbsolute(sourcePath) ? resolve(sourcePath) : resolve(cwd, sourcePath)
  const name = basename(resolved)
  return listSetupRestores(cwd, projectId).find((item) => (
    samePath(item.sourcePath, resolved) || item.originalName === name
  ))
}

function packDirFor(cwd: string, projectId: string, sourcePath: string): string {
  const existing = findSetupRestore(cwd, projectId, sourcePath)
  if (existing) return existing.packDir
  const root = officialStageDir(cwd, projectId, 'project-setup')
  const stem = packStem(sourcePath)
  const preferred = join(root, `${stem}-解析稿`)
  if (!existsSync(preferred)) return preferred
  const suffix = hashBytes(resolvedSource(cwd, sourcePath)).slice(0, 8)
  return join(root, `${stem}-${suffix}-解析稿`)
}

function resolvedSource(cwd: string, sourcePath: string): string {
  return isAbsolute(sourcePath) ? resolve(sourcePath) : resolve(cwd, sourcePath)
}

/**
 * Rebuild pack.json units from a manuscript. Used when the user saves the
 * preview so later stages read the same spans as the edited text.
 */
export function rebuildSetupPack(manuscriptPath: string, text?: string): SetupRestore {
  const resolved = resolve(manuscriptPath)
  const packPath = join(dirname(resolved), 'pack.json')
  if (!existsSync(packPath)) throw new Error('解析稿旁边没有 pack.json')
  const previous = readPack(packPath) || {}
  const manuscript = standardizeKbMarkdown(text == null ? readFileSync(resolved, 'utf8') : text)
  if (!manuscript.trim()) throw new Error('解析稿不能为空')
  writeFileSync(resolved, manuscript.endsWith('\n') ? manuscript : `${manuscript}\n`)
  const name = previous.name || previous.originalName || basename(dirname(resolved))
  const units = unitsFromManuscript(manuscript, name)
  const pack: SetupPackManifest = {
    schemaVersion: 1,
    kind: previous.kind || KB_PACK_KIND,
    role: previous.role,
    name,
    category: previous.category,
    manuscript: previous.manuscript || 'manuscript.md',
    originalName: previous.originalName,
    originalPath: previous.originalPath,
    sourceFileHash: previous.sourceFileHash,
    via: previous.via,
    units,
  }
  writePack(packPath, pack)
  let pageIndex: PageIndexShadowStatus | undefined
  try {
    pageIndex = compactPageIndex(createPageIndexShadow({
      manuscriptPath: resolved,
      originalPath: pack.originalPath,
      sourceFileHash: pack.sourceFileHash,
      packPath,
      sourceId: pack.originalName || basename(dirname(resolved)),
    }))
  } catch (error) {
    pageIndex = { state: 'corrupt', path: join(dirname(resolved), 'pageindex-tree.json'), reason: error instanceof Error ? error.message : String(error) }
  }
  return {
    sourcePath: pack.originalPath || resolved,
    originalName: pack.originalName || basename(resolved),
    packDir: dirname(resolved),
    packPath,
    manuscriptPath: resolved,
    via: pack.via,
    unitCount: units.length,
    pageIndex,
  }
}

/** True when this Markdown sits beside a setup or knowledge pack.json. */
export function looksLikeRestoreManuscript(path: string): boolean {
  const resolved = resolve(path)
  if (basename(resolved).toLowerCase() !== 'manuscript.md') return false
  return existsSync(join(dirname(resolved), 'pack.json'))
}

/**
 * After a preview save: rebuild a sibling pack.json when present.
 * @returns The rebuilt restore, or null when this file is ordinary Markdown.
 */
export function syncPackSidecarFromMarkdown(markdownPath: string, text: string): SetupRestore | null {
  if (!looksLikeRestoreManuscript(markdownPath) && !existsSync(join(dirname(resolve(markdownPath)), 'pack.json'))) {
    return null
  }
  const packPath = join(dirname(resolve(markdownPath)), 'pack.json')
  if (!existsSync(packPath)) return null
  return rebuildSetupPack(markdownPath, text)
}

async function extractSource(
  sourcePath: string,
  options?: {
    force?: boolean
    preferMineru?: boolean
    ingest?: typeof ingestDocumentForKb
  },
): Promise<MineruIngestResult> {
  const ingest = options?.ingest ?? ingestDocumentForKb
  return ingest(sourcePath, {
    preferLocalText: options?.preferMineru !== true,
  })
}

/**
 * Align one registered source into Official Outputs setup/ as manuscript.md + pack.json.
 * Digital PDFs use the local text layer; scans and Office follow the same MinerU route as the KB.
 */
export async function restoreSetupSource(
  cwd: string,
  projectId: string,
  sourcePath: string,
  options?: {
    force?: boolean
    preferMineru?: boolean
    ingest?: typeof ingestDocumentForKb
  },
): Promise<SetupRestore> {
  const resolved = resolvedSource(cwd, sourcePath)
  if (!existsSync(resolved) || !statSync(resolved).isFile()) {
    throw new Error(`文件不存在：${resolved}`)
  }
  if (!isSetupAlignablePath(resolved)) {
    throw new Error('第一阶段对齐原稿只处理 PDF、Word、Excel、PPT 和常见图片')
  }
  const sourceFileHash = hashBytes(readFileSync(resolved))
  const existing = findSetupRestore(cwd, projectId, resolved)
  if (existing && !options?.force) {
    const pack = readPack(existing.packPath)
    if (pack?.sourceFileHash === sourceFileHash && existsSync(existing.manuscriptPath)) {
      return existing
    }
  }
  const extracted = await extractSource(resolved, options)
  const markdown = standardizeKbMarkdown(extracted.markdown)
  if (!markdown.trim()) throw new Error(`未能从 ${basename(resolved)} 抽出可读文本`)
  const packDir = packDirFor(cwd, projectId, resolved)
  mkdirSync(packDir, { recursive: true })
  const manuscriptPath = join(packDir, 'manuscript.md')
  const packPath = join(packDir, 'pack.json')
  writeFileSync(manuscriptPath, markdown.endsWith('\n') ? markdown : `${markdown}\n`)
  const name = displayStem(resolved)
  const units = unitsFromManuscript(markdown, name)
  writePack(packPath, {
    schemaVersion: 1,
    kind: KB_PACK_KIND,
    role: SETUP_RESTORE_KIND,
    name,
    manuscript: 'manuscript.md',
    originalName: basename(resolved),
    originalPath: resolved,
    sourceFileHash,
    via: extracted.via || extracted.route,
    units,
  })
  if (Array.isArray(extracted.contentList) && extracted.contentList.length > 0) {
    writeFileSync(join(packDir, 'content_list.json'), `${JSON.stringify(extracted.contentList, null, 2)}\n`)
  }
  let pageIndex: PageIndexShadowStatus | undefined
  try {
    pageIndex = compactPageIndex(createPageIndexShadow({
      manuscriptPath,
      originalPath: resolved,
      sourceFileHash,
      packPath,
      sourceId: basename(resolved),
    }))
  } catch (error) {
    pageIndex = { state: 'corrupt', path: join(packDir, 'pageindex-tree.json'), reason: error instanceof Error ? error.message : String(error) }
  }
  return {
    sourcePath: resolved,
    originalName: basename(resolved),
    packDir,
    packPath,
    manuscriptPath,
    via: extracted.via || extracted.route,
    unitCount: units.length,
    pageIndex,
  }
}

/** Align every registered PDF/Office source; unsupported types and unchanged packs are skipped. */
export async function restoreSetupSources(
  cwd: string,
  projectId: string,
  inputPaths: string[],
  options?: {
    paths?: string[]
    force?: boolean
    preferMineru?: boolean
    ingest?: typeof ingestDocumentForKb
  },
): Promise<SetupRestoreBatch> {
  const startedAt = Date.now()
  const selected = (options?.paths && options.paths.length > 0 ? options.paths : inputPaths)
    .map((path) => resolvedSource(cwd, path))
  const restored: SetupRestore[] = []
  const skipped: SetupRestoreSkip[] = []
  for (const sourcePath of selected) {
    if (!isSetupAlignablePath(sourcePath)) {
      skipped.push({ sourcePath, reason: 'unsupported' })
      continue
    }
    if (!existsSync(sourcePath)) {
      skipped.push({ sourcePath, reason: 'missing' })
      continue
    }
    try {
      restored.push(await restoreSetupSource(cwd, projectId, sourcePath, options))
    } catch (error) {
      skipped.push({
        sourcePath,
        reason: error instanceof Error ? error.message : String(error),
      })
    }
  }
  const indexed = listSetupRestores(cwd, projectId)
    .map((restore) => {
      const status = readPageIndexShadow({ manuscriptPath: restore.manuscriptPath, packPath: restore.packPath })
      if (status.state !== 'ready' || !status.tree) return null
      const nodeIds: string[] = []
      const walk = (nodes: typeof status.tree.nodes) => {
        for (const node of nodes) {
          nodeIds.push(node.nodeId)
          if (node.nodes) walk(node.nodes)
        }
      }
      walk(status.tree.nodes)
      return { sourceId: status.tree.source.id, treeHash: status.tree.source.sourceHash, nodeIds }
    })
    .filter((item): item is { sourceId: string; treeHash: string; nodeIds: string[] } => Boolean(item))
  if (indexed.length > 0) initializeAnalysisCoverage(cwd, projectId, indexed)
  try {
    recordKnowledgeTelemetry(cwd, projectId, {
      operation: 'index',
      surfaces: ['document'],
      sourceCount: selected.length,
      status: skipped.some((item) => item.reason !== 'unsupported') ? 'fallback' : 'ok',
      elapsedMs: Date.now() - startedAt,
      modelCalls: 0,
      inputTokens: 0,
      outputTokens: 0,
      estimatedCostUsd: 0,
      detail: `${indexed.length} eligible PageIndex shadow trees; MinerU/pack remains authoritative.`,
    })
  } catch { /* telemetry must not block setup */ }
  return { restored, skipped }
}
