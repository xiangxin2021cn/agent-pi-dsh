import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import { mkdtemp, mkdir, readdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'
import {
  anonymousId,
  auditCase,
  attachmentRelativePaths,
  collectAttachmentRefs,
  copySessionArtifacts,
  resolveInside,
} from './session-013-migration-smoke.mjs'

test('session migration audit path guard rejects the root and escapes', () => {
  const root = join(tmpdir(), 'session-audit-root')
  assert.equal(resolveInside(root, join('project', 'session', 'session.jsonl.zstd')), join(root, 'project', 'session', 'session.jsonl.zstd'))
  assert.throws(() => resolveInside(root, '.'), /below its root/)
  assert.throws(() => resolveInside(root, '..'), /below its root/)
  assert.throws(() => resolveInside(root, join('..', 'foreign')), /below its root/)
})

test('attachment discovery is content-free, recursive, and deduplicated', () => {
  const digest = 'a'.repeat(64)
  const events = [{
    type: 'user/message',
    data: {
      content: [
        { type: 'file', attachment: { attachmentId: `sha256:${digest}`, name: 'drawing.dwg', bytes: 9 } },
        { attachmentId: `sha256:${digest}`, name: 'drawing.dwg', bytes: 9 },
      ],
    },
  }]
  assert.deepEqual(collectAttachmentRefs(events), [{ digest, kind: 'file', name: 'drawing.dwg', bytes: 9 }])
  assert.deepEqual(attachmentRelativePaths({ digest, kind: 'file', name: 'drawing.dwg' }), [
    join('file-objects', 'aa', digest),
    join('files', 'aa', digest, 'drawing.dwg'),
  ])
  assert.deepEqual(attachmentRelativePaths({ digest, kind: 'image', name: 'screenshot.png' }), [
    join('objects', 'aa', digest),
  ])
})

test('case identifiers do not expose session ids or paths', () => {
  const value = 'project/session-secret/session.jsonl.zstd'
  const id = anonymousId(value)
  assert.match(id, /^[a-f0-9]{12}$/)
  assert.equal(id.includes('session-secret'), false)
})

test('session staging copies only JSONL generations and never credentials or locks', async (t) => {
  const root = await mkdtemp(join(tmpdir(), 'session-013-test-'))
  t.after(() => rm(root, { recursive: true, force: true }))
  const sourceHome = join(root, 'source-home')
  const sourceSessions = join(sourceHome, 'sessions')
  const sourceDir = join(sourceSessions, 'project', 'session-id')
  const targetSessions = join(root, 'target-home', 'sessions')
  await mkdir(sourceDir, { recursive: true })
  await writeFile(join(sourceDir, 'session.jsonl.zstd'), 'historical')
  await writeFile(join(sourceDir, 'session.v1.jsonl.zstd'), 'successor')
  await writeFile(join(sourceDir, 'session.lock'), 'do not copy')
  await writeFile(join(sourceHome, '.credentials.yaml'), 'secret: must-stay-here\n')

  const staged = await copySessionArtifacts(
    join(sourceDir, 'session.jsonl.zstd'),
    sourceSessions,
    targetSessions,
  )
  assert.deepEqual((await readdir(staged.targetDir)).sort(), ['session.jsonl.zstd', 'session.v1.jsonl.zstd'])
  assert.equal(existsSync(join(root, 'target-home', '.credentials.yaml')), false)
})

test('CLI refuses a scratch directory inside the source data before loading a runtime', async (t) => {
  const sourceHome = await mkdtemp(join(tmpdir(), 'session-013-source-'))
  t.after(() => rm(sourceHome, { recursive: true, force: true }))
  await mkdir(join(sourceHome, 'sessions'))
  const result = spawnSync(process.execPath, [
    join(import.meta.dirname, 'session-013-migration-smoke.mjs'),
    '--source-home', sourceHome, '--scratch-root', join(sourceHome, 'scratch'),
    '--case', 'ordinary=project/session/session.jsonl',
  ], { encoding: 'utf8' })
  assert.notEqual(result.status, 0)
  assert.match(result.stderr, /scratch directory must not be inside/)
  assert.equal(existsSync(join(sourceHome, 'scratch')), false)
})

test('migration audit fails when a referenced attachment cannot be verified', async (t) => {
  const root = await mkdtemp(join(tmpdir(), 'session-013-missing-attachment-'))
  t.after(() => rm(root, { recursive: true, force: true }))
  const sourceHome = join(root, 'source-home')
  const sourceDirectory = join(sourceHome, 'sessions', 'project', 'session-id')
  await mkdir(sourceDirectory, { recursive: true })
  await writeFile(join(sourceDirectory, 'session.jsonl'), 'historical fixture')
  const header = { id: 'session-id', version: 2 }
  const runtime = {
    JsonlSessionPersistence: {},
    Context: class {
      sessionPersistence = {
        list: async () => [{ header }],
        open: async () => ({
          header, inheritedEventCount: 0,
          read: async () => [{ type: 'user/message', attachmentId: `sha256:${'a'.repeat(64)}`, mediaType: 'image/png', bytes: 12 }],
          close: async () => {},
        }),
      }
      async plugin() { return { dispose: async () => {} } }
    },
  }
  const result = await auditCase({
    kind: 'attachment-tool', relativeSession: join('project', 'session-id', 'session.jsonl'),
    sourceHome, runRoot: join(root, 'scratch'), runtime,
  })
  assert.equal(result.ok, false)
  assert.match(result.error.message, /referenced attachments are missing or fail content verification/)
})
