/**
 * Merge MinerU part outputs back into one source-faithful markdown (and optional JSON).
 * Page markers become original-file coordinates so citation chips stay honest.
 */
import { standardizeKbMarkdown } from './kb-md-standardize.ts'

export interface MineruPartResult {
  markdown: string
  contentList?: unknown
  startPage: number
  endPage: number
}

const PAGE_COMMENT = /<!--\s*page[:\s]+(\d+)\s*-->/gi
const PAGE_EN = /\bPage\s+(\d+)\b/g
const PAGE_ZH = /第\s*(\d+)\s*页/g

export function hasPageMarkers(markdown: string): boolean {
  return /<!--\s*page[:\s]+\d+/i.test(markdown)
    || /\bPage\s+\d+\b/.test(markdown)
    || /第\s*\d+\s*页/.test(markdown)
}

/** Shift 1-based page numbers by `addPages` (startPage - 1 for that part). */
export function remapMarkdownPageMarkers(markdown: string, addPages: number): string {
  if (!addPages) return markdown
  const shift = (raw: string) => {
    const page = Number(raw)
    return Number.isFinite(page) && page > 0 ? String(page + addPages) : raw
  }
  return markdown
    .replace(PAGE_COMMENT, (_, page: string) => `<!-- page ${shift(page)} -->`)
    .replace(PAGE_EN, (_, page: string) => `Page ${shift(page)}`)
    .replace(PAGE_ZH, (_, page: string) => `第 ${shift(page)} 页`)
}

export function remapContentList(data: unknown, addPages: number): unknown {
  if (!addPages) return data
  if (Array.isArray(data)) return data.map((item) => remapContentItem(item, addPages))
  if (data && typeof data === 'object') {
    const record = data as Record<string, unknown>
    const next: Record<string, unknown> = {}
    for (const [key, value] of Object.entries(record)) {
      if (key === 'page_idx' || key === 'pageIdx' || key === 'page') {
        next[key] = shiftPageField(value, addPages, key === 'page')
      } else {
        next[key] = remapContentList(value, addPages)
      }
    }
    return next
  }
  return data
}

function remapContentItem(item: unknown, addPages: number): unknown {
  if (!item || typeof item !== 'object') return item
  const record = { ...(item as Record<string, unknown>) }
  if ('page_idx' in record) record.page_idx = shiftPageField(record.page_idx, addPages, false)
  if ('pageIdx' in record) record.pageIdx = shiftPageField(record.pageIdx, addPages, false)
  if ('page' in record) record.page = shiftPageField(record.page, addPages, true)
  return record
}

/** 0-based fields add `addPages`; 1-based `page` does the same numeric add. */
function shiftPageField(value: unknown, addPages: number, oneBased: boolean): unknown {
  const page = Number(value)
  if (!Number.isFinite(page)) return value
  if (oneBased && page <= 0) return value
  if (!oneBased && page < 0) return value
  return page + addPages
}

export function contentListItems(data: unknown): Array<Record<string, unknown>> {
  if (Array.isArray(data)) {
    return data.filter((item): item is Record<string, unknown> => Boolean(item) && typeof item === 'object' && !Array.isArray(item))
  }
  if (data && typeof data === 'object') {
    const record = data as Record<string, unknown>
    for (const key of ['content_list', 'pdf_info', 'para_blocks']) {
      if (Array.isArray(record[key])) return contentListItems(record[key])
    }
  }
  return []
}

/**
 * When MinerU markdown has no page comments, drop a marker before the first
 * recognizable snippet of each page so citation chips can resolve a page.
 */
export function injectPageMarkers(
  markdown: string,
  contentList: unknown,
  startPage: number,
): string {
  if (hasPageMarkers(markdown)) return remapMarkdownPageMarkers(markdown, startPage - 1)
  const items = contentListItems(contentList)
  let out = markdown
  const seen = new Set<number>()
  for (const item of items) {
    const idx = Number(item.page_idx ?? item.pageIdx)
    if (!Number.isFinite(idx) || idx < 0 || seen.has(idx)) continue
    const snippet = String(item.text || item.md || '').replace(/\s+/g, ' ').trim()
    if (snippet.length < 2) continue
    const needle = snippet.slice(0, 40)
    const pos = out.indexOf(needle)
    if (pos < 0) continue
    seen.add(idx)
    out = `${out.slice(0, pos)}<!-- page ${startPage + idx} -->\n${out.slice(pos)}`
  }
  if (seen.size === 0) return `<!-- page ${startPage} -->\n\n${markdown}`
  if (!seen.has(0) && !out.startsWith('<!-- page ')) {
    return `<!-- page ${startPage} -->\n\n${out}`
  }
  return out
}

export function mergeMineruParts(parts: MineruPartResult[]): {
  markdown: string
  contentList: unknown[]
} {
  const markdownParts: string[] = []
  const contentList: unknown[] = []
  for (const part of parts) {
    const addPages = Math.max(0, part.startPage - 1)
    markdownParts.push(injectPageMarkers(part.markdown, part.contentList, part.startPage).trim())
    const items = contentListItems(remapContentList(part.contentList, addPages))
    contentList.push(...items)
  }
  return {
    markdown: standardizeKbMarkdown(markdownParts.filter(Boolean).join('\n\n')),
    contentList,
  }
}
