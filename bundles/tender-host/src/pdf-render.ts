/**
 * Rasterize PDF pages to PNG so official read_image can see them.
 * Primary engine is pdfjs-dist + @napi-rs/canvas (Mozilla's Node path).
 * Chromium --screenshot is a fallback when canvas cannot load.
 */
import { spawnSync } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { getDocument, GlobalWorkerOptions } from 'pdfjs-dist/legacy/build/pdf.mjs'
import { writePdfPageRange } from './pdf-parts.ts'

export type PdfRenderEngine = 'pdfjs-canvas' | 'chromium'

export interface RenderedPdfPage {
  page: number
  path: string
  bytes: number
  width?: number
  height?: number
}

const MAX_EDGE = 1280
const MAX_PIXELS = 600_000
const PNG_MAGIC = Buffer.from([0x89, 0x50, 0x4e, 0x47])

let workerReady = false

function ensurePdfjsWorker(): void {
  if (workerReady) return
  GlobalWorkerOptions.workerSrc = new URL(
    '../node_modules/pdfjs-dist/legacy/build/pdf.worker.mjs',
    import.meta.url,
  ).href
  workerReady = true
}

function fitScale(width: number, height: number): number {
  const area = Math.max(1, width * height)
  const edge = Math.max(width, height)
  let scale = Math.min(2, MAX_EDGE / edge)
  if (area * scale * scale > MAX_PIXELS) scale = Math.sqrt(MAX_PIXELS / area)
  return Math.max(0.6, scale)
}

function isPng(path: string): boolean {
  if (!existsSync(path)) return false
  const head = readFileSync(path).subarray(0, 4)
  return head.equals(PNG_MAGIC)
}

function findChromium(): string | null {
  const candidates = [
    process.env.PROGRAMFILES ? join(process.env.PROGRAMFILES, 'Google/Chrome/Application/chrome.exe') : '',
    process.env.LOCALAPPDATA ? join(process.env.LOCALAPPDATA, 'Google/Chrome/Application/chrome.exe') : '',
    process.env['PROGRAMFILES(X86)'] ? join(process.env['PROGRAMFILES(X86)'], 'Google/Chrome/Application/chrome.exe') : '',
    process.env.PROGRAMFILES ? join(process.env.PROGRAMFILES, 'Microsoft/Edge/Application/msedge.exe') : '',
    process.env['PROGRAMFILES(X86)'] ? join(process.env['PROGRAMFILES(X86)'], 'Microsoft/Edge/Application/msedge.exe') : '',
    process.env.LOCALAPPDATA ? join(process.env.LOCALAPPDATA, 'Microsoft/Edge/Application/msedge.exe') : '',
  ].filter(Boolean)
  return candidates.find((path) => existsSync(path)) ?? null
}

async function renderPageWithPdfjs(
  filePath: string,
  pageNumber: number,
  destPath: string,
): Promise<{ width: number; height: number }> {
  ensurePdfjsWorker()
  const data = new Uint8Array(readFileSync(filePath))
  const pdf = await getDocument({
    data,
    verbosity: 0,
    isEvalSupported: false,
    useSystemFonts: true,
    cMapUrl: new URL('../node_modules/pdfjs-dist/cmaps/', import.meta.url).href,
    cMapPacked: true,
    standardFontDataUrl: new URL('../node_modules/pdfjs-dist/standard_fonts/', import.meta.url).href,
  }).promise
  try {
    const page = await pdf.getPage(pageNumber)
    const base = page.getViewport({ scale: 1 })
    const viewport = page.getViewport({ scale: fitScale(base.width, base.height) })
    const factory = (pdf as { canvasFactory?: { create: (w: number, h: number) => { canvas: { toBuffer: (type: string) => Buffer }, context: unknown } } }).canvasFactory
    if (!factory) throw new Error('pdfjs canvasFactory is missing; @napi-rs/canvas did not load')
    const surface = factory.create(Math.ceil(viewport.width), Math.ceil(viewport.height))
    await page.render({ canvasContext: surface.context as never, viewport }).promise
    writeFileSync(destPath, surface.canvas.toBuffer('image/png'))
    page.cleanup()
    return { width: Math.ceil(viewport.width), height: Math.ceil(viewport.height) }
  } finally {
    await pdf.destroy()
  }
}

async function renderOnePage(filePath: string, pageNumber: number, destPath: string): Promise<{ engine: PdfRenderEngine, width?: number, height?: number }> {
  try {
    const size = await renderPageWithPdfjs(filePath, pageNumber, destPath)
    if (!isPng(destPath)) throw new Error('pdfjs wrote a non-PNG file')
    return { engine: 'pdfjs-canvas', ...size }
  } catch (canvasError) {
    try {
      await renderPageWithChromiumAsync(filePath, pageNumber, destPath)
      if (!isPng(destPath)) throw new Error('chromium wrote a non-PNG file')
      return { engine: 'chromium' }
    } catch (chromeError) {
      throw new Error(
        `无法把 PDF 第 ${pageNumber} 页输出为图片：${String((canvasError as Error).message || canvasError)}；回退也失败：${String((chromeError as Error).message || chromeError)}`,
      )
    }
  }
}

async function renderPageWithChromiumAsync(filePath: string, pageNumber: number, destPath: string): Promise<void> {
  const chrome = findChromium()
  if (!chrome) throw new Error('本机没有 Chrome / Edge，无法把 PDF 页栅格成图')
  const work = join(tmpdir(), `ap-pdf-page-${process.pid}-${pageNumber}-${Date.now()}`)
  mkdirSync(work, { recursive: true })
  const onePage = join(work, 'page.pdf')
  const shot = join(work, 'shot.png')
  const userData = join(work, 'ud')
  mkdirSync(userData, { recursive: true })
  try {
    await writePdfPageRange(filePath, onePage, pageNumber, pageNumber)
    const attempts = [
      ['--headless=new'],
      ['--headless=new', '--no-sandbox'],
      ['--headless'],
    ]
    for (const extra of attempts) {
      spawnSync(chrome, [
        ...extra,
        '--disable-gpu',
        '--disable-extensions',
        '--hide-scrollbars',
        '--no-first-run',
        '--no-default-browser-check',
        '--allow-file-access-from-files',
        '--window-size=1280,1800',
        `--user-data-dir=${userData}`,
        `--screenshot=${shot}`,
        pathToFileURL(onePage).href,
      ], { timeout: 60_000, windowsHide: true })
      if (isPng(shot)) {
        writeFileSync(destPath, readFileSync(shot))
        return
      }
    }
    throw new Error(`Chromium 未能写出第 ${pageNumber} 页 PNG`)
  } finally {
    try { rmSync(work, { recursive: true, force: true }) } catch { /* temp page leftovers */ }
  }
}

export async function renderPdfPages(input: {
  filePath: string
  destDir: string
  startPage: number
  endPage: number
}): Promise<{ engine: PdfRenderEngine, pages: RenderedPdfPage[] }> {
  mkdirSync(input.destDir, { recursive: true })
  const pages: RenderedPdfPage[] = []
  let engine: PdfRenderEngine = 'pdfjs-canvas'
  for (let page = input.startPage; page <= input.endPage; page++) {
    const destPath = join(input.destDir, `page-${String(page).padStart(4, '0')}.png`)
    const rendered = await renderOnePage(input.filePath, page, destPath)
    engine = rendered.engine
    pages.push({
      page,
      path: destPath,
      bytes: readFileSync(destPath).length,
      width: rendered.width,
      height: rendered.height,
    })
  }
  return { engine, pages }
}
