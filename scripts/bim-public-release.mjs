import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { readFileSync, statSync } from 'node:fs'
import { basename, dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const defaultPins = fileURLToPath(new URL('./bim-public-pins.json', import.meta.url))
const sha256 = bytes => createHash('sha256').update(bytes).digest('hex')

// Public builds bind the reviewed runtime to the corresponding source asset.
// A manually changed redistribution label alone must never clear this check.
export function verifyBimPublicRelease(directory, { pinsPath = defaultPins, sourceArchive } = {}) {
  const bytes = readFileSync(join(directory, 'BIM-RUNTIME-RECEIPT.json'))
  const receipt = JSON.parse(bytes)
  assert.equal(receipt.redistribution, 'public-release-reviewed', 'BIM public redistribution blocked: native dependency licenses and corresponding source need review')
  const pins = JSON.parse(readFileSync(pinsPath, 'utf8'))
  assert.equal(pins.schema, 'agent-pi-dsh/bim-public-runtime/v1')
  assert.match(pins.runtimeReceiptSha256, /^[a-f0-9]{64}$/)
  assert.equal(sha256(bytes), pins.runtimeReceiptSha256, 'BIM runtime differs from the reviewed distribution')
  const source = pins.sourceArchive
  assert.ok(source && /^[A-Za-z0-9][A-Za-z0-9._-]*\.tar\.gz$/.test(source.name), 'Invalid BIM source archive name')
  assert.match(source.sha256, /^[a-f0-9]{64}$/)
  assert.ok(Number.isSafeInteger(source.bytes) && source.bytes > 0)
  assert.deepEqual(receipt.sourceArchive, source, 'BIM receipt and corresponding source disagree')
  const path = sourceArchive ? resolve(sourceArchive) : join(dirname(pinsPath), '..', 'release', source.name)
  assert.equal(basename(path), source.name, 'Wrong BIM corresponding source asset')
  assert.equal(statSync(path).size, source.bytes, 'BIM source archive size mismatch')
  assert.equal(sha256(readFileSync(path)), source.sha256, 'BIM source archive checksum mismatch')
  return { runtimeReceiptSha256: pins.runtimeReceiptSha256, sourceArchive: source }
}
