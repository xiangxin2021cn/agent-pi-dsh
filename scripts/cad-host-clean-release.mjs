import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { readFileSync, realpathSync, statSync } from 'node:fs'
import { dirname, isAbsolute, join, relative, resolve, sep } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const sha256 = bytes => createHash('sha256').update(bytes).digest('hex')
const inside = (base, path) => {
  const rel = relative(base, path)
  return !isAbsolute(rel) && rel !== '..' && !rel.startsWith('..' + sep)
}

/** The host decoder has independent patched source; the viewer receipt never authorizes it. */
export function verifyCadHostCleanRelease(product = root) {
  product = realpathSync(product)
  const runtime = realpathSync(join(product, 'bundles/tender-host/lib/cad-decoder'))
  assert.ok(inside(product, runtime), 'CAD host runtime outside product')
  const pinsPath = realpathSync(join(product, 'scripts/cad-host-clean-pins.json'))
  assert.ok(inside(product, pinsPath), 'CAD host pins outside product')
  const pins = JSON.parse(readFileSync(pinsPath, 'utf8'))
  assert.equal(pins.schema, 'agent-pi-dsh/cad-host-clean-pins/v1', 'CAD host pins schema')
  const receipt = realpathSync(join(runtime, 'CAD-HOST-CLEAN-BUILD.json'))
  assert.ok(inside(runtime, receipt), 'CAD host receipt outside runtime')
  const bytes = readFileSync(receipt)
  assert.equal(sha256(bytes), pins.manifestSha256, 'CAD host build receipt differs from reviewed pins')
  const manifest = JSON.parse(bytes.toString('utf8'))
  assert.equal(manifest.schema, 'agent-pi-dsh/cad-host-clean-build/v1', 'CAD host receipt schema')
  const verifyFile = file => {
    const path = realpathSync(join(runtime, file.path))
    assert.ok(inside(runtime, path), 'CAD host artifact outside runtime')
    assert.equal(statSync(path).size, file.bytes, 'CAD host artifact size: ' + file.path)
    const content = readFileSync(path)
    assert.equal(sha256(content), file.sha256, 'CAD host artifact hash: ' + file.path)
    return content
  }
  for (const name of ['libredwg-web.mjs', 'libredwg-wasm-factory.mjs', 'libredwg-web.wasm', 'GPL-3.0.txt']) {
    assert.ok(manifest.artifacts.some(file => file.path === name), 'CAD host artifact missing: ' + name)
  }
  for (const file of manifest.artifacts) {
    const content = verifyFile(file)
    if (file.path === 'libredwg-web.wasm') {
      assert.ok(content.length > 1024 * 1024 && WebAssembly.validate(content), 'CAD host WASM is not a complete module')
    }
    if (file.path === 'GPL-3.0.txt') assert.match(content.toString('utf8'), /GNU GENERAL PUBLIC LICENSE/)
  }
  assert.ok(manifest.sourceArchive?.path?.startsWith('sources/'), 'CAD host corresponding source must ship beside the decoder')
  verifyFile(manifest.sourceArchive)
  return manifest
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const manifest = verifyCadHostCleanRelease(resolve(process.argv[2] || root))
  console.log(JSON.stringify({ decoderVersion: manifest.decoderVersion, source: manifest.source, sourceArchive: manifest.sourceArchive, artifacts: manifest.artifacts }, null, 2))
}
