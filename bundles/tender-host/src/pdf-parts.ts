/**
 * Plan and physically split PDFs so each MinerU job stays inside the official
 * page/size caps. Page numbers stay 1-based so merge can restore source coordinates.
 */
import { mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import { basename, join } from 'node:path'
import { PDFDocument } from 'pdf-lib'

/** Official precision API cap (token). https://mineru.net/apiManage/docs */
export const MINERU_PRECISION_MAX_PAGES = 200
export const MINERU_PRECISION_MAX_BYTES = 200 * 1024 * 1024
/** Official lightweight API cap (no token). */
export const MINERU_LIGHT_MAX_PAGES = 20
export const MINERU_LIGHT_MAX_BYTES = 10 * 1024 * 1024

export interface PdfPartPlan {
  /** 1-based inclusive. */
  startPage: number
  /** 1-based inclusive. */
  endPage: number
}

export interface PdfPartFile extends PdfPartPlan {
  path: string
  bytes: number
}

export interface MineruJobLimits {
  maxPages: number
  maxBytes: number
}

export function mineruJobLimits(hasToken: boolean): MineruJobLimits {
  return hasToken
    ? { maxPages: MINERU_PRECISION_MAX_PAGES, maxBytes: MINERU_PRECISION_MAX_BYTES }
    : { maxPages: MINERU_LIGHT_MAX_PAGES, maxBytes: MINERU_LIGHT_MAX_BYTES }
}

/**
 * Split a page/size pair into contiguous ranges that each fit both caps.
 * Uses average bytes/page so a 15MB file without a token can still go out as 20-page parts.
 */
export function planPdfParts(input: {
  pageCount: number
  fileBytes: number
  maxPages: number
  maxBytes: number
}): PdfPartPlan[] {
  const pageCount = Math.floor(Number(input.pageCount) || 0)
  const fileBytes = Math.max(0, Math.floor(Number(input.fileBytes) || 0))
  const maxPages = Math.max(1, Math.floor(Number(input.maxPages) || 1))
  const maxBytes = Math.max(1, Math.floor(Number(input.maxBytes) || 1))
  if (pageCount < 1) throw new Error('无法读取 PDF 页数，请另存为未加密的常规 PDF 后再入库')
  const bytesPerPage = fileBytes / pageCount
  if (bytesPerPage > maxBytes) {
    throw new Error(`单页平均体积已超过官方上限（${formatBytes(maxBytes)}）。请压缩扫描件或填写 MinerU Token 后重试。`)
  }
  let pagesPerPart = maxPages
  if (bytesPerPage > 0) {
    pagesPerPart = Math.max(1, Math.min(maxPages, Math.floor(maxBytes / bytesPerPage)))
  }
  if (pageCount <= pagesPerPart && fileBytes <= maxBytes) {
    return [{ startPage: 1, endPage: pageCount }]
  }
  const parts: PdfPartPlan[] = []
  for (let start = 1; start <= pageCount; start += pagesPerPart) {
    parts.push({ startPage: start, endPage: Math.min(pageCount, start + pagesPerPart - 1) })
  }
  return parts
}

export function formatBytes(bytes: number): string {
  if (bytes >= 1024 * 1024) return `${Math.round(bytes / (1024 * 1024))}MB`
  if (bytes >= 1024) return `${Math.round(bytes / 1024)}KB`
  return `${bytes}B`
}

export function isPdfPath(filePath: string): boolean {
  return /\.pdf$/i.test(filePath)
}

export async function inspectPdf(filePath: string): Promise<{ pageCount: number; fileBytes: number }> {
  const fileBytes = statSync(filePath).size
  const bytes = readFileSync(filePath)
  const doc = await PDFDocument.load(bytes, { ignoreEncryption: true, updateMetadata: false })
  const pageCount = doc.getPageCount()
  if (pageCount < 1) throw new Error('这份 PDF 没有页面')
  return { pageCount, fileBytes }
}

export async function writePdfPageRange(
  sourcePath: string,
  destPath: string,
  startPage: number,
  endPage: number,
): Promise<number> {
  const source = await PDFDocument.load(readFileSync(sourcePath), {
    ignoreEncryption: true,
    updateMetadata: false,
  })
  const total = source.getPageCount()
  if (startPage < 1 || endPage > total || startPage > endPage) {
    throw new Error(`页范围 ${startPage}-${endPage} 超出这份 PDF（共 ${total} 页）`)
  }
  const part = await PDFDocument.create()
  const indices = Array.from({ length: endPage - startPage + 1 }, (_, index) => startPage - 1 + index)
  const copied = await part.copyPages(source, indices)
  for (const page of copied) part.addPage(page)
  const bytes = Buffer.from(await part.save())
  writeFileSync(destPath, bytes)
  return bytes.length
}

export async function materializePdfParts(
  sourcePath: string,
  destDir: string,
  parts: PdfPartPlan[],
): Promise<PdfPartFile[]> {
  mkdirSync(destDir, { recursive: true })
  const stem = basename(sourcePath).replace(/\.pdf$/i, '') || 'document'
  const written: PdfPartFile[] = []
  for (const part of parts) {
    const dest = join(destDir, `${stem}.p${padPage(part.startPage)}-${padPage(part.endPage)}.pdf`)
    const bytes = await writePdfPageRange(sourcePath, dest, part.startPage, part.endPage)
    written.push({ ...part, path: dest, bytes })
  }
  return written
}

function padPage(page: number): string {
  return String(page).padStart(4, '0')
}
