import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import { macIntelManifest } from './prepare-macos-intel.mjs'

test('compatibility packaging changes only the macOS architecture and Electron in the extracted payload', () => {
  const original = JSON.parse(readFileSync(new URL('../apps/desktop/package.json', import.meta.url), 'utf8'))
  const updated = macIntelManifest(original)
  assert.equal(updated.version, original.version)
  assert.equal(updated.devDependencies.electron, '43.7.11')
  assert.equal(original.devDependencies.electron, '44.7.0')
  assert.equal(updated.build.mac.minimumSystemVersion, '12.0')
  assert.deepEqual(updated.build.mac.target, [{ target: 'dmg', arch: ['x64'] }, { target: 'zip', arch: ['x64'] }])
  assert.equal(updated.build.mac.artifactName, 'Agent-Pi-DSH-${version}-mac-${arch}-monterey.${ext}')
  assert.deepEqual(updated.build.win, original.build.win)
  assert.deepEqual(updated.build.linux, original.build.linux)
  assert.deepEqual(updated.build.files, original.build.files)
  assert.deepEqual(updated.build.extraResources, original.build.extraResources)
})

test('rejects input that is not a released desktop packaging manifest', () => {
  assert.throws(() => macIntelManifest({ version: '3.8.2', build: {} }), /desktop package/)
})
