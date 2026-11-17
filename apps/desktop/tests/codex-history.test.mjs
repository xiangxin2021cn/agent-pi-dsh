import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'
import { test } from 'node:test'
import { runInNewContext } from 'node:vm'

test('desktop retires the Codex history page IPC and packaged reader while preserving the data location', () => {
  const main = readFileSync(new URL('../main.mjs', import.meta.url), 'utf8')
  const preload = readFileSync(new URL('../preload.cjs', import.meta.url), 'utf8')
  const manifest = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'))
  assert.doesNotMatch(main, /readCodexHistory|codex-history-status|resolveCodexWrapper|createCodexAuthController|createCodexExecutionController|ipcMain\.handle\('codex-(?:auth|execution|task|set-default)/)
  assert.doesNotMatch(main, /CODEX_HOME:\s*codexHome/)
  assert.match(main, /existsSync\(codexHome\)/, 'legacy data remains recognizable for edition import')
  const exposed = {}
  runInNewContext(preload, { require(name) {
    assert.equal(name, 'electron')
    return { contextBridge: { exposeInMainWorld(key, value) { exposed[key] = value } }, ipcRenderer: { invoke() { return Promise.resolve({}) } }, webUtils: {} }
  } })
  assert.deepEqual(Object.keys(exposed.agentPiDesktop).filter(key => /codex/i.test(key)), [])
  assert.equal(typeof exposed.__DSH_DIRECTORY_PICKER__.pick, 'function')
  assert.ok(!manifest.build.files.some(file => /^codex-(?:auth|models|execution|history)\.mjs$/.test(file)))
  assert.equal(existsSync(new URL('../codex-history.mjs', import.meta.url)), false)
})
