import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { mkdtempSync, mkdirSync, readFileSync, rmdirSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'
import { pruneRuntimeDebugMaps } from './prune-runtime-debug-maps.mjs'

const sourceMap = JSON.stringify({ version: 3, sources: ['source.ts'], mappings: '', sourcesContent: ['export const answer = 42'] })
const write = (path, text) => { mkdirSync(dirname(path), { recursive: true }); writeFileSync(path, text) }
function fixture(t) {
  const root = mkdtempSync(join(tmpdir(), 'agent-pi-prune-maps-'))
  t.after(() => rmSync(root, { recursive: true, force: true }))
  write(join(root, 'product/package.json'), JSON.stringify({ agentPiProduct: { edition: 'mainline' } }))
  write(join(root, 'deepseek-harness/package.json'), JSON.stringify({ name: '@deepseek-ai/dsh-root' }))
  mkdirSync(join(root, 'deepseek-harness/node_modules'), { recursive: true })
  mkdirSync(join(root, 'product/bundles/tender-host/node_modules'), { recursive: true })
  return root
}

test('staging removes only validated dependency debug maps and keeps core assets, licensed Office, source and user data', t => {
  const root = fixture(t)
  const remove = ['deepseek-harness/node_modules/dependency/index.js.map', 'product/bundles/tender-host/node_modules/pdf/worker.mjs.map']
  const keep = ['deepseek-harness/node_modules/dependency/index.js', 'deepseek-harness/node_modules/dependency/LICENSE',
    'deepseek-harness/node_modules/dependency/geography.map', 'deepseek-harness/node_modules/dependency/not-a-map.js.map',
    'product/vendor/dsh-univer-office/node_modules/renderer/index.js.map', 'product/knowledge/template.map',
    'product/skills/office/reference.js.map', 'product/bundles/engineering-bim/runtime/lib.js.map',
    'product/bundles/tender-host/lib/cad-decoder/sources/source.tar.gz', 'product/bundles/project-plan/runtime/sources/license-sources.jar',
    'dsh-home/sessions/history.js.map']
  for (const file of remove) write(join(root, file), sourceMap)
  for (const file of keep) write(join(root, file), file.endsWith('not-a-map.js.map') ? 'runtime asset' : sourceMap)
  const before = keep.map(file => readFileSync(join(root, file)))
  const planned = pruneRuntimeDebugMaps(root)
  assert.equal(planned.mode, 'dry-run')
  assert.equal(planned.files, 2)
  for (const file of remove) assert.equal(readFileSync(join(root, file), 'utf8'), sourceMap)
  const result = pruneRuntimeDebugMaps(root, { apply: true })
  assert.equal(result.bytes, Buffer.byteLength(sourceMap) * 2)
  assert.deepEqual(result.candidates.map(row => row.path).sort(), remove.sort())
  keep.forEach((file, index) => assert.deepEqual(readFileSync(join(root, file)), before[index], file))
  assert.equal(pruneRuntimeDebugMaps(root, { apply: true }).files, 0)
})

test('staging does not traverse dependency links or prune the independent tender edition', t => {
  const root = fixture(t)
  const outside = join(root, 'unrelated-package')
  write(join(outside, 'index.js.map'), sourceMap)
  symlinkSync(outside, join(root, 'deepseek-harness/node_modules/linked'), process.platform === 'win32' ? 'junction' : 'dir')
  assert.equal(pruneRuntimeDebugMaps(root, { apply: true }).files, 0)
  assert.equal(readFileSync(join(outside, 'index.js.map'), 'utf8'), sourceMap)
  write(join(root, 'product/package.json'), JSON.stringify({ agentPiProduct: { edition: 'tender' } }))
  assert.throws(() => pruneRuntimeDebugMaps(root, { apply: true }), /mainline/)
  write(join(root, 'product/package.json'), JSON.stringify({ agentPiProduct: { edition: 'mainline' } }))
  const modules = join(root, 'product/bundles/tender-host/node_modules')
  rmdirSync(modules)
  symlinkSync(outside, modules, process.platform === 'win32' ? 'junction' : 'dir')
  assert.throws(() => pruneRuntimeDebugMaps(root, { apply: true }), /Linked or non-directory dependency root/)
  assert.equal(readFileSync(join(outside, 'index.js.map'), 'utf8'), sourceMap)
})

test('packaging writes a source-bound cleanup receipt only after verifying the physical post-cleanup inventory', t => {
  const root = fixture(t)
  write(join(root, 'deepseek-harness/node_modules/library/index.js.map'), sourceMap)
  write(join(root, 'deepseek-harness/node_modules/library/index.js'), 'export const answer = 42\n')
  const script = new URL('./prune-runtime-debug-maps.mjs', import.meta.url)
  const result = JSON.parse(execFileSync(process.execPath, [fileURLToPath(script), '--apply', root], { encoding: 'utf8', windowsHide: true }))
  assert.equal(result.files, 1)
  const receipt = JSON.parse(readFileSync(join(root, 'RUNTIME-DEBUG-MAP-PRUNING.json'), 'utf8'))
  assert.equal(receipt.postRemovalInventoryVerified, true)
  assert.equal(receipt.scriptSha256, createHash('sha256').update(readFileSync(script)).digest('hex'))
  assert.equal(receipt.areas[0].beforeBytes - receipt.areas[0].afterBytes, Buffer.byteLength(sourceMap))
  assert.equal(receipt.areas[0].beforeFiles - receipt.areas[0].afterFiles, 1)
  assert.equal(readFileSync(join(root, 'deepseek-harness/node_modules/library/index.js'), 'utf8'), 'export const answer = 42\n')
})
