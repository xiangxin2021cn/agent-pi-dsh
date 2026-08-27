import assert from 'node:assert/strict'
import { existsSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'
import { PDFDocument, StandardFonts } from 'pdf-lib'
import { resetPendingVisionContext, readVisionImages } from '../src/attachment-context.ts'
import { prepareKbDocument } from '../src/kb-prepare.ts'
import { manuscriptLooksUnstructured } from '../src/kb-manuscript.ts'

async function makePdf(pages: number, dest: string, extra = ''): Promise<string> {
  const doc = await PDFDocument.create()
  const font = await doc.embedFont(StandardFonts.Helvetica)
  for (let index = 1; index <= pages; index++) {
    const page = doc.addPage([400, 600])
    page.drawText(`Clause 8.${index} Source page ${index}.`, { x: 24, y: 540, size: 14, font })
    page.drawText('The Contractor shall be entitled to an extension of time.', { x: 24, y: 516, size: 11, font })
    if (extra) page.drawText(extra, { x: 24, y: 492, size: 10, font })
  }
  writeFileSync(dest, Buffer.from(await doc.save()))
  return dest
}

test('prepareKbDocument extracts a digital PDF into a knowledge-pack manuscript', async () => {
  const cwd = mkdtempSync(join(tmpdir(), 'ap-kb-prep-text-'))
  const pdf = await makePdf(2, join(cwd, 'fidic-excerpt.pdf'), 'Delay caused by exceptionally adverse climatic conditions shall be assessed from site records.')
  const result = await prepareKbDocument({ path: pdf, cwd, images: false })
  assert.equal(result.probe.kind, 'digital')
  assert.equal(result.route, 'text')
  assert.ok(result.manuscriptPath && existsSync(result.manuscriptPath))
  const manuscript = readFileSync(result.manuscriptPath, 'utf8')
  assert.match(manuscript, /Clause 8\.1/)
  assert.match(manuscript, /<!-- page 2 -->/)
  assert.equal(result.pages.filter((page) => page.imagePath).length, 0)
  assert.ok(existsSync(join(result.packDir, 'pack.json')))
  const nextText = result.next.join('\n')
  assert.match(nextText, /抽文本墙|可读 Markdown|ATX/)
  if (manuscriptLooksUnstructured(manuscript)) {
    assert.match(nextText, /几乎没有 Markdown 标题|必须重写/)
  }
})

test('prepareKbDocument defaults to page PNGs even for a digital PDF', async () => {
  const cwd = mkdtempSync(join(tmpdir(), 'ap-kb-prep-default-img-'))
  const pdf = await makePdf(2, join(cwd, 'digital-with-pages.pdf'), 'Delay caused by exceptionally adverse climatic conditions shall be assessed from site records.')
  const result = await prepareKbDocument({ path: pdf, cwd })
  assert.equal(result.probe.kind, 'digital')
  assert.equal(result.route, 'mixed')
  assert.ok(result.manuscriptPath && existsSync(result.manuscriptPath))
  assert.equal(result.pages.length, 2)
  for (const page of result.pages) {
    assert.ok(page.imagePath && existsSync(page.imagePath))
    const magic = readFileSync(page.imagePath).subarray(0, 4)
    assert.deepEqual([...magic], [0x89, 0x50, 0x4e, 0x47])
  }
})

test('manuscriptLooksUnstructured flags a page-comment wall without headings', () => {
  const wall = [
    '<!-- page 1 -->',
    '',
    'CHAPTER 2: SERVICES FOREWORD This document is amende d by i ndustry ... '.repeat(4),
    '<!-- page 2 -->',
    '',
    'PART A: SPECIFICATIO NS CONTENTS 2 - 1 2 - 16 ... '.repeat(4),
  ].join('\n')
  assert.equal(manuscriptLooksUnstructured(wall), true)
  assert.equal(manuscriptLooksUnstructured('# A2.1.1 SCOPE\n\nThe Contractor shall trench.\n'), false)
})

test('prepareKbDocument with images writes PNG pages the official read_image can open', async () => {
  const cwd = mkdtempSync(join(tmpdir(), 'ap-kb-prep-img-'))
  const pdf = await makePdf(2, join(cwd, 'scan-like.pdf'))
  const result = await prepareKbDocument({ path: pdf, cwd, images: true, endPage: 2 })
  assert.ok(result.engine === 'pdfjs-canvas' || result.engine === 'chromium')
  assert.equal(result.pages.length, 2)
  for (const page of result.pages) {
    assert.ok(page.imagePath && existsSync(page.imagePath))
    const magic = readFileSync(page.imagePath).subarray(0, 4)
    assert.deepEqual([...magic], [0x89, 0x50, 0x4e, 0x47])
  }
})

test('prepareKbDocument honors a page window', async () => {
  const cwd = mkdtempSync(join(tmpdir(), 'ap-kb-prep-win-'))
  const pdf = await makePdf(4, join(cwd, 'window.pdf'))
  const result = await prepareKbDocument({ path: pdf, cwd, images: true, startPage: 3, endPage: 4 })
  assert.deepEqual(result.pages.map((page) => page.page), [3, 4])
})

test('attaching a PDF tells the model to call kb_prepare_document', async () => {
  resetPendingVisionContext()
  const cwd = mkdtempSync(join(tmpdir(), 'ap-kb-prep-hint-'))
  const pdf = join(cwd, '规范.pdf')
  writeFileSync(pdf, '%PDF-1.4')
  await readVisionImages({
    sessionId: 'session-pdf',
    cwd,
    files: [{ name: '规范.pdf', path: pdf, kind: 'file' }],
  })
  const { peekPendingVisionContext } = await import('../src/attachment-context.ts')
  const text = peekPendingVisionContext('session-pdf')
  assert.match(text, /kb_prepare_document/)
  assert.match(text, /read_image/)
  assert.match(text, /kb-vision-pack/)
  assert.match(text, /YOU must call kb_prepare_document/)
  assert.match(text, /has not converted/)
  assert.match(text, /readable Markdown|ATX headings/)
})
