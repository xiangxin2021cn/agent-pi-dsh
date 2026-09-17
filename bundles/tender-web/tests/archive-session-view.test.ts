import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { readdirSync } from 'node:fs'
import { resolve, join } from 'node:path'
import { test } from 'node:test'
import { installArchiveSessionView } from '../src/client/archive-session-view.js'

test('archive owns an injected independent session and releases it on switch and close', async () => {
  const store = resolve(import.meta.dirname, '../../../vendor/deepseek-harness/node_modules/.pnpm')
  const require = createRequire(import.meta.url)
  const pkg = (name, entry = '') => require(join(store, readdirSync(store).find(x => x.startsWith(name + '@'))!, 'node_modules', name, entry))
  const React = pkg('react'), { createRoot } = pkg('react-dom', 'client.js'), { JSDOM } = pkg('jsdom')
  const dom = new JSDOM('<div id="root"></div>', { url: 'http://localhost/' })
  const globals = { window: dom.window, document: dom.window.document, IS_REACT_ACT_ENVIRONMENT: true }
  const previous = Object.fromEntries(Object.keys(globals).map(key => [key, Object.getOwnPropertyDescriptor(globalThis, key)]))
  for (const [key, value] of Object.entries(globals)) Object.defineProperty(globalThis, key, { configurable: true, writable: true, value })
  const entries = new Map(), retained = [], released = []
  const sessions = { retain(id, options) { retained.push({ id, options }); return { sessionId: id, ready: Promise.resolve(), release: () => released.push(id) } } }
  const scope = { sessions, slots: { inject(_name, fn) { fn() }, register(def, component) { entries.set(def.name, component) } } }
  const ctx = { get sessions() { throw new Error('Use the injected scope') }, inject(_services, fn) { fn(scope) } }
  installArchiveSessionView(ctx, { React, useLanguage: () => 'zh' })
  const root = createRoot(dom.window.document.getElementById('root'))
  try {
    const Viewer = entries.get('shell.overlay')
    await React.act(async () => root.render(React.createElement(Viewer, {
      SessionProvider: ({ session, children }) => React.createElement('div', { 'data-session': session.sessionId }, children),
      renderSlot: () => React.createElement('span', null, 'Native conversation'),
    })))
    for (const id of ['archived-a', 'archived-b']) {
      await React.act(async () => dom.window.dispatchEvent(new dom.window.CustomEvent('agent-pi-view-archive', { detail: { sessionId: id } })))
      assert.equal(dom.window.document.querySelector('[data-session]')?.getAttribute('data-session'), id)
    }
    assert.deepEqual(retained, ['archived-a', 'archived-b'].map(id => ({ id, options: { source: 'agentPiArchive' } })))
    assert.deepEqual(released, ['archived-a'])
    await React.act(async () => dom.window.document.querySelector('button')!.click())
    assert.equal(dom.window.document.querySelector('[role="dialog"]'), null)
    assert.deepEqual(released, ['archived-a', 'archived-b'])
  } finally {
    await React.act(async () => root.unmount())
    dom.window.close()
    for (const key of Object.keys(globals)) {
      if (previous[key]) Object.defineProperty(globalThis, key, previous[key])
      else delete globalThis[key]
    }
  }
})
