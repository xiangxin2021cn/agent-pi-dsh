import assert from 'node:assert/strict'
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { test } from 'node:test'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { patchRouterStandardForDshRc1 } from './patch-router-standard-rc1.mjs'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const preset = join(root, 'vendor', 'dsh-router-standard', 'preset')
const coreUrl = pathToFileURL(join(preset, 'router-core.mjs')).href
const bootstrapUrl = pathToFileURL(join(preset, 'router-bootstrap.mjs')).href

test('router-standard reads rc.1 sessions through snapshotEvents', async () => {
  const { sessionEvents, sessionMode } = await import(coreUrl)
  const current = [
    { type: 'user/message', data: { content: [{ type: 'text', text: '修复这个故障' }] } },
  ]
  const legacy = [
    { type: 'user/message', data: { content: [{ type: 'text', text: '创建一个网站' }] } },
  ]
  const session = { snapshotEvents: () => current, events: legacy }

  assert.equal(sessionEvents(session), current)
  assert.equal(sessionMode(session), 0)
  assert.equal(sessionMode({ events: legacy }), 1)
})

test('router-standard bootstrap handles an rc.1 session without an events getter', async () => {
  const { apply } = await import(bootstrapUrl)
  const handlers = new Map()
  const registered = []
  const appended = []
  const events = [
    { type: 'user/message', data: { content: [{ type: 'text', text: '请处理一下' }] } },
    { type: 'tool/call', data: {} },
  ]
  const session = { id: 'session-rc1', snapshotEvents: () => events }
  const agent = {
    session,
    options: { model: 'deepseek-v4-flash' },
    inbox: { append: (...args) => appended.push(args) },
  }
  const ctx = {
    on: (name, handler) => handlers.set(name, handler),
    effect: (run) => run(),
    tools: { register: (tool) => registered.push(tool) },
    get: (name) => name === 'agent' ? agent : undefined,
  }

  apply(ctx, {})
  assert.equal(registered.length, 3)

  const assembled = await handlers.get('system-prompt/assemble')(
    null,
    { agent },
    async () => ({
      sections: [{ name: 'persona', text: 'old' }],
      tools: [{ name: 'read' }, { name: 'pwsh' }, { name: 'extra' }],
    }),
  )
  assert.deepEqual(assembled.tools.map((tool) => tool.name), ['read', 'pwsh', 'extra'])

  handlers.get('session/event')(session, {
    type: 'user/message',
    data: { source: { kind: 'user' }, content: [{ type: 'text', text: '请处理一下' }] },
  })
  assert.equal(appended.length, 1)
})

test('router-standard confines the legacy Session.events fallback to its compatibility helper', () => {
  const core = readFileSync(join(preset, 'router-core.mjs'), 'utf8')
  const bootstrap = readFileSync(join(preset, 'router-bootstrap.mjs'), 'utf8')
  assert.equal((core.match(/\bsession\.events\b/g) || []).length, 1)
  assert.doesNotMatch(core, /const events = session\.events/)
  assert.doesNotMatch(bootstrap, /\bsession\.events\b/)
})

test('vendored Router Standard is pinned and patched deterministically', (t) => {
  const pluginRoot = mkdtempSync(join(tmpdir(), 'agent-pi-router-rc1-'))
  t.after(() => rmSync(pluginRoot, { recursive: true, force: true }))
  mkdirSync(join(pluginRoot, 'preset'), { recursive: true })
  writeFileSync(join(pluginRoot, 'package.json'), JSON.stringify({
    name: 'dsh-router-standard',
    version: '0.1.0',
  }))
  writeFileSync(join(pluginRoot, 'preset', 'router-core.mjs'), [
    'export function sessionMode(session) {',
    '  const events = session.events',
    '}',
    '',
  ].join('\n'))
  writeFileSync(join(pluginRoot, 'preset', 'router-bootstrap.mjs'), [
    'import {',
    '  applyPersona, bandFor, coreFor, parseMode, personaFor, sessionMode, testinessFor, clamp01,',
    "} from './router-core.mjs'",
    "    if (session.events.some((event) => event.type === 'tool/call')) {",
    '',
  ].join('\n'))

  assert.equal(patchRouterStandardForDshRc1({ pluginRoot }), 'applied')
  assert.equal(patchRouterStandardForDshRc1({ pluginRoot }), 'already-applied')
  assert.match(readFileSync(join(pluginRoot, 'preset', 'router-core.mjs'), 'utf8'), /snapshotEvents/)
  assert.match(readFileSync(join(pluginRoot, 'preset', 'router-bootstrap.mjs'), 'utf8'), /bandOf, coreFor, extractText/)

  const vendorScript = readFileSync(join(root, 'scripts', 'vendor-dsh-plugins.ps1'), 'utf8')
  assert.match(vendorScript, /b39112dce54b90e67b50b166c2773861d7945d1f/)
  assert.doesNotMatch(vendorScript, /dsh-router-standard\/main/)
  assert.match(vendorScript, /patch-router-standard-rc1\.mjs/)
})
