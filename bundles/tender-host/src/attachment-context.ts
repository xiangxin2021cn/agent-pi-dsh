// Composer attachment context: when the web client injects workspace files it
// calls /api/agent-pi/llm/vision/read before sending the turn; we stash a
// hidden per-turn note (workspace paths, read instructions) that prompt.ts
// injects into that session's next assembly only. Images already on the official
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

type PendingRow = { text: string; cwd: string }

const pendingBySession = new Map<string, PendingRow>()

/** Replace one session's pending hidden-turn context (empty text clears it). */
export function setPendingVisionContext(sessionId: string, text: string, cwd: string): void {
  const id = textOf(sessionId).trim()
  const root = textOf(cwd).trim()
  if (!id || !root) throw new Error('sessionId and cwd are required')
  const next = text.trim()
  if (!next) {
    pendingBySession.delete(id)
    return
  }
  pendingBySession.set(id, { text: next, cwd: resolve(root) })
}

/** Read one session's pending hidden-turn context without clearing it. */
export function peekPendingVisionContext(sessionId: string): string {
  return pendingBySession.get(textOf(sessionId).trim())?.text ?? ''
}

/**
 * Consume one session's pending hidden-turn context.
 * A cwd mismatch drops the stash instead of leaking another workspace's files.
 */
export function takePendingVisionContext(sessionId: string, sessionCwd?: string): string {
  const id = textOf(sessionId).trim()
  if (!id) return ''
  const row = pendingBySession.get(id)
  if (!row) return ''
  pendingBySession.delete(id)
  if (sessionCwd && normPath(row.cwd) !== normPath(resolve(sessionCwd))) return ''
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
}) {
  const sessionId = textOf(input.sessionId).trim()
  const cwd = textOf(input.cwd).trim()
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
  setPendingVisionContext(sessionId, formatHiddenTurnContext(images, files, folders), cwd)
  return { captions: [], files: files.length, folders: folders.length, stored: true, sessionId }
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
