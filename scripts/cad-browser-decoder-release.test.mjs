import assert from 'node:assert/strict'
import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { test } from 'node:test'
import { verifyCadBrowserDecoderRelease } from './cad-browser-decoder-release.mjs'

const product = resolve(import.meta.dirname, '..')
const receiptPath = 'scripts/cad-browser-decoder-release.json'
const binding = JSON.parse(readFileSync(join(product, receiptPath)))

function fixture(t) {
  const root = mkdtempSync(join(tmpdir(), 'agent-pi-cad-browser-binding-'))
  t.after(() => rmSync(root, { recursive: true, force: true }))
  for (const path of [receiptPath, 'scripts/cad-host-clean-pins.json', 'bundles/tender-web/lib/cad-viewer', 'bundles/tender-host/lib/cad-decoder']) {
    mkdirSync(dirname(join(root, path)), { recursive: true })
    cpSync(join(product, path), join(root, path), { recursive: true })
  }
  return root
}

test('browser binding keeps the complete clean viewer and returns only the reviewed host WASM', t => {
  const root = fixture(t)
  assert.equal(verifyCadBrowserDecoderRelease(root), join(root, binding.patched.wasm.path))
  assert.notDeepEqual(readFileSync(join(root, binding.patched.wasm.path)), readFileSync(join(root, binding.base.wasm.path)))
})

for (const [label, path] of [
  ['clean manifest', binding.base.manifest.path],
  ['clean browser worker', binding.base.worker.path],
  ['clean WASM', binding.base.wasm.path],
  ['patched host manifest', binding.patched.manifest.path],
  ['patched host WASM', binding.patched.wasm.path],
  ['patched corresponding source', 'bundles/tender-host/lib/cad-decoder/' + binding.patched.sourceArchive.path],
]) {
  test('browser binding rejects altered ' + label, t => {
    const root = fixture(t), target = join(root, path)
    const bytes = readFileSync(target); bytes[bytes.length - 1] ^= 1
    writeFileSync(target, bytes)
    assert.throws(() => verifyCadBrowserDecoderRelease(root), /hash|receipt/)
  })
}

test('browser binding rejects changed receipt routes even when other files remain intact', t => {
  const root = fixture(t), receipt = structuredClone(binding)
  receipt.replacementAsset = 'workers/libredwg-parser-worker.js'
  writeFileSync(join(root, receiptPath), JSON.stringify(receipt))
  assert.throws(() => verifyCadBrowserDecoderRelease(root), /binding receipt changed/)
})

test('browser binding rejects missing or additional viewer files', t => {
  const root = fixture(t), extra = join(root, 'bundles/tender-web/lib/cad-viewer/unreviewed.js')
  writeFileSync(extra, 'unreviewed')
  assert.throws(() => verifyCadBrowserDecoderRelease(root), /file inventory changed/)
  rmSync(extra)
  rmSync(join(root, binding.base.worker.path))
  assert.throws(() => verifyCadBrowserDecoderRelease(root), /ENOENT/)
})

test('browser binding rejects a host WASM replaced by the original unpatched viewer WASM', t => {
  const root = fixture(t)
  cpSync(join(root, binding.base.wasm.path), join(root, binding.patched.wasm.path))
  assert.throws(() => verifyCadBrowserDecoderRelease(root), /size|hash/)
})
