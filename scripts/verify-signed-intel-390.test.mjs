import assert from 'node:assert/strict'
import { test } from 'node:test'
import { acceptSignedIntelRelease } from './verify-signed-intel-390.mjs'

const dmg = 'a'.repeat(64)
const zip = 'b'.repeat(64)
const team = 'ABCDE12345'
function release() {
  return { id: 445163826, tag_name: 'v3.9.0', draft: true,
    assets: ['dmg', 'zip'].flatMap(extension => ['', '.sha256'].map(suffix => ({
      name: 'Agent-Pi-DSH-3.9.0-mac-x64.' + extension + suffix,
      state: 'uploaded', size: suffix ? 99 : 800000000,
      digest: 'sha256:' + (suffix ? 'c'.repeat(64) : extension === 'dmg' ? dmg : zip),
    }))) }
}

test('only complete final signed-input names and pinned digests enter the native gate', () => {
  assert.equal(acceptSignedIntelRelease(release(), dmg, zip, team).length, 4)
})
test('partial uploads and missing checksums never count as ready', () => {
  const partial = release(); partial.assets[0].state = 'starter'
  assert.throws(() => acceptSignedIntelRelease(partial, dmg, zip, team))
  const missing = release(); missing.assets.pop()
  assert.throws(() => acceptSignedIntelRelease(missing, dmg, zip, team))
})
test('a digest mismatch or local-test filename is refused', () => {
  assert.throws(() => acceptSignedIntelRelease(release(), 'd'.repeat(64), zip, team))
  const local = release(); local.assets[0].name = 'Agent-Pi-DSH-3.9.0-mac-x64-local-test.dmg'
  assert.throws(() => acceptSignedIntelRelease(local, dmg, zip, team))
})
test('formal release cannot precede this validation and malformed inputs are refused', () => {
  const publicRelease = release(); publicRelease.draft = false
  assert.throws(() => acceptSignedIntelRelease(publicRelease, dmg, zip, team))
  assert.throws(() => acceptSignedIntelRelease(release(), 'not-a-hash', zip, team))
  assert.throws(() => acceptSignedIntelRelease(release(), dmg, zip, 'unknown'))
})
