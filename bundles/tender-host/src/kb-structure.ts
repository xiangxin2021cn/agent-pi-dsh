/**
 * Structure-aware KB chunking: cut a parse manuscript at clause/heading
 * boundaries so retrieval units match the source, not a 3000-character window.
 *
 * Recognition folds spaced OCR ids (A1. 2.3 → A1.2.3). Emitted text stays
 * verbatim from the manuscript.
 */
export type KbUnitKind = 'chapter' | 'section' | 'part' | 'clause' | 'toc' | 'prose' | 'table'

export interface StructureChunkMetadata {
  headingPath: string[]
  clauseRefs: string[]
  tableRefs: string[]
  boqRefs: string[]
  kind: KbUnitKind
  pageStart?: number
  pageEnd?: number
  parentId?: string
}

export interface StructureChunk {
  id: string
  title: string
  text: string
  startLine: number
  endLine: number
  startOffset: number
  endOffset: number
  metadata: StructureChunkMetadata
}

export interface KbFidelity {
  coverage: number
  clauseCount: number
  tableCount: number
  tocUnits: number
  hardCuts: number
  completeUnits: number
  unclaimedLines: number[]
  collisions: string[]
}

interface HeadingHit {
  lineIndex: number
  level: number
  title: string
  clauseId?: string
  kind: KbUnitKind
}

const FALLBACK_SIZE = 3000
const FALLBACK_OVERLAP = 300

/** Fold a user or OCR clause token into a stable id (A1.2.3). */
export function normalizeClauseId(value: string): string {
  let text = String(value ?? '').trim()
  text = text.replace(/^(?:clause|article|section|cl\.?|条款|条文)\s+/i, '')
  text = text.replace(/^第\s*/u, '')
  text = text.replace(/\s*[章节条]$/u, '')
  text = text.replace(/\s+/g, ' ').trim()
  const brokenSuffix = /^([A-Za-z])\s*(\d+(?:\s*\.\s*\d+)+)\s+(\d{1,2})$/.exec(text)
  if (brokenSuffix) {
    const head = `${brokenSuffix[1]!.toUpperCase()}${brokenSuffix[2]!.replace(/\s+/g, '')}`
    return glueBrokenSuffix(head, brokenSuffix[3]!)
  }
  const lettered = /^([A-Za-z])\s*(\d+(?:\s*\.\s*\d+)+)$/.exec(text)
  if (lettered) return `${lettered[1]!.toUpperCase()}${lettered[2]!.replace(/\s+/g, '')}`
  const plain = /^(\d+(?:\s*\.\s*\d+)+)$/.exec(text)
  if (plain) return plain[1]!.replace(/\s+/g, '')
  if (/^[a-z][0-9]/.test(text)) return text[0]!.toUpperCase() + text.slice(1)
  return text
}

export function clauseRelation(ref: string, needle: string): 'exact' | 'child' | 'parent' | null {
  const left = normalizeClauseId(ref)
  const right = normalizeClauseId(needle)
  if (!left || !right) return null
  if (left === right) return 'exact'
  if (left.startsWith(`${right}.`) || left.startsWith(`${right}(`)) return 'child'
  if (right.startsWith(`${left}.`) || right.startsWith(`${left}(`)) return 'parent'
  return null
}

/**
 * Split manuscript text into retrieval units.
 * @param content - Parse markdown (original line text is preserved).
 * @param titlePrefix - Entry display name, used in chunk titles.
 */
export function chunkByStructure(content: string, titlePrefix: string): StructureChunk[] {
  const normalized = content.replace(/\r\n/g, '\n')
  const lines = normalized.split('\n')
  const headings = collectHeadings(lines)
  const structured = emitHeadingUnits(normalized, lines, headings, titlePrefix)
  if (structured.length > 0) return structured
  return chunkBySize(normalized, titlePrefix)
}

/**
 * Coverage uses claimable characters only: TOC, page marks, DRAFT STANDARD,
 * blank lines, and outline titles with no body do not count as missing text.
 */
export function measureFidelity(content: string, units: StructureChunk[]): KbFidelity {
  const normalized = content.replace(/\r\n/g, '\n')
  const lines = normalized.split('\n')
  const headings = collectHeadings(lines)
  const skippedHeadingLines = new Set<number>()
  for (let index = 0; index < headings.length; index++) {
    const heading = headings[index]!
    const next = headings[index + 1]
    const endLineExclusive = next ? next.lineIndex : lines.length
    if (!hasSubstantialBody(lines.slice(heading.lineIndex + 1, endLineExclusive))) {
      skippedHeadingLines.add(heading.lineIndex)
    }
  }
  const offsets = lineOffsets(normalized)
  const claimable = new Uint8Array(normalized.length)
  for (let index = 0; index < lines.length; index++) {
    if (!lineClaimable(lines[index] ?? '', index, skippedHeadingLines)) continue
    const start = offsets[index] ?? 0
    const end = index + 1 < offsets.length ? offsets[index + 1]! : normalized.length
    claimable.fill(1, start, end)
  }
  const claimed = new Uint8Array(normalized.length)
  for (const unit of units) {
    const start = Math.max(0, unit.startOffset)
    const end = Math.min(normalized.length, unit.endOffset)
    if (end > start) claimed.fill(1, start, end)
  }
  let claimableCount = 0
  let claimedCount = 0
  const unclaimedLines: number[] = []
  for (let index = 0; index < lines.length; index++) {
    if (!lineClaimable(lines[index] ?? '', index, skippedHeadingLines)) continue
    const start = offsets[index] ?? 0
    const end = index + 1 < offsets.length ? offsets[index + 1]! : normalized.length
    let lineClaimableChars = 0
    let lineClaimed = 0
    for (let pos = start; pos < end; pos++) {
      if (!claimable[pos]) continue
      lineClaimableChars++
      claimableCount++
      if (claimed[pos]) {
        lineClaimed++
        claimedCount++
      }
    }
    if (lineClaimableChars > 0 && lineClaimed < lineClaimableChars) unclaimedLines.push(index + 1)
  }
  return {
    coverage: claimableCount === 0 ? 1 : claimedCount / claimableCount,
    clauseCount: units.filter((unit) => unit.metadata.kind === 'clause').length,
    tableCount: units.some((unit) => unit.metadata.kind === 'table')
      ? units.filter((unit) => unit.metadata.kind === 'table').length
      : units.filter((unit) => unit.metadata.tableRefs.length > 0).length,
    tocUnits: units.filter((unit) => unit.metadata.kind === 'toc').length,
    hardCuts: units.filter((unit) => unit.metadata.kind === 'prose').length,
    completeUnits: units.filter((unit) => unit.metadata.kind !== 'prose' && unit.metadata.kind !== 'toc').length,
    unclaimedLines,
    collisions: units.map((unit) => unit.id).filter(isCollisionId),
  }
}

function lineClaimable(line: string, lineIndex: number, skippedHeadingLines: Set<number>): boolean {
  if (skippedHeadingLines.has(lineIndex)) return false
  const trimmed = line.trim()
  if (!trimmed) return false
  if (/^<!--\s*page\b/i.test(trimmed)) return false
  if (/^DRAFT STANDARD\b/i.test(trimmed)) return false
  if (isTocLine(line)) return false
  return true
}

function isCollisionId(id: string): boolean {
  if (/^chunk-\d{4}$/.test(id)) return false
  return /^.+-[2-9]\d*$/.test(id)
}

function collectHeadings(lines: string[]): HeadingHit[] {
  const hits: HeadingHit[] = []
  for (let index = 0; index < lines.length; index++) {
    const hit = detectHeading(lines[index] ?? '')
    if (hit) hits.push({ ...hit, lineIndex: index })
  }
  return hits
}

function detectHeading(raw: string): Omit<HeadingHit, 'lineIndex'> | null {
  const line = raw.trimEnd()
  if (!line.trim()) return null
  if (/^<!--\s*page\b/i.test(line.trim())) return null
  if (/^DRAFT STANDARD\b/i.test(line.trim())) return null
  if (isTocLine(line)) return null

  const atx = /^(#{1,6})\s+(.+?)\s*$/.exec(line)
  if (atx) {
    const title = atx[2]!.trim()
    const clauseId = clauseIdFromTitle(foldHeading(title))
    return { level: atx[1]!.length, title, clauseId, kind: clauseId ? 'clause' : 'section' }
  }

  const folded = foldHeading(line)

  const zhChapter = /^第\s*(\d+)\s*章\s*[：:.\-–]?\s*(.*)$/u.exec(folded)
  if (zhChapter) {
    const rest = zhChapter[2]!.trim()
    const id = zhChapter[1]!
    const title = rest ? `第${id}章 ${rest}` : `第${id}章`
    return { level: 1, title, clauseId: id, kind: 'chapter' }
  }

  const zhSection = /^第\s*(\d+(?:\.\d+)*)\s*节\s*[：:.\-–]?\s*(.*)$/u.exec(folded)
  if (zhSection) {
    const id = zhSection[1]!
    const rest = zhSection[2]!.trim()
    const title = rest ? `第${id}节 ${rest}` : `第${id}节`
    return { level: 1 + id.split('.').length, title, clauseId: id, kind: 'section' }
  }

  const zhClause = /^第\s*(\d+(?:\.\d+)*)\s*条\s*[：:.\-–]?\s*(.*)$/u.exec(folded)
  if (zhClause) {
    const id = zhClause[1]!
    const rest = zhClause[2]!.trim()
    const title = rest ? `第${id}条 ${rest}` : `第${id}条`
    return { level: 2 + id.split('.').length, title, clauseId: id, kind: 'clause' }
  }

  const chapter = /^CHAPTER\s+(\d+)\s*[:.\-–]?\s*(.*)$/i.exec(folded)
  if (chapter) {
    const rest = chapter[2]!.trim()
    const title = rest ? `CHAPTER ${chapter[1]}: ${rest}` : `CHAPTER ${chapter[1]}`
    return { level: 1, title, clauseId: chapter[1], kind: 'chapter' }
  }

  const part = /^PART\s+([A-D])\b(?:\s*[:.\-–]\s*(.*))?$/i.exec(folded)
  if (part) {
    const rest = (part[2] ?? '').trim()
    const title = rest ? `PART ${part[1]!.toUpperCase()}: ${rest}` : `PART ${part[1]!.toUpperCase()}`
    return { level: 3, title, clauseId: part[1]!.toUpperCase(), kind: 'part' }
  }

  const legal = /^(CLAUSE|ARTICLE|SECTION)\s+(\d+(?:\.\d+)*)\b(?:\s*[:.\-–]?\s*(.*))?$/i.exec(folded)
  if (legal) {
    const id = legal[2]!
    const rest = (legal[3] ?? '').trim()
    const label = legal[1]!.charAt(0).toUpperCase() + legal[1]!.slice(1).toLowerCase()
    const title = rest ? `${label} ${id} ${rest}` : `${label} ${id}`
    return { level: 2 + id.split('.').length, title, clauseId: id, kind: 'clause' }
  }

  const lettered = /^([A-D])(\d+(?:\.\d+)+)\b\s*(.*)$/i.exec(folded)
  if (lettered) {
    const rest = lettered[3]!.trim()
    if (/^[A-D]\d+\./i.test(rest)) return null
    const id = `${lettered[1]!.toUpperCase()}${lettered[2]}`
    const title = rest ? `${id} ${rest}` : id
    const segments = lettered[2]!.split('.').length
    return { level: 3 + segments, title, clauseId: id, kind: 'clause' }
  }

  const section = /^(\d+(?:\.\d+)+)\s+(\S.+)$/.exec(folded)
  if (section) {
    const id = section[1]!
    const title = `${id} ${section[2]!.trim()}`
    return { level: id.split('.').length, title, clauseId: id, kind: 'section' }
  }

  return null
}

function foldHeading(line: string): string {
  let text = line.replace(/\s+/g, ' ').trim()
  text = text.replace(/\b([A-Za-z])\s*(\d+)\s*\.\s*(\d+(?:\s*\.\s*\d+)*)/g, (_all, letter: string, head: string, rest: string) => {
    return `${letter.toUpperCase()}${head}.${rest.replace(/\s+/g, '')}`
  })
  text = text.replace(/\b([A-D]\d+(?:\.\d+)*\.)(\d)\s+(\d)\s+(?=[A-Z])/i, (_all, prefix: string, last: string, extra: string) => {
    return `${prefix}${last}${extra} `
  })
  return text
}

function glueBrokenSuffix(id: string, extra: string): string {
  const parts = id.split('.')
  const last = parts[parts.length - 1] ?? ''
  if (last.length === 1 && /^\d{1,2}$/.test(extra)) return `${id}${extra}`
  return id
}

function isTocLine(line: string): boolean {
  const trimmed = line.trim()
  if (/^(TABLE OF CONTENTS|CONTENTS|SUMMARY OF ALL CHAPTERS|目录|目次)\b/i.test(trimmed)) return true
  if (/\.{3,}|…/.test(trimmed)) return true
  if (/\s\d+\s*-\s*\d+\s*$/.test(trimmed) && /^(CHAPTER|PART|第|[A-D]\d|\d+\.\d+)/i.test(foldHeading(trimmed))) return true
  return false
}

function clauseIdFromTitle(title: string): string | undefined {
  const zh = /^第\s*(\d+(?:\.\d+)*)\s*[章节条]/u.exec(title)
  if (zh) return zh[1]
  const legal = /^(?:CLAUSE|ARTICLE|SECTION)\s+(\d+(?:\.\d+)*)\b/i.exec(title)
  if (legal) return legal[1]
  const lettered = /^([A-D])(\d+(?:\.\d+)+)\b/i.exec(title)
  if (lettered) return `${lettered[1]!.toUpperCase()}${lettered[2]}`
  const numbered = /^(\d+(?:\.\d+)+)\b/.exec(title)
  return numbered?.[1]
}

function emitHeadingUnits(
  normalized: string,
  lines: string[],
  headings: HeadingHit[],
  titlePrefix: string,
): StructureChunk[] {
  const chunks: StructureChunk[] = []
  const usedIds = new Set<string>()
  const offsets = lineOffsets(normalized)
  for (let index = 0; index < headings.length; index++) {
    const heading = headings[index]!
    const next = headings[index + 1]
    const endLineExclusive = next ? next.lineIndex : lines.length
    const bodyLines = lines.slice(heading.lineIndex + 1, endLineExclusive)
    if (!hasSubstantialBody(bodyLines)) continue
    const startOffset = offsets[heading.lineIndex] ?? 0
    const endOffset = endLineExclusive < offsets.length ? offsets[endLineExclusive]! : normalized.length
    const text = normalized.slice(startOffset, endOffset)
    if (!text.trim()) continue
    const headingPath = headingStack(headings, index)
    const id = uniqueUnitId(heading.clauseId, usedIds, chunks.length + 1)
    const clauseRefs = [heading.clauseId, ...extractClauseRefs(text)].filter((value, inner, all): value is string => {
      return Boolean(value) && all.indexOf(value) === inner
    })
    chunks.push({
      id,
      title: `${titlePrefix} · ${heading.title}`,
      text,
      startLine: heading.lineIndex + 1,
      endLine: endLineExclusive,
      startOffset,
      endOffset,
      metadata: {
        headingPath,
        clauseRefs,
        tableRefs: extractTableRefs(text),
        boqRefs: uniqueMatches(text, /\b\d+\/\d+(?:\.\d+)*(?:\([a-z0-9]+\))*/g),
        kind: heading.kind,
      },
    })
  }
  return chunks
}

function headingStack(headings: HeadingHit[], currentIndex: number): string[] {
  const stack: string[] = []
  const levels: number[] = []
  for (let index = 0; index <= currentIndex; index++) {
    const heading = headings[index]!
    while (levels.length > 0 && levels[levels.length - 1]! >= heading.level) {
      stack.pop()
      levels.pop()
    }
    stack.push(heading.title)
    levels.push(heading.level)
  }
  return stack
}

function hasSubstantialBody(bodyLines: string[]): boolean {
  const text = bodyLines
    .filter((line) => !/^<!--\s*page\b/i.test(line.trim()))
    .filter((line) => !/^DRAFT STANDARD\b/i.test(line.trim()))
    .join('\n')
    .replace(/\s+/g, ' ')
    .trim()
  if (text.length >= 20) return true
  return /[A-Za-z\u4e00-\u9fff].+[.。]/.test(text)
}

function uniqueUnitId(clauseId: string | undefined, used: Set<string>, serial: number): string {
  const base = clauseId && /^[A-Za-z0-9][A-Za-z0-9_.()-]*$/.test(clauseId) ? clauseId : `chunk-${String(serial).padStart(4, '0')}`
  let id = base
  let suffix = 2
  while (used.has(id)) {
    id = `${base}-${suffix}`
    suffix++
  }
  used.add(id)
  return id
}

export function extractClauseRefs(text: string): string[] {
  return uniqueMatches(text, /\b(?:clause|section|cl\.?)\s*([A-Z]?\d{1,4}(?:\.\d+)*(?:\([a-z0-9]+\))*)\b/gi)
    .concat(uniqueMatches(text, /(?:第\s*([\d.]+)\s*[条款章节])/g))
    .concat(uniqueMatches(text, /(?:条款|条文)\s*([A-Z]?\d{1,3}(?:\.\d+){0,4})/gi))
    .concat(uniqueMatches(text, /(?:^|\n)\s{0,3}#{1,6}\s+(?:第\s*)?([A-Z]?\d{1,3}(?:\.\d+){1,4})\b/g))
    .map(normalizeClauseId)
    .filter((value) => /\d/.test(value) && value.length > 1)
}

export function extractTableRefs(text: string): string[] {
  const refs: string[] = []
  const lines = text.split('\n')
  for (let index = 0; index < lines.length - 1; index++) {
    const current = lines[index]?.trim() ?? ''
    const next = lines[index + 1]?.trim() ?? ''
    if (!current.startsWith('|') || !current.endsWith('|')) continue
    if (!/^\|?[\s:-]+\|[\s|:-]*$/.test(next)) continue
    refs.push(current.replace(/^\|/, '').replace(/\|$/, '').split('|').map((cell) => cell.trim()).join(' | '))
  }
  return [...new Set(refs)]
}

function uniqueMatches(text: string, pattern: RegExp): string[] {
  const values = new Set<string>()
  for (const match of text.matchAll(pattern)) {
    const value = (match[1] ?? match[0])?.trim()
    if (value) values.add(value)
  }
  return [...values]
}

function chunkBySize(normalized: string, titlePrefix: string): StructureChunk[] {
  const chunkSize = Math.max(1000, Math.min(FALLBACK_SIZE, 12000))
  const overlap = Math.max(0, Math.min(FALLBACK_OVERLAP, Math.floor(chunkSize / 3), 2000))
  const chunks: StructureChunk[] = []
  let start = 0
  let index = 1
  while (start < normalized.length) {
    let end = Math.min(normalized.length, start + chunkSize)
    if (end < normalized.length) {
      const paragraph = normalized.lastIndexOf('\n\n', end)
      if (paragraph > start + Math.floor(chunkSize * 0.5)) end = paragraph
      else {
        const sentence = Math.max(normalized.lastIndexOf('. ', end), normalized.lastIndexOf('。', end))
        if (sentence > start + Math.floor(chunkSize * 0.5)) end = sentence + 1
      }
    }
    const raw = normalized.slice(start, end)
    const text = raw.trim()
    if (text) {
      const startOffset = start + (raw.length - raw.trimStart().length)
      const endOffset = startOffset + text.length
      chunks.push({
        id: `chunk-${String(index).padStart(4, '0')}`,
        title: `${titlePrefix} #${index}`,
        text,
        startLine: lineNumberAt(normalized, startOffset),
        endLine: lineNumberAt(normalized, endOffset),
        startOffset,
        endOffset,
        metadata: {
          headingPath: [],
          clauseRefs: extractClauseRefs(text),
          tableRefs: extractTableRefs(text),
          boqRefs: uniqueMatches(text, /\b\d+\/\d+(?:\.\d+)*(?:\([a-z0-9]+\))*/g),
          kind: 'prose',
        },
      })
      index++
    }
    if (end >= normalized.length) break
    start = Math.max(end - overlap, start + 1)
  }
  return chunks
}

function lineOffsets(content: string): number[] {
  const offsets = [0]
  for (let index = 0; index < content.length; index++) {
    if (content.charCodeAt(index) === 10) offsets.push(index + 1)
  }
  return offsets
}

function lineNumberAt(content: string, offset: number): number {
  let line = 1
  for (let index = 0; index < Math.min(offset, content.length); index++) {
    if (content.charCodeAt(index) === 10) line++
  }
  return line
}
