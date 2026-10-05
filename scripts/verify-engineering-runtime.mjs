import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { existsSync, mkdtempSync, readFileSync, readdirSync, realpathSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, isAbsolute, join, relative, resolve, sep } from 'node:path'
import { tmpdir } from 'node:os'
import { pathToFileURL } from 'node:url'

// Run against the actual staged product, not this script's development imports.
const product = resolve(process.argv[2] || '.')
const require = createRequire(pathToFileURL(join(product, 'bundles/tender-host/package.json')))
const workspace = mkdtempSync(join(tmpdir(), 'agent-pi-engineering-runtime-'))
let pdfEngine
try {
  for (const name of ['pdfjs-dist/package.json', 'pdf-lib', '@napi-rs/canvas', '@mlightcad/libredwg-web', '@mlightcad/data-model', '@mlightcad/libredwg-converter']) {
    const rel = relative(realpathSync(product), realpathSync(require.resolve(name)))
    assert.ok(!isAbsolute(rel) && rel !== '..' && !rel.startsWith(`..${sep}`), `${name} resolved outside the staged product`)
  }
  const pdfRoot = dirname(require.resolve('pdfjs-dist/package.json'))
  for (const name of ['cmaps', 'standard_fonts', 'wasm']) {
    assert.ok(readdirSync(join(pdfRoot, name)).length > 0, `Missing PDF ${name} assets`)
  }
  const { PDFDocument, StandardFonts, rgb } = require('pdf-lib')
  const { createCanvas, loadImage } = require('@napi-rs/canvas')
  const pdf = await PDFDocument.create(), font = await pdf.embedFont(StandardFonts.Helvetica)
  const page = pdf.addPage([200, 100])
  page.drawText('REBAR 4C16', { x: 20, y: 60, size: 3, font })
  page.drawRectangle({ x: 40, y: 20, width: 10, height: 10, color: rgb(1, 0, 0) })
  writeFileSync(join(workspace, 'detail.pdf'), await pdf.save())
  const { EngineeringPdfEngine } = await import(pathToFileURL(join(product, 'bundles/engineering-pdf/src/engine.ts')).href)
  pdfEngine = new EngineeringPdfEngine()
  const input = { path: 'detail.pdf', page: 1 }
  const text = await pdfEngine.run({ ...input, action: 'text' }, { cwd: workspace })
  assert.ok(text.items.some(item => item.text === 'REBAR 4C16'))
  const result = await pdfEngine.run({ ...input, action: 'render', dpi: 288, roi: { x: 0.1, y: 0.2, width: 0.4, height: 0.7 } }, { cwd: workspace })
  assert.equal(result.width, 320)
  assert.equal(result.height, 280)
  const image = await loadImage(readFileSync(result.imagePath)), canvas = createCanvas(image.width, image.height)
  const context = canvas.getContext('2d'); context.drawImage(image, 0, 0)
  assert.deepEqual([...context.getImageData(100, 220, 1, 1).data], [255, 0, 0, 255])
  const workers = join(product, 'bundles/tender-web/lib/cad-viewer/workers')
  assert.ok(existsSync(join(workers, 'libredwg-web.wasm')), 'DWG WASM must ship in the clean viewer workers directory')
  const { LibreDwg } = await import(pathToFileURL(require.resolve('@mlightcad/libredwg-web').replace('libredwg-web.umd.cjs', 'libredwg-web.js')).href)
  const libredwg = await LibreDwg.create(workers.replaceAll('\\', '/'))
  assert.equal(typeof libredwg.dwg_read_data, 'function')
  const { AcDbDatabase } = require('@mlightcad/data-model')
  const { AcDbLibreDwgConverter } = require('@mlightcad/libredwg-converter')
  assert.equal(typeof AcDbLibreDwgConverter, 'function')
  assert.match(new AcDbDatabase().dxfOut(), /SECTION/)
  console.log(JSON.stringify({ product, pdf: { text: true, roiPixels: [result.width, result.height], nativeCanvas: true, assets: ['cmaps', 'standard_fonts', 'wasm'] }, cad: { wasmInitialized: true, databaseLoaded: true, converterLoaded: true, note: 'DWG conversion accuracy is not asserted by this runtime loading test.' } }, null, 2))
} finally {
  await pdfEngine?.dispose()
  rmSync(workspace, { recursive: true, force: true })
}
