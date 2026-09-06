import assert from 'node:assert/strict'
import { test } from 'node:test'
import { installKbSessionBridge, installKbWorkspaceBridge } from '../src/client/kb-session-bridge.js'

function fixture() {
  let current = ''
  let epoch = 'draft-1'
  let finish: (id: string) => void
  const claims: unknown[][] = []
  const selected: string[] = []
  const sessions = {
    list: { getSnapshot: () => ({ current }) },
    create: async (_options?: unknown) => new Promise<string>((resolve) => { finish = resolve }),
    open(id: string) { current = id },
    clear() { current = '' },
  }
  const kb = {
    kbDraftKey: () => epoch,
    resetDraftKbTask() { epoch += '-new' },
    async claimDraftKbTask(id: string, created: boolean, captured: string) {
      if (epoch === captured) { claims.push([id, created, captured]); this.resetDraftKbTask() }
    },
  }
  installKbSessionBridge(sessions, kb, (id) => selected.push(id))
  return { sessions, kb, claims, selected, finish: (id: string) => finish(id) }
}

test('only native create from the current no-session draft claims the exact returned id', async () => {
  const f = fixture()
  const pending = f.sessions.create({ cwd: 'C:/workspace' })
  f.finish('new-id')
  assert.equal(await pending, 'new-id')
  assert.deepEqual(f.claims, [['new-id', true, 'draft-1']])
  f.sessions.open('new-id')
  f.sessions.open('historical-blank')
  assert.equal(f.claims.length, 1)
  f.sessions.clear()
  const next = f.sessions.create()
  f.finish('second-new-id')
  await next
  assert.equal(f.claims.at(-1)?.[0], 'second-new-id')
  assert.ok(f.selected.includes(''))
})

test('opening history or starting another draft invalidates an in-flight create claim', async () => {
  for (const action of ['open', 'clear']) {
    const f = fixture()
    const pending = f.sessions.create()
    if (action === 'open') f.sessions.open('historical-blank')
    else f.sessions.clear()
    f.finish('late-created-id')
    await pending
    assert.deepEqual(f.claims, [])
  }
})

test('active-session creates and explicit adoption never claim draft choices', async () => {
  const f = fixture()
  f.sessions.open('existing')
  let pending = f.sessions.create()
  f.finish('background-created')
  await pending
  f.sessions.clear()
  pending = f.sessions.create({ sessionId: 'adopted' })
  f.finish('adopted')
  await pending
  assert.deepEqual(f.claims, [])
})

test('failed selection persistence never turns a successful native create into a creation failure', async () => {
  const f = fixture()
  f.kb.claimDraftKbTask = async () => { throw new Error('save failed') }
  const pending = f.sessions.create()
  f.finish('created-but-selection-pending')
  assert.equal(await pending, 'created-but-selection-pending')
  f.sessions.open('created-but-selection-pending')
  assert.equal(f.sessions.list.getSnapshot().current, 'created-but-selection-pending')
})

test('native workspace navigation claims its reused blank but history navigation does not', async () => {
  const f = fixture()
  const workspace = { connectWorkspace: async () => 'reused-blank' }
  installKbWorkspaceBridge(f.sessions, workspace, f.kb)
  const id = await workspace.connectWorkspace()
  assert.deepEqual(f.claims, [['reused-blank', true, 'draft-1']])
  f.sessions.open(id)
  f.sessions.open('history')
  assert.equal(f.claims.length, 1)
  await workspace.connectWorkspace()
  assert.equal(f.claims.length, 1, 'an active historical session never transfers no-session choices')
})

test('workspace navigation cannot consume a stale draft or double-claim a real new session', async () => {
  const f = fixture()
  const workspace = { connectWorkspace: () => f.sessions.create() }
  installKbWorkspaceBridge(f.sessions, workspace, f.kb)
  let pending = workspace.connectWorkspace()
  f.finish('new-through-workspace')
  await pending
  assert.equal(f.claims.length, 1)
  f.sessions.clear()
  pending = workspace.connectWorkspace()
  f.sessions.open('historical-blank')
  f.finish('late-workspace')
  await pending
  assert.equal(f.claims.length, 1)
})
