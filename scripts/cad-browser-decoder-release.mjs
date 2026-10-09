import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { lstatSync, readFileSync, readdirSync, realpathSync } from 'node:fs'
import { dirname, isAbsolute, join, relative, resolve, sep } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { verifyCadHostCleanRelease } from './cad-host-clean-release.mjs'

const receiptName = 'scripts/cad-browser-decoder-release.json'
const receiptSha256 = '662a2fc0b8b167ff72e86d929cd0157eeceec1257906a0cd573f21268b35cb66'
const sha256 = bytes => createHash('sha256').update(bytes).digest('hex')
const inside = (root, path) => {
  const name = relative(root, path)
  return !isAbsolute(name) && name !== '..' && !name.startsWith(`..${sep}`)
}

/** Verify the fixed browser-worker/host-decoder composition without changing the clean viewer. */
export function verifyCadBrowserDecoderRelease(productRoot) {
  const root = realpathSync(productRoot)
  const read = path => {
    const file = realpathSync(join(root, path))
    assert.ok(inside(root, file), 'CAD browser decoder file escaped product: ' + path)
    return readFileSync(file)
  }
  const receipt = JSON.parse(read(receiptName).toString('utf8'))
  // Pin semantic JSON so Git line-ending conversion cannot change this identity.
  assert.equal(sha256(JSON.stringify(receipt)), receiptSha256, 'CAD browser decoder binding receipt changed')
  assert.equal(receipt.schema, 'agent-pi-dsh/cad-browser-decoder-release/v1')
  assert.equal(receipt.namespace, '/api/agent-pi/cad-viewer/host-decoder/')
  assert.equal(receipt.replacementAsset, 'workers/libredwg-web.wasm')
  const verifyFile = record => {
    const bytes = read(record.path)
    assert.equal(bytes.length, record.bytes, 'CAD browser decoder file size: ' + record.path)
    assert.equal(sha256(bytes), record.sha256, 'CAD browser decoder file hash: ' + record.path)
    return bytes
  }
  const base = JSON.parse(verifyFile(receipt.base.manifest).toString('utf8'))
  assert.equal(base.schema, 'agent-pi-dsh/cad-clean-build/v1')
  assert.equal(base.releaseVersion, '3.6.2')
  const viewer = 'bundles/tender-web/lib/cad-viewer'
  const files = new Set(['CAD-CLEAN-BUILD.json'])
  for (const file of base.runtimeFiles) {
    assert.ok(!files.has(file.path), 'Duplicate CAD clean viewer file')
    files.add(file.path)
    verifyFile({ ...file, path: viewer + '/' + file.path })
  }
  const actual = []
  const walk = (directory, prefix = '') => {
    for (const entry of readdirSync(directory)) {
      const file = join(directory, entry), name = prefix + entry, stat = lstatSync(file)
      assert.ok(!stat.isSymbolicLink(), 'CAD clean viewer contains a link: ' + name)
      if (stat.isDirectory()) walk(file, name + '/')
      else { assert.ok(stat.isFile(), 'Invalid CAD clean viewer file'); actual.push(name) }
    }
  }
  walk(join(root, viewer))
  assert.deepEqual(actual.sort(), [...files].sort(), 'CAD clean viewer file inventory changed')
  verifyFile(receipt.base.worker)
  verifyFile(receipt.base.wasm)
  verifyFile(receipt.patched.manifest)
  const host = verifyCadHostCleanRelease(root)
  assert.equal(host.decoderVersion, receipt.patched.decoderVersion)
  assert.deepEqual(host.sourceArchive, receipt.patched.sourceArchive, 'CAD browser decoder corresponding source changed')
  const wasm = verifyFile(receipt.patched.wasm)
  assert.ok(WebAssembly.validate(wasm), 'CAD browser decoder WASM is incomplete')
  return realpathSync(join(root, receipt.patched.wasm.path))
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const root = process.argv[2] || resolve(dirname(fileURLToPath(import.meta.url)), '..')
  console.log('CAD browser decoder verified: ' + verifyCadBrowserDecoderRelease(root))
}
