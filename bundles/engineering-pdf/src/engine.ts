import { createHash, randomUUID } from 'node:crypto'
import { createRequire } from 'node:module'
import { readFile, realpath, stat, lstat, mkdir, writeFile, rename, readdir } from 'node:fs/promises'
import { dirname, isAbsolute, join, relative, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import type { EngineeringPdfInput, PdfPageInfo, PdfReceipt, PdfRoi, PdfSource, PdfTextItem } from './types.ts'

export const PDF_LIMITS = { fileBytes: 64 * 1024 * 1024, pages: 5000, pageBatch: 50, textBatch: 2000, textOffset: 100000, textChars: 200000, pixels: 16_000_000, edge: 8192, dpi: 600, tiles: 4096, receipts: 4096, timeoutMs: 45000, cachedDocuments: 2 } as const
const VERSION = '3'
const dependencyRequire = createRequire(new URL('../../tender-host/package.json', import.meta.url))
const sha = (value: Uint8Array | string) => createHash('sha256').update(value).digest('hex')
const inside = (root: string, path: string) => { const value = relative(root, path); return value === '' || (!isAbsolute(value) && value !== '..' && !value.startsWith(`..${process.platform === 'win32' ? '\\' : '/'}`)) }

let runtimePromise: Promise<{ pdfjs: any; version: string }> | undefined
async function runtime() {
  if (!runtimePromise) runtimePromise = (async () => {
    try {
      // Resolve the already packaged runtime; this plugin never downloads a renderer.
      const modulePath = dependencyRequire.resolve('pdfjs-dist/legacy/build/pdf.mjs')
      dependencyRequire.resolve('@napi-rs/canvas')
      const pdfjs = await import(pathToFileURL(modulePath).href)
      pdfjs.GlobalWorkerOptions.workerSrc = pathToFileURL(dependencyRequire.resolve('pdfjs-dist/legacy/build/pdf.worker.mjs')).href
      return { pdfjs, version: String(pdfjs.version) }
    } catch (error) {
      runtimePromise = undefined
      throw new Error(`工程 PDF 需要已安装 tender-host 的 pdfjs-dist 与 @napi-rs/canvas 运行时：${(error as Error).message}`)
    }
  })()
  return runtimePromise
}

function integer(value: unknown, fallback: number, min: number, max: number, name: string) {
  const number = value === undefined ? fallback : value
  if (typeof number !== 'number' || !Number.isSafeInteger(number) || number < min || number > max) throw new RangeError(`${name} 必须为 ${min}..${max} 的整数。`)
  return number
}
export function validatePdfInput(value: unknown): EngineeringPdfInput {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new TypeError('需要 PDF 操作对象。')
  const input = value as EngineeringPdfInput
  if (!['inventory', 'text', 'render', 'tiles', 'coverage'].includes(input.action) || typeof input.path !== 'string' || !input.path.trim()) throw new TypeError('需要有效 action 与工作目录内的 PDF path。')
  const output: EngineeringPdfInput = { action: input.action, path: input.path }
  if (['text', 'render', 'tiles'].includes(input.action)) output.page = integer(input.page, 1, 1, PDF_LIMITS.pages, 'page')
  if (['inventory', 'coverage'].includes(input.action)) { output.startPage = integer(input.startPage, 1, 1, PDF_LIMITS.pages, 'startPage'); output.limit = integer(input.limit, PDF_LIMITS.pageBatch, 1, PDF_LIMITS.pageBatch, 'limit') }
  if (input.action === 'text') { output.offset = integer(input.offset, 0, 0, PDF_LIMITS.textOffset, 'offset'); output.limit = integer(input.limit, 1000, 1, PDF_LIMITS.textBatch, 'limit') }
  if (['render', 'tiles'].includes(input.action)) output.dpi = integer(input.dpi, 144, 36, PDF_LIMITS.dpi, 'dpi')
  if (input.action === 'render') {
    const roi = input.roi ?? { x: 0, y: 0, width: 1, height: 1 }
    if (!roi || [roi.x, roi.y, roi.width, roi.height].some(number => typeof number !== 'number' || !Number.isFinite(number)) || roi.x < 0 || roi.y < 0 || roi.width <= 0 || roi.height <= 0 || roi.x + roi.width > 1 || roi.y + roi.height > 1) throw new RangeError('ROI 必须完全位于旋转后页面的 normalized top-left [0,1] 范围内；不自动裁边。')
    output.roi = { x: roi.x, y: roi.y, width: roi.width, height: roi.height }
  }
  if (input.action === 'tiles') {
    output.tilePixels = integer(input.tilePixels, 2048, 256, 4000, 'tilePixels')
    output.overlapPixels = integer(input.overlapPixels, 128, 0, Math.floor(output.tilePixels / 2), 'overlapPixels')
    output.offset = integer(input.offset, 0, 0, PDF_LIMITS.tiles, 'offset')
    output.limit = integer(input.limit, 32, 1, 100, 'limit')
  }
  return output
}

function pageInfo(page: any): PdfPageInfo {
  const viewport = page.getViewport({ scale: 1 })
  if (![viewport.width, viewport.height, page.userUnit].every(number => Number.isFinite(number) && number > 0)) throw new Error('PDF 页面尺寸或 UserUnit 无效。')
  return { page: page.pageNumber, pdfViewBox: [...page.view], rotation: page.rotate, userUnit: page.userUnit, pdfCoordinateUnit: '1/72 inch multiplied by userUnit', viewport: { width: viewport.width, height: viewport.height, unit: 'pt', origin: 'top-left', rotationApplied: true }, pdfToViewportTransform: [...viewport.transform], engineeringScale: null }
}

export function planPdfTiles(info: PdfPageInfo, input: EngineeringPdfInput) {
  const dpi = input.dpi!, pixels = input.tilePixels!, overlap = input.overlapPixels!, step = pixels - overlap
  const width = info.viewport.width * dpi / 72, height = info.viewport.height * dpi / 72
  const columns = Math.max(1, Math.ceil((width - overlap) / step)), rows = Math.max(1, Math.ceil((height - overlap) / step))
  const total = columns * rows
  if (!Number.isSafeInteger(total) || total > PDF_LIMITS.tiles) throw new RangeError('分块数量超过预算，请降低 dpi 或增加 tilePixels。')
  if (input.offset! >= total && input.offset !== 0) throw new RangeError('分块 offset 超出范围。')
  const tiles = []
  for (let index = input.offset!; index < Math.min(total, input.offset! + input.limit!); index++) {
    const x = index % columns * step / width, y = Math.floor(index / columns) * step / height
    const roi = { x, y, width: Math.min(pixels / width, 1 - x), height: Math.min(pixels / height, 1 - y) }
    tiles.push({ id: `page-${info.page}:tile-${index + 1}`, index, roi, action: 'render', page: info.page, dpi, state: 'planned', visualReview: 'pending' })
  }
  return { page: info, coordinateSpace: 'normalized-top-left-rotated-page', dpi, tilePixels: pixels, overlapPixels: overlap, columns, rows, total, offset: input.offset, nextOffset: input.offset! + tiles.length < total ? input.offset! + tiles.length : null, tiles }
}

async function safeCacheDir(root: string, sourceHash: string) {
  let current = root
  for (const name of ['.agent-pi', 'engineering-pdf', sourceHash]) {
    current = join(current, name)
    await mkdir(current).catch(error => { if (error.code !== 'EEXIST') throw error })
    const info = await lstat(current)
    if (!info.isDirectory() || info.isSymbolicLink() || !inside(root, await realpath(current))) throw new Error('PDF 缓存目录不能是链接或工作目录外的路径。')
  }
  return current
}
async function atomicWrite(path: string, value: Uint8Array | string) {
  const temporary = join(dirname(path), `${randomUUID()}.tmp`)
  await writeFile(temporary, value, { flag: 'wx' })
  await rename(temporary, path)
}
async function readCache(path: string, maxBytes: number) {
  try {
    const info = await lstat(path)
    if (!info.isFile() || info.isSymbolicLink() || info.size > maxBytes) return null
    return await readFile(path)
  } catch (error) { if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null; throw error }
}
interface OpenDocument { key: string; source: PdfSource; pdf: any; loading: any }

export class EngineeringPdfEngine {
  private documents = new Map<string, OpenDocument>()
  private queue: Promise<unknown> = Promise.resolve()
  private disposed = false
  private activeController?: AbortController

  run(value: unknown, context: { cwd: string; signal?: AbortSignal }): Promise<any> {
    const input = validatePdfInput(value)
    if (typeof context.cwd !== 'string' || !context.cwd) return Promise.reject(new Error('工程 PDF 工具需要会话的真实工作目录。'))
    const task = this.queue.then(async () => {
      if (this.disposed) throw new Error('工程 PDF 插件已停止。')
      const controller = new AbortController()
      this.activeController = controller
      const abort = () => controller.abort(context.signal?.reason)
      context.signal?.addEventListener('abort', abort, { once: true })
      if (context.signal?.aborted) abort()
      const timer = setTimeout(() => controller.abort(new Error('工程 PDF 操作超过 45 秒预算。')), PDF_LIMITS.timeoutMs)
      timer.unref()
      try { return await this.execute(input, context.cwd, controller.signal) }
      finally { clearTimeout(timer); context.signal?.removeEventListener('abort', abort); this.activeController = undefined }
    })
    this.queue = task.catch(() => {})
    return task
  }

  async dispose() {
    this.disposed = true
    this.activeController?.abort(new Error('工程 PDF 插件已停止。'))
    await this.queue
    for (const entry of this.documents.values()) await entry.loading.destroy()
    this.documents.clear()
  }

  private async open(cwd: string, path: string, signal: AbortSignal) {
    signal.throwIfAborted()
    const root = await realpath(cwd), requested = resolve(root, path)
    if (!inside(root, requested)) throw new Error('PDF 读取路径必须位于当前会话工作目录内。')
    const sourcePath = await realpath(requested)
    if (!inside(root, sourcePath)) throw new Error('PDF 链接指向工作目录外，不能读取。')
    const fileStat = await stat(sourcePath, { bigint: true })
    if (!fileStat.isFile() || fileStat.size > BigInt(PDF_LIMITS.fileBytes)) throw new RangeError('PDF 必须是文件且不超过 64 MiB。')
    const key = `${fileStat.size}:${fileStat.mtimeNs}:${fileStat.ctimeNs}:${fileStat.ino}`
    const existing = this.documents.get(sourcePath)
    if (existing?.key === key) { this.documents.delete(sourcePath); this.documents.set(sourcePath, existing); return { root, entry: existing } }
    if (existing) { await existing.loading.destroy(); this.documents.delete(sourcePath) }
    const data = await readFile(sourcePath, { signal })
    if (!data.subarray(0, 1024).includes(Buffer.from('%PDF-'))) throw new Error('输入不是可识别的 PDF 文件。')
    const after = await stat(sourcePath, { bigint: true })
    if (`${after.size}:${after.mtimeNs}:${after.ctimeNs}:${after.ino}` !== key) throw new Error('PDF 在读取期间发生变化，请重试以取得一致版本。')
    const { pdfjs } = await runtime()
    const base = dirname(dependencyRequire.resolve('pdfjs-dist/package.json'))
    // Node's BinaryDataFactory calls fs.readFile with a string path, not a file: URL.
    const loading = pdfjs.getDocument({ data: new Uint8Array(data), verbosity: 0, isEvalSupported: false, useSystemFonts: false, disableFontFace: true, cMapUrl: join(base, 'cmaps') + '/', cMapPacked: true, standardFontDataUrl: join(base, 'standard_fonts') + '/', wasmUrl: join(base, 'wasm') + '/', isOffscreenCanvasSupported: false })
    const abort = () => { void loading.destroy() }
    signal.addEventListener('abort', abort, { once: true })
    let pdf: any
    try { signal.throwIfAborted(); pdf = await loading.promise; signal.throwIfAborted() }
    catch (error) { await loading.destroy(); signal.throwIfAborted(); throw error }
    finally { signal.removeEventListener('abort', abort) }
    if (pdf.numPages > PDF_LIMITS.pages) { await loading.destroy(); throw new RangeError('PDF 超过 5000 页预算，请分卷处理。') }
    const entry = { key, source: { path: sourcePath, sha256: sha(data), bytes: data.byteLength, pageCount: pdf.numPages }, pdf, loading }
    this.documents.set(sourcePath, entry)
    while (this.documents.size > PDF_LIMITS.cachedDocuments) { const oldest = this.documents.keys().next().value!; await this.documents.get(oldest)!.loading.destroy(); this.documents.delete(oldest) }
    return { root, entry }
  }

  private async execute(input: EngineeringPdfInput, cwd: string, signal: AbortSignal): Promise<any> {
    const { root, entry } = await this.open(cwd, input.path, signal)
    const { source, pdf } = entry
    if ((input.page ?? input.startPage ?? 1) > source.pageCount) throw new RangeError('请求页码超过 PDF 实际页数。')
    const { version } = await runtime()
    const parameters = { ...input, path: undefined }
    const parameterFingerprint = sha(JSON.stringify({ schemaVersion: VERSION, rendererVersion: version, sourceSha256: source.sha256, parameters }))
    const cache = await safeCacheDir(root, source.sha256)
    const resultPath = join(cache, `${parameterFingerprint}.json`), receiptPath = join(cache, `${parameterFingerprint}.receipt.json`)
    const base = { source, parameterFingerprint, rendererVersion: version, coordinateNotice: 'PDF/视口坐标不是工程真实长度；禁止无标定依据从像素估算工程尺寸。' }
    signal.throwIfAborted()
    if (input.action === 'coverage') return { ...base, ...(await readCoverage(cache, source, input, signal)) }
    const saved = await readCache(resultPath, 4 * 1024 * 1024)
    if (saved) {
      try {
        const result = JSON.parse(saved.toString('utf8'))
        if (result.parameterFingerprint === parameterFingerprint && result.source.sha256 === source.sha256) {
          if (input.action !== 'render') return { ...result, source, cacheHit: true }
          const image = await readCache(join(cache, `${parameterFingerprint}.png`), PDF_LIMITS.pixels * 4 + 1024 * 1024)
          if (image && sha(image) === result.imageSha256) return { ...result, source, cacheHit: true }
        }
      } catch { /* Discard an incomplete cache entry and recreate it from the source PDF. */ }
    }
    let result: any, receipt: PdfReceipt | undefined
    if (input.action === 'inventory') {
      const pages: PdfPageInfo[] = []
      for (let number = input.startPage!; number <= Math.min(source.pageCount, input.startPage! + input.limit! - 1); number++) { signal.throwIfAborted(); pages.push(pageInfo(await pdf.getPage(number))) }
      result = { ...base, pages, nextPage: input.startPage! + pages.length <= source.pageCount ? input.startPage! + pages.length : null }
      receipt = { sourceSha256: source.sha256, parameterFingerprint, action: 'inventory', pages: pages.map(page => page.page), createdAt: new Date().toISOString() }
    } else {
      const page = await pdf.getPage(input.page!), info = pageInfo(page)
      signal.throwIfAborted()
      if (input.action === 'tiles') result = { ...base, ...planPdfTiles(info, input) }
      else if (input.action === 'text') {
        const extracted = await extractText(page, input, signal)
        result = { ...base, page: info, ...extracted, visualReview: 'pending', textNotice: extracted.items.length === 0 && extracted.totalItems === 0 ? '未提取到文本；可能是扫描、矢量轮廓或空白页，必须视觉核查，不能标为无图纸内容。' : '文本坐标是排版推进范围估计；请结合局部渲染核对细字、符号和引线关系。' }
        receipt = { sourceSha256: source.sha256, parameterFingerprint, action: 'text', pages: [info.page], textRange: { page: info.page, start: input.offset!, end: input.offset! + extracted.items.length, ...(extracted.totalItems !== null ? { total: extracted.totalItems } : {}), chars: extracted.items.reduce((sum, item) => sum + item.text.length, 0) }, createdAt: new Date().toISOString() }
      } else {
        const imagePath = join(cache, `${parameterFingerprint}.png`)
        const rendered = await renderRoi(pdf, page, input, signal)
        await atomicWrite(imagePath, rendered.buffer)
        const { buffer, ...metadata } = rendered
        result = { ...base, page: info, ...metadata, imagePath, imageSha256: sha(buffer), roi: input.roi, dpi: input.dpi, sourceResolution: 'direct-pdf-render', visualReview: 'pending' }
        receipt = { sourceSha256: source.sha256, parameterFingerprint, action: 'render', pages: [info.page], roi: input.roi, imagePath, createdAt: new Date().toISOString() }
      }
    }
    signal.throwIfAborted()
    if (receipt) await atomicWrite(receiptPath, JSON.stringify(receipt))
    await atomicWrite(resultPath, JSON.stringify(result))
    return { ...result, cacheHit: false }
  }
}

async function extractText(page: any, input: EngineeringPdfInput, signal: AbortSignal) {
  const reader = page.streamTextContent().getReader(), viewport = page.getViewport({ scale: 1 })
  const items: PdfTextItem[] = []
  let index = 0, chars = 0, reachedEnd = false, hasNext = false
  const abort = () => { void reader.cancel(signal.reason).catch(() => {}) }
  signal.addEventListener('abort', abort, { once: true })
  try {
    while (true) {
      signal.throwIfAborted()
      const chunk = await reader.read()
      if (chunk.done) { reachedEnd = true; break }
      for (const item of chunk.value.items) {
        if (typeof item.str !== 'string') continue
        if (index > PDF_LIMITS.textOffset + PDF_LIMITS.textBatch) throw new RangeError('单页文本项超过 102000 项预算，请分卷或视觉核查。')
        if (index >= input.offset!) {
          if (hasNext) { index++; continue }
          if (item.str.length > PDF_LIMITS.textChars) throw new RangeError('单个 PDF 文本项超过字符预算，请局部渲染核对。')
          if (items.length >= input.limit! || chars + item.str.length > PDF_LIMITS.textChars) { hasNext = true; index++; continue }
          const transform = item.transform, length = Math.hypot(transform[0], transform[1]) || 1
          const dx = transform[0] / length * item.width, dy = transform[1] / length * item.width
          const style = chunk.value.styles?.[item.fontName], ascent = style?.ascent ?? 1, descent = style?.descent ?? 0
          const point = (x: number, y: number) => viewport.convertToViewportPoint(x, y)
          const quad = [[0, ascent], [1, ascent], [1, descent], [0, descent]].map(([end, side]) => point(transform[4] + dx * end + transform[2] * side, transform[5] + dy * end + transform[3] * side))
          const xs = quad.map(point => point[0]), ys = quad.map(point => point[1]), x = Math.min(...xs), y = Math.min(...ys)
          items.push({ index, text: item.str, fontName: item.fontName, direction: item.dir, hasEOL: Boolean(item.hasEOL), pdfTransform: [...transform], pdfWidth: item.width, pdfHeight: item.height, viewportBaseline: point(transform[4], transform[5]), viewportQuad: quad, normalizedBounds: { x: x / viewport.width, y: y / viewport.height, width: (Math.max(...xs) - x) / viewport.width, height: (Math.max(...ys) - y) / viewport.height }, boundsKind: 'text-advance-estimate' })
          chars += item.str.length
        }
        index++
      }
    }
    signal.throwIfAborted()
    if (reachedEnd && input.offset! > index) throw new RangeError('文本 offset 超过实际文本项数。')
    return { items, offset: input.offset, nextOffset: hasNext ? input.offset! + items.length : null, totalItems: reachedEnd ? index : null, extractionComplete: reachedEnd && input.offset === 0 }
  } finally { signal.removeEventListener('abort', abort); if (!reachedEnd) await reader.cancel().catch(() => {}); reader.releaseLock() }
}

async function renderRoi(pdf: any, page: any, input: EngineeringPdfInput, signal: AbortSignal) {
  const viewport = page.getViewport({ scale: input.dpi! / 72 }), roi = input.roi!
  const left = viewport.width * roi.x, top = viewport.height * roi.y
  const width = Math.ceil(viewport.width * roi.width), height = Math.ceil(viewport.height * roi.height)
  if (width < 1 || height < 1 || width > PDF_LIMITS.edge || height > PDF_LIMITS.edge || width * height > PDF_LIMITS.pixels) throw new RangeError('渲染超过 8192 边长或 1600 万像素预算，请使用更小 ROI 或分块。')
  if (!pdf.canvasFactory) throw new Error('@napi-rs/canvas 渲染器未加载。')
  const surface = pdf.canvasFactory.create(width, height)
  const task = page.render({ canvasContext: surface.context, viewport, transform: [1, 0, 0, 1, -left, -top], background: 'rgb(255,255,255)' })
  const abort = () => task.cancel()
  signal.addEventListener('abort', abort, { once: true })
  try {
    signal.throwIfAborted(); await task.promise; signal.throwIfAborted()
    const transform = [...viewport.transform]; transform[4] -= left; transform[5] -= top
    return { buffer: surface.canvas.toBuffer('image/png') as Buffer, width, height, pdfToImageTransform: transform, imageOrigin: 'top-left', pixelsPerInch: input.dpi, pdfCorners: [viewport.convertToPdfPoint(left, top), viewport.convertToPdfPoint(left + width, top + height)] }
  } finally { signal.removeEventListener('abort', abort); pdf.canvasFactory.destroy(surface) }
}

async function readCoverage(cache: string, source: PdfSource, input: EngineeringPdfInput, signal: AbortSignal) {
  const files = (await readdir(cache)).filter(name => /^[a-f0-9]{64}\.receipt\.json$/.test(name))
  if (files.length > PDF_LIMITS.receipts) throw new RangeError('覆盖记录超过 4096 次预算，请分项目管理来源。')
  const receipts: PdfReceipt[] = []
  for (const file of files) {
    signal.throwIfAborted()
    const data = await readCache(join(cache, file), 32768)
    if (!data) continue
    const receipt = JSON.parse(data.toString('utf8')) as PdfReceipt
    if (receipt.sourceSha256 === source.sha256) receipts.push(receipt)
  }
  const pages = []
  for (let page = input.startPage!; page <= Math.min(source.pageCount, input.startPage! + input.limit! - 1); page++) {
    const matches = receipts.filter(receipt => receipt.pages.includes(page)), text = matches.flatMap(receipt => receipt.textRange ? [receipt.textRange] : [])
    const total = text.find(range => range.total !== undefined)?.total
    let end = 0
    for (const range of text.sort((a, b) => a.start - b.start)) if (range.start <= end) end = Math.max(end, range.end)
    const complete = total !== undefined && end >= total
    pages.push({ page, inventoried: matches.some(receipt => receipt.action === 'inventory'), textStatus: complete ? total === 0 ? 'no-text-visual-review' : 'extracted' : text.length ? 'partial' : 'not-extracted', renderedRegions: matches.filter(receipt => receipt.action === 'render').map(receipt => ({ roi: receipt.roi, imagePath: receipt.imagePath, parameterFingerprint: receipt.parameterFingerprint })), professionalReview: 'pending' })
  }
  return { sourceSha256: source.sha256, pages, nextPage: input.startPage! + pages.length <= source.pageCount ? input.startPage! + pages.length : null, professionalReviewComplete: false, notice: '页清点、文本抽取和区域渲染分别记录；渲染不证明已理解，更不构成专业复核。' }
}
