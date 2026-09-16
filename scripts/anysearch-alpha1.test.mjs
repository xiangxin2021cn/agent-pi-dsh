import assert from 'node:assert/strict'
import { test } from 'node:test'
import { apply } from '../vendor/anysearch-dsh/lib/index.js'

test('AnySearch 0.1.4 registers against the actual bundled native web-fetch API', () => {
  const tools = new Map(), search = [], fetch = [], sections = []
  const ctx = {
    credentials: { resolve: async () => undefined },
    web: { registerSearchProvider: value => search.push(value), registerFetchProvider: value => fetch.push(value) },
    tools: { get: name => tools.get(name), register: tool => tools.set(tool.name, tool) },
    systemPrompt: { section: value => sections.push(value), getSectionOrder: () => 1 },
  }
  apply(ctx, {})
  assert.equal(search[0].id, 'anysearch')
  assert.equal(fetch[0].id, 'anysearch')
  assert.ok(tools.has('web_fetch'))
  assert.ok(tools.has('anysearch_capabilities'))
  assert.equal(sections[0].name, 'tool:web_fetch')
  const native = tools.get('web_fetch')
  apply(ctx, {})
  assert.equal(tools.get('web_fetch'), native, 'existing native tool must never be replaced')
  assert.equal(sections.length, 1)
})
