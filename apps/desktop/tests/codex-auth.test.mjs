import assert from 'node:assert/strict'
import { EventEmitter } from 'node:events'
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { PassThrough } from 'node:stream'
import { test } from 'node:test'
import { runInNewContext } from 'node:vm'
import {
  createCodexAuthController,
  parseCodexLoginStatus,
  resolveCodexWrapper,
} from '../codex-auth.mjs'

test('desktop resolves only the product Codex package and never the old DSH or PATH CLI', (t) => {
  const root = mkdtempSync(join(tmpdir(), 'agent-pi-product-codex-'))
  t.after(() => rmSync(root, { recursive: true, force: true }))
  const oldPackage = join(root, 'packages/subagent/subagent-codex/node_modules/@openai/codex')
  mkdirSync(join(oldPackage, 'bin'), { recursive: true })
  writeFileSync(join(oldPackage, 'package.json'), JSON.stringify({ version: '0.149.1', bin: { codex: 'bin/codex.js' } }))
  writeFileSync(join(oldPackage, 'bin/codex.js'), 'old DSH wrapper')
  const fakePath = join(root, 'global-bin')
  mkdirSync(fakePath)
  writeFileSync(join(fakePath, 'codex.exe'), 'global CLI must not be used')
  const beforePath = process.env.PATH
  try {
    process.env.PATH = fakePath
    assert.equal(resolveCodexWrapper(root), null)
    const productPackage = join(root, 'bundles/tender-host/node_modules/@openai/codex')
    mkdirSync(join(productPackage, 'bin'), { recursive: true })
    writeFileSync(join(productPackage, 'package.json'), JSON.stringify({ version: '0.153.4', bin: { codex: 'bin/codex.js' } }))
    const wrapper = join(productPackage, 'bin/codex.js')
    writeFileSync(wrapper, 'product wrapper')
    assert.equal(resolveCodexWrapper(root), wrapper)
    rmSync(wrapper)
    assert.equal(resolveCodexWrapper(root), null)
  } finally {
    if (beforePath === undefined) delete process.env.PATH
    else process.env.PATH = beforePath
  }
  const main = readFileSync(new URL('../main.mjs', import.meta.url), 'utf8')
  assert.match(main, /resolveCodexWrapper\(productRoot\)/)
  assert.doesNotMatch(main, /resolveCodexWrapper\(dshRoot\)/)
})

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

test('Codex auth controller enriches a logged-in status with the dynamic catalog', async () => {
  const catalog = {
    models: [{ id: 'model-a', displayName: 'Model A', isDefault: true }],
    selectedModel: null,
    defaultModel: 'model-a',
    model: { id: 'model-a', displayName: 'Model A', isDefault: true },
  }
  let probes = 0
  const controller = createCodexAuthController({
    nodePath: 'node.exe',
    wrapperPath: 'codex.js',
    codexHome: join(process.cwd(), '.tmp', 'codex-auth-model-test'),
    baseEnv: { OPENAI_API_KEY: 'must-not-cross' },
    spawnSync() { return { status: 0, stdout: 'Logged in using ChatGPT' } },
    async probeModels(options) {
      probes += 1
      assert.equal(options.env.OPENAI_API_KEY, undefined)
      return catalog
    },
  })
  const [first, second] = await Promise.all([controller.status(), controller.status()])
  assert.equal(probes, 1)
  assert.deepEqual(first, { available: true, state: 'logged-in', method: 'chatgpt', ...catalog })
  assert.deepEqual(second, first)
})

test('Codex auth controller preserves login and returns a retryable error when model discovery fails', async () => {
  const controller = createCodexAuthController({
    nodePath: 'node.exe',
    wrapperPath: 'codex.js',
    codexHome: join(process.cwd(), '.tmp', 'codex-auth-model-failure-test'),
    spawnSync() { return { status: 0, stdout: 'Logged in using ChatGPT' } },
    async probeModels() { throw new Error('private upstream diagnostic') },
  })
  const status = await controller.status()
  assert.equal(status.state, 'logged-in')
  assert.equal(status.method, 'chatgpt')
  assert.deepEqual(status.models, [])
  assert.equal(status.model, null)
  assert.match(status.modelError, /重试/)
  assert.doesNotMatch(status.modelError, /private upstream/)
})

test('saving a default model uses the isolated account and refuses logged-out writes', async () => {
  let loggedIn = true
  const calls = []
  const catalog = { models: [{ id: 'model-b' }], selectedModel: 'model-b', defaultModel: 'model-b', model: { id: 'model-b' } }
  const codexHome = join(process.cwd(), '.tmp', 'codex-auth-save-test')
  const controller = createCodexAuthController({
    nodePath: 'node.exe',
    wrapperPath: 'codex.js',
    codexHome,
    baseEnv: { CODEX_HOME: 'unrelated-home', OPENAI_API_KEY: 'must-not-cross' },
    spawnSync() { return { status: loggedIn ? 0 : 1, stdout: loggedIn ? 'Logged in using ChatGPT' : 'Not logged in' } },
    async setDefaultModel(options, model) {
      calls.push(model)
      assert.equal(options.env.CODEX_HOME, codexHome)
      assert.equal(options.env.OPENAI_API_KEY, undefined)
      return catalog
    },
  })
  assert.equal((await controller.setDefaultModel('model-b')).defaultModel, 'model-b')
  loggedIn = false
  await assert.rejects(controller.setDefaultModel('model-a'), /先登录/)
  assert.deepEqual(calls, ['model-b'])
})

test('an unavailable saved model is visible and requires a new selection', async () => {
  const controller = createCodexAuthController({
    nodePath: 'node.exe',
    wrapperPath: 'codex.js',
    codexHome: join(process.cwd(), '.tmp', 'codex-auth-missing-model-test'),
    spawnSync() { return { status: 0, stdout: 'Logged in using ChatGPT' } },
    async probeModels() { return { models: [{ id: 'model-a' }], selectedModel: 'removed', defaultModel: null, model: null } },
  })
  const status = await controller.status()
  assert.equal(status.selectedModel, 'removed')
  assert.equal(status.defaultModel, null)
  assert.match(status.modelError, /重新选择/)
})

test('saving reasoning uses the isolated account and refuses logged-out writes', async () => {
  let loggedIn = true
  const calls = []
  const codexHome = join(process.cwd(), '.tmp', 'codex-auth-reasoning-test')
  const controller = createCodexAuthController({
    nodePath: 'node.exe', wrapperPath: 'codex.js', codexHome,
    baseEnv: { CODEX_HOME: 'unrelated-home', OPENAI_API_KEY: 'must-not-cross' },
    spawnSync() { return { status: loggedIn ? 0 : 1, stdout: loggedIn ? 'Logged in using ChatGPT' : 'Not logged in' } },
    async setDefaultReasoningEffort(options, effort) {
      calls.push(effort)
      assert.equal(options.env.CODEX_HOME, codexHome)
      assert.equal(options.env.OPENAI_API_KEY, undefined)
      return { selectedReasoningEffort: effort }
    },
  })
  assert.equal((await controller.setDefaultReasoningEffort('ultra')).selectedReasoningEffort, 'ultra')
  assert.equal((await controller.setDefaultReasoningEffort(null)).selectedReasoningEffort, null)
  loggedIn = false
  await assert.rejects(controller.setDefaultReasoningEffort('medium'), /先登录/)
  assert.deepEqual(calls, ['ultra', null])
})

test('Electron exposes only normalized Codex auth operations to the renderer', () => {
  const desktop = join(import.meta.dirname, '..')
  const main = readFileSync(join(desktop, 'main.mjs'), 'utf8')
  const preload = readFileSync(join(desktop, 'preload.cjs'), 'utf8')
  assert.match(main, /createCodexAuthController/)
  assert.match(main, /ipcMain\.handle\('codex-auth-status'/)
  assert.match(main, /ipcMain\.handle\('codex-auth-login'/)
  assert.match(main, /ipcMain\.handle\('codex-auth-logout'/)
  assert.match(main, /ipcMain\.handle\('codex-set-default-reasoning-effort'/)
  assert.match(main, /delete env\.OPENAI_API_KEY/)
  assert.match(main, /delete env\.CODEX_ACCESS_TOKEN/)
  assert.match(preload, /codexAuthStatus/)
  assert.match(preload, /codexAuthLogin/)
  assert.match(preload, /codexAuthLogout/)
  assert.match(preload, /codexSetDefaultReasoningEffort/)
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

test('logout cancels an in-flight model query and cannot restore stale logged-in state', async () => {
  let loggedIn = true
  const controller = createCodexAuthController({
    nodePath: 'node.exe',
    wrapperPath: 'codex.js',
    codexHome: join(process.cwd(), '.tmp', 'codex-auth-logout-race-test'),
    spawnSync(_command, args) {
      if (args.at(-1) === 'logout') { loggedIn = false; return { status: 0 } }
      return { status: loggedIn ? 0 : 1, stdout: loggedIn ? 'Logged in using ChatGPT' : 'Not logged in' }
    },
    probeModels({ signal }) {
      return new Promise((_resolve, reject) => signal.addEventListener('abort', () => reject(new Error('aborted'))))
    },
  })
  const pending = controller.status()
  assert.equal(controller.logout().state, 'logged-out')
  assert.equal((await pending).state, 'logged-out')
})

test('a failed model query can be retried by refreshing status', async () => {
  let attempts = 0
  const controller = createCodexAuthController({
    nodePath: 'node.exe',
    wrapperPath: 'codex.js',
    codexHome: join(process.cwd(), '.tmp', 'codex-auth-refresh-test'),
    spawnSync() { return { status: 0, stdout: 'Logged in using ChatGPT' } },
    async probeModels() {
      if (++attempts === 1) throw new Error('temporary failure')
      return { models: [{ id: 'new-model' }], model: { id: 'new-model' }, defaultModel: 'new-model', selectedModel: null }
    },
  })
  assert.match((await controller.status()).modelError, /重试/)
  assert.equal((await controller.status()).defaultModel, 'new-model')
  assert.equal(attempts, 2)
})
