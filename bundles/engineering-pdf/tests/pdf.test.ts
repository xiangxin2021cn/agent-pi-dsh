import test, { before, after } from 'node:test'
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { mkdtemp, mkdir, writeFile, readFile, rm, symlink } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { EngineeringPdfEngine, PDF_LIMITS, validatePdfInput } from '../src/engine.ts'
import { registerEngineeringPdf } from '../src/plugin.ts'

const require = createRequire(new URL('../../tender-host/package.json', import.meta.url))
const { PDFDocument, StandardFonts, rgb, degrees, PDFName, PDFNumber } = require('pdf-lib')
const { createCanvas, loadImage } = require('@napi-rs/canvas')
let temp: string, cwd: string, file: string
const engine = new EngineeringPdfEngine()

async function fixture(version = 'A') {
  const pdf = await PDFDocument.create(), font = await pdf.embedFont(StandardFonts.Helvetica)
  const first = pdf.addPage([720, 540])
  first.drawText(`DRAWING REV ${version}`, { x: 30, y: 500, size: 12, font })
  first.drawText('REBAR 4C16 @100', { x: 200, y: 350, size: 3, font })
  first.drawText('SECOND NOTE', { x: 200, y: 330, size: 5, font })
  first.drawRectangle({ x: 210, y: 300, width: 30, height: 20, color: rgb(1, 0, 0) })
  first.drawLine({ start: { x: 100, y: 250 }, end: { x: 620, y: 250 }, thickness: 0.35, color: rgb(0, 0, 0) })
  const rotated = pdf.addPage([400, 300])
  rotated.setCropBox(20, 30, 360, 240)
  rotated.setRotation(degrees(90))
  rotated.node.set(PDFName.of('UserUnit'), PDFNumber.of(2))
  rotated.drawText('ROTATED DETAIL', { x: 60, y: 160, size: 6, font })
  rotated.drawRectangle({ x: 60, y: 80, width: 20, height: 20, color: rgb(1, 0, 0) })
  const scan = createCanvas(80, 80), context = scan.getContext('2d')
  context.fillStyle = 'white'; context.fillRect(0, 0, 80, 80)
  context.fillStyle = 'black'; context.fillRect(10, 10, 60, 5)
  const image = await pdf.embedPng(scan.toBuffer('image/png'))
  pdf.addPage([300, 300]).drawImage(image, { x: 30, y: 30, width: 240, height: 240 })
  return Buffer.from(await pdf.save())
}
async function pixels(path: string) {
  const image = await loadImage(await readFile(path)), canvas = createCanvas(image.width, image.height)
  const context = canvas.getContext('2d'); context.drawImage(image, 0, 0)
  return { width: image.width as number, height: image.height as number, at(x: number, y: number) { return [...context.getImageData(x, y, 1, 1).data] as number[] }, region(x: number, y: number, width: number, height: number) { return context.getImageData(x, y, width, height).data as Uint8Array } }
}
const run = (input: Record<string, unknown>) => engine.run({ path: 'drawing.pdf', ...input }, { cwd })

before(async () => {
  temp = await mkdtemp(join(tmpdir(), 'agent-pi-engineering-pdf-'))
  cwd = join(temp, 'workspace'); await mkdir(cwd)
  file = join(cwd, 'drawing.pdf'); await writeFile(file, await fixture())
})
after(async () => {
  await engine.dispose()
  if (process.env.PDF_KEEP_TEST_ARTIFACTS === '1') console.log(`PDF_QA_ARTIFACTS=${temp}`)
  else await rm(temp, { recursive: true, force: true })
})

test('inventory paginates real PDF dimensions including CropBox, rotation and UserUnit', async () => {
  const first = await run({ action: 'inventory', limit: 1 })
  assert.equal(first.source.pageCount, 3); assert.equal(first.nextPage, 2)
  assert.equal(first.pages[0].viewport.width, 720)
  const second = await run({ action: 'inventory', startPage: 2 })
  assert.deepEqual(second.pages[0].pdfViewBox, [20, 30, 380, 270])
  assert.equal(second.pages[0].rotation, 90); assert.equal(second.pages[0].userUnit, 2)
  assert.equal(second.pages[0].viewport.width, 480); assert.equal(second.pages[0].viewport.height, 720)
  assert.equal(second.pages[0].engineeringScale, null)
  assert.equal(second.nextPage, null)
})

test('text retains tiny text with original PDF matrix and rotated top-left coordinates', async () => {
  const result = await run({ action: 'text', page: 1 })
  const tiny = result.items.find((item: any) => item.text === 'REBAR 4C16 @100')
  assert.ok(tiny); assert.deepEqual(tiny.pdfTransform.slice(4), [200, 350])
  assert.deepEqual(tiny.viewportBaseline, [200, 190])
  assert.equal(tiny.boundsKind, 'text-advance-estimate')
  assert.ok(tiny.normalizedBounds.height > 0 && tiny.normalizedBounds.height < 0.01)
  const rotated = await run({ action: 'text', page: 2 })
  const text = rotated.items.find((item: any) => item.text === 'ROTATED DETAIL')
  assert.deepEqual(text.viewportBaseline, [260, 80])
})

test('text pagination retains every item and coverage merges returned ranges', async () => {
  const all = await run({ action: 'text', page: 1 })
  const batches: any[] = []; let offset: number | null = 0
  while (offset !== null) {
    const result = await run({ action: 'text', page: 1, offset, limit: 1 })
    batches.push(...result.items); offset = result.nextOffset
  }
  assert.deepEqual(batches, all.items)
  const coverage = await run({ action: 'coverage' })
  assert.equal(coverage.pages[0].textStatus, 'extracted')
  assert.equal(coverage.professionalReviewComplete, false)
  assert.ok(coverage.pages.every((page: any) => page.professionalReview === 'pending'))
})

test('ROI directly renders fine lines and tiny lettering at requested resolution', async () => {
  const roi = { x: 0.2, y: 0.25, width: 0.4, height: 0.4 }
  const result = await run({ action: 'render', page: 1, roi, dpi: 288 })
  assert.equal(result.width, 1152); assert.equal(result.height, 864)
  assert.equal(result.sourceResolution, 'direct-pdf-render')
  assert.deepEqual(result.pdfToImageTransform, [4, 0, 0, -4, -576, 1620])
  const rendered = await pixels(result.imagePath)
  assert.deepEqual(rendered.at(324, 380), [255, 0, 0, 255])
  const glyphs = rendered.region(224, 205, 130, 18)
  let dark = 0; for (let index = 0; index < glyphs.length; index += 4) if (glyphs[index] < 100 && glyphs[index + 1] < 100) dark++
  assert.ok(dark > 80, `3pt text needs true high resolution glyph pixels, found ${dark}`)
  const line = rendered.region(0, 619, 1000, 2)
  let linePixels = 0; for (let index = 0; index < line.length; index += 4) if (line[index] < 200) linePixels++
  assert.ok(linePixels > 900)
  const repeated = await run({ action: 'render', page: 1, roi, dpi: 288 })
  assert.equal(repeated.cacheHit, true); assert.equal(repeated.imagePath, result.imagePath)
  const changedDpi = await run({ action: 'render', page: 1, roi, dpi: 144 })
  assert.notEqual(changedDpi.parameterFingerprint, result.parameterFingerprint)
  assert.equal(changedDpi.width, 576)
  console.log(`PDF_QA_ROI=${result.imagePath}`)
})

test('rotation and UserUnit also affect actual pixel placement, not just inventory labels', async () => {
  const result = await run({ action: 'render', page: 2, dpi: 72 })
  const rendered = await pixels(result.imagePath)
  assert.equal(rendered.width, 480); assert.equal(rendered.height, 720)
  assert.deepEqual(rendered.at(120, 100), [255, 0, 0, 255])
  assert.deepEqual(rendered.at(20, 20), [255, 255, 255, 255])
  const crop = await run({ action: 'render', page: 2, dpi: 72, roi: { x: 0.1, y: 0.05, width: 0.5, height: 0.5 } })
  assert.deepEqual((await pixels(crop.imagePath)).at(72, 64), [255, 0, 0, 255])
  console.log(`PDF_QA_ROTATED=${result.imagePath}`)
})

test('no-text scan stays pending visual review and retains visible image content', async () => {
  const text = await run({ action: 'text', page: 3 })
  assert.equal(text.totalItems, 0); assert.equal(text.items.length, 0)
  assert.match(text.textNotice, /不能标为无图纸内容/)
  const image = await run({ action: 'render', page: 3, dpi: 72 })
  assert.deepEqual((await pixels(image.imagePath)).at(90, 68), [0, 0, 0, 255])
  const coverage = await run({ action: 'coverage' })
  assert.equal(coverage.pages[2].textStatus, 'no-text-visual-review')
  assert.equal(coverage.pages[2].renderedRegions.length, 1)
  assert.equal(coverage.pages[2].professionalReview, 'pending')
})

test('tile plans cover right/bottom edges with explicit overlap and pageable stable indices', async () => {
  const first = await run({ action: 'tiles', page: 1, dpi: 144, tilePixels: 512, overlapPixels: 64, limit: 2 })
  const rest = await run({ action: 'tiles', page: 1, dpi: 144, tilePixels: 512, overlapPixels: 64, offset: 2, limit: 100 })
  const tiles = [...first.tiles, ...rest.tiles]
  assert.equal(tiles.length, first.total); assert.equal(rest.nextOffset, null)
  assert.ok(tiles[0].roi.x + tiles[0].roi.width > tiles[1].roi.x)
  const last = tiles.at(-1)!.roi
  assert.ok(Math.abs(last.x + last.width - 1) < 1e-12)
  assert.ok(Math.abs(last.y + last.height - 1) < 1e-12)
  assert.ok(tiles.every((tile: any) => tile.visualReview === 'pending'))
  const rendered = await run({ action: 'render', page: 1, dpi: 144, roi: tiles.at(-1)!.roi })
  assert.ok(rendered.width <= 512 && rendered.height <= 512)
})

test('strict ROI, page, pixel, batch and file boundaries reject without clamping', async () => {
  for (const roi of [{ x: -0.1, y: 0, width: 1, height: 1 }, { x: 0.9, y: 0, width: 0.2, height: 1 }, { x: 0, y: 0, width: NaN, height: 1 }]) assert.throws(() => validatePdfInput({ action: 'render', path: 'drawing.pdf', roi }), /ROI/)
  assert.throws(() => validatePdfInput({ action: 'text', path: 'drawing.pdf', limit: 2001 }), /limit/)
  assert.throws(() => validatePdfInput({ action: 'inventory', path: 'drawing.pdf', limit: 51 }), /limit/)
  await assert.rejects(run({ action: 'render', page: 1, dpi: 600 }), /像素预算/)
  await assert.rejects(run({ action: 'inventory', startPage: 4 }), /实际页数/)
  await writeFile(join(temp, 'outside.pdf'), await fixture())
  await assert.rejects(run({ action: 'inventory', path: '../outside.pdf' }), /工作目录内/)
  await writeFile(join(cwd, 'not.pdf'), 'not a PDF')
  await assert.rejects(run({ action: 'inventory', path: 'not.pdf' }), /不是可识别/)
})

test('realpath blocks external junction sources and linked cache directories', async () => {
  const outside = join(temp, 'external'); await mkdir(outside); await writeFile(join(outside, 'drawing.pdf'), await fixture())
  await symlink(outside, join(cwd, 'external-link'), process.platform === 'win32' ? 'junction' : 'dir')
  await assert.rejects(run({ action: 'inventory', path: 'external-link/drawing.pdf' }), /链接指向工作目录外/)
  const bad = join(temp, 'bad-cache'); await mkdir(bad); await writeFile(join(bad, 'drawing.pdf'), await fixture())
  await symlink(outside, join(bad, '.agent-pi'), process.platform === 'win32' ? 'junction' : 'dir')
  await assert.rejects(engine.run({ action: 'inventory', path: 'drawing.pdf' }, { cwd: bad }), /缓存目录不能/)
})

test('cancelled calls do not create results and later valid calls still work', async () => {
  const controller = new AbortController(); controller.abort(new Error('test cancelled'))
  await assert.rejects(engine.run({ action: 'render', path: 'drawing.pdf', page: 1 }, { cwd, signal: controller.signal }), /test cancelled/)
  const next = await run({ action: 'inventory' }); assert.equal(next.source.pageCount, 3)
})

test('changed source bytes get a separate hash, cache and initially independent coverage', async () => {
  const previous = await run({ action: 'inventory' })
  await writeFile(file, await fixture('B'))
  const coverage = await run({ action: 'coverage' })
  assert.notEqual(coverage.source.sha256, previous.source.sha256)
  assert.ok(coverage.pages.every((page: any) => page.textStatus === 'not-extracted' && page.renderedRegions.length === 0))
})

test('actual plugin tool takes cwd and cancellation from executor, not model arguments', async () => {
  let tool: any, capability: any
  const disposers: (() => void)[] = []
  const effect = (factory: () => () => void) => disposers.push(factory())
  const pluginEngine = registerEngineeringPdf({ effect, tools: { register(value: any) { tool = value } }, systemPrompt: { section() {} }, inject(_names: string[], callback: (scope: any) => void) { callback({ effect, professionalCapabilities: { register(value: any) { capability = value; return () => { capability = undefined } } } }) } }, value => value)
  try {
    assert.equal(tool.name, 'engineering_pdf'); assert.ok(capability.limitations.length)
    const result = await tool.execute({ action: 'inventory', path: 'drawing.pdf', cwd: temp }, { agent: { session: { header: { cwd } } } })
    assert.equal(result.source.path, file)
    assert.equal(result.engineeringSync.status, 'unavailable')
    await assert.rejects(tool.execute({ action: 'inventory', path: 'drawing.pdf' }, { agent: {} }), /真实工作目录/)
    assert.equal(PDF_LIMITS.pixels, 16_000_000)
  } finally { await pluginEngine.dispose(); for (const dispose of disposers.reverse()) dispose() }
})

test('plugin records full page inventory and actual observed page in the shared engineering service', async () => {
  let tool: any, observation: any, failSync = false
  const pluginEngine = registerEngineeringPdf({ effect() {}, tools: { register(value: any) { tool = value } }, systemPrompt: { section() {} }, inject() {}, get(name: string) { assert.equal(name, 'engineering'); return { async recordObservation(sessionId: string, value: unknown) { assert.equal(sessionId, 'session-1'); if (failSync) throw new Error('ledger conflict'); observation = value; return { recorded: true, sourceId: 'pdf-source', revision: 3 } } } } }, value => value)
  const exec = { agent: { session: { id: 'session-1', header: { cwd } } } }
  try {
    const result = await tool.execute({ action: 'text', path: 'drawing.pdf', page: 2 }, exec)
    assert.equal(result.engineeringSync.status, 'synced')
    assert.equal(result.engineeringSync.sourceId, 'pdf-source')
    assert.equal(result.engineeringSync.revision, 3)
    assert.deepEqual(observation.inventory.map((item: any) => item.id), ['page:1', 'page:2', 'page:3'])
    assert.deepEqual(observation.observedIds, ['page:2'])
    assert.equal(observation.source.sha256, result.source.sha256)
    assert.equal(observation.details.professionalReview, 'pending')
    assert.match(observation.summary, /不等于完整识图或专业复核/)
    failSync = true
    const failed = await tool.execute({ action: 'render', path: 'drawing.pdf', page: 2, dpi: 72 }, exec)
    assert.equal(failed.engineeringSync.status, 'failed'); assert.match(failed.engineeringSync.message, /ledger conflict/)
    assert.ok(failed.imagePath)
  } finally { await pluginEngine.dispose() }
})
