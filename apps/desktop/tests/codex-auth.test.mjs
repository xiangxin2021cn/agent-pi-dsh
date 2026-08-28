import assert from 'node:assert/strict'
import { EventEmitter } from 'node:events'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { PassThrough } from 'node:stream'
import { test } from 'node:test'
import { runInNewContext } from 'node:vm'
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

test('Codex auth controller enriches a logged-in status with the active model', () => {
  const codexHome = join(process.cwd(), '.tmp', 'codex-auth-model-test')
  const appServerReply = JSON.stringify({
    id: 2,
    result: { data: [{ id: 'gpt-5.6-sol', isDefault: true }] },
  })
  const controller = createCodexAuthController({
    nodePath: 'node.exe',
    wrapperPath: 'codex.js',
    codexHome,
    baseEnv: { PATH: 'C:\\Windows', OPENAI_API_KEY: 'must-not-cross' },
    spawnSync(_command, args) {
      if (args.slice(-2).join(' ') === 'login status') {
        return { status: 0, stdout: 'Logged in using ChatGPT\n', stderr: '' }
      }
      if (args.includes('app-server')) {
        return { status: 0, stdout: appServerReply, stderr: '' }
      }
      throw new Error('unexpected command')
    },
  })

  assert.deepEqual(controller.status(), {
    available: true,
    state: 'logged-in',
    method: 'chatgpt',
    model: {
      id: 'gpt-5.6-sol',
      contextWindow: 1_050_000,
      maxTokens: 128_000,
      contextWindowSource: 'official',
      maxTokensSource: 'official',
    },
  })
})

test('Electron exposes only normalized Codex auth operations to the renderer', () => {
  const desktop = join(import.meta.dirname, '..')
  const main = readFileSync(join(desktop, 'main.mjs'), 'utf8')
  const preload = readFileSync(join(desktop, 'preload.cjs'), 'utf8')
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

test('sandboxed Electron preload executes as CommonJS and exposes the Codex bridge', () => {
  const desktop = join(import.meta.dirname, '..')
  const source = readFileSync(join(desktop, 'preload.cjs'), 'utf8')
  const exposed = {}
  const invocations = []

  runInNewContext(source, {
    require(specifier) {
      assert.equal(specifier, 'electron')
      return {
        contextBridge: {
          exposeInMainWorld(name, value) { exposed[name] = value },
        },
        ipcRenderer: {
          invoke(channel) {
            invocations.push(channel)
            return Promise.resolve({ available: true, state: 'logged-out' })
          },
          on() {},
          removeListener() {},
        },
        webUtils: { getPathForFile() { return '' } },
      }
    },
  })

  assert.equal(typeof exposed.agentPiDesktop.codexAuthStatus, 'function')
  exposed.agentPiDesktop.codexAuthStatus()
  assert.deepEqual(invocations, ['codex-auth-status'])

  const main = readFileSync(join(desktop, 'main.mjs'), 'utf8')
  const manifest = JSON.parse(readFileSync(join(desktop, 'package.json'), 'utf8'))
  assert.match(main, /preload\.cjs/)
  assert.ok(manifest.build.files.includes('preload.cjs'))
})
