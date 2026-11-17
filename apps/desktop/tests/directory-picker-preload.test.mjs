import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import { runInNewContext } from 'node:vm'

const preload = readFileSync(new URL('../preload.cjs', import.meta.url), 'utf8')

function load(invoke) {
  const exposed = {}
  runInNewContext(preload, {
    require(name) {
      assert.equal(name, 'electron')
      return {
        contextBridge: { exposeInMainWorld: (key, value) => { exposed[key] = value } },
        ipcRenderer: { invoke },
        webUtils: {},
      }
    },
  })
  return exposed
}

test('DSH and workbench folder selection use the existing desktop IPC', async () => {
  const calls = []
  const exposed = load(async (...args) => { calls.push(args); return 'C:\\项目\\已存在' })
  assert.equal(await exposed.__DSH_DIRECTORY_PICKER__.pick(), 'C:\\项目\\已存在')
  assert.equal(await exposed.agentPiDesktop.pickFolder(), 'C:\\项目\\已存在')
  assert.deepEqual(calls, [['pick-folder'], ['pick-folder']])
  assert.deepEqual(Object.keys(exposed.__DSH_DIRECTORY_PICKER__), ['pick'])
})

test('DSH folder selection retains operator cancellation', async () => {
  const exposed = load(async () => null)
  assert.equal(await exposed.__DSH_DIRECTORY_PICKER__.pick(), null)
})

test('DSH folder selection propagates desktop rejection without a Host fallback', async () => {
  const failure = new Error('dialog failed')
  const exposed = load(async () => { throw failure })
  await assert.rejects(exposed.__DSH_DIRECTORY_PICKER__.pick(), error => error === failure)
})

test('the DSH bridge preserves all existing desktop APIs', () => {
  const exposed = load(async () => undefined)
  assert.deepEqual(Object.keys(exposed.agentPiDesktop).sort(), [
    'relaunch', 'pickFolder', 'pickFiles', 'pathForFile', 'printToPdf', 'openPath',
    'revealPath', 'appVersion', 'agentTeamsStatus', 'setAgentTeams',
    'compactionFallbackStatus', 'setCompactionFallback', 'codexHistoryStatus',
    'checkUpdate', 'downloadUpdate', 'installUpdate', 'onUpdateProgress',
  ].sort())
})
