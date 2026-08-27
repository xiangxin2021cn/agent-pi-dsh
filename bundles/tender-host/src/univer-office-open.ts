import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, realpathSync, statSync, writeFileSync } from 'node:fs'
import { basename, dirname, extname, join } from 'node:path'
import { assertInside } from './files.ts'

export interface UniverOfficeWorktree {
  worktreeId?: string
  status?: string
  worktreeUrl?: string
  openUrl?: string
  mergeUrl?: string
  units?: unknown[]
}

export interface UniverOfficeState {
  viewerUrl?: string
  worktrees?: UniverOfficeWorktree[]
}

export interface UniverOfficeService {
  newFile?(request: { workspace: string; file: string }, signal?: AbortSignal): Promise<unknown>
  worktree?(request: {
    workspace: string
    file: string
    action: 'create' | 'ready' | 'reopen' | 'discard' | 'merge'
    name?: string
    worktreeId?: string
  }, signal?: AbortSignal): Promise<{ result?: { worktreeId?: string } }>
  importUnitContent?(request: {
    workspace: string
    file: string
    sourceWorkspace: string
    source: string
    worktreeId: string
    name: string
  }, signal?: AbortSignal): Promise<unknown>
  fileState?(request: { workspace: string; file: string }): Promise<UniverOfficeState>
}

export function isUniverOfficePath(path: string): boolean {
  const ext = extname(path).toLowerCase()
  return ext === '.univer' || ext === '.xlsx' || ext === '.csv' || ext === '.tsv'
    || ext === '.docx' || ext === '.pptx'
}

export function univerOfficePreviewKind(path: string): 'spreadsheet' | 'word' | 'slides' {
  const ext = extname(path).toLowerCase()
  if (ext === '.docx') return 'word'
  if (ext === '.pptx') return 'slides'
  return 'spreadsheet'
}

export function univerOfficeUnitName(path: string): string {
  const ext = extname(path).toLowerCase()
  const base = basename(path, ext).trim()
  if (base) return base
  if (ext === '.docx') return 'Document'
  if (ext === '.pptx') return 'Presentation'
  return 'Sheet'
}

export function pickUniverOfficeViewerUrl(state: UniverOfficeState | null | undefined): string {
  const trees = state?.worktrees || []
  const draft = trees.find((item) => item.status === 'draft' && (item.worktreeUrl || item.openUrl))
  if (draft) return String(draft.worktreeUrl || draft.openUrl)
  const ready = trees.find((item) => item.status === 'ready' && (item.mergeUrl || item.worktreeUrl))
  if (ready) return String(ready.mergeUrl || ready.worktreeUrl)
  return String(state?.viewerUrl || '')
}

export function univerPreviewSidecarPath(workspace: string, source: string): string {
  const digest = createHash('sha1').update(source).digest('hex').slice(0, 12)
  const label = basename(source).replace(/[<>:"|?*]/g, '_')
  return join(workspace, '.agent-pi', 'univer-preview', `${digest}-${label}.univer`)
}

export async function resolveUniverOfficeService(
  getUniver: (() => UniverOfficeService | null | undefined) | undefined,
  tries = 8,
  delayMs = 250,
): Promise<UniverOfficeService | null> {
  if (!getUniver) return null
  for (let i = 0; i < tries; i++) {
    const service = safeGet(getUniver)
    if (service) return service
    if (i < tries - 1) await sleep(delayMs)
  }
  return safeGet(getUniver)
}

function safeGet(getUniver: () => UniverOfficeService | null | undefined): UniverOfficeService | null {
  try {
    const service = getUniver()
    return service && typeof service.fileState === 'function' ? service : null
  } catch {
    return null
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function canonDir(path: string): string {
  return existsSync(path) ? realpathSync(path) : path
}

function canonExisting(path: string): string {
  return realpathSync(path)
}

function canonNew(path: string): string {
  mkdirSync(dirname(path), { recursive: true })
  return join(canonDir(dirname(path)), basename(path))
}

function sourceStamp(path: string): string {
  const stats = statSync(path)
  return `${stats.size}:${Math.trunc(stats.mtimeMs)}`
}

function stampPathOf(file: string): string {
  return `${file}.stamp`
}

function stampMatches(file: string, source: string): boolean {
  const stamp = stampPathOf(file)
  return existsSync(stamp) && readFileSync(stamp, 'utf8') === sourceStamp(source)
}

function writeStamp(file: string, source: string): void {
  writeFileSync(stampPathOf(file), sourceStamp(source), 'utf8')
}

function worktreeIdOf(value: unknown): string {
  if (!value || typeof value !== 'object') return ''
  const record = value as Record<string, unknown>
  if (typeof record.worktreeId === 'string' && record.worktreeId) return record.worktreeId
  return worktreeIdOf(record.result)
}

/**
 * Open a workspace Office file in the official dsh-univer-office Viewer.
 * `.univer` files use the live Gateway URL. xlsx/csv/tsv/docx/pptx are imported
 * into a hidden sidecar under `.agent-pi/univer-preview/` so the right-hand
 * preview can load the same ribbon as the chat card.
 */
export async function openUniverOfficePreview(
  univer: UniverOfficeService | null | undefined,
  cwd: string,
  sourcePath: string,
  signal?: AbortSignal,
): Promise<{ viewerUrl: string; file: string } | null> {
  if (!univer || typeof univer.fileState !== 'function') return null
  const source = assertInside(cwd, sourcePath)
  if (!existsSync(source) || !statSync(source).isFile()) return null
  const workspace = canonExisting(cwd)
  const ext = extname(source).toLowerCase()
  if (ext === '.univer') {
    const file = canonExisting(source)
    const state = await univer.fileState({ workspace, file })
    const viewerUrl = pickUniverOfficeViewerUrl(state)
    return viewerUrl ? { viewerUrl, file } : null
  }
  if (!univer.newFile || !univer.worktree || !univer.importUnitContent) return null
  const absSource = canonExisting(source)
  const planned = univerPreviewSidecarPath(workspace, absSource)
  const file = existsSync(planned) ? canonExisting(planned) : canonNew(planned)
  if (!existsSync(file)) {
    await univer.newFile({ workspace, file }, signal)
  }
  let state = await univer.fileState({ workspace, file })
  let viewerUrl = pickUniverOfficeViewerUrl(state)
  const draft = (state.worktrees || []).find((item) => item.status === 'draft')
  const hasUnits = Array.isArray(draft?.units) && draft.units.length > 0
  if (viewerUrl && hasUnits && stampMatches(file, absSource)) {
    return { viewerUrl, file }
  }
  let worktreeId = hasUnits ? '' : String(draft?.worktreeId || '')
  if (!worktreeId) {
    const created = await univer.worktree({
      workspace,
      file,
      action: 'create',
      name: univerOfficeUnitName(source) || '右侧预览',
    }, signal)
    worktreeId = worktreeIdOf(created)
    if (!worktreeId) {
      const afterCreate = await univer.fileState({ workspace, file })
      worktreeId = String((afterCreate.worktrees || []).find((item) => item.status === 'draft')?.worktreeId || '')
    }
  }
  if (!worktreeId) return viewerUrl ? { viewerUrl, file } : null
  await univer.importUnitContent({
    workspace,
    file,
    sourceWorkspace: workspace,
    source: absSource,
    worktreeId,
    name: univerOfficeUnitName(source),
  }, signal)
  writeStamp(file, absSource)
  state = await univer.fileState({ workspace, file })
  viewerUrl = pickUniverOfficeViewerUrl(state)
  return viewerUrl ? { viewerUrl, file } : null
}
