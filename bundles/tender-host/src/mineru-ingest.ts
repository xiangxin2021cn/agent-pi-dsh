/**
 * Knowledge-base MinerU ingest: preflight PDF pages/size, split to official
 * caps, run jobs serially, merge markdown/JSON with original page numbers.
 */
import { rmSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { extractDocumentToMarkdown, mineruStatus } from './mineru.ts'
import { mergeMineruParts, type MineruPartResult } from './mineru-merge.ts'
import {
  inspectPdf,
  isPdfPath,
  materializePdfParts,
  mineruJobLimits,
  planPdfParts,
  type PdfPartFile,
} from './pdf-parts.ts'
import { extractPdfTextMarkdown, probePdfText, type PdfTextProbe } from './pdf-text.ts'
import { standardizeKbMarkdown } from './kb-md-standardize.ts'

export type MineruExtract = typeof extractDocumentToMarkdown

export interface MineruIngestResult {
  markdown: string
  contentList: unknown[]
  partCount: number
  pageCount?: number
  via: 'precision' | 'lightweight' | 'mixed' | 'local'
  route?: 'local' | 'mineru'
  ocr?: boolean
}

export async function ingestDocumentForKb(
  filePath: string,
  options?: {
    isOcr?: boolean
    preferLocalText?: boolean
    hasToken?: boolean
    workDir?: string
    extract?: MineruExtract
    probe?: (path: string) => Promise<PdfTextProbe>
    extractLocal?: (path: string) => Promise<{ markdown: string; pageCount: number; chars: number }>
    onProgress?: (message: string, percent?: number) => void
  },
): Promise<MineruIngestResult> {
  const extract = options?.extract ?? extractDocumentToMarkdown
  const hasToken = options?.hasToken ?? mineruStatus().configured
  const onProgress = options?.onProgress
  const limits = mineruJobLimits(hasToken)
  const preferLocalText = options?.preferLocalText !== false

  if (!isPdfPath(filePath)) {
    onProgress?.('正在用 MinerU 解析…', 20)
    const one = await extract(filePath, { isOcr: options?.isOcr !== false })
    return {
      markdown: standardizeKbMarkdown(one.markdown),
      contentList: listOrEmpty(one.contentList),
      partCount: 1,
      via: one.via,
      route: 'mineru',
      ocr: options?.isOcr !== false,
    }
  }

  let probe: PdfTextProbe | undefined
  if (preferLocalText) {
      onProgress?.('正在检测是否可本机抽取…', 8)
    try {
      probe = await (options?.probe ?? probePdfText)(filePath)
    } catch {
      probe = undefined
    }
    if (probe?.useLocalText) {
      onProgress?.(`本机抽取文本（${probe.pageCount} 页）…`, 28)
      try {
        const local = await (options?.extractLocal ?? extractPdfTextMarkdown)(filePath)
        const minChars = Math.max(80, Math.floor(local.pageCount * 40))
        if (local.markdown.trim() && local.chars >= minChars) {
          return {
            markdown: local.markdown,
            contentList: [],
            partCount: 1,
            pageCount: local.pageCount,
            via: 'local',
            route: 'local',
            ocr: false,
          }
        }
        onProgress?.('本机抽取内容偏少，改走 MinerU…', 32)
      } catch {
        onProgress?.('本机抽取失败，改走 MinerU…', 32)
      }
    }
  }

  const isOcr = options?.isOcr !== undefined ? options.isOcr : (probe?.useOcr ?? true)

  let inspected: { pageCount: number; fileBytes: number }
  try {
    inspected = await inspectPdf(filePath)
  } catch (error) {
    const fileBytes = statSync(filePath).size
    if (fileBytes > limits.maxBytes) {
      const reason = error instanceof Error ? error.message : String(error)
      throw new Error(`无法读取这份 PDF 的页数，且体积超过官方上限。${reason}`)
    }
    onProgress?.('无法预检页数，按整文件交给 MinerU…', 18)
    const one = await extract(filePath, { isOcr })
    return {
      markdown: one.markdown,
      contentList: listOrEmpty(one.contentList),
      partCount: 1,
      via: one.via,
      route: 'mineru',
      ocr: isOcr,
    }
  }
  const plan = planPdfParts({
    pageCount: inspected.pageCount,
    fileBytes: inspected.fileBytes,
    maxPages: limits.maxPages,
    maxBytes: limits.maxBytes,
  })
  const ocrHint = isOcr ? 'OCR' : '关闭 OCR'

  if (plan.length === 1 && plan[0]!.startPage === 1 && plan[0]!.endPage === inspected.pageCount) {
    onProgress?.(
      inspected.pageCount > 1
        ? `正在用 MinerU 解析（${inspected.pageCount} 页，${ocrHint}）…`
        : `正在用 MinerU 解析（${ocrHint}）…`,
      40,
    )
    const one = await extract(filePath, { isOcr })
    const merged = mergeMineruParts([{
      markdown: one.markdown,
      contentList: one.contentList,
      startPage: 1,
      endPage: inspected.pageCount,
    }])
    return {
      markdown: merged.markdown,
      contentList: merged.contentList,
      partCount: 1,
      pageCount: inspected.pageCount,
      via: one.via,
      route: 'mineru',
      ocr: isOcr,
    }
  }

  const workDir = options?.workDir
  if (!workDir) throw new Error('拆页作业缺少工作目录')
  onProgress?.(`超过官方上限，拆成 ${plan.length} 段串行解析（共 ${inspected.pageCount} 页，${ocrHint}）…`, 18)
  const files = await materializePdfParts(filePath, workDir, plan)
  try {
    assertPartsFit(files, limits, hasToken)
    const parts: MineruPartResult[] = []
    const vias = new Set<string>()
    for (let index = 0; index < files.length; index++) {
      const file = files[index]!
      onProgress?.(
        `MinerU 解析第 ${index + 1}/${files.length} 段（第 ${file.startPage}–${file.endPage} 页）…`,
        20 + Math.round(70 * ((index + 1) / files.length)),
      )
      const extracted = await extract(file.path, { isOcr })
      vias.add(extracted.via)
      parts.push({
        markdown: extracted.markdown,
        contentList: extracted.contentList,
        startPage: file.startPage,
        endPage: file.endPage,
      })
    }
    onProgress?.('正在合并解析稿…', 94)
    const merged = mergeMineruParts(parts)
    if (!merged.markdown.trim()) throw new Error('合并后的解析稿为空')
    const via = vias.size === 1 ? [...vias][0]! : 'mixed'
    return {
      markdown: merged.markdown,
      contentList: merged.contentList,
      partCount: parts.length,
      pageCount: inspected.pageCount,
      via: via as MineruIngestResult['via'],
      route: 'mineru',
      ocr: isOcr,
    }
  } finally {
    rmSync(workDir, { recursive: true, force: true })
  }
}

function listOrEmpty(data: unknown): unknown[] {
  return Array.isArray(data) ? data : []
}

function assertPartsFit(files: PdfPartFile[], limits: { maxPages: number; maxBytes: number }, hasToken: boolean): void {
  for (const file of files) {
    const pages = file.endPage - file.startPage + 1
    if (pages > limits.maxPages) {
      throw new Error(`拆段后仍有 ${pages} 页，超过官方 ${limits.maxPages} 页上限`)
    }
    if (file.bytes > limits.maxBytes) {
      throw new Error(
        hasToken
          ? `拆段后仍有 ${Math.round(file.bytes / (1024 * 1024))}MB，超过官方 200MB 上限。请压缩后再入库。`
          : `拆段后仍超过 10MB。请在知识库页填写 MinerU Token：https://mineru.net/apiManage/token`,
      )
    }
  }
}
