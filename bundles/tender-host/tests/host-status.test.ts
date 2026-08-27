import assert from 'node:assert/strict'
import { mkdtempSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'
import {
  ackHostRestart,
  buildCrashResumePrompt,
  classifyRestartReason,
  hostStatus,
  writeHostRestart,
} from '../src/host-status.ts'

test('Windows abort and SIGABRT count as OOM', () => {
  assert.equal(classifyRestartReason(134), 'oom')
  assert.equal(classifyRestartReason(3221226505), 'oom')
  assert.equal(classifyRestartReason(1), 'crash')
})

test('restart marker is pending until ack', () => {
  const home = mkdtempSync(join(tmpdir(), 'ap-host-'))
  const written = writeHostRestart(home, { at: 100, code: 134 })
  assert.equal(written.pending, true)
  assert.equal(written.reason, 'oom')
  assert.equal(hostStatus(home).restart?.pending, true)
  ackHostRestart(100, home)
  assert.equal(hostStatus(home).restart?.pending, false)
  const raw = JSON.parse(readFileSync(join(home, 'host-restart.json'), 'utf8'))
  assert.equal(raw.pending, false)
})

test('crash resume prompt stays on the parent session', () => {
  const text = buildCrashResumePrompt({ reason: 'oom' })
  assert.match(text, /请在本会话继续/)
  assert.match(text, /内存不足/)
  assert.match(text, /Official Output/)
})
