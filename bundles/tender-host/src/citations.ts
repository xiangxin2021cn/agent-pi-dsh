/**
 * Citation-token extraction and deterministic verification.
 *
 * Deliverables cite facts inline with two token forms:
 *   [kb:slug:chunkId]        — a knowledge-base chunk (kb_search / kb_find_* citation field)
 *   [src:path#L10-L25]       — a registered file or parse deliverable, optional line range;
 *                              path is absolute, project-root-relative, or workspace-relative.
 *
 * The QA (organize) step audits every Markdown file under the project's Official Outputs,
 * verifies each token, and writes orchestration/citation-audit.json. Unresolvable tokens are
 * "orphans" — a soft gate: they never block publishing, but the stage draft tells the model
 * to repair them before complete_stage.
 */
import { basename, extname, isAbsolute, join, resolve } from 'node:path'
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs'
import type { BusinessProjectRecord } from '../../../packages/business-projects/index.ts'
import { kbChunkStatus, kbRoot, readKbChunk } from './kb.ts'
import { createHash } from 'node:crypto'
import { knowledgeApplicability, readKnowledgeVersion } from './knowledge-versions.ts'
import { isGeneratedProjectSource } from './knowledge-provenance.ts'
import { listSetupRestores, setupSourceStatus } from './setup-restore.ts'
import { officialProjectDir } from './outputs.ts'
import { projectDir, writeJson, readJson, writeNewJsonAtomic } from './fsutil.ts'
import { loadWorkspace } from './workspace.ts'
import { findStructuredEvidence, verifyStructuredEvidence } from './structured-evidence.ts'

export interface CitationToken {
  kind: 'kb' | 'src' | 'ev'
  /** Verbatim token text as written, e.g. `[kb:coto-ch4:c0012]`. */
  raw: string
  /** 1-based line number inside the scanned text. */
  line: number
  slug?: string
  chunkId?: string
  versionId?: string
  path?: string
  lineStart?: number
  lineEnd?: number
  claimId?: string
}

export interface CitationOrphan {
  /** Workspace-relative (or absolute, when outside cwd) file the token was found in. */
  file: string
  token: string
  line: number
  reason: string
}

export interface CitationAudit {
  schemaVersion: 1
  projectId: string
  module: string
  generatedAt: string
  checkedFiles: number
  totalCitations: number
  kbCitations: number
  srcCitations: number
  evidenceCitations?: number
  orphans: CitationOrphan[]
  /** Locatability and explicit support reviews are distinct checks. */
  support?: { supported: number; unsupported: number; uncertain: number; issues: CitationOrphan[] }
  unversionedKbCitations?: number
}

const KB_TOKEN = /\[kb:([a-z0-9][a-z0-9-]*)(?:@([a-f0-9]{64}))?:([A-Za-z0-9][A-Za-z0-9_.()-]*)\]/g
const SRC_TOKEN = /\[src:([^\[\]#\n]+?)(?:#L(\d+)(?:-L?(\d+))?)?\]/g
const EVIDENCE_TOKEN = /\[ev:([A-Za-z0-9][A-Za-z0-9._-]{2,127})\]/g
const TEXT_EXT = new Set(['.md', '.markdown', '.txt', '.json', '.csv', '.xml', '.yml', '.yaml'])
const MAX_LINE_CHECK_BYTES = 8_000_000
const digest = (value: string | Buffer) => createHash('sha256').update(value).digest('hex')
const pathKey = (path: string) => resolve(path).replace(/\\/g,'/').toLocaleLowerCase()

export interface CitationSupportInput {
  id: string
  artifactPath: string
  claim: string
  citation: string
  verdict: 'supported' | 'unsupported' | 'uncertain'
  reason: string
  reviewer: string
  context?: {region?: string; asOf?: string}
  independentEvidence: Array<{citation: string; quote: string}>
}
export interface CitationSupportRecord extends CitationSupportInput {
  schemaVersion: 1
  artifactHash: string
  claimLine: number
  reviewedAt: string
  /** These hashes establish evidence identity; they do not decide semantic entailment. */
  evidenceFingerprints: string[]
}
function supportDir(cwd: string, project: BusinessProjectRecord): string { return join(projectDir(cwd,project.module,project.projectId),'orchestration','citation-support') }
export function listCitationSupport(cwd: string, project: BusinessProjectRecord): CitationSupportRecord[] {
  const dir = supportDir(cwd,project)
  return existsSync(dir) ? readdirSync(dir).filter(name=>/^[A-Za-z0-9][A-Za-z0-9._-]{0,127}\.json$/.test(name)).map(name=>readJson<CitationSupportRecord>(join(dir,name),null!)) : []
}
function independentSource(cwd: string, project: BusinessProjectRecord, citation: string, artifactHash: string, context: CitationSupportInput['context'], seen = new Set<string>()): {text: string; fingerprint: string} {
  const token = extractCitationTokens(citation)[0]
  if (!token || token.raw !== citation.trim()) throw new Error('独立依据必须是完整引用 token')
  if (seen.has(token.raw)) throw new Error('生成/解析依据存在循环支持关系')
  seen.add(token.raw)
  const reason = verifyCitationToken(cwd,project,token)
  if (reason) throw new Error(reason)
  if (token.kind === 'kb') {
    if (!token.versionId) throw new Error('独立知识依据必须固定不可变版本')
    const version = readKnowledgeVersion(kbRoot(),token.slug!,token.versionId)
    if (version.entry.sourceKind === 'generated') throw new Error('生成内容不能作为原始独立事实依据')
    if (version.entry.sourceKind!=='parsed'&&isGeneratedProjectSource(cwd,project.projectId,version.entry.sourcePath,project.module)) throw new Error('生成成果入库后仍不能充当原始独立依据')
    if (knowledgeApplicability(version.entry,context).status !== 'applicable') throw new Error('知识依据地区或有效期尚未确认适用')
    if (version.entry.sourceKind === 'parsed') {
      if (!version.entry.derivedFrom?.length) throw new Error('解析稿缺少原始版本来源')
      for (const source of version.entry.derivedFrom) independentSource(cwd,project,source,artifactHash,context,new Set(seen))
    }
    if (version.manuscriptHash === artifactHash || version.originalHash === artifactHash) throw new Error('成果不能通过自身内容建立独立支持')
    return {text:readKbChunk(token.slug!,token.chunkId!,token.versionId).text,fingerprint:token.raw+':'+version.manuscriptHash}
  }
  const sourceId = token.kind === 'ev' ? findStructuredEvidence(cwd,project.projectId,token.claimId!,project.module)!.sourceId : token.path!
  const path = resolveSourceCitation(cwd,project,sourceId)
  if (!path || isGeneratedProjectSource(cwd,project.projectId,path,project.module)) throw new Error('成果和阶段报告不能反过来作为原始依据')
  let registered = project.inputPaths.some(row=>pathKey(resolve(cwd,row))===pathKey(path))
  try { registered ||= loadWorkspace(cwd,project.projectId).documents.some(row=>!!row.path&&pathKey(row.path)===pathKey(path)) } catch {}
  if (!registered) throw new Error('独立依据不是已登记的原始来源')
  const bytes = readFileSync(path), sha256 = digest(bytes)
  if (sha256 === artifactHash) throw new Error('成果不能通过自身内容建立独立支持')
  const status = setupSourceStatus(cwd,project.projectId,path,listSetupRestores(cwd,project.projectId),true)
  const text = TEXT_EXT.has(extname(path).toLocaleLowerCase()) ? bytes.toString('utf8') : status.extracted&&status.restore ? readFileSync(status.restore.manuscriptPath,'utf8') : ''
  return {text,fingerprint:pathKey(path)+':'+sha256+(status.restore ? ':'+digest(readFileSync(status.restore.manuscriptPath)) : '')}
}
/** Record an explicit review; no model-independent semantic verdict is inferred here. */
export function recordCitationSupport(cwd: string, project: BusinessProjectRecord, input: CitationSupportInput): CitationSupportRecord {
  if (!/^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/.test(input.id)) throw new Error('支持关系 id 非法')
  if (!['supported','unsupported','uncertain'].includes(input.verdict) || !input.reason?.trim() || !input.reviewer?.trim() || !input.claim?.trim()) throw new Error('支持关系需要明确判断、理由、复核者和结论')
  const artifactPath = resolve(cwd,input.artifactPath), bytes = readFileSync(artifactPath), artifactHash = digest(bytes)
  const claimLine = bytes.toString('utf8').split(/\r?\n/).findIndex(line=>line.includes(input.claim)&&line.includes(input.citation))+1
  if (!claimLine) throw new Error('结论和引用必须实际位于成果的同一行')
  if (!extractCitationTokens(input.citation).some(row=>row.raw===input.citation.trim())) throw new Error('结论引用 token 非法')
  if (input.verdict !== 'uncertain' && !input.independentEvidence?.length) throw new Error('确定支持或不支持需要独立原始依据')
  const evidenceFingerprints = (input.independentEvidence || []).map(row=>{
    const source = independentSource(cwd,project,row.citation,artifactHash,input.context)
    if (!row.quote?.trim() || !source.text.includes(row.quote)) throw new Error('独立依据引用摘录未在实际来源中找到')
    return source.fingerprint
  })
  const path = join(supportDir(cwd,project),input.id+'.json'), existing = readJson<CitationSupportRecord | null>(path,null)
  if (existing) {
    if (existing.artifactHash===artifactHash && existing.verdict===input.verdict && existing.claim===input.claim && existing.citation===input.citation && JSON.stringify(existing.evidenceFingerprints)===JSON.stringify(evidenceFingerprints)) return existing
    throw new Error('支持关系已冻结；新判断需使用新的 id')
  }
  const record: CitationSupportRecord = {...input,artifactPath,schemaVersion:1,artifactHash,claimLine,reviewedAt:new Date().toISOString(),evidenceFingerprints}
  writeNewJsonAtomic(path,record)
  return record
}
function supportVerdict(cwd: string, project: BusinessProjectRecord, file: string, artifactHash: string, token: CitationToken, records: CitationSupportRecord[]): CitationSupportInput['verdict'] {
  const matching = records.filter(row=>pathKey(row.artifactPath)===pathKey(file)&&row.artifactHash===artifactHash&&row.citation===token.raw&&row.claimLine===token.line)
  if (!matching.length) return 'uncertain'
  for (const row of matching) {
    try {
      const fingerprints = row.independentEvidence.map(evidence=>independentSource(cwd,project,evidence.citation,artifactHash,row.context).fingerprint)
      if (JSON.stringify(fingerprints)!==JSON.stringify(row.evidenceFingerprints)) return 'uncertain'
    } catch { return 'uncertain' }
  }
  return matching.some(row=>row.verdict==='unsupported') ? 'unsupported' : matching.some(row=>row.verdict==='uncertain') ? 'uncertain' : 'supported'
}

/**
 * Extract every citation token from a text.
 * @param text - Markdown or plain text to scan.
 * @returns tokens in document order with 1-based line numbers.
 */
export function extractCitationTokens(text: string): CitationToken[] {
  const tokens: CitationToken[] = []
  const lines = String(text ?? '').split(/\r?\n/)
  for (const [index, lineText] of lines.entries()) {
    for (const match of lineText.matchAll(KB_TOKEN)) {
      tokens.push({ kind: 'kb', raw: match[0], line: index + 1, slug: match[1], chunkId: match[3], ...(match[2] ? {versionId:match[2]} : {}) })
    }
    for (const match of lineText.matchAll(SRC_TOKEN)) {
      tokens.push({
        kind: 'src',
        raw: match[0],
        line: index + 1,
        path: match[1].trim(),
        lineStart: match[2] ? Number(match[2]) : undefined,
        lineEnd: match[3] ? Number(match[3]) : (match[2] ? Number(match[2]) : undefined),
      })
    }
    for (const match of lineText.matchAll(EVIDENCE_TOKEN)) {
      tokens.push({ kind: 'ev', raw: match[0], line: index + 1, claimId: match[1] })
    }
  }
  return tokens
}

/**
 * Resolve a `[src:...]` path against the project: absolute as-is, then project root,
 * then workspace cwd, then basename match over registered inputs and workspace documents.
 * @returns the first existing absolute path, or null when nothing resolves.
 */
export function resolveSourceCitation(cwd: string, project: BusinessProjectRecord, path: string): string | null {
  const candidates: string[] = []
  if (isAbsolute(path)) candidates.push(resolve(path))
  else {
    candidates.push(resolve(project.rootPath, path))
    candidates.push(resolve(cwd, path))
  }
  for (const candidate of candidates) {
    if (existsSync(candidate)) return candidate
  }
  // Basename fallback: tokens often carry just the registered file name.
  const name = basename(path).toLocaleLowerCase()
  if (!name) return null
  for (const inputPath of project.inputPaths) {
    if (basename(inputPath).toLocaleLowerCase() === name && existsSync(inputPath)) return resolve(inputPath)
  }
  try {
    for (const doc of loadWorkspace(cwd, project.projectId).documents) {
      if (doc.path && basename(doc.path).toLocaleLowerCase() === name && existsSync(doc.path)) return resolve(doc.path)
    }
  } catch { /* non-tender modules have no tender workspace */ }
  return null
}

/**
 * Verify one token against the knowledge base or the project's files.
 * @returns null when the token resolves, otherwise a human-readable orphan reason.
 */
export function verifyCitationToken(cwd: string, project: BusinessProjectRecord, token: CitationToken): string | null {
  if (token.kind === 'kb') {
    try {
      return kbChunkStatus(String(token.slug), String(token.chunkId), token.versionId)
    } catch (error) {
      return `知识库不可读：${error instanceof Error ? error.message : String(error)}`
    }
  }
  if (token.kind === 'ev') {
    const claim = findStructuredEvidence(cwd, project.projectId, String(token.claimId), project.module)
    if (!claim) return `找不到结构化证据 ${token.claimId}`
    return verifyStructuredEvidence(cwd, claim, (sourceId) => resolveSourceCitation(cwd, project, sourceId))
  }
  const resolved = resolveSourceCitation(cwd, project, String(token.path))
  if (!resolved) return `找不到引用文件 ${token.path}`
  if (token.lineStart !== undefined) {
    if (token.lineEnd !== undefined && token.lineEnd < token.lineStart) {
      return `行号区间倒置 L${token.lineStart}-L${token.lineEnd}`
    }
    const ext = extname(resolved).toLocaleLowerCase()
    if (TEXT_EXT.has(ext)) {
      try {
        const stats = statSync(resolved)
        if (stats.size <= MAX_LINE_CHECK_BYTES) {
          const lineCount = readFileSync(resolved, 'utf8').split(/\r?\n/).length
          const end = token.lineEnd ?? token.lineStart
          if (token.lineStart < 1 || end > lineCount) {
            return `行号超出范围（${basename(resolved)} 共 ${lineCount} 行，引用 L${token.lineStart}-L${end}）`
          }
        }
      } catch { /* unreadable file counts as resolved-by-existence; range unverifiable */ }
    }
  }
  return null
}

function walkMarkdown(dirPath: string): string[] {
  if (!existsSync(dirPath)) return []
  const found: string[] = []
  let entries
  try {
    entries = readdirSync(dirPath, { withFileTypes: true })
  } catch {
    return []
  }
  for (const entry of entries) {
    const full = join(dirPath, entry.name)
    if (entry.isDirectory()) found.push(...walkMarkdown(full))
    else if (/\.(md|markdown)$/i.test(entry.name)) found.push(full)
  }
  return found
}

export function citationAuditPath(cwd: string, projectId: string, module: string): string {
  return join(projectDir(cwd, module, projectId), 'orchestration', 'citation-audit.json')
}

/**
 * Audit every Markdown deliverable under the project's Official Outputs: extract tokens,
 * verify each, persist the ledger to orchestration/citation-audit.json.
 * @returns the persisted audit (also the API/tool response payload).
 */
export function auditProjectCitations(cwd: string, project: BusinessProjectRecord, options: { persist?: boolean } = {}): CitationAudit {
  const files = walkMarkdown(officialProjectDir(cwd, project.projectId))
  const orphans: CitationOrphan[] = []
  const records = listCitationSupport(cwd,project)
  const support = {supported:0,unsupported:0,uncertain:0,issues:[] as CitationOrphan[]}
  let unversionedKbCitations = 0
  let total = 0
  let kbCount = 0
  let srcCount = 0
  let evidenceCount = 0
  const cwdPrefix = resolve(cwd).replace(/\\/g, '/').toLocaleLowerCase()
  for (const file of files) {
    let text = ''
    try {
      if (statSync(file).size > MAX_LINE_CHECK_BYTES) continue
      text = readFileSync(file, 'utf8')
    } catch {
      continue
    }
    const normalized = resolve(file).replace(/\\/g, '/')
    const display = normalized.toLocaleLowerCase().startsWith(cwdPrefix + '/')
      ? normalized.slice(cwdPrefix.length + 1)
      : normalized
    const artifactHash = digest(readFileSync(file))
    for (const token of extractCitationTokens(text)) {
      total += 1
      if (token.kind === 'kb') kbCount += 1
      else if (token.kind === 'ev') evidenceCount += 1
      else srcCount += 1
      const reason = verifyCitationToken(cwd, project, token)
      if (reason) orphans.push({ file: display, token: token.raw, line: token.line, reason })
      if (token.kind==='kb'&&!token.versionId) unversionedKbCitations++
      const verdict = supportVerdict(cwd,project,file,artifactHash,token,records)
      support[verdict]++
      if (verdict!=='supported') support.issues.push({file:display,token:token.raw,line:token.line,reason:verdict==='unsupported'?'独立复核记录为不支持该结论':'尚无有效独立支持复核；引用存在仅证明可定位'})
    }
  }
  const audit: CitationAudit = {
    schemaVersion: 1,
    projectId: project.projectId,
    module: project.module,
    generatedAt: new Date().toISOString(),
    checkedFiles: files.length,
    totalCitations: total,
    kbCitations: kbCount,
    srcCitations: srcCount,
    evidenceCitations: evidenceCount,
    orphans,
    support,
    unversionedKbCitations,
  }
  if (options.persist !== false) writeJson(citationAuditPath(cwd, project.projectId, project.module), audit)
  return audit
}

export interface CitationLocator {
  kind: 'kb' | 'src' | 'ev'
  token: string
  label: string
  source?: string
  heading?: string
  page?: number
  clause?: string
  lineStart?: number
  lineEnd?: number
  path?: string
  exists: boolean
}

const PAGE_MARK = /(?:<!--\s*page[:\s]+(\d+)\s*-->)|(?:\bPage\s+(\d+)\b)|(?:第\s*(\d+)\s*页)/i
const LOCATOR_READ_BYTES = 2_000_000

/**
 * Short chip label: file · lines, or kb slug. The popover carries page/heading.
 * @param token - Token without surrounding brackets, e.g. `src:Volume 3.md#L10-L12`.
 */
export function citationChipLabel(token: string): string {
  const raw = String(token ?? '')
  if (raw.startsWith('kb:')) {
    const rest = raw.slice(3)
    const sep = rest.lastIndexOf(':')
    return (sep > 0 ? rest.slice(0, sep) : rest).split('@')[0]!
  }
  if (raw.startsWith('ev:')) return `证据 · ${raw.slice(3)}`
  if (raw.startsWith('src:')) {
    const rest = raw.slice(4)
    const hash = rest.lastIndexOf('#')
    const path = hash > 0 ? rest.slice(0, hash) : rest
    const loc = hash > 0 ? rest.slice(hash + 1) : ''
    const name = basename(path)
    return loc ? `${name} · ${loc}` : name
  }
  return raw.length > 42 ? raw.slice(0, 39) + '…' : raw
}

/**
 * Walk lines up to `upto` and keep the last heading and page marker.
 * @param text - File or chunk text.
 * @param upto - 1-based inclusive line cap; omit to scan the whole text.
 */
export function locatorFromText(text: string, upto?: number): { heading?: string; page?: number } {
  const lines = String(text ?? '').split(/\r?\n/)
  const end = upto && upto > 0 ? Math.min(lines.length, upto) : lines.length
  let heading: string | undefined
  let page: number | undefined
  for (let i = 0; i < end; i++) {
    const line = lines[i] ?? ''
    const marked = /^(#{1,6})\s+(.+)$/.exec(line)
    if (marked) heading = marked[2].trim()
    const found = PAGE_MARK.exec(line)
    if (found) {
      const n = Number(found[1] || found[2] || found[3])
      if (Number.isFinite(n) && n > 0) page = n
    }
  }
  return { heading, page }
}

/**
 * Resolve a citation token to locator metadata for the preview chip popover.
 * Returns source file, page, heading/clause — never the cited body text.
 */
export function describeCitation(
  cwd: string,
  project: BusinessProjectRecord | null,
  rawToken: string,
): CitationLocator {
  const token = String(rawToken ?? '').replace(/^\[/, '').replace(/\]$/, '')
  if (token.startsWith('kb:')) {
    const rest = token.slice(3)
    const sep = rest.lastIndexOf(':')
    const reference = sep > 0 ? rest.slice(0, sep) : rest
    const [slug,versionId] = reference.split('@')
    const chunkId = sep > 0 ? rest.slice(sep + 1) : ''
    try {
      const chunk = readKbChunk(slug, chunkId, versionId)
      const loc = locatorFromText(chunk.text, 80)
      const heading = (chunk.headingPath && chunk.headingPath.length > 0)
        ? chunk.headingPath[chunk.headingPath.length - 1]
        : (chunk.title || loc.heading)
      return {
        kind: 'kb',
        token,
        label: [chunk.name, heading].filter(Boolean).join(' · '),
        source: chunk.name,
        heading,
        page: chunk.pageStart ?? loc.page,
        clause: chunk.clauseRefs[0],
        exists: true,
      }
    } catch {
      return { kind: 'kb', token, label: citationChipLabel(token), exists: false }
    }
  }
  if (token.startsWith('ev:')) {
    const claimId = token.slice(3)
    const claim = project ? findStructuredEvidence(cwd, project.projectId, claimId, project.module) : undefined
    if (!claim) return { kind: 'ev', token, label: citationChipLabel(token), exists: false }
    return {
      kind: 'ev',
      token,
      label: [basename(claim.sourceId), claim.section, claim.page ? `第 ${claim.page} 页` : claim.internalLocator].filter(Boolean).join(' · '),
      source: basename(claim.sourceId),
      heading: claim.section,
      page: claim.page,
      path: claim.sourceId,
      exists: true,
    }
  }
  if (token.startsWith('src:')) {
    const rest = token.slice(4)
    const hash = rest.lastIndexOf('#L')
    const rawPath = hash > 0 ? rest.slice(0, hash) : rest
    const start = hash > 0 ? Number(rest.slice(hash + 2).split(/-L?/)[0]) : undefined
    const endPart = hash > 0 ? rest.slice(hash + 2).split(/-L?/)[1] : undefined
    const lineEnd = endPart ? Number(endPart) : start
    let resolved: string | null = null
    if (project) resolved = resolveSourceCitation(cwd, project, rawPath)
    if (!resolved) {
      const direct = isAbsolute(rawPath) ? resolve(rawPath) : resolve(cwd, rawPath)
      if (existsSync(direct)) resolved = direct
    }
    if (!resolved) {
      return {
        kind: 'src',
        token,
        label: citationChipLabel(token),
        source: basename(rawPath),
        lineStart: Number.isFinite(start) ? start : undefined,
        lineEnd: Number.isFinite(lineEnd) ? lineEnd : undefined,
        exists: false,
      }
    }
    let heading: string | undefined
    let page: number | undefined
    try {
      if (statSync(resolved).size <= LOCATOR_READ_BYTES) {
        const loc = locatorFromText(readFileSync(resolved, 'utf8'), start)
        heading = loc.heading
        page = loc.page
      }
    } catch { /* binary or unreadable: filename + lines are enough */ }
    return {
      kind: 'src',
      token,
      label: [basename(resolved), heading, page ? `第 ${page} 页` : (start ? `L${start}` : '')].filter(Boolean).join(' · '),
      source: basename(resolved),
      heading,
      page,
      lineStart: Number.isFinite(start) ? start : undefined,
      lineEnd: Number.isFinite(lineEnd) ? lineEnd : undefined,
      path: resolved,
      exists: true,
    }
  }
  return { kind: 'src', token, label: citationChipLabel(token), exists: false }
}

/**
 * Read the last persisted audit without recomputing (snapshot/UI path).
 * @returns the audit or null when the project has never been audited.
 */
export function loadCitationAudit(cwd: string, projectId: string, module: string): CitationAudit | null {
  const path = citationAuditPath(cwd, projectId, module)
  if (!existsSync(path)) return null
  const parsed = readJson<CitationAudit | null>(path, null)
  return parsed && parsed.schemaVersion === 1 ? parsed : null
}
