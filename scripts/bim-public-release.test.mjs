import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'
import { verifyBimPublicRelease } from './bim-public-release.mjs'

const hash = bytes => createHash('sha256').update(bytes).digest('hex')
function fixture(t) {
  const root = mkdtempSync(join(tmpdir(), 'bim-public-'))
  t.after(() => rmSync(root, { recursive: true, force: true }))
  mkdirSync(join(root, 'runtime'))
  const sourceArchive = join(root, 'BIM-corresponding-source.tar.gz')
  const sourceBytes = Buffer.from('source archive fixture')
  writeFileSync(sourceArchive, sourceBytes)
  const source = { name: 'BIM-corresponding-source.tar.gz', bytes: sourceBytes.length, sha256: hash(sourceBytes) }
  const receiptPath = join(root, 'runtime/BIM-RUNTIME-RECEIPT.json')
  writeFileSync(receiptPath, JSON.stringify({ redistribution: 'public-release-reviewed', sourceArchive: source }))
  const pinsPath = join(root, 'pins.json')
  writeFileSync(pinsPath, JSON.stringify({ schema: 'agent-pi-dsh/bim-public-runtime/v1', runtimeReceiptSha256: hash(readFileSync(receiptPath)), sourceArchive: source }))
  return { directory: join(root, 'runtime'), options: { pinsPath, sourceArchive }, receiptPath }
}

test('public release requires the exact reviewed runtime and available source asset', t => {
  const f = fixture(t)
  assert.equal(verifyBimPublicRelease(f.directory, f.options).sourceArchive.bytes, 22)
  rmSync(f.options.sourceArchive)
  assert.throws(() => verifyBimPublicRelease(f.directory, f.options), /ENOENT/)
})

test('changing the redistribution label cannot approve another runtime', t => {
  const f = fixture(t)
  const receipt = JSON.parse(readFileSync(f.receiptPath))
  receipt.coreVersion = 'unreviewed-core'
  writeFileSync(f.receiptPath, JSON.stringify(receipt))
  assert.throws(() => verifyBimPublicRelease(f.directory, f.options), /differs from the reviewed distribution/)
})

test('local-only receipt remains blocked before reading public pins', t => {
  const f = fixture(t)
  writeFileSync(f.receiptPath, JSON.stringify({ redistribution: 'license-review-required' }))
  assert.throws(() => verifyBimPublicRelease(f.directory, f.options), /native dependency licenses/)
})

test('same-size source corruption is rejected', t => {
  const f = fixture(t)
  writeFileSync(f.options.sourceArchive, Buffer.alloc(22))
  assert.throws(() => verifyBimPublicRelease(f.directory, f.options), /checksum mismatch/)
})
