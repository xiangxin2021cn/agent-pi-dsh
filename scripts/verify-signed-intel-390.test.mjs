import assert from 'node:assert/strict'
import { test } from 'node:test'
import { acceptSignedIntelRelease, acceptScopedIntelInputs, normalDownloadPrompt } from './verify-signed-intel-390.mjs'

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

test('file-scoped inputs reject broader access, foreign hosts, missing files, and stale links', () => {
  const assets = acceptSignedIntelRelease(release(), dmg, zip, team)
  const now = Date.now(), expiresAt = new Date(now + 3600000).toISOString()
  const input = () => ({ expiresAt, downloads: Object.fromEntries(assets.map(asset => [asset.name,
    'https://release-assets.githubusercontent.com/github-production-release-asset/1/fixture?sp=r&sr=b&se=' + encodeURIComponent(expiresAt)])) })
  acceptScopedIntelInputs(input(), assets, now)
  for (const change of [
    value => { value.expiresAt = new Date(now - 1000).toISOString() },
    value => { delete value.downloads[assets[0].name] },
    value => { value.downloads[assets[0].name] = value.downloads[assets[0].name].replace('sp=r', 'sp=rw') },
    value => { value.downloads[assets[0].name] = value.downloads[assets[0].name].replace('release-assets.githubusercontent.com', 'another.example') },
  ]) {
    const value = input(); change(value)
    assert.throws(() => acceptScopedIntelInputs(value, assets, now))
  }
})

test('only the known app normal download confirmation can be accepted', () => {
  const text = '“Agent Pi DSH” is an app downloaded from the Internet. Are you sure you want to open it? Apple checked it for malicious software and none was detected.'
  assert.equal(normalDownloadPrompt(text, ['Cancel', 'Open']), true)
  for (const unsafe of [text.replace('Agent Pi DSH', 'Another App'), text.replace('none was detected', 'malware was detected'), text + ' This will damage your computer.', 'The developer cannot be verified.']) {
    assert.equal(normalDownloadPrompt(unsafe, ['Cancel', 'Open']), false)
  }
  assert.equal(normalDownloadPrompt(text, ['Cancel', 'Open Anyway']), false)
})
