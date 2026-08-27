/**
 * Align structured KB units with MinerU content_list.json.
 * Titles and page_idx refine locators; tables become whole units.
 * A manuscript without a list still gets pages from <!-- page N --> markers.
 */
import { contentListItems } from './mineru-merge.ts'
import type { StructureChunk } from './kb-structure.ts'

const PAGE_MARK = /<!--\s*page[:\s]+(\d+)\s*-->|\bPage\s+(\d+)\b|第\s*(\d+)\s*页/gi
const SKIP_TYPES = new Set(['header', 'footer', 'page_number', 'aside_text', 'page_footnote'])

interface ContentBlock {
  type: string
  text: string
  caption: string
  html: string
  page?: number
}

/**
 * Attach manuscript/content_list pages and emit whole-table units.
 * @param content - Parse manuscript (CRLF folded to LF).
 * @param units - Units from chunkByStructure; mutated copies are returned.
 * @param contentList - MinerU content_list.json or undefined.
 */
export function enrichStructureUnits(
  content: string,
  units: StructureChunk[],
  contentList?: unknown,
): StructureChunk[] {
  const normalized = content.replace(/\r\n/g, '\n')
  const markers = collectPageMarkers(normalized)
  const next = units.map((unit) => attachManuscriptPages(normalized, unit, markers))
  const blocks = parseContentBlocks(contentList)
  applyTitlePages(normalized, next, blocks)
  return next.concat(emitTableUnits(normalized, next, blocks))
}

function collectPageMarkers(normalized: string): Array<{ offset: number, page: number }> {
  const markers: Array<{ offset: number, page: number }> = []
  PAGE_MARK.lastIndex = 0
  let match: RegExpExecArray | null
  while ((match = PAGE_MARK.exec(normalized))) {
    const page = Number(match[1] || match[2] || match[3])
    if (Number.isFinite(page) && page > 0) markers.push({ offset: match.index, page })
  }
  return markers
}

function pageAt(markers: Array<{ offset: number, page: number }>, offset: number): number | undefined {
  let page: number | undefined
  for (const marker of markers) {
    if (marker.offset <= offset) page = marker.page
    else break
  }
  return page
}

function lastPageInSpan(
  markers: Array<{ offset: number, page: number }>,
  start: number,
  end: number,
  fallback?: number,
): number | undefined {
  let page = fallback
  for (const marker of markers) {
    if (marker.offset >= end) break
    if (marker.offset >= start) page = marker.page
  }
  return page
}

function attachManuscriptPages(
  normalized: string,
  unit: StructureChunk,
  markers: Array<{ offset: number, page: number }>,
): StructureChunk {
  const start = Number.isInteger(unit.startOffset) ? unit.startOffset : 0
  const end = Number.isInteger(unit.endOffset) ? unit.endOffset : normalized.length
  const pageStart = pageAt(markers, start)
  const pageEnd = lastPageInSpan(markers, start, end, pageStart)
  if (!pageStart && !pageEnd) return unit
  return {
    ...unit,
    metadata: { ...unit.metadata, pageStart, pageEnd },
  }
}

function parseContentBlocks(contentList: unknown): ContentBlock[] {
  const blocks: ContentBlock[] = []
  for (const item of contentListItems(contentList)) {
    const type = String(item.type || '').toLowerCase()
    if (!type || SKIP_TYPES.has(type)) continue
    const caption = flattenCaption(item.table_caption ?? item.caption)
    const html = firstString(item.html, item.table_body)
    const text = firstString(item.text, item.md, caption, stripTags(html))
    const page = contentPage(item)
    if (!text && !html && !caption) continue
    blocks.push({ type, text, caption, html, page })
  }
  return blocks
}

function flattenCaption(value: unknown): string {
  if (Array.isArray(value)) return value.map((item) => String(item || '').trim()).filter(Boolean).join(' ')
  return typeof value === 'string' ? value.trim() : ''
}

function firstString(...values: unknown[]): string {
  for (const value of values) {
    if (typeof value === 'string' && value.trim()) return value
  }
  return ''
}

function contentPage(item: Record<string, unknown>): number | undefined {
  const idx = Number(item.page_idx ?? item.pageIdx)
  if (Number.isFinite(idx) && idx >= 0) return idx + 1
  const page = Number(item.page)
  if (Number.isFinite(page) && page > 0) return page
}

function stripTags(html: string): string {
  return html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim()
}

function applyTitlePages(normalized: string, units: StructureChunk[], blocks: ContentBlock[]): void {
  for (const block of blocks) {
    if (block.type !== 'title' || !block.page || !block.text) continue
    const needle = block.text.replace(/\s+/g, ' ').trim()
    if (needle.length < 3) continue
    let from = 0
    while (from < normalized.length) {
      const pos = normalized.indexOf(needle, from)
      if (pos < 0) break
      const owner = units.find((unit) => unit.startOffset <= pos && pos < unit.endOffset)
      if (owner && !owner.metadata.pageStart) {
        owner.metadata.pageStart = block.page
        owner.metadata.pageEnd = owner.metadata.pageEnd ?? block.page
      }
      from = pos + Math.max(1, needle.length)
    }
  }
}

function emitTableUnits(
  normalized: string,
  units: StructureChunk[],
  blocks: ContentBlock[],
): StructureChunk[] {
  const used = new Set(units.map((unit) => unit.id))
  const tables: StructureChunk[] = []
  let serial = 1
  for (const block of blocks) {
    if (block.type !== 'table' && block.type !== 'table_caption') continue
    const span = locateTableSpan(normalized, block)
    if (!span) continue
    const parent = owningUnit(units, span.start)
    const caption = block.caption || firstTableCaption(normalized, span.start)
    const id = uniqueTableId(caption, used, serial)
    serial++
    const text = normalized.slice(span.start, span.end)
    const startLine = lineNumberAt(normalized, span.start)
    const endLine = lineNumberAt(normalized, span.end)
    if (parent && caption && !parent.metadata.tableRefs.includes(caption)) {
      parent.metadata.tableRefs = [...parent.metadata.tableRefs, caption]
    }
    tables.push({
      id,
      title: caption ? `${parent?.title.split(' · ')[0] || 'Table'} · ${caption}` : `Table ${serial}`,
      text,
      startLine,
      endLine,
      startOffset: span.start,
      endOffset: span.end,
      metadata: {
        headingPath: [
          ...(parent?.metadata.headingPath ?? []),
          caption || id,
        ],
        clauseRefs: parent ? [parent.id, ...parent.metadata.clauseRefs].filter((value, index, all) => all.indexOf(value) === index) : [],
        tableRefs: [caption, ...tableHeaders(text)].filter(Boolean),
        boqRefs: [],
        kind: 'table',
        pageStart: block.page ?? parent?.metadata.pageStart,
        pageEnd: block.page ?? parent?.metadata.pageEnd,
        parentId: parent?.id,
      },
    })
  }
  return tables
}

function locateTableSpan(normalized: string, block: ContentBlock): { start: number, end: number } | null {
  if (block.caption) {
    const capAt = normalized.indexOf(block.caption)
    if (capAt >= 0) {
      const after = normalized.slice(capAt)
      const html = /<table[\s\S]*?<\/table>/i.exec(after)
      if (html && html.index !== undefined) {
        return { start: capAt, end: capAt + html.index + html[0].length }
      }
      const pipe = locatePipeTable(after)
      if (pipe) return { start: capAt, end: capAt + pipe }
    }
  }
  if (block.html) {
    const htmlAt = normalized.indexOf(block.html)
    if (htmlAt >= 0) return { start: htmlAt, end: htmlAt + block.html.length }
    const generic = /<table[\s\S]*?<\/table>/i.exec(normalized)
    if (generic && generic.index !== undefined) {
      return { start: generic.index, end: generic.index + generic[0].length }
    }
  }
  if (block.text && block.text.includes('|')) {
    const at = normalized.indexOf(block.text.trim())
    if (at >= 0) return { start: at, end: at + block.text.trim().length }
  }
  return null
}

function locatePipeTable(fromCaption: string): number | null {
  const lines = fromCaption.split('\n')
  let start = -1
  let end = 0
  let offset = 0
  for (const line of lines) {
    const next = offset + line.length + 1
    const trimmed = line.trim()
    if (trimmed.startsWith('|') && trimmed.endsWith('|')) {
      if (start < 0) start = offset
      end = Math.min(fromCaption.length, next)
    } else if (start >= 0 && trimmed) {
      break
    }
    offset = next
  }
  return start >= 0 ? end : null
}

function firstTableCaption(normalized: string, start: number): string {
  const before = normalized.slice(Math.max(0, start - 200), start)
  const line = before.split('\n').filter((item) => item.trim()).pop() ?? ''
  return /^table\b/i.test(line.trim()) ? line.trim() : ''
}

function owningUnit(units: StructureChunk[], offset: number): StructureChunk | undefined {
  return units.find((unit) => unit.metadata.kind !== 'table' && unit.startOffset <= offset && offset < unit.endOffset)
}

function uniqueTableId(caption: string, used: Set<string>, serial: number): string {
  const named = /table\s+([A-Za-z0-9][A-Za-z0-9_.()-]*)/i.exec(caption)
  const base = named ? `table-${named[1]}` : `table-${String(serial).padStart(4, '0')}`
  let id = base
  let suffix = 2
  while (used.has(id)) {
    id = `${base}-${suffix}`
    suffix++
  }
  used.add(id)
  return id
}

function tableHeaders(text: string): string[] {
  const htmlCells = [...text.matchAll(/<t[hd][^>]*>([\s\S]*?)<\/t[hd]>/gi)]
    .map((match) => stripTags(match[1] || ''))
    .filter(Boolean)
  if (htmlCells.length > 0) return htmlCells.slice(0, 8)
  const pipe = text.split('\n').find((line) => line.trim().startsWith('|') && line.trim().endsWith('|'))
  if (!pipe) return []
  return pipe.replace(/^\|/, '').replace(/\|$/, '').split('|').map((cell) => cell.trim()).filter(Boolean)
}

function lineNumberAt(content: string, offset: number): number {
  let line = 1
  for (let index = 0; index < Math.min(offset, content.length); index++) {
    if (content.charCodeAt(index) === 10) line++
  }
  return line
}
