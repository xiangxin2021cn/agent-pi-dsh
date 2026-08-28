import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { test } from 'node:test'
import vm from 'node:vm'

const client = readFileSync(join(dirname(fileURLToPath(import.meta.url)), '../lib/client.js'), 'utf8')

function renderedCodexSettings(locale, source) {
  let definition
  const document = {
    addEventListener() {},
    removeEventListener() {},
    querySelector() { return null },
    querySelectorAll() { return [] },
    createElement() { return { dataset: {}, remove() {} } },
    head: { appendChild() {} },
    documentElement: {
      classList: { add() {}, remove() {}, toggle() {} },
      setAttribute() {},
    },
  }
  const window = {
    __ModuleLoader__: { load(next) { definition = next } },
    agentPiDesktop: {},
    addEventListener() {},
    removeEventListener() {},
    dispatchEvent() {},
    confirm() { return false },
  }
  const auth = {
    available: true,
    state: 'logged-in',
    model: {
      id: 'gpt-test',
      contextWindow: 1000,
      contextWindowSource: source,
      maxTokens: 100,
      maxTokensSource: source,
    },
  }
  const React = {
    createElement(type, props, ...children) { return { type, props, children } },
    useState(value) {
      const initial = typeof value === 'function' ? value() : value
      return [initial && initial.state === 'checking' ? auth : initial, () => {}]
    },
    useEffect() {},
    useRef(value) { return { current: value } },
    useCallback(fn) { return fn },
  }
  const sourceCode = client.replace(
    "    exports.name = 'tender-web'",
    "    window.__apCodexSettingsTest = { CodexSettingsSection, setApLang };\n\n    exports.name = 'tender-web'",
  )
  vm.runInNewContext(sourceCode, {
    window,
    document,
    requestAnimationFrame: (fn) => { fn(); return 1 },
    setInterval: () => 1,
    clearInterval() {},
    CustomEvent: class { constructor(type, init) { this.type = type; this.detail = init?.detail } },
    Event: class { constructor(type) { this.type = type } },
    fetch: async () => ({ ok: true, json: async () => ({}) }),
    MutationObserver: class { observe() {} disconnect() {} },
    AbortController,
    URLSearchParams,
    console,
  })
  definition.factory((name) => name === 'react' ? React : {})
  window.__apCodexSettingsTest.setApLang(locale)
  return window.__apCodexSettingsTest.CodexSettingsSection()
}

function renderedText(node) {
  if (node == null || node === false) return ''
  if (Array.isArray(node)) return node.map(renderedText).join('')
  if (typeof node === 'object') return renderedText(node.children)
  return String(node)
}

test('desktop settings expose ChatGPT login without treating Codex as a model provider', () => {
  assert.match(client, /function CodexSettingsSection/)
  assert.match(client, /codexAuthStatus/)
  assert.match(client, /codexAuthLogin/)
  assert.match(client, /codexAuthLogout/)
  assert.match(client, /id: 'agent-pi-codex'/)
  assert.match(client, /subagent_codex/)
  assert.match(client, /模型信息暂不可用/)
  assert.match(client, /供应商返回/)
  assert.match(client, /官方参数/)
  assert.match(client, /估算参数/)
  assert.match(client, /Codex 执行/)
  assert.match(client, /run_in_background=false/)
  assert.match(client, /codexAuthStatus\(\)/)
  assert.match(client, /setCodexTurnArmed/)
  assert.match(client, /clearCodexTurnAfterSubmit/)
  assert.doesNotMatch(client, /if \(typeof window\.agentPiDesktop\?\.codexAuthStatus === 'function'\)/)
  assert.doesNotMatch(client, /id: 'codex'/)
  assert.doesNotMatch(client, /OPENAI_API_KEY/)
})

test('capacity provenance labels render in the active locale', () => {
  const labels = {
    zh: {
      provider: '供应商返回',
      official: '官方参数',
      estimated: '估算参数',
    },
    en: {
      provider: 'Provider metadata',
      official: 'Verified catalog',
      estimated: 'Conservative estimate',
    },
  }
  for (const [locale, expected] of Object.entries(labels)) {
    for (const [source, label] of Object.entries(expected)) {
      const text = renderedText(renderedCodexSettings(locale, source))
      assert.ok(text.includes(label), locale + ' ' + source + ' label')
      if (locale === 'en') {
        assert.equal(/供应商返回|官方参数|估算参数/.test(text), false)
      }
    }
  }
})
