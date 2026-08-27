import { basename, dirname, extname, join, relative } from 'node:path'
import { readFileSync, statSync, unlinkSync, writeFileSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { assertInside } from './files.ts'
import { syncKbFromMarkdownSave } from './kb.ts'
import { syncOrchestrationReportFromMarkdown } from './orchestration.ts'
import { syncPackSidecarFromMarkdown } from './setup-restore.ts'
import {
  createMarkdownHtml,
  exportPreparedMarkdown,
  renderMarkdownBlocksForExport,
  type MarkdownExportFormat,
} from './export-document.ts'
import { commitReviewedPricing, type PricingRecalcResult } from './pricing-recalc.ts'

export { renderMarkdownBlocksForExport, createMarkdownHtml }

export function markdownToHtml(markdown: string): string {
  return createMarkdownHtml(markdown, 'document')
}

const MARKDOWN_EXT = new Set(['.md', '.markdown'])
const IMAGE_EXT = new Set(['.png', '.jpg', '.jpeg', '.gif', '.webp', '.svg', '.bmp', '.ico'])
const MIME: Record<string, string> = {
  '.md': 'text/markdown; charset=utf-8',
  '.markdown': 'text/markdown; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.html': 'text/html; charset=utf-8',
  '.htm': 'text/html; charset=utf-8',
  '.csv': 'text/csv; charset=utf-8',
  '.pdf': 'application/pdf',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.svg': 'image/svg+xml',
  '.bmp': 'image/bmp',
  '.ico': 'image/x-icon',
  '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
}

export function fileMime(path: string): string {
  return MIME[extname(path).toLowerCase()] ?? 'application/octet-stream'
}

export type PreviewKind =
  | 'markdown'
  | 'text'
  | 'image'
  | 'pdf'
  | 'html'
  | 'spreadsheet'
  | 'word'
  | 'slides'
  | 'legacy-office'
  | 'binary'

export function previewKind(path: string): PreviewKind {
  const ext = extname(path).toLowerCase()
  if (MARKDOWN_EXT.has(ext)) return 'markdown'
  if (IMAGE_EXT.has(ext)) return 'image'
  if (ext === '.pdf') return 'pdf'
  if (ext === '.html' || ext === '.htm') return 'html'
  if (ext === '.xlsx' || ext === '.csv' || ext === '.tsv' || ext === '.univer') return 'spreadsheet'
  if (ext === '.docx') return 'word'
  if (ext === '.pptx') return 'slides'
  if (ext === '.xls' || ext === '.doc' || ext === '.ppt') return 'legacy-office'
  if (['.txt', '.json', '.jsonl', '.xml', '.yml', '.yaml', '.log', '.css', '.js', '.ts', '.tsx'].includes(ext)) {
    return 'text'
  }
  return 'binary'
}

export function readWorkspaceBinary(cwd: string, sourcePath: string): { path: string; mime: string; body: Buffer; filename: string } {
  const path = assertInside(cwd, sourcePath)
  const stats = statSync(path)
  if (stats.isDirectory()) throw new Error('not a file')
  return { path, mime: fileMime(path), body: readFileSync(path), filename: basename(path) }
}

export function saveWorkspaceText(cwd: string, sourcePath: string, content: string, options?: {
  recalculate?: boolean
  projectId?: string
}): {
  path: string
  mtimeMs: number
  packSidecar?: string
  reportSidecar?: string
  kbSidecar?: string
  pricingReview?: PricingRecalcResult
} {
  const path = assertInside(cwd, sourcePath)
  if (!MARKDOWN_EXT.has(extname(path).toLowerCase()) && extname(path).toLowerCase() !== '.txt') {
    throw new Error('Only Markdown or text files can be edited in preview')
  }
  if (!statSync(path).isFile()) throw new Error('Path is not a file')
  const previous = MARKDOWN_EXT.has(extname(path).toLowerCase()) ? readFileSync(path, 'utf8') : ''
  writeFileSync(path, content, 'utf8')
  let packSidecar: string | undefined
  let reportSidecar: string | undefined
  let kbSidecar: string | undefined
  try {
    const pack = syncPackSidecarFromMarkdown(path, content)
    if (pack) packSidecar = pack.packPath
  } catch {
    // sibling pack.json may be a foreign file; the Markdown save still stands
  }
  try {
    const kb = syncKbFromMarkdownSave(path, content)
    if (kb) kbSidecar = kb.entry.slug
  } catch {
    // registry lookup is best-effort; do not roll back the Markdown write
  }
  try {
    const report = syncOrchestrationReportFromMarkdown(cwd, path, content)
    if (report) reportSidecar = report.reportPath
  } catch {
    // board lookup is best-effort; do not roll back the Markdown write
  }
  let pricingReview: PricingRecalcResult | undefined
  if (options?.recalculate && MARKDOWN_EXT.has(extname(path).toLowerCase())) {
    try {
      pricingReview = commitReviewedPricing(cwd, path, previous, content, options.projectId)
    } catch {
      // Markdown is already on disk; the caller still sees the saved file
    }
  }
  return { path, mtimeMs: statSync(path).mtimeMs, packSidecar, reportSidecar, kbSidecar, pricingReview }
}

export function deleteWorkspaceFile(cwd: string, sourcePath: string): { path: string } {
  const path = assertInside(cwd, sourcePath)
  if (!statSync(path).isFile()) throw new Error('delete requires a file')
  unlinkSync(path)
  return { path }
}

export function exportMarkdownFile(
  cwd: string,
  sourcePath: string,
  format: MarkdownExportFormat,
  content?: string,
): { path: string; filename: string; mime: string; body: Buffer } {
  const path = assertInside(cwd, sourcePath)
  const markdown = typeof content === 'string' ? content : readFileSync(path, 'utf8')
  const exported = exportPreparedMarkdown(path, markdown, format)
  return {
    path: join(dirname(path), exported.filename),
    filename: exported.filename,
    mime: exported.mime,
    body: exported.body,
  }
}

export function relativeWorkspacePath(cwd: string, sourcePath: string): string {
  return relative(assertInside(cwd, cwd), assertInside(cwd, sourcePath))
}
