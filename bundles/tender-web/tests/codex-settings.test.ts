import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { test } from 'node:test'
import vm from 'node:vm'

const client = readFileSync(join(dirname(fileURLToPath(import.meta.url)), '../lib/client.js'), 'utf8')

function renderedRuntimeSettings(locale, source) {
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
  const React = {
    createElement(type, props, ...children) { return { type, props, children } },
    useState(value) {
      const initial = typeof value === 'function' ? value() : value
      return [initial, () => {}]
    },
    useEffect() {},
    useRef(value) { return { current: value } },
    useCallback(fn) { return fn },
  }
  const sourceCode = client.replace(
    /(\s*return module\.exports;)/,
    "\n    window.__apCodexSettingsTest = { DshRuntimeSettingsSection, setApLang };\n$1",
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
  return window.__apCodexSettingsTest.DshRuntimeSettingsSection()
}

function renderedText(node) {
  if (node == null || node === false) return ''
  if (Array.isArray(node)) return node.map(renderedText).join('')
  if (typeof node === 'object') return renderedText(node.children)
  return String(node)
}

test('mainline settings expose DSH runtime preferences without custom Codex login or model controls', () => {
  const source = readFileSync(new URL('../src/client/index.js', import.meta.url), 'utf8')
  assert.match(source, /function DshRuntimeSettingsSection/)
  assert.match(source, /id: 'agent-pi-runtime'/)
  assert.match(source, /h\(AgentTeamsSettings, \{ desktop, zh \}\)/)
  assert.doesNotMatch(source, /CodexSettingsSection|ComposerCodexModelSelector|codexAuthLogin|codexAuthLogout|codexSetDefaultModel|codexSetDefaultReasoningEffort|DSH \/ Codex/)
  assert.doesNotMatch(source, /nativeCodex\.(?:submit|taskAction|enabled|busy)/)
})

test('runtime settings retain localized compaction and team preferences', () => {
  for (const [locale, title, compaction] of [['zh', 'DSH 运行设置', '对话自动压缩'], ['en', 'DSH runtime settings', 'Automatic conversation compaction']]) {
    const tree = renderedRuntimeSettings(locale)
    const text = renderedText(tree)
    assert.ok(text.includes(title))
    assert.ok(text.includes(compaction))
    assert.doesNotMatch(text, /ChatGPT|默认 Codex|Default Codex/)
    if (locale === 'en') assert.doesNotMatch(text, /[\u4e00-\u9fff]/)
  }
})
