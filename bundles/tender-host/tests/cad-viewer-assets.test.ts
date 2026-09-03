import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'
import { cadViewerAssetPath, cadViewerUrl, readCadViewerAsset } from '../src/cad-viewer-assets.ts'

const here = dirname(fileURLToPath(import.meta.url))

test('CAD viewer asset resolver rejects traversal and unknown files', () => {
  assert.equal(cadViewerAssetPath('../http.ts'), null)
  assert.equal(cadViewerAssetPath('assets/../../http.ts'), null)
  assert.equal(cadViewerAssetPath('workers\\..\\index.html'), null)
  assert.equal(cadViewerAssetPath('missing.js'), null)
})

test('CAD viewer URL keeps workspace and drawing paths encoded', () => {
  const cwd = 'C:\\项目 1 & 审核'
  const path = 'C:\\项目 1 & 审核\\图纸\\总图#1?复核.dwg'
  const url = cadViewerUrl(cwd, path)
  assert.match(url, /^\/api\/agent-pi\/cad-viewer\/index\.html\?/)
  const parsed = new URL(url, 'http://127.0.0.1')
  assert.equal(parsed.origin, 'http://127.0.0.1')
  assert.equal(parsed.searchParams.get('cwd'), cwd)
  assert.equal(parsed.searchParams.get('path'), path)
})

test('CAD viewer serves HTML, workers, WASM, and offline font assets with strict MIME types', () => {
  const html = readCadViewerAsset('index.html')
  const worker = readCadViewerAsset('workers/libredwg-parser-worker.js')
  const wasm = readCadViewerAsset('workers/libredwg-web.wasm')
  const fontManifest = readCadViewerAsset('resources/fonts/fonts.json')
  const font = readCadViewerAsset('resources/fonts/SourceHanSansCN-Regular.otf')
  assert.ok(html && html.body.length > 0)
  assert.equal(html.mime, 'text/html; charset=utf-8')
  assert.ok(worker && worker.body.length > 0)
  assert.equal(worker.mime, 'text/javascript; charset=utf-8')
  assert.ok(wasm && wasm.body.length > 8)
  assert.equal(wasm.mime, 'application/wasm')
  assert.ok(fontManifest && fontManifest.body.length > 0)
  assert.equal(fontManifest.mime, 'application/json; charset=utf-8')
  assert.ok(font && font.body.length > 8_000_000)
  assert.equal(font.mime, 'font/otf')
})

test('CAD asset HTTP route supports worker HEAD probes without weakening content sniffing', () => {
  const http = readFileSync(join(here, '../src/http.ts'), 'utf8')
  assert.match(http, /\(req\.method === 'GET' \|\| req\.method === 'HEAD'\)[\s\S]*?\/api\/agent-pi\/cad-viewer\//)
  assert.match(http, /'x-content-type-options': 'nosniff'/)
  assert.match(http, /res\.end\(req\.method === 'HEAD' \? undefined : file\.body\)/)
})
