import assert from 'node:assert/strict'
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'
import { constants, zstdCompressSync, zstdDecompressSync } from 'node:zlib'
import { migrateLegacyAgentPresetSessions } from './migrate-legacy-agent-preset-sessions.mjs'

const options = { params: { [constants.ZSTD_c_checksumFlag]: 1 } }

function fixture(t) {
  const home = mkdtempSync(join(tmpdir(), 'agent-pi-preset-migration-'))
  t.after(() => rmSync(home, { recursive: true, force: true }))
  const sessions = join(home, 'sessions', 'project')
  const storages = join(home, 'storages')
  mkdirSync(sessions, { recursive: true })
  mkdirSync(storages, { recursive: true })
  return { home, sessions, storages }
}

function sessionHeader(id, preset) {
  return { type: 'session', version: 0, id, createdAt: 1, cwd: 'C:/workspace', delegationDepth: 0, agentPreset: preset }
}

test('migrates only the independent zstd header frame and invalidates that session cache', (t) => {
  const { home, sessions, storages } = fixture(t)
  const id = 'session-legacy-zstd'
  const dir = join(sessions, id)
  mkdirSync(dir)
  const headerFrame = zstdCompressSync(`${JSON.stringify(sessionHeader(id, 'code'))}\n`, options)
  const bodyFrame = zstdCompressSync(`${JSON.stringify({
    type: 'user/message', seq: 0, time: 2, data: { content: 'literal agentPreset code must remain untouched' },
  })}\n`, options)
  const path = join(dir, 'session.jsonl.zstd')
  writeFileSync(path, Buffer.concat([headerFrame, bodyFrame]))
  writeFileSync(join(storages, 'session_projcache.json'), `${JSON.stringify({
    tables: { sessions: { [id]: { identity: { createdAt: 1 }, rows: {} }, keep: { identity: {}, rows: {} } } },
  })}\n`)

  const result = migrateLegacyAgentPresetSessions(home)

  assert.deepEqual(result, { scanned: 1, migrated: 1, invalidated: 1, errors: 0, skipped: false })
  const migrated = readFileSync(path)
  assert.ok(migrated.subarray(migrated.length - bodyFrame.length).equals(bodyFrame), 'event frames must stay byte-identical')
  const migratedHeader = JSON.parse(zstdDecompressSync(migrated).toString('utf8'))
  assert.equal(migratedHeader.agentPreset, 'standard')
  const cache = JSON.parse(readFileSync(join(storages, 'session_projcache.json'), 'utf8'))
  assert.equal(cache.tables.sessions[id], undefined)
  assert.ok(cache.tables.sessions.keep)
  const backupDir = join(home, '.runtime-install', 'agent-pi-preset-session-migration-v1')
  const backups = readFileSync(join(backupDir, 'projection-cache-removed.json'), 'utf8')
  assert.match(backups, new RegExp(id))
})

test('migrates a plaintext header and leaves valid sessions unchanged', (t) => {
  const { home, sessions } = fixture(t)
  const legacyDir = join(sessions, 'legacy')
  const validDir = join(sessions, 'valid')
  mkdirSync(legacyDir)
  mkdirSync(validDir)
  const legacyPath = join(legacyDir, 'session.jsonl')
  const validPath = join(validDir, 'session.jsonl')
  const event = `${JSON.stringify({ type: 'turn/end', seq: 0, time: 2, data: {} })}\n`
  writeFileSync(legacyPath, `${JSON.stringify(sessionHeader('legacy', 'code'))}\n${event}`)
  const valid = `${JSON.stringify(sessionHeader('valid', 'minimal'))}\n${event}`
  writeFileSync(validPath, valid)

  const result = migrateLegacyAgentPresetSessions(home)

  assert.equal(result.migrated, 1)
  const lines = readFileSync(legacyPath, 'utf8').trimEnd().split('\n')
  assert.equal(JSON.parse(lines[0]).agentPreset, 'standard')
  assert.equal(`${lines[1]}\n`, event)
  assert.equal(readFileSync(validPath, 'utf8'), valid)
  assert.deepEqual(migrateLegacyAgentPresetSessions(home), {
    scanned: 0, migrated: 0, invalidated: 0, errors: 0, skipped: true,
  })
})
