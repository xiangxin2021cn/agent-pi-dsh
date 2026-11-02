import assert from 'node:assert/strict'
import childProcess from 'node:child_process'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'
import { inspectMacOSOarProviders } from './macos-intel-capabilities.mjs'

test('official OAR inspection registers the unified tool without invoking CLIs or claiming login readiness', async t => {
  const home = mkdtempSync(join(tmpdir(), 'mac-oar-capability-')); t.after(() => rmSync(home, { recursive: true, force: true }))
  const spawn = t.mock.method(childProcess, 'spawnSync', () => { throw new Error('inspection must not execute native CLIs') })
  const codex = join(home, 'codex-fixture'); writeFileSync(codex, 'fixture only')
  const dsh = fileURLToPath(new URL('../vendor/deepseek-harness', import.meta.url))
  const result = await inspectMacOSOarProviders(dsh, { home, env: { PATH: '', OAR_CODEX_BIN: codex, OAR_CLAUDE_BIN: join(home, 'missing-claude') } })
  assert.deepEqual(result.providers, ['oar-codex', 'oar-claude'])
  assert.equal(result.tool, 'subagent_oar')
  assert.deepEqual(result.localCLI.map(row => row.status), ['detected', 'unsupported'])
  assert.match(result.localCLI[0].reason, /authentication.*checked on delegation/)
  assert.equal(spawn.mock.callCount(), 0)
})
