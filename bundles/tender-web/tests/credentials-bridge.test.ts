import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { test } from 'node:test'
import vm from 'node:vm'

const client = readFileSync(join(dirname(fileURLToPath(import.meta.url)), '../lib/client.js'), 'utf8')

function loadCredentialsBridge(fetchCalls) {
  let definition
  const document = {
    addEventListener() {},
    removeEventListener() {},
    querySelector() { return null },
    querySelectorAll() { return [] },
    createElement() { return { dataset: {}, remove() {} } },
    head: { appendChild() {} },
    documentElement: { classList: { add() {}, remove() {}, toggle() {} }, setAttribute() {} },
  }
  const window = {
    __ModuleLoader__: { load(next) { definition = next } },
    agentPiDesktop: {},
    addEventListener() {},
    removeEventListener() {},
    dispatchEvent() {},
    confirm() { return false },
  }
  const React = {
    createElement(type, props, ...children) { return { type, props, children } },
    useState(value) { return [typeof value === 'function' ? value() : value, () => {}] },
    useEffect() {},
    useRef(value) { return { current: value } },
    useCallback(fn) { return fn },
  }
  const source = client.replace(
    "    exports.name = 'tender-web'",
    "    window.__apCredentialsTest = { officialRpc, runtime };\n\n    exports.name = 'tender-web'",
  )
  vm.runInNewContext(source, {
    window,
    document,
    requestAnimationFrame: (fn) => { fn(); return 1 },
    setInterval: () => 1,
    clearInterval() {},
    CustomEvent: class { constructor(type, init) { this.type = type; this.detail = init?.detail } },
    Event: class { constructor(type) { this.type = type } },
    fetch: async (...args) => {
      fetchCalls.push(args)
      return { ok: false, statusText: 'Method Not Allowed', json: async () => ({}) }
    },
    crypto: { randomUUID: () => 'rpc-test' },
    MutationObserver: class { observe() {} disconnect() {} },
    AbortController,
    URLSearchParams,
    console,
  })
  definition.factory((name) => name === 'react' ? React : {})
  return window.__apCredentialsTest
}

test('DeepSeek key dialog uses the alpha.1 Remote credentials namespace', async () => {
  const fetchCalls = []
  const calls = []
  const bridge = loadCredentialsBridge(fetchCalls)
  fetchCalls.length = 0
  bridge.runtime.remote = {
    credentials: {
      describe: async (refs) => {
        calls.push(['describe', refs])
        return { ok: true, value: { credentials: { DEEPSEEK_API_KEY: { configured: true } } } }
      },
      set: async (ref, value) => {
        calls.push(['set', ref, value])
        return { ok: true, value: undefined }
      },
    },
  }

  const described = await bridge.officialRpc('credentials.describe', { refs: ['DEEPSEEK_API_KEY'] })
  await bridge.officialRpc('credentials.set', { ref: 'DEEPSEEK_API_KEY', value: 'sk-test' })

  assert.equal(described.credentials.DEEPSEEK_API_KEY.configured, true)
  assert.deepEqual(calls, [
    ['describe', ['DEEPSEEK_API_KEY']],
    ['set', 'DEEPSEEK_API_KEY', 'sk-test'],
  ])
  assert.equal(fetchCalls.length, 0)
})

test('DeepSeek key dialog surfaces a typed Remote failure', async () => {
  const bridge = loadCredentialsBridge([])
  bridge.runtime.remote = {
    credentials: {
      describe: async () => ({ ok: false, error: { code: 'credential-unavailable', message: 'credential store unavailable' } }),
    },
  }

  await assert.rejects(
    bridge.officialRpc('credentials.describe', { refs: ['DEEPSEEK_API_KEY'] }),
    /credential store unavailable/,
  )
})
