/**
 * Markdown preview helpers for the files overlay.
 * Large BOQ tables must not dump thousands of <tr> into the live document.
 */

export const PREVIEW_TABLE_ROW_CAP = 80

export interface MdPreviewImage {
  src: string
  origin: string
}

export interface MdPreviewCtx {
  cwd?: string
  filePath?: string
  /** Cap body rows per table. Infinity expands every table. */
  tableRowCap?: number
  resolveImage?: (href: string, ctx: MdPreviewCtx) => MdPreviewImage
}

const MARKUP_RE = /[`*!\[]/
const HTML_SPECIAL_RE = /[&<>"]/

export function escapeHtml(value: string): string {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

/** Chip label: file · lines, or kb slug. The popover carries page/heading. */
export function citationChipLabel(token: string): string {
  const raw = String(token ?? '')
  if (raw.startsWith('kb:')) {
    const rest = raw.slice(3)
    const sep = rest.lastIndexOf(':')
    return sep > 0 ? rest.slice(0, sep) : rest
  }
  if (raw.startsWith('src:')) {
    const rest = raw.slice(4)
    const hash = rest.lastIndexOf('#')
    const path = hash > 0 ? rest.slice(0, hash) : rest
    const loc = hash > 0 ? rest.slice(hash + 1) : ''
    const name = path.replace(/^.*[/\\]/, '')
    return loc ? name + ' · ' + loc : name
  }
  return raw.length > 42 ? raw.slice(0, 39) + '…' : raw
}

export function citationChip(token: string): string {
  const label = citationChipLabel(token)
  return '<span class="ap-cite" data-cite="' + token + '" data-cite-token="[' + token + ']" title="点击查看出处">' + label + '</span>'
}

function defaultResolveImage(href: string): MdPreviewImage {
  const raw = String(href || '').trim()
  const origin = raw.replace(/^</, '').replace(/>.*$/, '').split(/\s+["']/)[0]
  return { src: origin, origin }
}

export function inlineMarkdown(value: string, ctx: MdPreviewCtx = {}): string {
  const raw = String(value)
  if (!MARKUP_RE.test(raw)) return HTML_SPECIAL_RE.test(raw) ? escapeHtml(raw) : raw
  let text = escapeHtml(raw)
  text = text.replace(/`([^`]+)`/g, '<code>$1</code>')
  text = text.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
  text = text.replace(/\*([^*]+)\*/g, '<em>$1</em>')
  text = text.replace(/\[(kb:[a-z0-9][a-z0-9._-]*:[A-Za-z0-9._-]+)\]/g, (_, token) => citationChip(token))
  text = text.replace(/\[(src:[^\]\r\n]+?)\]/g, (_, token) => citationChip(token))
  text = text.replace(/!\[([^\]]*)\]\(([^)]+)\)/g, (_, alt, href) => {
    const image = (ctx.resolveImage || defaultResolveImage)(href, ctx)
    return '<img alt="' + escapeHtml(alt) + '" src="' + escapeHtml(image.src) + '" data-md-src="' + escapeHtml(image.origin) + '">'
  })
  text = text.replace(/\[([^\]]+)\]\((https?:[^)]+|data:[^)]+)\)/g, '<a href="$2" target="_blank" rel="noreferrer">$1</a>')
  return text
}

function isPipeTableRow(line: string): boolean {
  return /^\s*\|.+\|\s*$/.test(line)
}

/** Linear check: every cell is :--- / --- / ---: / :---:. Avoids ReDoS on long pipe rows. */
function isPipeSeparatorRow(line: string): boolean {
  const trimmed = String(line).trim()
  if (!trimmed.includes('|') || !trimmed.includes('-')) return false
  const inner = trimmed.replace(/^\|/, '').replace(/\|$/, '')
  const cells = inner.split('|')
  return cells.length > 0 && cells.every((cell) => /^:?-+:?$/.test(cell.trim()))
}

function pipeCells(line: string): string[] {
  return line.split('|').slice(1, -1).map((cell) => cell.trim())
}

function startsMdBlock(line: string): boolean {
  return /^(#{1,6}\s|```|\s*\\?[-*+]\s|\s*\\?\d+\.\s|\s*>|---+$)/.test(line)
    || isPipeTableRow(line)
    || /^\s*<table\b/i.test(line)
}

const TABLE_TAGS = new Set(['table', 'thead', 'tbody', 'tfoot', 'tr', 'th', 'td', 'caption', 'colgroup', 'col', 'br'])

function capHtmlTableRows(table: string, cap: number): { html: string; hidden: number } {
  if (!Number.isFinite(cap) || cap === Number.POSITIVE_INFINITY) return { html: table, hidden: 0 }
  let seen = 0
  let hidden = 0
  const html = table.replace(/<tr\b[\s\S]*?<\/tr>/gi, (row) => {
    seen += 1
    if (seen <= cap + 1) return row
    hidden += 1
    return ''
  })
  return { html, hidden }
}

/** Keep only table markup from MinerU HTML so the preview can draw a grid. */
export function sanitizeMineruTable(html: string, cap = PREVIEW_TABLE_ROW_CAP): string {
  const match = /<table\b[\s\S]*?<\/table>/i.exec(html)
  if (!match) return '<p>' + escapeHtml(html) + '</p>'
  const table = match[0]
    .replace(/<\/?(script|style|iframe|object|embed|link|meta|img|svg|video|audio)[^>]*>/gi, '')
    .replace(/<\/?([a-z][\w:-]*)\b([^>]*)>/gi, (all, name: string, attrs: string) => {
      const tag = String(name).toLowerCase()
      if (tag === 'br') return '<br>'
      if (!TABLE_TAGS.has(tag)) return ''
      if (all.startsWith('</')) return '</' + tag + '>'
      const kept: string[] = []
      const attrRe = /([a-zA-Z_:][\w:.-]*)\s*=\s*("([^"]*)"|'([^']*)'|(\S+))/g
      let attr: RegExpExecArray | null
      while ((attr = attrRe.exec(attrs))) {
        if (/^(colspan|rowspan|scope)$/i.test(attr[1])) {
          const value = attr[3] ?? attr[4] ?? attr[5] ?? ''
          kept.push(attr[1].toLowerCase() + '="' + escapeHtml(value) + '"')
        }
      }
      return '<' + tag + (kept.length ? ' ' + kept.join(' ') : '') + '>'
    })
  const capped = capHtmlTableRows(table, cap)
  const more = capped.hidden > 0
    ? '<p class="ap-doc-more">还有 ' + capped.hidden + ' 行未显示，切源码可看全文；保存时会拼回。</p>'
    : ''
  return '<div class="ap-doc-table-wrap">' + capped.html + '</div>' + more
}

function takeHtmlTable(lines: string[], start: number): { html: string, next: number } | null {
  const first = lines[start]
  if (!first || (!/^\s*<table\b/i.test(first) && !(/^\s*<html\b/i.test(first) && /<table/i.test(first)))) return null
  const buf = [first]
  let i = start + 1
  let chars = first.length
  if (!/<\/table>/i.test(first)) {
    while (i < lines.length && !/<\/table>/i.test(lines[i]) && chars < 400_000) {
      buf.push(lines[i])
      chars += lines[i].length + 1
      i += 1
    }
    if (i < lines.length) {
      buf.push(lines[i])
      i += 1
    }
  }
  return { html: buf.join('\n'), next: i }
}

function tableRowCapOf(ctx: MdPreviewCtx | undefined): number {
  const cap = ctx && ctx.tableRowCap
  if (cap === Number.POSITIVE_INFINITY) return Number.POSITIVE_INFINITY
  if (typeof cap === 'number' && cap > 0) return cap
  return PREVIEW_TABLE_ROW_CAP
}

export function mdToHtml(markdown: string, ctx: MdPreviewCtx = {}): string {
  const lines = String(markdown || '').replace(/\r\n/g, '\n').split('\n')
  const out: string[] = []
  const cap = tableRowCapOf(ctx)
  let i = 0
  let tableIndex = 0
  let listType: string | null = null
  let listItems: string[] = []
  const flushList = () => {
    if (!listType) return
    out.push('<' + listType + '>' + listItems.map((item) => '<li>' + item + '</li>').join('') + '</' + listType + '>')
    listType = null
    listItems = []
  }
  while (i < lines.length) {
    const line = lines[i]
    if (line.startsWith('```')) {
      flushList()
      const code: string[] = []
      i += 1
      while (i < lines.length && !lines[i].startsWith('```')) {
        code.push(lines[i])
        i += 1
      }
      if (i < lines.length) i += 1
      out.push('<pre><code>' + escapeHtml(code.join('\n')) + '</code></pre>')
      continue
    }
    const htmlTable = takeHtmlTable(lines, i)
    if (htmlTable) {
      flushList()
      out.push(sanitizeMineruTable(htmlTable.html, cap))
      i = htmlTable.next
      continue
    }
    if (isPipeTableRow(line) && i + 1 < lines.length && isPipeSeparatorRow(lines[i + 1])) {
      flushList()
      const header = pipeCells(line).map((cell) => '<th>' + inlineMarkdown(cell, ctx) + '</th>').join('')
      i += 2
      const rows: string[] = []
      let hidden = 0
      while (i < lines.length && isPipeTableRow(lines[i])) {
        if (rows.length >= cap) {
          hidden += 1
          i += 1
          continue
        }
        rows.push('<tr>' + pipeCells(lines[i]).map((cell) => '<td>' + inlineMarkdown(cell, ctx) + '</td>').join('') + '</tr>')
        i += 1
      }
      out.push('<div class="ap-doc-table-wrap" data-md-table="' + tableIndex + '"><table><thead><tr>' + header + '</tr></thead><tbody>' + rows.join('') + '</tbody></table></div>')
      tableIndex += 1
      if (hidden > 0) {
        out.push('<p class="ap-doc-more"><button type="button" class="ap-doc-btn" data-md-expand="table">还有 ' + hidden + ' 行未显示，点击立即展开</button></p>')
      }
      continue
    }
    if (isPipeTableRow(line)) {
      flushList()
      out.push('<div class="ap-doc-table-wrap"><table><tbody><tr>' + pipeCells(line).map((cell) => '<td>' + inlineMarkdown(cell, ctx) + '</td>').join('') + '</tr></tbody></table></div>')
      i += 1
      continue
    }
    const heading = /^(#{1,6})\s+(.*)$/.exec(line)
    if (heading) {
      flushList()
      const level = heading[1].length
      out.push('<h' + level + '>' + inlineMarkdown(heading[2], ctx) + '</h' + level + '>')
      i += 1
      continue
    }
    if (/^---+$/.test(line.trim())) {
      flushList()
      out.push('<hr/>')
      i += 1
      continue
    }
    const ul = /^\s*\\?[-*+]\s+(.*)$/.exec(line)
    if (ul) {
      if (listType && listType !== 'ul') flushList()
      listType = 'ul'
      listItems.push(inlineMarkdown(ul[1], ctx))
      i += 1
      continue
    }
    const ol = /^\s*\\?\d+\.\s+(.*)$/.exec(line)
    if (ol) {
      if (listType && listType !== 'ol') flushList()
      listType = 'ol'
      listItems.push(inlineMarkdown(ol[1], ctx))
      i += 1
      continue
    }
    if (/^\s*>\s?/.test(line)) {
      flushList()
      const quote: string[] = []
      while (i < lines.length && /^\s*>\s?/.test(lines[i])) {
        quote.push(lines[i].replace(/^\s*>\s?/, ''))
        i += 1
      }
      out.push('<blockquote><p>' + inlineMarkdown(quote.join(' '), ctx) + '</p></blockquote>')
      continue
    }
    if (!line.trim()) {
      flushList()
      i += 1
      continue
    }
    flushList()
    const para: string[] = []
    while (i < lines.length && lines[i].trim() && !startsMdBlock(lines[i])) {
      para.push(lines[i])
      i += 1
    }
    if (!para.length) {
      out.push('<p>' + inlineMarkdown(line, ctx) + '</p>')
      i += 1
      continue
    }
    const joined = para.join(' ').trim()
    const embedded = /<table\b[\s\S]*?<\/table>/i.exec(joined)
    if (embedded) {
      const before = joined.slice(0, embedded.index).trim()
      if (before) out.push('<p>' + inlineMarkdown(before, ctx) + '</p>')
      out.push(sanitizeMineruTable(embedded[0], cap))
      const after = joined.slice(embedded.index + embedded[0].length).trim()
      if (after) out.push('<p>' + inlineMarkdown(after, ctx) + '</p>')
      continue
    }
    out.push('<p>' + inlineMarkdown(joined, ctx) + '</p>')
  }
  flushList()
  return out.join('\n')
}

const HEAVY_MD_CHARS = 80_000
const HEAVY_TABLE_ROWS = 150
export const PREVIEW_HEAD_CHARS = 60_000

/** True when live HTML preview / WYSIWYG would likely crash the renderer. */
export function previewIsHeavy(markdown: string): boolean {
  const text = String(markdown || '')
  if (text.length > HEAVY_MD_CHARS) return true
  let rows = 0
  for (const line of text.split('\n')) {
    if (isPipeTableRow(line)) {
      rows += 1
      if (rows > HEAVY_TABLE_ROWS) return true
    }
  }
  return false
}

function collectPipeTables(markdown: string): string[] {
  const lines = String(markdown || '').replace(/\r\n/g, '\n').split('\n')
  const tables: string[] = []
  let i = 0
  while (i < lines.length) {
    if (isPipeTableRow(lines[i]) && i + 1 < lines.length && isPipeSeparatorRow(lines[i + 1])) {
      const start = i
      i += 2
      while (i < lines.length && isPipeTableRow(lines[i])) i += 1
      tables.push(lines.slice(start, i).join('\n'))
      continue
    }
    i += 1
  }
  return tables
}

/**
 * WYSIWYG only paints the capped table head. Put hidden original rows back
 * so saving the overlay does not truncate a BOQ.
 */
export function restoreCappedTables(edited: string, original: string): string {
  const fromOriginal = collectPipeTables(original)
  const fromEdited = collectPipeTables(edited)
  if (!fromOriginal.length || fromEdited.length !== fromOriginal.length) return edited
  let index = 0
  const lines = String(edited || '').replace(/\r\n/g, '\n').split('\n')
  const out: string[] = []
  let i = 0
  while (i < lines.length) {
    if (isPipeTableRow(lines[i]) && i + 1 < lines.length && isPipeSeparatorRow(lines[i + 1])) {
      const start = i
      i += 2
      while (i < lines.length && isPipeTableRow(lines[i])) i += 1
      const next = fromEdited[index] || lines.slice(start, i).join('\n')
      const orig = fromOriginal[index] || next
      index += 1
      const nextRows = next.split('\n')
      const origRows = orig.split('\n')
      out.push(origRows.length > nextRows.length
        ? nextRows.concat(origRows.slice(nextRows.length)).join('\n')
        : next)
      continue
    }
    out.push(lines[i])
    i += 1
  }
  return out.join('\n')
}

/** First paint of a huge manuscript: keep a line-bounded head, leave the rest for expand / source. */
export function slicePreviewMarkdown(
  markdown: string,
  maxChars = PREVIEW_HEAD_CHARS,
): { text: string; truncated: boolean; originalChars: number } {
  const text = String(markdown || '')
  if (text.length <= maxChars) return { text, truncated: false, originalChars: text.length }
  let cut = text.lastIndexOf('\n', maxChars)
  if (cut < Math.floor(maxChars * 0.6)) cut = maxChars
  return { text: text.slice(0, cut), truncated: true, originalChars: text.length }
}

/** Brand MutationObserver must not walk the document preview subtree. */
export function isInsideApDoc(node: { nodeType?: number; parentElement?: unknown; parentNode?: unknown; closest?: (sel: string) => unknown } | null | undefined): boolean {
  if (!node) return false
  let el: typeof node | null | undefined = node
  if (el.nodeType === 3) el = (el.parentElement || el.parentNode) as typeof node
  if (!el || typeof el.closest !== 'function') return false
  return !!el.closest('.ap-doc')
}
