import assert from 'node:assert/strict'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'
import {
  forgetSession,
  forgetWorkspace,
  markWorkspaceArchived,
  readArchiveStore,
} from '../src/archive-store.ts'

function isolateStore() {
  const root = mkdtempSync(join(tmpdir(), 'ap-archive-'))
  process.env.AGENT_PI_ARCHIVE_FILE = join(root, 'archive.json')
  return root
}

test('forgetSession appends once and survives a reread', () => {
  isolateStore()
  assert.deepEqual(readArchiveStore(), { forgottenSessionIds: [], archivedWorkspaceIds: [] })
  assert.deepEqual(forgetSession('  s-1  ').forgottenSessionIds, ['s-1'])
  assert.deepEqual(forgetSession('s-1').forgottenSessionIds, ['s-1'])
  assert.deepEqual(forgetSession('s-2').forgottenSessionIds, ['s-1', 's-2'])
  assert.deepEqual(readArchiveStore().forgottenSessionIds, ['s-1', 's-2'])
})

test('forgetSession ignores a blank id', () => {
  isolateStore()
  assert.deepEqual(forgetSession('').forgottenSessionIds, [])
  assert.deepEqual(forgetSession('   ').forgottenSessionIds, [])
})

test('workspace archive marks and forget drops only that workspace', () => {
  isolateStore()
  markWorkspaceArchived('w-1')
  markWorkspaceArchived('w-1')
  markWorkspaceArchived('w-2')
  assert.deepEqual(readArchiveStore().archivedWorkspaceIds, ['w-1', 'w-2'])
  assert.deepEqual(forgetWorkspace('w-1').archivedWorkspaceIds, ['w-2'])
  assert.deepEqual(readArchiveStore().archivedWorkspaceIds, ['w-2'])
})
