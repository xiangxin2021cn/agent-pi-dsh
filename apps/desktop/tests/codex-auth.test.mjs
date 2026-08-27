import assert from 'node:assert/strict'
import { EventEmitter } from 'node:events'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { PassThrough } from 'node:stream'
import { test } from 'node:test'
import {
  createCodexAuthController,
  parseCodexLoginStatus,
} from '../codex-auth.mjs'

test('Codex login status exposes only normalized authentication state', () => {
  assert.deepEqual(
    parseCodexLoginStatus({ status: 0, stdout: 'Logged in using ChatGPT\n', stderr: '' }),
    { available: true, state: 'logged-in', method: 'chatgpt' },
  )
  assert.deepEqual(
    parseCodexLoginStatus({ status: 1, stdout: 'Not logged in\n', stderr: '' }),
    { available: true, state: 'logged-out' },
  )
  assert.deepEqual(
    parseCodexLoginStatus({ status: null, error: new Error('spawn failed'), stdout: '', stderr: '' }),
    { available: false, state: 'unavailable' },
  )
})

test('Codex auth controller uses browser login with isolated CODEX_HOME and no API key', () => {
  const calls = []
  const codexHome = join(process.cwd(), '.tmp', 'codex-auth-test')
  const child = new EventEmitter()
  child.exitCode = null
  child.stdout = new PassThrough()
  child.stderr = new PassThrough()
  child.kill = () => { child.exitCode = 0 }
  const controller = createCodexAuthController({
    nodePath: 'node.exe',
    wrapperPath: 'codex.js',
    codexHome,
    baseEnv: {
      PATH: 'C:\\Windows',
      OPENAI_API_KEY: 'must-not-cross',
      CODEX_ACCESS_TOKEN: 'must-not-cross',
    },
    spawn(_command, args, options) {
      calls.push({ kind: 'spawn', args, options })
      return child
    },
    spawnSync(_command, args, options) {
      calls.push({ kind: 'spawnSync', args, options })
      return { status: 1, stdout: 'Not logged in\n', stderr: '' }
    },
  })

  assert.deepEqual(controller.login(), { available: true, state: 'pending' })
  const login = calls.find((call) => call.kind === 'spawn')
  assert.deepEqual(login.args, ['codex.js', 'login'])
  assert.equal(login.options.env.CODEX_HOME, codexHome)
  assert.equal(login.options.env.OPENAI_API_KEY, undefined)
  assert.equal(login.options.env.CODEX_ACCESS_TOKEN, undefined)
  controller.dispose()
})

test('Electron exposes only normalized Codex auth operations to the renderer', () => {
  const desktop = join(import.meta.dirname, '..')
  const main = readFileSync(join(desktop, 'main.mjs'), 'utf8')
  const preload = readFileSync(join(desktop, 'preload.mjs'), 'utf8')
  assert.match(main, /createCodexAuthController/)
  assert.match(main, /ipcMain\.handle\('codex-auth-status'/)
  assert.match(main, /ipcMain\.handle\('codex-auth-login'/)
  assert.match(main, /ipcMain\.handle\('codex-auth-logout'/)
  assert.match(main, /delete env\.OPENAI_API_KEY/)
  assert.match(main, /delete env\.CODEX_ACCESS_TOKEN/)
  assert.match(preload, /codexAuthStatus/)
  assert.match(preload, /codexAuthLogin/)
  assert.match(preload, /codexAuthLogout/)
  assert.doesNotMatch(preload, /auth\.json|token|OPENAI_API_KEY/i)
})
