import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { readdirSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { test } from 'node:test'
import { createKnowledgeVersionPanel } from '../src/client/knowledge-version.js'

function vendorPackage(name, entry = '') {
  const pnpm = resolve(fileURLToPath(new URL('../../../vendor/deepseek-harness/node_modules/.pnpm/', import.meta.url)))
  const folder = readdirSync(pnpm).find(row => row === name || row.startsWith(name + '@'))
  return createRequire(import.meta.url)(join(pnpm, folder, 'node_modules', name, entry))
}
test('human date clearing sends explicit empty fields instead of silently retaining prior validity', async () => {
  const { JSDOM } = vendorPackage('jsdom'), React = vendorPackage('react')
  const dom = new JSDOM('<div id="root"></div>', { url: 'http://localhost/' }), previous = {}, calls = []
  for (const [key, value] of Object.entries({ window: dom.window, document: dom.window.document, navigator: dom.window.navigator, HTMLElement: dom.window.HTMLElement, Event: dom.window.Event, MouseEvent: dom.window.MouseEvent, IS_REACT_ACT_ENVIRONMENT: true })) {
    previous[key] = Object.getOwnPropertyDescriptor(globalThis, key)
    Object.defineProperty(globalThis, key, { configurable: true, writable: true, value })
  }
  const { createRoot } = vendorPackage('react-dom', 'client.js'), root = createRoot(dom.window.document.getElementById('root')), changed = []
  const Panel = createKnowledgeVersionPanel({ React, api: async (_url, _cwd, options) => { calls.push(JSON.parse(options.body)); return { versions: [] } } })
  try {
    await React.act(async () => root.render(React.createElement(Panel, { cwd: 'workspace', entry: { slug: 'validity-note', sourceKind: 'original', validFrom: '2026-01-01', validUntil: '2026-12-31' }, onChanged: () => changed.push(true) })))
    const setter = Object.getOwnPropertyDescriptor(dom.window.HTMLInputElement.prototype, 'value').set
    for (const input of dom.window.document.querySelectorAll('input[type=date]')) await React.act(async () => { setter.call(input, ''); input.dispatchEvent(new dom.window.Event('input', { bubbles: true })) })
    await React.act(async () => dom.window.document.querySelector('button').dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true })))
    const saved = calls.find(row => row.action === 'metadata')
    assert.equal(saved.slug, 'validity-note'); assert.equal(saved.metadata.validFrom, ''); assert.equal(saved.metadata.validUntil, '')
    assert.equal(changed.length, 1)
  } finally {
    await React.act(async () => root.unmount()); dom.window.close()
    for (const [key, descriptor] of Object.entries(previous)) { if (descriptor) Object.defineProperty(globalThis, key, descriptor); else delete globalThis[key] }
  }
})
