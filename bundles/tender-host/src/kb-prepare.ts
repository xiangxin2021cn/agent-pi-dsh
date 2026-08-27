/**
 * Model-called PDF tool: probe a PDF, write a knowledge-pack folder,
 * extract text when the digital layer is enough, and rasterize pages so
 * the model can call official read_image. Nothing runs until the model
 * invokes kb_prepare_document.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { basename, isAbsolute, join, resolve } from 'node:path'
import { extractPdfTextMarkdown, probePdfText, readPdfPageText, type PdfTextProbe } from './pdf-text.ts'
import { renderPdfPages, type PdfRenderEngine } from './pdf-render.ts'
import { KB_PACK_KIND } from './kb-pack.ts'
import { KB_MANUSCRIPT_LAYOUT_RULE, manuscriptLooksUnstructured } from './kb-manuscript.ts'
import { KB_USER_TEMPLATE_CATEGORY, looksLikeUserTemplateName, resolveKbCategory } from './kb-template.ts'

export const KB_PREPARE_MAX_PAGES = 20

export interface KbPreparePage {
  page: number
  chars: number
  imagePath?: string
}

export interface KbPrepareResult {
  sourcePath: string
  packDir: string
  manuscriptPath?: string
  probe: PdfTextProbe
  route: 'text' | 'vision' | 'mixed'
  engine?: PdfRenderEngine | 'none'
  pages: KbPreparePage[]
  next: string[]
}

export interface KbPrepareInput {
  path: string
  cwd?: string
  startPage?: number
  endPage?: number
  images?: boolean
  category?: string
}

function resolveSource(path: string, cwd?: string): string {
  const resolved = isAbsolute(path) ? resolve(path) : resolve(cwd || process.cwd(), path)
  if (!existsSync(resolved)) throw new Error(`文件不存在：${resolved}`)
  if (!/\.pdf$/i.test(resolved)) throw new Error('kb_prepare_document 目前只处理 PDF。Word/扫描件请走知识库页 MinerU，或先另存为 PDF。')
  return resolved
}

function packDirFor(sourcePath: string, cwd?: string): string {
  const stem = basename(sourcePath).replace(/\.pdf$/i, '') || 'document'
  const parent = cwd ? resolve(cwd) : resolve(sourcePath, '..')
  return join(parent, `${stem}-知识包`)
}

function writeSkeletonPack(packDir: string, sourcePath: string, category?: string): void {
  const dest = join(packDir, 'pack.json')
  if (existsSync(dest)) return
  writeFileSync(dest, JSON.stringify({
    schemaVersion: 1,
    kind: KB_PACK_KIND,
    name: basename(sourcePath).replace(/\.pdf$/i, ''),
    category: resolveKbCategory(category || (looksLikeUserTemplateName(sourcePath) ? KB_USER_TEMPLATE_CATEGORY : '规范'), basename(sourcePath)),
    manuscript: 'manuscript.md',
    originalName: basename(sourcePath),
  }, null, 2) + '\n')
}

function nextSteps(result: Pick<KbPrepareResult, 'route' | 'pages' | 'manuscriptPath' | 'packDir'>): string[] {
  const steps: string[] = []
  if (result.route === 'text' && result.manuscriptPath) {
    steps.push('文本层只证明这份 PDF 能抽出字，不是可读解析稿。抽文本墙（整页一段、词中空格、目录点线散落）不得直接入库。')
    steps.push(KB_MANUSCRIPT_LAYOUT_RULE)
    steps.push('按文档自己的章/节/条/Clause 写好标题后再补 pack.json 的 units（偏移必须能 slice 还原），然后让用户右侧一键导入知识包。')
    if (manuscriptLooksUnstructured(readFileSync(result.manuscriptPath, 'utf8'))) {
      steps.push('当前 manuscript.md 几乎没有 Markdown 标题，预览会是墙。必须重写后再入库；排版对不上就再调 kb_prepare_document（默认出页图），然后 read_image。')
    }
  } else {
    steps.push('必须使用 DeepSeek-V4-Flash-Vision-Exp。官方 read / read_image 打不开 PDF，只能读本工具写出的 PNG。')
    steps.push('对 pages[].imagePath 逐页调用 read_image，按印刷页的层级写入 manuscript.md：章/节/条用 ATX 标题，目录用列表，表格用 Markdown 表，页前加 <!-- page N -->。')
    steps.push(KB_MANUSCRIPT_LAYOUT_RULE)
    steps.push('写完 pack.json 后告诉用户：右侧对该知识包文件夹或 pack.json 右键「一键导入知识包」。')
    if (result.pages.length > 0) {
      steps.push(`本批页：${result.pages[0]!.page}-${result.pages[result.pages.length - 1]!.page}。后面还有页就再调 kb_prepare_document，startPage=${result.pages[result.pages.length - 1]!.page + 1}。`)
    }
  }
  steps.push(`知识包目录：${result.packDir}`)
  return steps
}

export async function prepareKbDocument(input: KbPrepareInput): Promise<KbPrepareResult> {
  const sourcePath = resolveSource(input.path, input.cwd)
  const probe = await probePdfText(sourcePath)
  const wantImages = input.images !== false
  const startPage = Math.max(1, Math.floor(Number(input.startPage) || 1))
  const requestedEnd = Math.floor(Number(input.endPage) || 0)
  const defaultEnd = wantImages
    ? Math.min(probe.pageCount, startPage + KB_PREPARE_MAX_PAGES - 1)
    : probe.pageCount
  const endPage = Math.min(probe.pageCount, requestedEnd > 0 ? requestedEnd : defaultEnd)
  if (startPage > endPage) throw new Error(`页范围 ${startPage}-${endPage} 超出这份 PDF（共 ${probe.pageCount} 页）`)
  if (wantImages && endPage - startPage + 1 > KB_PREPARE_MAX_PAGES) {
    throw new Error(`一次最多栅格 ${KB_PREPARE_MAX_PAGES} 页。请用 startPage/endPage 分段。`)
  }

  const packDir = packDirFor(sourcePath, input.cwd)
  mkdirSync(join(packDir, 'pages'), { recursive: true })
  writeSkeletonPack(packDir, sourcePath, input.category)

  let manuscriptPath: string | undefined
  if (probe.useLocalText || !wantImages) {
    const extracted = await extractPdfTextMarkdown(sourcePath)
    manuscriptPath = join(packDir, 'manuscript.md')
    writeFileSync(manuscriptPath, extracted.markdown.endsWith('\n') ? extracted.markdown : `${extracted.markdown}\n`)
  }

  const pages: KbPreparePage[] = []
  let engine: KbPrepareResult['engine'] = 'none'
  if (wantImages) {
    const rendered = await renderPdfPages({
      filePath: sourcePath,
      destDir: join(packDir, 'pages'),
      startPage,
      endPage,
    })
    engine = rendered.engine
    for (const page of rendered.pages) {
      const text = await readPdfPageText(sourcePath, page.page).catch(() => '')
      pages.push({
        page: page.page,
        chars: text.replace(/\s+/g, '').length,
        imagePath: page.path,
      })
    }
  }

  const route: KbPrepareResult['route'] = wantImages
    ? (probe.kind === 'digital' ? 'mixed' : probe.kind === 'mixed' ? 'mixed' : 'vision')
    : 'text'
  const result: KbPrepareResult = {
    sourcePath,
    packDir,
    manuscriptPath,
    probe,
    route,
    engine,
    pages,
    next: [],
  }
  result.next = nextSteps(result)
  return result
}
