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

test('release history is increasing, unique, and matches the current identity', () => {
  const history = [
    { version: '3.5.1', dshPin: 'pin-a', releaseTag: 'v3.5.1' },
    { version: '3.5.2', dshPin: 'pin-b', releaseTag: 'v3.5.2' },
  ]
  assert.doesNotThrow(() => assertKernelVersionHistory(history, 'pin-b', '3.5.2'))
  assert.throws(() => assertKernelVersionHistory(history, 'pin-c', '3.5.2'), /must match/)
  assert.throws(() => assertKernelVersionHistory([...history, history[1]], 'pin-b', '3.5.2'), /duplicate/)
})
