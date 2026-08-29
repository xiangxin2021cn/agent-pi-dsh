/**
 * PageIndex-compatible shadow tree for long narrative setup manuscripts.
 *
 * This is a small TypeScript adaptation of the Markdown hierarchy algorithm in
 * VectifyAI/PageIndex (MIT, pinned below). It deliberately does not embed the
 * Python/LiteLLM runtime: Agent Pi keeps MinerU as parser and its own provider
 * credentials. The sidecar is navigation metadata, never authoritative evidence.
 */
import { createHash } from 'node:crypto'
import { existsSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { basename, dirname, extname, join, resolve } from 'node:path'

export const PAGEINDEX_UPSTREAM_REPOSITORY = 'https://github.com/VectifyAI/PageIndex'
export const PAGEINDEX_UPSTREAM_COMMIT = '9fee239b174fcc205fec28df105e519ac7171522'
export const PAGEINDEX_SHADOW_SCHEMA_VERSION = 1
export const PAGEINDEX_SHADOW_PARSER_VERSION = 'agent-pi-pageindex-md/1'
export const PAGEINDEX_SHADOW_FILE = 'pageindex-tree.json'

export interface PageIndexShadowNode {
  title: string
  nodeId: string
  level: number
  startLine: number
  endLine: number
  startOffset: number
  endOffset: number
  headingPath: string[]
  pageStart?: number
  pageEnd?: number
  preview?: string
  nodes?: PageIndexShadowNode[]
}

export interface PageIndexShadowTree {
  schemaVersion: 1
  kind: 'agent-pi-pageindex-shadow'
  mode: 'shadow'
  source: {
    id: string
    manuscript: string
    originalPath?: string
    sourceHash: string
    sourceFileHash?: string
    packHash?: string
  }
  parser: {
    name: 'agent-pi-pageindex-md'
    version: string
    upstreamRepository: string
    upstreamCommit: string
    upstreamLicense: 'MIT'
  }
  model: null | { provider?: string; name: string }
  generatedAt: string
  lineCount: number
  nodes: PageIndexShadowNode[]
}

export interface PageIndexShadowStatus {
  state: 'ready' | 'not-eligible' | 'missing' | 'stale' | 'corrupt'
  path: string
  reason?: string
  tree?: PageIndexShadowTree
}

interface FlatHeading {
  title: string
  level: number
  startLine: number
  startOffset: number
  endLine: number
  endOffset: number
  pageStart?: number
  pageEnd?: number
  preview?: string
}

function sha256(value: string | Buffer): string {
  return createHash('sha256').update(value).digest('hex')
}

function normalizePreview(value: string): string | undefined {
  const text = value
    .replace(/<!--\s*page[^>]*-->/gi, ' ')
    .replace(/^#{1,6}\s+.+$/gm, ' ')
    .replace(/^\*\*(.+?)\*\*\s*$/gm, '$1')
    .replace(/\s+/g, ' ')
    .trim()
  if (!text) return undefined
  return text.length > 280 ? `${text.slice(0, 277)}…` : text
}

function pageAtOrBefore(lines: string[], line: number): number | undefined {
  let page: number | undefined
  const pattern = /(?:<!--\s*page[:\s]+(\d+)\s*-->)|(?:\bPage\s+(\d+)\b)|(?:第\s*(\d+)\s*页)/i
  for (let index = 0; index < Math.min(line, lines.length); index++) {
    const found = pattern.exec(lines[index] ?? '')
    if (!found) continue
    const candidate = Number(found[1] || found[2] || found[3])
    if (Number.isFinite(candidate) && candidate > 0) page = candidate
  }
  return page
}

function pageRange(lines: string[], startLine: number, endLine: number): { start?: number; end?: number } {
  const pattern = /(?:<!--\s*page[:\s]+(\d+)\s*-->)|(?:\bPage\s+(\d+)\b)|(?:第\s*(\d+)\s*页)/i
  const pages: number[] = []
  for (let index = Math.max(0, startLine - 1); index < Math.min(lines.length, endLine); index++) {
    const found = pattern.exec(lines[index] ?? '')
    const candidate = found ? Number(found[1] || found[2] || found[3]) : NaN
    if (Number.isFinite(candidate) && candidate > 0) pages.push(candidate)
  }
  const fallback = pageAtOrBefore(lines, startLine)
  return { start: pages[0] ?? fallback, end: pages.at(-1) ?? fallback }
}

/** Extract ATX and standalone-bold headings, excluding fenced code blocks. */
export function extractPageIndexHeadings(markdown: string): FlatHeading[] {
  const lines = String(markdown ?? '').split(/\r?\n/)
  const offsets: number[] = []
  let cursor = 0
  for (const line of lines) {
    offsets.push(cursor)
    cursor += line.length + 1
  }
  const starts: Array<{ title: string; level: number; line: number; offset: number }> = []
  let fenced = false
  for (let index = 0; index < lines.length; index++) {
    const trimmed = (lines[index] ?? '').trim()
    if (/^```/.test(trimmed)) {
      fenced = !fenced
      continue
    }
    if (fenced || !trimmed) continue
    const atx = /^(#{1,6})\s+(.+?)\s*$/.exec(trimmed)
    const bold = /^\*\*(.+?)\*\*\s*$/.exec(trimmed)
    if (atx) starts.push({ title: atx[2].trim(), level: atx[1].length, line: index + 1, offset: offsets[index] ?? 0 })
    else if (bold) starts.push({ title: bold[1].trim(), level: 1, line: index + 1, offset: offsets[index] ?? 0 })
  }
  if (starts.length === 0 && markdown.trim()) {
    starts.push({ title: 'Document', level: 1, line: 1, offset: 0 })
  }
  return starts.map((start, index) => {
    const next = starts[index + 1]
    const endOffset = next?.offset ?? markdown.length
    const endLine = next ? Math.max(start.line, next.line - 1) : lines.length
    const body = markdown.slice(start.offset, endOffset)
    const pages = pageRange(lines, start.line, endLine)
    return {
      title: start.title,
      level: start.level,
      startLine: start.line,
      startOffset: start.offset,
      endLine,
      endOffset,
      pageStart: pages.start,
      pageEnd: pages.end,
      preview: normalizePreview(body),
    }
  })
}

/** Build the same stack-based hierarchy used by PageIndex's Markdown adapter. */
export function buildPageIndexTree(markdown: string): PageIndexShadowNode[] {
  const flat = extractPageIndexHeadings(markdown)
  const roots: PageIndexShadowNode[] = []
  const stack: PageIndexShadowNode[] = []
  let counter = 1
  for (const heading of flat) {
    const node: PageIndexShadowNode = {
      title: heading.title,
      nodeId: String(counter++).padStart(4, '0'),
      level: heading.level,
      startLine: heading.startLine,
      endLine: heading.endLine,
      startOffset: heading.startOffset,
      endOffset: heading.endOffset,
      headingPath: [],
      pageStart: heading.pageStart,
      pageEnd: heading.pageEnd,
      preview: heading.preview,
    }
    while (stack.length > 0 && (stack.at(-1)?.level ?? 0) >= node.level) stack.pop()
    const parent = stack.at(-1)
    node.headingPath = [...(parent?.headingPath ?? []), node.title]
    if (parent) {
      parent.nodes = parent.nodes ?? []
      parent.nodes.push(node)
    } else roots.push(node)
    stack.push(node)
  }
  return roots
}

function markdownTableRatio(markdown: string): number {
  const lines = markdown.split(/\r?\n/).filter((line) => line.trim())
  if (lines.length === 0) return 0
  const tableLines = lines.filter((line) => /^\s*\|.*\|\s*$/.test(line)).length
  return tableLines / lines.length
}

/** PageIndex is limited to long narrative sources; BOQ/Excel stays on table tools. */
export function pageIndexShadowEligibility(markdown: string, originalPath?: string): { eligible: boolean; reason?: string } {
  const ext = extname(originalPath || '').toLowerCase()
  if (['.xls', '.xlsx', '.xlsm', '.csv'].includes(ext)) return { eligible: false, reason: 'table-source' }
  const bytes = Buffer.byteLength(markdown, 'utf8')
  const lines = markdown.split(/\r?\n/).length
  if (bytes < 12_000 && lines < 120) return { eligible: false, reason: 'short-document' }
  if (markdownTableRatio(markdown) >= 0.35 || /\bBOQ\b|Bill\s+of\s+Quantities|工程量清单/i.test(basename(originalPath || ''))) {
    return { eligible: false, reason: 'table-dominant' }
  }
  return { eligible: true }
}

export function pageIndexShadowPath(manuscriptPath: string): string {
  return join(dirname(resolve(manuscriptPath)), PAGEINDEX_SHADOW_FILE)
}

export function createPageIndexShadow(input: {
  manuscriptPath: string
  originalPath?: string
  sourceFileHash?: string
  packPath?: string
  sourceId?: string
  model?: { provider?: string; name: string } | null
  force?: boolean
  outputPath?: string
  classificationPath?: string
}): PageIndexShadowStatus {
  const manuscriptPath = resolve(input.manuscriptPath)
  const path = input.outputPath ? resolve(input.outputPath) : pageIndexShadowPath(manuscriptPath)
  const markdown = readFileSync(manuscriptPath, 'utf8')
  const eligibility = pageIndexShadowEligibility(markdown, input.classificationPath || input.originalPath)
  if (!eligibility.eligible && !input.force) {
    rmSync(path, { force: true })
    return { state: 'not-eligible', path, reason: eligibility.reason }
  }
  const tree: PageIndexShadowTree = {
    schemaVersion: PAGEINDEX_SHADOW_SCHEMA_VERSION,
    kind: 'agent-pi-pageindex-shadow',
    mode: 'shadow',
    source: {
      id: input.sourceId || basename(dirname(manuscriptPath)),
      manuscript: basename(manuscriptPath),
      originalPath: input.originalPath ? resolve(input.originalPath) : undefined,
      sourceHash: sha256(markdown),
      sourceFileHash: input.sourceFileHash,
      packHash: input.packPath && existsSync(input.packPath) ? sha256(readFileSync(input.packPath)) : undefined,
    },
    parser: {
      name: 'agent-pi-pageindex-md',
      version: PAGEINDEX_SHADOW_PARSER_VERSION,
      upstreamRepository: PAGEINDEX_UPSTREAM_REPOSITORY,
      upstreamCommit: PAGEINDEX_UPSTREAM_COMMIT,
      upstreamLicense: 'MIT',
    },
    model: input.model ?? null,
    generatedAt: new Date().toISOString(),
    lineCount: markdown.split(/\r?\n/).length,
    nodes: buildPageIndexTree(markdown),
  }
  writeFileSync(path, `${JSON.stringify(tree, null, 2)}\n`)
  return { state: 'ready', path, tree }
}

export function readPageIndexShadow(input: {
  manuscriptPath: string
  packPath?: string
  outputPath?: string
}): PageIndexShadowStatus {
  const manuscriptPath = resolve(input.manuscriptPath)
  const path = input.outputPath ? resolve(input.outputPath) : pageIndexShadowPath(manuscriptPath)
  if (!existsSync(path)) return { state: 'missing', path }
  let tree: PageIndexShadowTree
  try {
    tree = JSON.parse(readFileSync(path, 'utf8')) as PageIndexShadowTree
  } catch {
    return { state: 'corrupt', path, reason: 'invalid-json' }
  }
  if (tree.kind !== 'agent-pi-pageindex-shadow' || tree.schemaVersion !== PAGEINDEX_SHADOW_SCHEMA_VERSION) {
    return { state: 'corrupt', path, reason: 'unsupported-schema' }
  }
  if (tree.parser.version !== PAGEINDEX_SHADOW_PARSER_VERSION) return { state: 'stale', path, reason: 'parser-version' }
  if (!existsSync(manuscriptPath) || tree.source.sourceHash !== sha256(readFileSync(manuscriptPath, 'utf8'))) {
    return { state: 'stale', path, reason: 'manuscript-hash' }
  }
  if (input.packPath && existsSync(input.packPath) && tree.source.packHash !== sha256(readFileSync(input.packPath))) {
    return { state: 'stale', path, reason: 'pack-hash' }
  }
  return { state: 'ready', path, tree }
}

function searchTerms(query: string): string[] {
  const normalized = query.toLocaleLowerCase()
  const words = normalized.match(/[a-z0-9_.-]{2,}/g) ?? []
  const hanSegments = normalized.match(/[\p{Script=Han}]{2,}/gu) ?? []
  const han: string[] = []
  for (const segment of hanSegments) {
    han.push(segment)
    for (let index = 0; index < segment.length - 1; index++) han.push(segment.slice(index, index + 2))
  }
  return [...new Set([...words, ...han])].slice(0, 32)
}

export function searchPageIndexShadow(tree: PageIndexShadowTree, query: string, limit = 8): Array<{
  nodeId: string
  title: string
  headingPath: string[]
  pageStart?: number
  pageEnd?: number
  startLine: number
  endLine: number
  preview?: string
  score: number
}> {
  const terms = searchTerms(query)
  const flat: PageIndexShadowNode[] = []
  const walk = (nodes: PageIndexShadowNode[]) => {
    for (const node of nodes) {
      flat.push(node)
      if (node.nodes) walk(node.nodes)
    }
  }
  walk(tree.nodes)
  return flat.map((node) => {
    const title = node.title.toLocaleLowerCase()
    const path = node.headingPath.join(' ').toLocaleLowerCase()
    const preview = (node.preview || '').toLocaleLowerCase()
    const score = terms.reduce((sum, term) => sum
      + (title.includes(term) ? 8 : 0)
      + (path.includes(term) ? 4 : 0)
      + (preview.includes(term) ? 1 : 0), 0)
    return { ...node, score }
  })
    .filter((node) => terms.length === 0 || node.score > 0)
    .sort((a, b) => b.score - a.score || a.startLine - b.startLine)
    .slice(0, Math.max(1, Math.min(30, limit)))
    .map(({ nodes: _nodes, level: _level, startOffset: _start, endOffset: _end, ...hit }) => hit)
}
