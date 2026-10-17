import assert from 'node:assert/strict'
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
