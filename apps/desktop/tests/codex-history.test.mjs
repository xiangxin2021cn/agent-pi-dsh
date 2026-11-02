import assert from 'node:assert/strict'
import { mkdtempSync, readFileSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'
import { runInNewContext } from 'node:vm'
import { readCodexHistory } from '../codex-history.mjs'

test('desktop and sandboxed preload expose legacy history without authentication or execution controls', () => {
  const main = readFileSync(new URL('../main.mjs', import.meta.url), 'utf8')
  const preload = readFileSync(new URL('../preload.cjs', import.meta.url), 'utf8')
  const manifest = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'))
  assert.match(main, /ipcMain\.handle\('codex-history-status'/)
  assert.doesNotMatch(main, /resolveCodexWrapper|createCodexAuthController|createCodexExecutionController|ipcMain\.handle\('codex-(?:auth|execution|task|set-default)/)
  assert.doesNotMatch(main, /CODEX_HOME:\s*codexHome/)
  const exposed = {}, invocations = []
  runInNewContext(preload, { require(name) {
    assert.equal(name, 'electron')
    return { contextBridge: { exposeInMainWorld(key, value) { exposed[key] = value } }, ipcRenderer: { invoke(...args) { invocations.push(args); return Promise.resolve({}) }, on() {}, removeListener() {} }, webUtils: { getPathForFile() { return '' } } }
  } })
  assert.deepEqual(Object.keys(exposed.agentPiDesktop).filter(key => /codex/i.test(key)), ['codexHistoryStatus'])
  exposed.agentPiDesktop.codexHistoryStatus('original-session')
  assert.deepEqual(invocations, [['codex-history-status', 'original-session']])
  assert.ok(manifest.build.files.includes('codex-history.mjs'))
  assert.ok(!manifest.build.files.some(file => ['codex-auth.mjs', 'codex-models.mjs', 'codex-execution.mjs'].includes(file)))
})

test('retired executor history is projected without changing its original bytes or exposing controls', t => {
  const dir = mkdtempSync(join(tmpdir(), 'ap-codex-history-')); t.after(() => rmSync(dir, { recursive: true, force: true }))
  const file = join(dir, 'history.json')
  const original = JSON.stringify({ sessions: [{ sessionId: 'original-session', cwd: dir, threadId: 'native-thread', lease: { token: 'fixture-only' }, messages: [{ id: 'one', role: 'assistant', text: 'Original result', internal: true }] }] })
  writeFileSync(file, original)
  assert.deepEqual(readCodexHistory(file, 'original-session'), { sessionId: 'original-session', cwd: dir, messages: [{ id: 'one', role: 'assistant', text: 'Original result' }] })
  assert.equal(readFileSync(file, 'utf8'), original)
  assert.deepEqual(readCodexHistory(file, 'another-session'), { sessionId: 'another-session', messages: [] })
})

test('absent history stays absent; corrupt and ambiguous records are preserved for review', t => {
  const dir = mkdtempSync(join(tmpdir(), 'ap-codex-history-')); t.after(() => rmSync(dir, { recursive: true, force: true }))
  const file = join(dir, 'history.json')
  assert.deepEqual(readCodexHistory(file, 'session-one'), { sessionId: 'session-one', messages: [] })
  for (const original of ['{bad', JSON.stringify({ sessions: [{ sessionId: 'session-one' }, { sessionId: 'session-one' }] }), JSON.stringify({ sessions: [{ sessionId: 'session-one', cwd: dir, messages: [{ id: 'one', role: 'assistant', text: null }] }] })]) {
    writeFileSync(file, original); assert.match(readCodexHistory(file, 'session-one').error, /原文件已保留/)
    assert.equal(readFileSync(file, 'utf8'), original)
  }
  assert.throws(() => readCodexHistory(file, '../arbitrary-file'), /原会话编号/)
})
