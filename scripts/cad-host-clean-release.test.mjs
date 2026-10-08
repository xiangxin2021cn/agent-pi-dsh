import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, renameSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import test from 'node:test'
import { verifyCadHostCleanRelease } from './cad-host-clean-release.mjs'

const hash = bytes => createHash('sha256').update(bytes).digest('hex')
const leb = number => {
  const bytes = []
  do { const next = number & 127; number >>>= 7; bytes.push(next | (number ? 128 : 0)) } while (number)
  return Buffer.from(bytes)
}
const payload = Buffer.concat([Buffer.from([1, 120]), Buffer.alloc(1024 * 1024)])
const wasm = Buffer.concat([Buffer.from('0061736d01000000', 'hex'), Buffer.from([0]), leb(payload.length), payload])

function fixture(t) {
  const directory = mkdtempSync(join(tmpdir(), 'cad-host-release-test-')), product = join(directory, 'product')
  t.after(() => rmSync(directory, { recursive: true, force: true }))
  const runtime = join(product, 'bundles/tender-host/lib/cad-decoder'), scripts = join(product, 'scripts')
  mkdirSync(join(runtime, 'sources'), { recursive: true }); mkdirSync(scripts)
  const files = {
    'libredwg-web.mjs': Buffer.from('export const LibreDwg = {};\n'),
    'libredwg-wasm-factory.mjs': Buffer.from('export default () => ({});\n'),
    'libredwg-web.wasm': wasm,
    'GPL-3.0.txt': Buffer.from('GNU GENERAL PUBLIC LICENSE\nVersion 3 fixture\n'),
    'sources/corresponding-source.tar.gz': Buffer.from('fixture source archive bytes'),
  }
  const describe = (path, bytes) => ({ path, bytes: bytes.length, sha256: hash(bytes) })
  for (const [path, bytes] of Object.entries(files)) writeFileSync(join(runtime, path), bytes)
  const manifest = {
    schema: 'agent-pi-dsh/cad-host-clean-build/v1', decoderVersion: '0.7.10-patched',
    source: { commit: '5909bd2bb87fa1168838e1295188f3ee603618eb' },
    artifacts: Object.entries(files).filter(([path]) => !path.startsWith('sources/')).map(([path, bytes]) => describe(path, bytes)),
    sourceArchive: describe('sources/corresponding-source.tar.gz', files['sources/corresponding-source.tar.gz']),
  }
  const receipt = join(runtime, 'CAD-HOST-CLEAN-BUILD.json'), pinsPath = join(scripts, 'cad-host-clean-pins.json')
  const seal = () => {
    const bytes = Buffer.from(JSON.stringify(manifest) + '\n')
    writeFileSync(receipt, bytes)
    writeFileSync(pinsPath, JSON.stringify({ schema: 'agent-pi-dsh/cad-host-clean-pins/v1', manifestSha256: hash(bytes) }))
  }
  seal()
  return { directory, product, runtime, receipt, pinsPath, manifest, files, describe, seal }
}

test('verifies independent host receipt, exact binary artifacts and corresponding-source bytes', t => {
  const value = fixture(t)
  assert.ok(wasm.length > 1024 * 1024 && WebAssembly.validate(wasm))
  assert.deepEqual(verifyCadHostCleanRelease(value.product), value.manifest)
})

test('rejects a changed binary byte even when size and WebAssembly validity are unchanged', t => {
  const value = fixture(t), changed = Buffer.from(wasm)
  changed[changed.length - 1] = 255
  assert.ok(WebAssembly.validate(changed))
  writeFileSync(join(value.runtime, 'libredwg-web.wasm'), changed)
  assert.throws(() => verifyCadHostCleanRelease(value.product), /artifact hash.*libredwg-web.wasm/)
})

test('rejects changed receipts, missing source archives and changed source bytes', t => {
  for (const change of ['receipt', 'missing', 'changed', 'undeclared']) {
    const value = fixture(t), source = join(value.runtime, value.manifest.sourceArchive.path)
    if (change === 'receipt') writeFileSync(value.receipt, readFileSync(value.receipt) + ' ')
    if (change === 'missing') rmSync(source)
    if (change === 'changed') writeFileSync(source, 'replaced source archive')
    if (change === 'undeclared') { delete value.manifest.sourceArchive; value.seal() }
    assert.throws(() => verifyCadHostCleanRelease(value.product), change === 'receipt' ? /receipt differs/ : change === 'missing' ? /ENOENT/ : change === 'undeclared' ? /corresponding source must ship/ : /artifact size|artifact hash/)
  }
})

test('rejects artifact and source-archive traversal after receipt hash verification', t => {
  for (const change of ['artifact', 'source']) {
    const value = fixture(t), bytes = Buffer.from('outside runtime fixture')
    writeFileSync(join(dirname(value.runtime), 'outside.mjs'), bytes)
    if (change === 'artifact') value.manifest.artifacts.push(value.describe('../outside.mjs', bytes))
    else value.manifest.sourceArchive = value.describe('sources/../../outside.mjs', bytes)
    value.seal()
    assert.throws(() => verifyCadHostCleanRelease(value.product), /outside runtime/)
  }
})

test('rejects a runtime directory junction outside the product', t => {
  const value = fixture(t), external = join(value.directory, 'external-runtime')
  renameSync(value.runtime, external)
  symlinkSync(external, value.runtime, process.platform === 'win32' ? 'junction' : 'dir')
  assert.ok(existsSync(value.receipt))
  assert.throws(() => verifyCadHostCleanRelease(value.product), /outside product/)
})

test('rejects pins reached through a scripts-directory junction outside the product', t => {
  const value = fixture(t), scripts = dirname(value.pinsPath), external = join(value.directory, 'external-scripts')
  renameSync(scripts, external)
  symlinkSync(external, scripts, process.platform === 'win32' ? 'junction' : 'dir')
  assert.throws(() => verifyCadHostCleanRelease(value.product), /pins outside product/)
})

test('rejects incomplete or invalid WASM and missing or invalid GPL material', t => {
  for (const change of ['short-wasm', 'invalid-wasm', 'missing-gpl', 'invalid-gpl']) {
    const value = fixture(t)
    if (change === 'missing-gpl') value.manifest.artifacts = value.manifest.artifacts.filter(file => file.path !== 'GPL-3.0.txt')
    else {
      const path = change === 'invalid-gpl' ? 'GPL-3.0.txt' : 'libredwg-web.wasm'
      const bytes = change === 'short-wasm' ? Buffer.from('0061736d01000000', 'hex') : change === 'invalid-gpl' ? Buffer.from('incorrect license fixture') : Buffer.from(wasm)
      if (change === 'invalid-wasm') bytes[0] = 1
      writeFileSync(join(value.runtime, path), bytes)
      value.manifest.artifacts = value.manifest.artifacts.map(file => file.path === path ? value.describe(path, bytes) : file)
    }
    value.seal()
    assert.throws(() => verifyCadHostCleanRelease(value.product), change.includes('wasm') ? /not a complete module/ : change === 'missing-gpl' ? /artifact missing.*GPL/ : /GNU GENERAL PUBLIC LICENSE/)
  }
})
