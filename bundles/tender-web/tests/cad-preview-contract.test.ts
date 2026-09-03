import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const root = resolve(here, '../../..')
const overlay = readFileSync(join(here, '../src/client/file-preview-overlay.js'), 'utf8')
const viewer = readFileSync(join(root, 'tools/mlightcad-poc/src/main.ts'), 'utf8')
const mainClientBytes = readFileSync(join(here, '../lib/client.js'))
const mainClient = mainClientBytes.toString('utf8')

test('CAD preview uses an isolated same-origin iframe', () => {
  assert.match(overlay, /else if \(isCad\)[\s\S]*?className: 'ap-cad-frame'/)
  assert.match(overlay, /className: 'ap-cad-frame'[\s\S]*?src: cadUrl/)
  assert.match(overlay, /className: 'ap-cad-frame'[\s\S]*?sandbox: 'allow-same-origin allow-scripts'/)
  assert.match(overlay, /event\.origin !== window\.location\.origin/)
  assert.match(overlay, /event\.source !== cadRef\.current\.contentWindow/)

  assert.match(viewer, /const explicitSource = params\.get\('src'\)/)
  assert.match(viewer, /sourceUrl\.origin !== window\.location\.origin/)
  assert.match(viewer, /credentials: 'same-origin'/)
  assert.match(viewer, /\/api\/agent-pi\/files\/raw\?cwd=/)
  assert.match(viewer, /window\.parent\.postMessage\(message, window\.location\.origin\)/)
})

test('CAD frame reports opened, error, and external-open events to its parent', () => {
  const openStart = viewer.indexOf('async function openDrawing')
  const openEnd = viewer.indexOf('async function openSelectedFile')
  assert.ok(openStart >= 0 && openEnd > openStart)
  const openDrawing = viewer.slice(openStart, openEnd)
  const opened = openDrawing.indexOf('const opened = await docManager.openDocument')
  const ready = openDrawing.indexOf("postToParent({ type: 'agent-pi-cad:ready' })")
  assert.ok(opened >= 0 && ready > opened, 'ready must be posted only after the document opens')

  assert.match(viewer, /postToParent\(\{ type: 'agent-pi-cad:error', message \}\)/)
  assert.match(viewer, /postToParent\(\{ type: 'agent-pi-cad:open-external' \}\)/)
  assert.match(overlay, /message\.type === 'agent-pi-cad:ready'/)
  assert.match(overlay, /message\.type === 'agent-pi-cad:error'/)
  assert.match(overlay, /message\.type === 'agent-pi-cad:open-external'[\s\S]*?openInExplorer\(cwd, file\.path/)
})

test('CAD preview keeps download and system-open actions without embedding its runtime in the main client', () => {
  assert.match(overlay, /isCad \? DocBtn\('系统打开'[\s\S]*?openInExplorer\(cwd, file\.path/)
  assert.match(overlay, /kind === 'binary' \|\| kind === 'pdf' \|\| kind === 'image' \|\| isOffice \|\| kind === 'html' \|\| isCad \? DocBtn\('下载原件'/)
  assert.match(overlay, /apiBlob\('\/api\/agent-pi\/files\/raw\?path=' \+ encodeURIComponent\(file\.path\)/)

  assert.ok(mainClient.includes('ap-cad-frame'), 'generated client must include the CAD overlay bridge')
  assert.doesNotMatch(mainClient, /@mlightcad\//)
  assert.doesNotMatch(mainClient, /libredwg-(?:parser-worker|web\.wasm)/)
  assert.doesNotMatch(mainClient, /AGFzbQ/)
  assert.equal(mainClientBytes.indexOf(Buffer.from([0x00, 0x61, 0x73, 0x6d])), -1)
})
