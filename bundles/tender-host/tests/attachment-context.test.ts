import assert from 'node:assert/strict'
import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'
import {
  peekPendingVisionContext,
  readVisionImages,
  resetPendingVisionContext,
  takePendingVisionContext,
} from '../src/attachment-context.ts'

function workspaceWithFile(name: string): { cwd: string; path: string } {
  const cwd = mkdtempSync(join(tmpdir(), 'ap-attach-'))
  const path = join(cwd, name)
  writeFileSync(path, 'price')
  return { cwd, path }
}

test('pending attachment context stays on the owning session', async () => {
  resetPendingVisionContext()
  const a = workspaceWithFile('N.003-010-2017-3 Pricing Schedule.xlsx')
  const b = workspaceWithFile('other.xlsx')
  await readVisionImages({
    sessionId: 'session-a',
    cwd: a.cwd,
    files: [{ name: 'N.003-010-2017-3 Pricing Schedule.xlsx', path: a.path, kind: 'file' }],
  })
  assert.match(peekPendingVisionContext('session-a'), /Pricing Schedule/)
  assert.equal(peekPendingVisionContext('session-b'), '')
  assert.equal(takePendingVisionContext('session-b', b.cwd), '')
  assert.match(takePendingVisionContext('session-a', a.cwd), /Pricing Schedule/)
  assert.equal(peekPendingVisionContext('session-a'), '')
})

test('a later session assembly cannot consume another workspace stash', async () => {
  resetPendingVisionContext()
  const a = workspaceWithFile('secret.xlsx')
  const b = workspaceWithFile('deck.pptx')
  await readVisionImages({
    sessionId: 'session-a',
    cwd: a.cwd,
    files: [{ name: 'secret.xlsx', path: a.path, kind: 'file' }],
  })
  assert.equal(takePendingVisionContext('session-a', b.cwd), '')
  assert.equal(peekPendingVisionContext('session-a'), '')
})

test('paths outside the session cwd are rejected', async () => {
  resetPendingVisionContext()
  const a = workspaceWithFile('inside.xlsx')
  const b = workspaceWithFile('outside.xlsx')
  await assert.rejects(() => readVisionImages({
    sessionId: 'session-a',
    cwd: a.cwd,
    files: [{ name: 'outside.xlsx', path: b.path, kind: 'file' }],
  }), /outside the workspace/)
  assert.equal(peekPendingVisionContext('session-a'), '')
})

test('a folder pointer is stashed as a directory path, even outside cwd', async () => {
  resetPendingVisionContext()
  const a = workspaceWithFile('inside.xlsx')
  const outside = mkdtempSync(join(tmpdir(), 'ap-folder-'))
  await readVisionImages({
    sessionId: 'session-a',
    cwd: a.cwd,
    folders: [{ name: '土耳其项目资料', path: outside }],
  })
  const text = peekPendingVisionContext('session-a')
  assert.match(text, /pointed at these folders/)
  assert.match(text, /土耳其项目资料/)
  assert.match(text, /Do not copy or upload the tree/)
})

test('stash requires sessionId and absolute cwd', async () => {
  resetPendingVisionContext()
  const a = workspaceWithFile('file.xlsx')
  await assert.rejects(() => readVisionImages({
    cwd: a.cwd,
    files: [{ name: 'file.xlsx', path: a.path, kind: 'file' }],
  }), /sessionId is required/)
  await assert.rejects(() => readVisionImages({
    sessionId: 'session-a',
    cwd: 'relative',
    files: [{ name: 'file.xlsx', path: a.path, kind: 'file' }],
  }), /cwd is required/)
})
