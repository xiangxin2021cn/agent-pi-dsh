import assert from 'node:assert/strict'
import { existsSync, mkdtempSync, statSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'
import { PDFDocument, StandardFonts } from 'pdf-lib'
import { ingestDocumentForKb } from '../src/mineru-ingest.ts'
import { classifyPdfText, extractPdfTextMarkdown, samplePageNumbers } from '../src/pdf-text.ts'
import { injectPageMarkers, mergeMineruParts, remapContentList, remapMarkdownPageMarkers } from '../src/mineru-merge.ts'
import {
  inspectPdf,
  materializePdfParts,
  mineruJobLimits,
  MINERU_LIGHT_MAX_BYTES,
  MINERU_LIGHT_MAX_PAGES,
  MINERU_PRECISION_MAX_PAGES,
  planPdfParts,
  writePdfPageRange,
} from '../src/pdf-parts.ts'

async function makePdf(pages: number, dest: string): Promise<string> {
  const doc = await PDFDocument.create()
  const font = await doc.embedFont(StandardFonts.Helvetica)
  for (let index = 1; index <= pages; index++) {
    const page = doc.addPage([400, 600])
    page.drawText(`Source page ${index}. Cement shall comply with GB 175 grade 42.5.`, { x: 24, y: 540, size: 11, font })
    page.drawText('Concrete strength shall not be lower than C30 in the specification.', { x: 24, y: 520, size: 11, font })
  }
  const { writeFileSync } = await import('node:fs')
  writeFileSync(dest, Buffer.from(await doc.save()))
  return dest
}

test('planPdfParts keeps a compliant file as one part', () => {
  assert.deepEqual(planPdfParts({
    pageCount: 180,
    fileBytes: 20 * 1024 * 1024,
    maxPages: MINERU_PRECISION_MAX_PAGES,
    maxBytes: 200 * 1024 * 1024,
  }), [{ startPage: 1, endPage: 180 }])
})

test('planPdfParts splits a 450-page spec into 200-page jobs', () => {
  const parts = planPdfParts({
    pageCount: 450,
    fileBytes: 40 * 1024 * 1024,
    maxPages: MINERU_PRECISION_MAX_PAGES,
    maxBytes: 200 * 1024 * 1024,
  })
  assert.deepEqual(parts, [
    { startPage: 1, endPage: 200 },
    { startPage: 201, endPage: 400 },
    { startPage: 401, endPage: 450 },
  ])
})

test('planPdfParts without token uses the 20-page / 10MB cap', () => {
  const limits = mineruJobLimits(false)
  assert.equal(limits.maxPages, MINERU_LIGHT_MAX_PAGES)
  assert.equal(limits.maxBytes, MINERU_LIGHT_MAX_BYTES)
  const parts = planPdfParts({
    pageCount: 80,
    fileBytes: 8 * 1024 * 1024,
    maxPages: limits.maxPages,
    maxBytes: limits.maxBytes,
  })
  assert.equal(parts.length, 4)
  assert.deepEqual(parts[0], { startPage: 1, endPage: 20 })
  assert.deepEqual(parts[3], { startPage: 61, endPage: 80 })
})

test('remapMarkdownPageMarkers restores original page numbers', () => {
  const part2 = ['<!-- page 1 -->', '第 2 页', 'Page 3'].join('\n')
  const shifted = remapMarkdownPageMarkers(part2, 200)
  assert.equal(shifted, ['<!-- page 201 -->', '第 202 页', 'Page 203'].join('\n'))
})

test('mergeMineruParts is one document with original coordinates', () => {
  const merged = mergeMineruParts([
    {
      startPage: 1,
      endPage: 200,
      markdown: '<!-- page 1 -->\n# 总则\n',
      contentList: [{ type: 'text', text: '总则', page_idx: 0 }],
    },
    {
      startPage: 201,
      endPage: 250,
      markdown: '<!-- page 1 -->\n# 附录\n',
      contentList: [{ type: 'text', text: '附录', page_idx: 0 }],
    },
  ])
  assert.match(merged.markdown, /<!-- page 1 -->/)
  assert.match(merged.markdown, /<!-- page 201 -->/)
  assert.doesNotMatch(merged.markdown, /<!-- page 1 -->\n# 附录/)
  assert.equal((merged.contentList[1] as { page_idx: number }).page_idx, 200)
})

test('injectPageMarkers uses content_list when markdown has no comments', () => {
  const md = '前言。\n\n混凝土强度等级不得低于 C30。\n'
  const marked = injectPageMarkers(md, [
    { page_idx: 0, text: '前言。' },
    { page_idx: 2, text: '混凝土强度等级不得低于 C30。' },
  ], 201)
  assert.match(marked, /<!-- page 201 -->/)
  assert.match(marked, /<!-- page 203 -->/)
})

test('remapContentList walks nested page_idx', () => {
  const next = remapContentList({ pdf_info: [{ page_idx: 3, text: 'x' }] }, 200) as {
    pdf_info: Array<{ page_idx: number }>
  }
  assert.equal(next.pdf_info[0]!.page_idx, 203)
})

test('pdf-lib split keeps requested page count', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'ap-pdf-'))
  const src = await makePdf(5, join(dir, 'src.pdf'))
  const info = await inspectPdf(src)
  assert.equal(info.pageCount, 5)
  const dest = join(dir, 'part.pdf')
  await writePdfPageRange(src, dest, 3, 5)
  assert.equal((await inspectPdf(dest)).pageCount, 3)
  const parts = await materializePdfParts(src, join(dir, 'parts'), [
    { startPage: 1, endPage: 2 },
    { startPage: 3, endPage: 5 },
  ])
  assert.equal(parts.length, 2)
  assert.equal((await inspectPdf(parts[0]!.path)).pageCount, 2)
  assert.ok(statSync(parts[0]!.path).size > 0)
})

test('ingestDocumentForKb runs MinerU parts serially and merges as one source', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'ap-ingest-'))
  const src = await makePdf(5, join(dir, 'spec.pdf'))
  const calls: string[] = []
  const progress: string[] = []
  const result = await ingestDocumentForKb(src, {
    hasToken: false,
    preferLocalText: false,
    workDir: join(dir, 'work'),
    onProgress: (message) => progress.push(message),
    extract: async (filePath) => {
      calls.push(filePath)
      const pages = (await inspectPdf(filePath)).pageCount
      return {
        markdown: `<!-- page 1 -->\n段 ${calls.length} 共 ${pages} 页\n`,
        via: 'lightweight',
        contentList: [{ type: 'text', text: `段 ${calls.length}`, page_idx: 0 }],
      }
    },
  })
  assert.equal(calls.length, 1)
  assert.equal(result.partCount, 1)
  assert.match(result.markdown, /<!-- page 1 -->/)

  const oversize = await ingestDocumentForKb(src, {
    hasToken: false,
    preferLocalText: false,
    workDir: join(dir, 'work2'),
    extract: async (filePath) => {
      const pages = (await inspectPdf(filePath)).pageCount
      return {
        markdown: `<!-- page 1 -->\n拆段 ${pages} 页\n`,
        via: 'lightweight',
        contentList: [{ page_idx: 0, text: '拆段' }],
      }
    },
  })
  // 5 pages, no token, 20-page cap → still one part
  assert.equal(oversize.partCount, 1)

  const long = await makePdf(45, join(dir, 'long.pdf'))
  const serial: string[] = []
  const split = await ingestDocumentForKb(long, {
    hasToken: false,
    preferLocalText: false,
    workDir: join(dir, 'work3'),
    onProgress: (message) => progress.push(message),
    extract: async (filePath) => {
      serial.push(filePath)
      const pages = (await inspectPdf(filePath)).pageCount
      return {
        markdown: `<!-- page 1 -->\n作业 ${serial.length}\n`,
        via: 'lightweight',
        contentList: [{ page_idx: 0, text: `作业 ${serial.length}`, extra: pages }],
      }
    },
  })
  assert.equal(serial.length, 3)
  assert.equal(split.partCount, 3)
  assert.match(split.markdown, /<!-- page 1 -->/)
  assert.match(split.markdown, /<!-- page 21 -->/)
  assert.match(split.markdown, /<!-- page 41 -->/)
  assert.equal((split.contentList[1] as { page_idx: number }).page_idx, 20)
  assert.ok(progress.some((line) => line.includes('拆成 3 段')))
  assert.ok(progress.some((line) => line.includes('第 2/3 段')))
  assert.equal(existsSync(join(dir, 'work3')), false)
})

test('samplePageNumbers covers head, middle, and tail', () => {
  const pages = samplePageNumbers(400)
  assert.ok(pages.includes(1))
  assert.ok(pages.includes(10))
  assert.ok(pages.includes(400))
  assert.ok(pages.some((page) => page > 10 && page < 397))
  assert.ok(pages.length < 20)
})

test('classifyPdfText sends digital files local and scanned files to OCR', () => {
  const digital = classifyPdfText(Array.from({ length: 10 }, (_, index) => ({ page: index + 1, chars: 200 })))
  assert.equal(digital.kind, 'digital')
  assert.equal(digital.useLocalText, true)
  assert.equal(digital.useOcr, false)

  const scanned = classifyPdfText(Array.from({ length: 10 }, (_, index) => ({ page: index + 1, chars: index === 0 ? 12 : 0 })))
  assert.equal(scanned.kind, 'scanned')
  assert.equal(scanned.useLocalText, false)
  assert.equal(scanned.useOcr, true)

  const mixed = classifyPdfText([
    { page: 1, chars: 200 },
    { page: 2, chars: 200 },
    { page: 3, chars: 0 },
    { page: 4, chars: 0 },
    { page: 5, chars: 180 },
  ])
  assert.equal(mixed.kind, 'mixed')
  assert.equal(mixed.useLocalText, false)
  assert.equal(mixed.useOcr, false)
})

test('digital PDF uses the local text channel and never calls MinerU', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'ap-local-'))
  const src = await makePdf(4, join(dir, 'text.pdf'))
  const extracted = await extractPdfTextMarkdown(src)
  assert.match(extracted.markdown, /<!-- page 1 -->/)
  assert.match(extracted.markdown, /Source page 4/)
  assert.ok(extracted.chars > 40)

  let mineruCalls = 0
  const result = await ingestDocumentForKb(src, {
    hasToken: false,
    workDir: join(dir, 'work'),
    extract: async () => {
      mineruCalls += 1
      return { markdown: 'should not run', via: 'lightweight' }
    },
  })
  assert.equal(mineruCalls, 0)
  assert.equal(result.via, 'local')
  assert.equal(result.ocr, false)
  assert.match(result.markdown, /<!-- page 2 -->/)
})

test('mixed text layer goes to MinerU with OCR off', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'ap-mixed-'))
  const src = await makePdf(3, join(dir, 'mixed.pdf'))
  const flags: boolean[] = []
  const result = await ingestDocumentForKb(src, {
    hasToken: true,
    workDir: join(dir, 'work'),
    probe: async () => ({
      kind: 'mixed',
      pageCount: 3,
      coverage: 0.5,
      avgChars: 90,
      useOcr: false,
      useLocalText: false,
      samples: [],
    }),
    extract: async (_path, options) => {
      flags.push(options?.isOcr !== false)
      return { markdown: '<!-- page 1 -->\n表\n', via: 'precision' }
    },
  })
  assert.equal(result.route, 'mineru')
  assert.equal(result.ocr, false)
  assert.deepEqual(flags, [false])
})
