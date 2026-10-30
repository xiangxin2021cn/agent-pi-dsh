import assert from 'node:assert/strict'
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'
import { backupScheduleV1 } from './backup-schedule-v1.mjs'

function fixture(t, version = 1) {
  const home = mkdtempSync(join(tmpdir(), 'agent-pi-schedule-upgrade-'))
  t.after(() => rmSync(home, { recursive: true, force: true }))
  mkdirSync(join(home, 'storages'))
  const source = join(home, 'storages', 'schedule.json')
  const bytes = Buffer.from(JSON.stringify({ unit: { name: 'schedule', version }, global: null,
    tables: { tasks: { example: { title: '测试任务', prompt: 'preserve exact original text' } } } }) + '\n')
  writeFileSync(source, bytes)
  return { home, source, bytes }
}

test('backs up the complete original v1 bytes without rewriting live storage', t => {
  const { home, source, bytes } = fixture(t)
  const result = backupScheduleV1(home)
  assert.equal(result.status, 'created')
  assert.deepEqual(readFileSync(join(result.path, 'schedule.json')), bytes)
  assert.deepEqual(readFileSync(source), bytes)
  const receipt = JSON.parse(readFileSync(join(result.path, 'receipt.json')))
  assert.equal(receipt.bytes, bytes.length)
  assert.equal(receipt.storageVersion, 1)
  assert.equal(receipt.source, 'storages/schedule.json')
})

test('later launches retain the first verified snapshot after tasks change', t => {
  const { home, source, bytes } = fixture(t)
  const first = backupScheduleV1(home)
  const changed = JSON.parse(bytes)
  changed.tables.tasks.example.title = 'later edit'
  writeFileSync(source, JSON.stringify(changed))
  assert.equal(backupScheduleV1(home).status, 'retained')
  assert.deepEqual(readFileSync(join(first.path, 'schedule.json')), bytes)
})

test('a damaged existing snapshot prevents silently starting without recovery data', t => {
  const { home } = fixture(t)
  const first = backupScheduleV1(home)
  writeFileSync(join(first.path, 'schedule.json'), '{}')
  assert.throws(() => backupScheduleV1(home), /integrity verification/)
})

test('fresh and v2 profiles are not rewritten', t => {
  const { home, source, bytes } = fixture(t, 2)
  assert.equal(backupScheduleV1(home).status, 'already-new-format')
  assert.deepEqual(readFileSync(source), bytes)
  rmSync(source)
  assert.equal(backupScheduleV1(home).status, 'absent')
})

test('each edition snapshots only its own home', t => {
  const mainline = fixture(t)
  const tender = fixture(t)
  const a = backupScheduleV1(mainline.home), b = backupScheduleV1(tender.home)
  assert.notEqual(a.path, b.path)
  assert.deepEqual(readFileSync(mainline.source), mainline.bytes)
  assert.deepEqual(readFileSync(tender.source), tender.bytes)
})
