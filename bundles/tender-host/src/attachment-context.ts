// Composer attachment context: when the web client injects workspace files it
// calls /api/agent-pi/llm/vision/read before sending the turn; we stash a
// hidden per-turn note (workspace paths, read instructions) that prompt.ts
// binds to the exact claimed user message transaction. Images already on the official
// composer rail stay native image parts. Pixel understanding is owned by
// DeepSeek-V4-Flash-Vision-Exp plus official read_image — not vision_* tools.
import { existsSync, readFileSync } from 'node:fs'
import { isAbsolute, join, resolve } from 'node:path'
import { parse } from 'yaml'
import { assertInside } from './files.ts'
import { looksLikeUserTemplateName } from './kb-template.ts'

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {}
}

function asList(value: unknown): unknown[] {
  return Array.isArray(value) ? value : []
}

function textOf(value: unknown): string {
  return typeof value === 'string' ? value : ''
}

function readSettings(home = process.env.DSH_HOME): Record<string, unknown> {
  if (!home) throw new Error('DSH_HOME is required')
  const path = join(home, 'settings.yaml')
  if (!existsSync(path)) return {}
  return asRecord(parse(readFileSync(path, 'utf8')))
}

/** The model the agent defaults to, straight from settings.yaml (agent-default-model). */
export function currentDefaultModel(home = process.env.DSH_HOME): { provider: string; id: string; name?: string } | undefined {
  const doc = readSettings(home)
  const row = asRecord(doc['agent-default-model'])
  const provider = textOf(row.provider)
  const id = textOf(row.model)
  if (!provider || !id) return undefined
  const profile = asRecord(asRecord(asRecord(doc['llm-pi-ai']).providers)[provider])
  const named = asList(profile.models)
    .map((item) => asRecord(item))
    .find((model) => textOf(model.id) === id)
  const name = textOf(named?.name)
  return { provider, id, name: name || undefined }
}

function normPath(value: string): string {
  return value.replace(/\\/g, '/').replace(/\/+$/, '').toLowerCase()
}

function resolveWorkspacePath(cwd: string, raw: string): string {
  const abs = isAbsolute(raw) ? raw : resolve(cwd, raw)
  return assertInside(cwd, abs)
}

type PendingRow = {
  text: string
  cwd: string
  transactionId: string
  state: AttachmentTransactionState
  turn?: number
  deliveryMessageId?: string
  createdAt: number
  updatedAt: number
}

export type AttachmentTransactionState =
  | 'prepared'
  | 'committed'
  | 'claimed'
  | 'delivered'
  | 'failed'
  | 'cancelled'
  | 'destroyed'

export type AttachmentTransactionStatus = {
  sessionId: string
  transactionId: string
  state: AttachmentTransactionState | 'unknown'
  turn?: number
}

const pendingBySession = new Map<string, Map<string, PendingRow>>()
const PENDING_CONTEXT_TTL_MS = 6 * 60 * 60 * 1000

function pendingRows(sessionId: string, create = false): Map<string, PendingRow> | undefined {
  const id = textOf(sessionId).trim()
  if (!id) return undefined
  let rows = pendingBySession.get(id)
  if (!rows && create) {
    rows = new Map<string, PendingRow>()
    pendingBySession.set(id, rows)
  }
  if (!rows) return undefined
  const now = Date.now()
  for (const [transactionId, row] of rows) {
    if (now - row.updatedAt > PENDING_CONTEXT_TTL_MS) rows.delete(transactionId)
  }
  if (rows.size > 0 || create) return rows
  pendingBySession.delete(id)
  return undefined
}

function pendingRow(sessionId: string, transactionId = ''): PendingRow | undefined {
  return pendingRows(sessionId)?.get(textOf(transactionId).trim())
}

function deletePendingRow(sessionId: string, transactionId: string): boolean {
  const id = textOf(sessionId).trim()
  const rows = pendingRows(id)
  if (!rows) return false
  const deleted = rows.delete(textOf(transactionId).trim())
  if (rows.size === 0) pendingBySession.delete(id)
  return deleted
}

/** Replace one session's pending hidden-turn context (empty text clears it). */
export function setPendingVisionContext(sessionId: string, text: string, cwd: string, transactionId = ''): void {
  const id = textOf(sessionId).trim()
  const root = textOf(cwd).trim()
  if (!id || !root) throw new Error('sessionId and cwd are required')
  const token = textOf(transactionId).trim()
  const next = text.trim()
  if (!next) {
    if (token) deletePendingRow(id, token)
    else pendingBySession.delete(id)
    return
  }
  pendingRows(id, true)!.set(token, {
    text: next,
    cwd: resolve(root),
    transactionId: token,
    state: token ? 'prepared' : 'committed',
    createdAt: Date.now(),
    updatedAt: Date.now(),
  })
}

/** Make one prepared stash visible to prompt assembly only when its transaction still owns the row. */
export function commitPendingVisionContext(sessionId: string, transactionId: string): boolean {
  const id = textOf(sessionId).trim()
  const token = textOf(transactionId).trim()
  if (!id || !token) return false
  const row = pendingRow(id, token)
  if (!row) return false
  if (row.state !== 'prepared' && row.state !== 'committed') return false
  row.state = 'committed'
  row.updatedAt = Date.now()
  return true
}

/** Clear one pending stash only when it still belongs to this attachment transaction. */
export function cancelPendingVisionContext(sessionId: string, transactionId: string): boolean {
  const id = textOf(sessionId).trim()
  const token = textOf(transactionId).trim()
  if (!id || !token) return false
  const row = pendingRow(id, token)
  if (!row) return false
  row.text = ''
  if (row.state !== 'delivered' && row.state !== 'failed' && row.state !== 'destroyed') {
    row.state = 'cancelled'
  }
  row.updatedAt = Date.now()
  return true
}

/** Return the exact transaction lifecycle without exposing attachment paths or prompt text. */
export function pendingVisionTransactionStatus(sessionId: string, transactionId: string): AttachmentTransactionStatus {
  const id = textOf(sessionId).trim()
  const token = textOf(transactionId).trim()
  const row = id && token ? pendingRow(id, token) : undefined
  return {
    sessionId: id,
    transactionId: token,
    state: row?.state ?? 'unknown',
    ...(row?.turn === undefined ? {} : { turn: row.turn }),
  }
}

/** Bind one committed row to the exact inbox turn that claimed its marked user message. */
export function claimPendingVisionContext(sessionId: string, transactionId: string, turn: number): boolean {
  const row = pendingRow(sessionId, transactionId)
  if (!row || (row.state !== 'committed' && row.state !== 'claimed')) return false
  row.state = 'claimed'
  row.turn = turn
  row.updatedAt = Date.now()
  return true
}

/** Bind one claimed transaction to the stable id of its generated prompt message. */
export function bindPendingVisionDeliveryMessage(
  sessionId: string,
  transactionId: string,
  messageId: string,
): boolean {
  const id = textOf(messageId).trim()
  const row = pendingRow(sessionId, transactionId)
  if (!id || !row || row.state !== 'claimed') return false
  row.deliveryMessageId = id
  row.updatedAt = Date.now()
  return true
}

/** Acknowledge only the exact tender-host prompt message after its session append commits. */
export function deliverPendingVisionContextForMessage(sessionId: string, message: unknown): boolean {
  const candidate = asRecord(message)
  const source = asRecord(candidate.source)
  const messageId = textOf(candidate.id).trim()
  if (!messageId || textOf(source.kind) !== 'plugin' || textOf(source.plugin) !== 'tender-host'
    || textOf(source.form) !== 'instructions') return false
  const matches = [...(pendingRows(sessionId)?.values() || [])]
    .filter((row) => row.state === 'claimed' && row.deliveryMessageId === messageId)
  if (matches.length !== 1) return false
  const row = matches[0]!
  row.state = 'delivered'
  row.text = ''
  row.updatedAt = Date.now()
  return true
}

/** A claimed turn that closes before its exact prompt-message acknowledgement failed delivery. */
export function failPendingVisionContexts(sessionId: string, turn: number): number {
  let failed = 0
  for (const row of pendingRows(sessionId)?.values() || []) {
    if (row.state !== 'claimed' || row.turn !== turn) continue
    row.state = 'failed'
    row.text = ''
    row.updatedAt = Date.now()
    failed += 1
  }
  return failed
}

/** Mark one exact transaction failed when prompt interception rejects it. */
export function failPendingVisionContext(sessionId: string, transactionId: string): boolean {
  const row = pendingRow(sessionId, transactionId)
  if (!row || row.state === 'delivered' || row.state === 'destroyed') return false
  row.state = 'failed'
  row.text = ''
  row.updatedAt = Date.now()
  return true
}

/** Read one session's pending hidden-turn context without clearing it. */
export function peekPendingVisionContext(sessionId: string): string {
  let newest: PendingRow | undefined
  for (const row of pendingRows(sessionId)?.values() || []) {
    if (!newest || row.createdAt >= newest.createdAt) newest = row
  }
  return newest?.text ?? ''
}

/** Whether one session has a committed attachment row for its current workspace. */
export function hasCommittedPendingVisionContext(sessionId: string, sessionCwd?: string): boolean {
  for (const row of pendingRows(sessionId)?.values() || []) {
    if (row.state !== 'committed' && row.state !== 'claimed') continue
    if (sessionCwd && normPath(row.cwd) !== normPath(resolve(sessionCwd))) continue
    return true
  }
  return false
}

/** Whether a message contains marker syntax, regardless of its source. */
export function hasAttachmentTransactionMarker(message: unknown): boolean {
  const row = asRecord(message)
  return asList(row.content).some((block) => /<!--agent-pi-attachment-tx:[^>]*-->/.test(textOf(asRecord(block).text)))
}

/** Extract every hidden attachment transaction marker from one claimed user message. */
export function attachmentTransactionIdsFromMessage(message: unknown): string[] {
  const row = asRecord(message)
  if (textOf(asRecord(row.source).kind) !== 'user') return []
  const transactionIds: string[] = []
  for (const block of asList(row.content)) {
    const text = textOf(asRecord(block).text)
    for (const match of text.matchAll(/<!--agent-pi-attachment-tx:([^>]+?)-->/g)) {
      try {
        transactionIds.push(decodeURIComponent(match[1]!.trim()))
      } catch {
        transactionIds.push('')
      }
    }
  }
  return transactionIds
}

/** Extract exactly one valid hidden attachment transaction marker. */
export function attachmentTransactionIdFromMessage(message: unknown): string {
  const transactionIds = attachmentTransactionIdsFromMessage(message)
  return transactionIds.length === 1 ? transactionIds[0]! : ''
}

/** Read a committed row only for the exact claimed message transaction, without consuming it. */
export function pendingVisionContextForTransaction(
  sessionId: string,
  transactionId: string,
  sessionCwd?: string,
): string {
  const id = textOf(sessionId).trim()
  const token = textOf(transactionId).trim()
  if (!id || !token) return ''
  const row = pendingRow(id, token)
  if (!row || (row.state !== 'committed' && row.state !== 'claimed')) return ''
  if (sessionCwd && normPath(row.cwd) !== normPath(resolve(sessionCwd))) return ''
  return row.text
}

/** Remove any row owned by a session that is being destroyed. */
export function clearPendingVisionContext(sessionId: string): void {
  for (const row of pendingRows(sessionId)?.values() || []) {
    row.state = 'destroyed'
    row.text = ''
    row.updatedAt = Date.now()
  }
}

/**
 * Consume one session's pending hidden-turn context.
 * A tokened cwd mismatch leaves the exact transaction pending for its owner;
 * legacy tokenless rows are dropped to preserve the previous safety contract.
 */
export function takePendingVisionContext(sessionId: string, sessionCwd?: string, transactionId = ''): string {
  const id = textOf(sessionId).trim()
  if (!id) return ''
  const token = textOf(transactionId).trim()
  const row = pendingRow(id, token)
  if (!row) return ''
  if (row.state !== 'committed' && row.state !== 'claimed') return ''
  if (sessionCwd && normPath(row.cwd) !== normPath(resolve(sessionCwd))) {
    if (!token) deletePendingRow(id, token)
    return ''
  }
  deletePendingRow(id, token)
  return row.text
}

/** Drop every pending stash. Tests only. */
export function resetPendingVisionContext(): void {
  pendingBySession.clear()
}

function resolveFolderPointer(cwd: string, raw: string): string {
  const trimmed = textOf(raw).trim()
  if (!trimmed) return ''
  if (isAbsolute(trimmed)) return resolve(trimmed)
  return assertInside(cwd, resolve(cwd, trimmed))
}

/** Stash the composer attachments of the upcoming turn as hidden context. */
export async function readVisionImages(input: {
  message?: string
  images?: Array<{ name?: string; path?: string }>
  files?: Array<{ name?: string; path?: string; relativePath?: string; kind?: 'image' | 'file' | 'folder' }>
  folders?: Array<{ name?: string; path?: string }>
  cwd?: string
  sessionId?: string
  transactionId?: string
}) {
  const sessionId = textOf(input.sessionId).trim()
  const cwd = textOf(input.cwd).trim()
  const transactionId = textOf(input.transactionId).trim()
  if (!sessionId) throw new Error('sessionId is required')
  if (!cwd || !isAbsolute(cwd)) throw new Error('cwd is required (absolute workspace path)')

  const images = (input.images || []).flatMap((item) => {
    const path = textOf(item.path)
    if (!path) return []
    const safe = resolveWorkspacePath(cwd, path)
    return [{ name: textOf(item.name) || safe.split(/[\\/]/).pop() || 'image', path: safe }]
  })
  const files = (input.files || []).flatMap((item) => {
    if (item.kind === 'folder') return []
    const path = textOf(item.path) || textOf(item.relativePath)
    if (!path) return []
    const safe = resolveWorkspacePath(cwd, path)
    const kind = item.kind === 'image' ? 'image' as const : 'file' as const
    return [{ name: textOf(item.name) || safe.split(/[\\/]/).pop() || 'file', path: safe, kind }]
  })
  const folders = [
    ...(input.folders || []),
    ...(input.files || []).filter((item) => item.kind === 'folder'),
  ].flatMap((item) => {
    const path = resolveFolderPointer(cwd, textOf(item.path) || textOf((item as { relativePath?: string }).relativePath || ''))
    if (!path) return []
    return [{ name: textOf(item.name) || path.split(/[\\/]/).pop() || 'folder', path }]
  })
  setPendingVisionContext(sessionId, formatHiddenTurnContext(images, files, folders), cwd, transactionId)
  return { captions: [], files: files.length, folders: folders.length, stored: true, sessionId, transactionId }
}

function formatHiddenTurnContext(
  images: Array<{ name: string; path: string }>,
  files: Array<{ name: string; path: string; kind: 'image' | 'file' }>,
  folders: Array<{ name: string; path: string }> = [],
): string {
  const parts: string[] = []
  const line = (file: { name: string; path: string }) => `- ${file.path}${file.name && file.name !== file.path ? ` (${file.name})` : ''}`
  const docs = files.filter((file) => file.kind !== 'image')
  if (images.length) {
    parts.push(`The user also saved these workspace image files (the pixels are already on this user message as native image parts; do not re-open them with vision tools):\n${images.map(line).join('\n')}`)
  }
  if (docs.length) {
    const pdfs = docs.filter((file) => /\.pdf$/i.test(file.path) || /\.pdf$/i.test(file.name))
    parts.push(`The user attached these workspace files. Read text files with the read tool if needed. Do not paste their full contents into the chat.\n${docs.map(line).join('\n')}`)
    if (pdfs.length) {
      parts.push(`Official read and read_image cannot open PDF. The host has not converted these files. If the user wants complete accurate content, 准确整理, 全文转录, or a knowledge pack, YOU must call kb_prepare_document on each PDF path. It writes <stem>-知识包/ (draft manuscript.md plus pages/page-NNNN.png by default). Then you call read_image on those PNGs (DeepSeek-V4-Flash-Vision-Exp) and rewrite the manuscript from the printed page. Pass images:false only to skip PNGs. Read skill kb-vision-pack. The extract is a draft: rewrite manuscript.md as readable Markdown that mirrors the printed source (ATX headings, TOC list, tables) for both 规范/合同 and 用户模板. Do not import a wall of text. Never call vision_*. Never ask the user to export pages.`)
      if (docs.some((file) => looksLikeUserTemplateName(file.name) || looksLikeUserTemplateName(file.path))) {
        parts.push(`At least one attachment looks like a user writing template (文件名含 模板/模版/template). If the user wants this conversation's output to clone its format, outline, and depth, read skill kb-user-template, kb_add or import it as category 用户模板, and do not copy the template's project facts.`)
      }
    }
  }
  if (folders.length) {
    parts.push(`The user pointed at these folders. Use each path as a directory; list and read files from it as needed. Do not copy or upload the tree, and do not paste full contents into the chat.\n${folders.map(line).join('\n')}`)
  }
  return parts.join('\n\n')
}
