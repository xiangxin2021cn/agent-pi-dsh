import assert from 'node:assert/strict'
import { test } from 'node:test'
import { installKbSessionBridge, installKbWorkspaceBridge, mainSessionId } from '../src/client/kb-session-bridge.js'

function fixture() {
  let byId = {}
  let epoch = 'draft-1'
  let finish
  const listeners = new Set()
  const claims = [], selected = []
  const sessions = {
    list: { getSnapshot: () => ({ byId }), subscribe(fn) { listeners.add(fn); return () => listeners.delete(fn) } },
    create: async () => new Promise(resolve => { finish = resolve }),
  }
  const select = (id, sidebar = '') => {
    byId = Object.fromEntries([[id, 'mainView'], [sidebar, 'sidebarChat']].filter(([key]) => key).map(([key, source]) => [key, { id: key, retainedBy: { [source]: 1 } }]))
    listeners.forEach(fn => fn())
  }
  const kb = {
    kbDraftKey: () => epoch,
    resetDraftKbTask() { epoch += '-new' },
    async claimDraftKbTask(id, created, captured) {
      if (epoch === captured) { claims.push([id, created, captured]); this.resetDraftKbTask() }
    },
  }
  const stop = installKbSessionBridge(sessions, kb, id => selected.push(id))
  const workspace = { connectWorkspace: () => sessions.create() }
  installKbWorkspaceBridge(sessions, workspace, kb)
  return { sessions, workspace, kb, claims, selected, select, stop, finish: id => finish(id) }
}

test('main selection ignores a retained sidebar teammate', () => {
  const f = fixture()
  f.select('main', 'child')
  f.select('main', 'other-child')
  assert.equal(mainSessionId(f.sessions.list.getSnapshot()), 'main')
  assert.deepEqual(f.selected, ['', 'main'])
  f.select('', 'child')
  assert.equal(mainSessionId(f.sessions.list.getSnapshot()), '')
  assert.deepEqual(f.selected, ['', 'main', ''])
  f.stop(); f.select('after-dispose')
  assert.deepEqual(f.selected, ['', 'main', ''])
})

test('main workspace navigation claims its new or reused blank exactly once', async () => {
  const f = fixture()
  const pending = f.workspace.connectWorkspace()
  f.finish('blank'); assert.equal(await pending, 'blank')
  assert.deepEqual(f.claims, [['blank', true, 'draft-1']])
  f.select('blank')
  f.select('history')
  const next = f.workspace.connectWorkspace(); f.finish('another'); await next
  assert.equal(f.claims.length, 1)
})

test('background creation never consumes no-session knowledge choices', async () => {
  const f = fixture()
  const pending = f.sessions.create(); f.finish('background'); await pending
  assert.deepEqual(f.claims, [])
  f.select('', 'background')
  assert.equal(f.kb.kbDraftKey(), 'draft-1')
})

test('navigation to history invalidates a late workspace claim', async () => {
  const f = fixture()
  const pending = f.workspace.connectWorkspace()
  f.select('history'); f.finish('late'); await pending
  assert.deepEqual(f.claims, [])
})

test('failed persistence does not turn a successful workspace connection into failure', async () => {
  const f = fixture()
  f.kb.claimDraftKbTask = async () => { throw new Error('save failed') }
  const pending = f.workspace.connectWorkspace(); f.finish('created')
  assert.equal(await pending, 'created')
})
