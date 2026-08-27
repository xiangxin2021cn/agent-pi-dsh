/**
 * Vision / hand-authored knowledge pack: a folder with manuscript.md + pack.json.
 * Units (if present and offsets valid) become retrieval spans; otherwise the
 * manuscript is cut by document headings. Never stores a second manuscript copy.
 */
import { existsSync, readFileSync, statSync } from 'node:fs'
import { basename, dirname, isAbsolute, join, resolve } from 'node:path'
import { extractClauseRefs, extractTableRefs, type KbUnitKind, type StructureChunk } from './kb-structure.ts'

export const KB_PACK_KIND = 'agent-pi-kb-pack'

export interface KbPackUnit {
  id?: string
  title?: string
  startOffset?: number
  endOffset?: number
  kind?: KbUnitKind
  headingPath?: string[]
  pageStart?: number
  pageEnd?: number
  clauseRefs?: string[]
}

export interface KbPackManifest {
  schemaVersion?: number
  kind?: string
  name?: string
  category?: string
  slug?: string
  manuscript?: string
  contentList?: string
  originalName?: string
  units?: KbPackUnit[]
}

export interface ResolvedKbPack {
  dir: string
  packPath: string
  manuscriptPath: string
  contentListPath?: string
  pack: KbPackManifest
}

function lineNumberAt(text: string, offset: number): number {
  let line = 1
  const end = Math.max(0, Math.min(text.length, offset))
  for (let index = 0; index < end; index++) {
    if (text.charCodeAt(index) === 10) line++
  }
  return line
}

/** True when `path` is a pack.json, a manuscript beside pack.json, or a folder that contains pack.json. */
export function looksLikeKbPack(path: string): boolean {
  const resolved = isAbsolute(path) ? resolve(path) : resolve(path)
  if (!existsSync(resolved)) return false
  if (statSync(resolved).isDirectory()) return existsSync(join(resolved, 'pack.json'))
  const name = basename(resolved).toLowerCase()
  if (name === 'pack.json') return true
  if (name === 'manuscript.md' && existsSync(join(dirname(resolved), 'pack.json'))) return true
  return false
}

export function resolveKbPack(path: string): ResolvedKbPack {
  const resolved = isAbsolute(path) ? resolve(path) : resolve(path)
  if (!existsSync(resolved)) throw new Error(`知识包不存在：${resolved}`)
  const packPath = statSync(resolved).isDirectory()
    ? join(resolved, 'pack.json')
    : basename(resolved).toLowerCase() === 'pack.json'
      ? resolved
      : join(dirname(resolved), 'pack.json')
  if (!existsSync(packPath)) throw new Error('知识包缺少 pack.json')
  let pack: KbPackManifest
  try {
    pack = JSON.parse(readFileSync(packPath, 'utf8')) as KbPackManifest
  } catch {
    throw new Error('知识包 pack.json 不是合法 JSON')
  }
  if (pack.kind && pack.kind !== KB_PACK_KIND) {
    throw new Error(`不是 Agent Pi 知识包（kind=${pack.kind}）`)
  }
  const dir = dirname(packPath)
  const manuscriptPath = join(dir, pack.manuscript || 'manuscript.md')
  if (!existsSync(manuscriptPath)) throw new Error('知识包缺少 manuscript.md 解析稿')
  const contentListName = pack.contentList || 'content_list.json'
  const contentListPath = join(dir, contentListName)
  return {
    dir,
    packPath,
    manuscriptPath,
    contentListPath: existsSync(contentListPath) ? contentListPath : undefined,
    pack,
  }
}

export function loadPackContentList(resolved: ResolvedKbPack): unknown {
  if (!resolved.contentListPath) return undefined
  try {
    return JSON.parse(readFileSync(resolved.contentListPath, 'utf8'))
  } catch {
    return undefined
  }
}

/**
 * Turn pack units into structure chunks when every offset is in range.
 * A single bad span fails the pack units so heading cut can take over.
 */
export function chunksFromPackUnits(manuscript: string, pack: KbPackManifest, titlePrefix: string): StructureChunk[] | undefined {
  if (!Array.isArray(pack.units) || pack.units.length === 0) return undefined
  const chunks: StructureChunk[] = []
  const used = new Set<string>()
  for (const [index, unit] of pack.units.entries()) {
    const start = Number(unit.startOffset)
    const end = Number(unit.endOffset)
    if (!Number.isInteger(start) || !Number.isInteger(end) || start < 0 || end > manuscript.length || end <= start) {
      return undefined
    }
    const text = manuscript.slice(start, end)
    if (!text.trim()) return undefined
    const rawId = String(unit.id || '').trim() || `chunk-${String(index + 1).padStart(4, '0')}`
    let id = rawId
    let suffix = 2
    while (used.has(id)) {
      id = `${rawId}-${suffix}`
      suffix++
    }
    used.add(id)
    const title = String(unit.title || `${titlePrefix} · ${id}`)
    chunks.push({
      id,
      title: title.includes(titlePrefix) ? title : `${titlePrefix} · ${title}`,
      text,
      startLine: lineNumberAt(manuscript, start),
      endLine: lineNumberAt(manuscript, end),
      startOffset: start,
      endOffset: end,
      metadata: {
        headingPath: Array.isArray(unit.headingPath) ? unit.headingPath.map(String) : [title],
        clauseRefs: Array.isArray(unit.clauseRefs)
          ? unit.clauseRefs.map(String)
          : [rawId, ...extractClauseRefs(text)].filter((value, inner, all) => all.indexOf(value) === inner),
        tableRefs: extractTableRefs(text),
        boqRefs: [],
        kind: unit.kind || 'clause',
        pageStart: Number.isFinite(Number(unit.pageStart)) ? Number(unit.pageStart) : undefined,
        pageEnd: Number.isFinite(Number(unit.pageEnd)) ? Number(unit.pageEnd) : undefined,
      },
    })
  }
  return chunks
}
