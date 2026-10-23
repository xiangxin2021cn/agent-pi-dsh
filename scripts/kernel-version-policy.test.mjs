import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { test } from 'node:test'

import {
  assertKernelVersionBump,
  assertKernelVersionHistory,
  compareVersions,
} from './kernel-version-policy.mjs'

test('semantic release versions compare numerically', () => {
  assert.equal(compareVersions('3.5.2', '3.5.1'), 1)
  assert.equal(compareVersions('3.5.2', '3.5.2'), 0)
  assert.equal(compareVersions('3.6.0', '3.10.0'), -1)
})

test('a changed DSH pin requires a higher application version', () => {
  assert.throws(() => assertKernelVersionBump({
    basePin: 'old',
    baseVersion: '3.5.2',
    currentPin: 'new',
    currentVersion: '3.5.2',
  }), /did not increase/)
  assert.doesNotThrow(() => assertKernelVersionBump({
    basePin: 'old',
    baseVersion: '3.5.2',
    currentPin: 'new',
    currentVersion: '3.5.3',
  }))
})

test('only the authorized 3.8.3 alpha.4 to alpha.5 rebuild may keep its product version', () => {
  const allowed = {
    basePin: 'f2235d6c023a81d86b202db5e472167ad2307ddb',
    baseVersion: '3.8.3',
    currentPin: '1517a4dbca0a2789ff1d41ba439600f8547d23fa',
    currentVersion: '3.8.3',
  }
  assert.doesNotThrow(() => assertKernelVersionBump(allowed))
  for (const rejected of [
    { ...allowed, basePin: 'unreviewed' },
    { ...allowed, currentPin: 'unreviewed' },
    { ...allowed, currentPin: 'a5e553a5ee04fc66bc264fd25b71a71668727115' },
    { ...allowed, basePin: allowed.currentPin, currentPin: allowed.basePin },
    { ...allowed, baseVersion: '3.8.2', currentVersion: '3.8.2' },
    { ...allowed, baseVersion: '3.8.4' },
    { ...allowed, currentVersion: '3.8.2' },
  ]) assert.throws(() => assertKernelVersionBump(rejected), /did not increase/)
})

test('release history is increasing, unique, and matches the current identity', () => {
  const history = [
    { version: '3.5.1', dshPin: 'pin-a', releaseTag: 'v3.5.1' },
    { version: '3.5.2', dshPin: 'pin-b', releaseTag: 'v3.5.2' },
  ]
  assert.doesNotThrow(() => assertKernelVersionHistory(history, 'pin-b', '3.5.2'))
  assert.throws(() => assertKernelVersionHistory(history, 'pin-c', '3.5.2'), /must match/)
  assert.throws(() => assertKernelVersionHistory([...history, history[1]], 'pin-b', '3.5.2'), /duplicate/)
})

test('Tender retains inherited mainline and edition tags but requires its own current tag', () => {
  const history = [
    { version: '3.8.3', dshPin: 'pin-a', releaseTag: 'v3.8.3' },
    { version: '3.8.5', dshPin: 'pin-b', releaseTag: 'tender-v3.8.5' },
    { version: '3.8.6', dshPin: 'pin-c', releaseTag: 'tender-v3.8.6' },
  ]
  assert.doesNotThrow(() => assertKernelVersionHistory(history, 'pin-c', '3.8.6', 'tender'))
  assert.throws(() => assertKernelVersionHistory([
    ...history.slice(0, -1), { ...history.at(-1), releaseTag: 'v3.8.6' },
  ], 'pin-c', '3.8.6', 'tender'), /release tag mismatch/)
  assert.throws(() => assertKernelVersionHistory([...history, history.at(-1)], 'pin-c', '3.8.6', 'tender'), /duplicate/)
  assert.throws(() => assertKernelVersionHistory([history[1], history[0], history[2]], 'pin-c', '3.8.6', 'tender'), /must increase/)
  assert.throws(() => assertKernelVersionHistory(history, 'other-pin', '3.8.6', 'tender'), /must match/)
  assert.throws(() => assertKernelVersionHistory(history, 'pin-c', '3.8.5', 'tender'), /must match/)
})

test('edition history refuses foreign prefixes, mismatched tag versions and unknown editions', () => {
  const history = [
    { version: '3.8.5', dshPin: 'pin-a', releaseTag: 'v3.8.5' },
    { version: '3.8.6', dshPin: 'pin-b', releaseTag: 'v3.8.6' },
  ]
  assert.doesNotThrow(() => assertKernelVersionHistory(history, 'pin-b', '3.8.6', 'mainline'))
  for (const releaseTag of ['tender-v3.8.5', 'other-v3.8.5', 'v3.8.6']) {
    assert.throws(() => assertKernelVersionHistory([
      { ...history[0], releaseTag }, history[1],
    ], 'pin-b', '3.8.6', 'mainline'), /release tag mismatch/)
  }
  for (const releaseTag of ['other-v3.8.6', 'tender-v3.8.5', 'tender-v3.8.7']) {
    assert.throws(() => assertKernelVersionHistory([
      history[0], { ...history[1], releaseTag },
    ], 'pin-b', '3.8.6', 'tender'), /release tag mismatch/)
  }
  for (const edition of ['other', 'tender-v', '']) {
    assert.throws(() => assertKernelVersionHistory(history, 'pin-b', '3.8.6', edition), /unknown product edition/)
  }
})

test('history CLI validates the actual checked-out product manifests and history', () => {
  const result = spawnSync(process.execPath, [fileURLToPath(new URL('./kernel-version-policy.mjs', import.meta.url)), '--history'], {
    encoding: 'utf8', windowsHide: true,
  })
  assert.equal(result.status, 0, result.stderr)
  assert.match(result.stdout, /kernel release history verified:/)
})
