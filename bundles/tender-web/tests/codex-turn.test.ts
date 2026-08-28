import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'
import vm from 'node:vm'
import { buildCodexTurnDelegation, codexCanRun } from '../src/codex-turn.ts'

const client = readFileSync(join(dirname(fileURLToPath(import.meta.url)), '../lib/client.js'), 'utf8')

function loadShippedComposer(options = {}) {
  const timers = []
  let definition
  const document = {
    addEventListener() {},
    removeEventListener() {},
    querySelector() { return null },
    querySelectorAll() { return [] },
    createElement() { return { dataset: {}, remove() {} } },
    head: { appendChild() {} },
    documentElement: { classList: { add() {}, remove() {}, toggle() {} } },
  }
  const window = {
    __ModuleLoader__: { load(next) { definition = next } },
    agentPiDesktop: { codexAuthStatus: async () => ({ available: true, state: 'logged-in' }) },
    addEventListener() {},
    removeEventListener() {},
    dispatchEvent() {},
    setTimeout(fn) { timers.push(fn); return timers.length },
    requestAnimationFrame(fn) { fn() },
  }
  const React = {
    createElement(type, props, ...children) { return { type, props, children } },
    useState(value) { return [typeof value === 'function' ? value() : value, () => {}] },
    useEffect(effect) { effect() },
    useRef(value) { return { current: value } },
    useCallback(fn) { return fn },
  }
  const source = client.replace(
    "    exports.name = 'tender-web'",
    "    window.__apCodexTurnTest = { ComposerTools, codexTurnState, codexTurnArmed, setCodexTurnArmed, setAttachItems, attachItemsOf };\n\n    exports.name = 'tender-web'",
  )
  vm.runInNewContext(source, {
    window,
    document,
    requestAnimationFrame: (fn) => fn(),
    setInterval: () => 1,
    clearInterval() {},
    CustomEvent: class { constructor(type, init) { this.type = type; this.detail = init?.detail } },
    Event: class { constructor(type) { this.type = type } },
    fetch: options.fetch || (async () => ({ ok: true, json: async () => ({}) })),
    MutationObserver: class { observe() {} disconnect() {} },
    AbortController,
    URLSearchParams,
    console,
  })
  const bundle = definition.factory((name) => name === 'react' ? React : {})
  if (options.runtime) {
    bundle.apply({
      slots: { inject() {} },
      inject(names, install) {
        if (names.includes('sessions')) install({ sessions: options.runtime.sessions })
        if (names.includes('conversation')) install({ conversation: options.runtime.conversation })
      },
    })
  }
  return {
    api: window.__apCodexTurnTest,
    runTimers() { timers.splice(0).forEach((fn) => fn()) },
  }
}

function deferred() {
  let resolve
  let reject
  const promise = new Promise((resolvePromise, rejectPromise) => {
    resolve = resolvePromise
    reject = rejectPromise
  })
  return { promise, resolve, reject }
}

function observable(snapshot) {
  let current = snapshot
  const listeners = new Set()
  return {
    getSnapshot() { return current },
    subscribe(listener) { listeners.add(listener); return () => listeners.delete(listener) },
    set(next) { current = next; listeners.forEach((listener) => listener()) },
    get subscriberCount() { return listeners.size },
  }
}

function publicComposer(sessionId, draft) {
  const input = observable({ draft, phase: 'plain', imageIds: [] })
  const session = Object.assign(observable({ nodes: [], promptError: null }), { prompt() {} })
  const scope = { sessionId }
  const sent = []
  const actions = {
    setDraft(text) { input.set({ ...input.getSnapshot(), draft: text }) },
    submit() {
      const framed = input.getSnapshot().draft
      sent.push(framed)
      input.set({ ...input.getSnapshot(), phase: 'submitting' })
    },
  }
  return {
    sessionId,
    input,
    session,
    scope,
    actions,
    sent,
    props() {
      return {
        sessionId,
        input: input.getSnapshot(),
        inputActions: actions,
        useWorkspaces(selector) {
          return selector({ items: [{ path: 'C:/workspace', sessionIds: [sessionId] }] })
        },
      }
    },
  }
}

function publicRuntime(...composers) {
  const byId = new Map(composers.map((composer) => [composer.sessionId, composer]))
  return {
    sessions: {
      scope(sessionId) { return byId.get(sessionId)?.scope },
      binding(sessionId) {
        const composer = byId.get(sessionId)
        return composer ? { session: composer.session } : undefined
      },
    },
    conversation: {
      input: {
        for(scope) {
          return { state: byId.get(scope.sessionId).input }
        },
      },
    },
  }
}

function userNode(seq, text) {
  return { kind: 'user', seq, content: [{ type: 'text', text }] }
}

function composerProps(sessionId, state, actions) {
  return { sessionId, input: state, inputActions: actions }
}

async function flush() {
  await Promise.resolve()
  await Promise.resolve()
  await Promise.resolve()
  await Promise.resolve()
  await Promise.resolve()
  await Promise.resolve()
  await Promise.resolve()
  await Promise.resolve()
}

test('shipped composer uses latest props for a stable action and releases its lock', async () => {
  const { api, runTimers } = loadShippedComposer()
  const state = { draft: 'stale first render', phase: 'plain', imageIds: [] }
  const sent = []
  const actions = {
    setDraft(text) { state.draft = text },
    submit() { state.phase = 'submitting'; sent.push(state.draft) },
  }
  api.ComposerTools(composerProps('one', { draft: 'stale first render', phase: 'plain', imageIds: [] }, actions))
  state.draft = 'latest typed task'
  api.ComposerTools(composerProps('one', state, actions))
  api.setCodexTurnArmed(composerProps('one', state, actions), true)
  actions.submit()
  await flush()
  assert.match(sent[0], /latest typed task/)
  api.ComposerTools(composerProps('one', state, actions))
  state.draft = ''
  state.phase = 'plain'
  api.ComposerTools(composerProps('one', state, actions))
  runTimers()
  assert.equal(api.codexTurnState.submitting.has('one'), false)
})

test('shipped composer does not clear a pending Codex turn after 280ms', async () => {
  const { api, runTimers } = loadShippedComposer()
  const state = { draft: 'deferred task', phase: 'plain', imageIds: ['host-image'] }
  const actions = {
    setDraft(text) { state.draft = text },
    submit() { state.phase = 'submitting' },
  }
  const props = composerProps('deferred', state, actions)
  api.ComposerTools(props)
  api.setAttachItems([{ name: 'photo.png', kind: 'image' }], props)
  api.setCodexTurnArmed(props, true)
  actions.submit()
  await flush()
  runTimers()
  assert.equal(api.codexTurnArmed(props), true)
  assert.equal(api.codexTurnState.submitting.has('deferred'), true)
  assert.equal(api.attachItemsOf('deferred').length, 1)
})

test('shipped composer restores a failed Codex submission for retry without nesting', async () => {
  const { api, runTimers } = loadShippedComposer()
  const state = { draft: 'retry task', phase: 'plain', imageIds: ['host-image'] }
  const actions = {
    setDraft(text) { state.draft = text },
    submit() { state.phase = 'submitting' },
  }
  const props = composerProps('failure', state, actions)
  api.ComposerTools(props)
  api.setAttachItems([{ name: 'photo.png', kind: 'image' }], props)
  api.setCodexTurnArmed(props, true)
  actions.submit()
  await flush()
  api.ComposerTools(props)
  state.phase = 'plain'
  api.ComposerTools(props)
  runTimers()
  assert.equal(state.draft, 'retry task')
  assert.equal(api.codexTurnArmed(props), true)
  assert.equal(api.attachItemsOf('failure').length, 1)
  assert.deepEqual(state.imageIds, ['host-image'])
  assert.equal(api.codexTurnState.submitting.has('failure'), false)
})

test('shipped composer clears only after a successful submitting to plain settlement', async () => {
  const { api, runTimers } = loadShippedComposer()
  const state = { draft: 'successful task', phase: 'plain', imageIds: [] }
  const actions = {
    setDraft(text) { state.draft = text },
    submit() { state.phase = 'submitting' },
  }
  const props = composerProps('success', state, actions)
  api.ComposerTools(props)
  api.setAttachItems([{ name: 'photo.png', kind: 'image' }], props)
  api.setCodexTurnArmed(props, true)
  actions.submit()
  await flush()
  runTimers()
  assert.equal(api.codexTurnArmed(props), true)
  api.ComposerTools(props)
  state.draft = ''
  state.phase = 'plain'
  api.ComposerTools(props)
  assert.equal(api.codexTurnArmed(props), false)
  assert.equal(api.attachItemsOf('success').length, 0)
  assert.equal(api.codexTurnState.submitting.has('success'), false)
})

test('shipped composer keeps remounted stable actions isolated by session', async () => {
  const { api, runTimers } = loadShippedComposer()
  const left = { draft: 'left stale', phase: 'plain', imageIds: [] }
  const right = { draft: 'right stale', phase: 'plain', imageIds: [] }
  const sent = []
  const leftActions = { setDraft(text) { left.draft = text }, submit() { left.phase = 'submitting'; sent.push(left.draft) } }
  const rightActions = { setDraft(text) { right.draft = text }, submit() { right.phase = 'submitting'; sent.push(right.draft) } }
  api.ComposerTools(composerProps('left', { draft: 'left stale', phase: 'plain', imageIds: [] }, leftActions))
  api.ComposerTools(composerProps('right', { draft: 'right stale', phase: 'plain', imageIds: [] }, rightActions))
  left.draft = 'left latest'
  right.draft = 'right latest'
  api.ComposerTools(composerProps('left', left, leftActions))
  api.ComposerTools(composerProps('right', right, rightActions))
  api.setCodexTurnArmed(composerProps('left', left, leftActions), true)
  api.setCodexTurnArmed(composerProps('right', right, rightActions), true)
  leftActions.submit()
  rightActions.submit()
  await flush()
  assert.match(sent[0], /left latest/)
  assert.match(sent[1], /right latest/)
  runTimers()
})

test('shipped composer aborts a deferred document fold after draft and attachment changes', async () => {
  const read = deferred()
  const composer = publicComposer('fold-edit', 'original task')
  const { api } = loadShippedComposer({
    runtime: publicRuntime(composer),
    fetch: async () => read.promise,
  })
  const documentItem = { name: 'scope.pdf', kind: 'file', path: 'C:/workspace/scope.pdf', relativePath: 'scope.pdf' }
  const newerItem = { name: 'new.txt', kind: 'file', path: 'C:/workspace/new.txt', relativePath: 'new.txt' }
  api.ComposerTools(composer.props())
  api.setAttachItems([documentItem], composer.props())
  api.setCodexTurnArmed(composer.props(), true)
  composer.actions.submit()
  await flush()
  composer.input.set({ ...composer.input.getSnapshot(), draft: 'user changed this' })
  api.setAttachItems([documentItem, newerItem], composer.props())
  api.ComposerTools(composer.props())
  read.resolve({ ok: true, json: async () => ({}) })
  await flush()
  await flush()
  assert.equal(composer.sent.length, 0)
  assert.equal(composer.input.getSnapshot().draft, 'user changed this')
  assert.equal(api.codexTurnArmed(composer.props()), true)
  assert.equal(api.attachItemsOf('fold-edit').length, 2)
  assert.equal(api.codexTurnState.submitting.has('fold-edit'), false)
})

test('shipped composer preserves latest work when deferred document folding rejects', async () => {
  const read = deferred()
  const composer = publicComposer('fold-error', 'original task')
  const { api } = loadShippedComposer({
    runtime: publicRuntime(composer),
    fetch: async () => read.promise,
  })
  const documentItem = { name: 'scope.pdf', kind: 'file', path: 'C:/workspace/scope.pdf', relativePath: 'scope.pdf' }
  const newerItem = { name: 'new.txt', kind: 'file', path: 'C:/workspace/new.txt', relativePath: 'new.txt' }
  api.ComposerTools(composer.props())
  api.setAttachItems([documentItem], composer.props())
  api.setCodexTurnArmed(composer.props(), true)
  composer.actions.submit()
  await flush()
  composer.input.set({ ...composer.input.getSnapshot(), draft: 'newer wording' })
  api.setAttachItems([documentItem, newerItem], composer.props())
  api.ComposerTools(composer.props())
  read.reject(new Error('reader failed'))
  await flush()
  assert.equal(composer.sent.length, 0)
  assert.equal(composer.input.getSnapshot().draft, 'newer wording')
  assert.equal(api.codexTurnArmed(composer.props()), true)
  assert.equal(api.attachItemsOf('fold-error').length, 2)
  assert.equal(api.codexTurnState.submitting.has('fold-error'), false)
})

test('shipped composer settles successful public stores after ComposerTools unmounts', async () => {
  const composer = publicComposer('background', 'background task')
  const { api } = loadShippedComposer({ runtime: publicRuntime(composer) })
  api.ComposerTools(composer.props())
  api.setAttachItems([{ name: 'photo.png', kind: 'image' }], composer.props())
  api.setCodexTurnArmed(composer.props(), true)
  composer.actions.submit()
  await flush()
  const framed = composer.sent[0]
  composer.input.set({ ...composer.input.getSnapshot(), phase: 'plain', draft: '' })
  composer.session.set({ nodes: [userNode(1, framed)], promptError: null })
  assert.equal(api.codexTurnArmed(composer.props()), false)
  assert.equal(api.attachItemsOf('background').length, 0)
  assert.equal(api.codexTurnState.submitting.has('background'), false)
  assert.equal(api.codexTurnState.pending.has('background'), false)
  assert.equal(composer.input.subscriberCount, 0)
  assert.equal(composer.session.subscriberCount, 0)
})

test('shipped composer retains later draft work after public host failure', async () => {
  const composer = publicComposer('late-failure', 'retry task')
  const { api } = loadShippedComposer({ runtime: publicRuntime(composer) })
  api.ComposerTools(composer.props())
  api.setAttachItems([{ name: 'photo.png', kind: 'image' }], composer.props())
  api.setCodexTurnArmed(composer.props(), true)
  composer.actions.submit()
  await flush()
  assert.ok(composer.sent[0])
  composer.input.set({ ...composer.input.getSnapshot(), draft: 'latest user work' })
  composer.session.set({ nodes: [], promptError: { op: 'send', error: { code: 'rejected' } } })
  composer.input.set({ ...composer.input.getSnapshot(), phase: 'plain' })
  assert.equal(composer.input.getSnapshot().draft, 'latest user work')
  assert.equal(api.codexTurnArmed(composer.props()), true)
  assert.equal(api.attachItemsOf('late-failure').length, 1)
  assert.equal(api.codexTurnState.submitting.has('late-failure'), false)
  assert.equal(api.codexTurnState.pending.has('late-failure'), false)
  assert.equal(composer.input.subscriberCount, 0)
  assert.equal(composer.session.subscriberCount, 0)
})

test('shipped composer waits for a matching new user node and isolates sessions', async () => {
  const left = publicComposer('left-store', 'left task')
  const right = publicComposer('right-store', 'right task')
  const { api } = loadShippedComposer({ runtime: publicRuntime(left, right) })
  api.ComposerTools(left.props())
  api.ComposerTools(right.props())
  api.setCodexTurnArmed(left.props(), true)
  api.setCodexTurnArmed(right.props(), true)
  left.actions.submit()
  right.actions.submit()
  await flush()
  assert.ok(left.sent[0])
  assert.ok(right.sent[0])
  left.session.set({ nodes: [userNode(1, 'unrelated')], promptError: null })
  assert.equal(api.codexTurnArmed(left.props()), true)
  assert.equal(api.codexTurnArmed(right.props()), true)
  left.session.set({ nodes: [userNode(1, 'unrelated'), userNode(2, left.sent[0])], promptError: null })
  assert.equal(api.codexTurnArmed(left.props()), false)
  assert.equal(api.codexTurnArmed(right.props()), true)
})

test('builds a foreground one-shot delegation without changing the task', () => {
  const task = '修复 C:\\work\\app.ts，并运行测试。'
  const prompt = buildCodexTurnDelegation(task)
  assert.match(prompt, /subagent_codex/)
  assert.match(prompt, /run_in_background=false/)
  assert.match(prompt, /等待 Codex 完成/)
  assert.match(prompt, /核验实际结果/)
  assert.ok(prompt.endsWith(task))
  assert.match(client, /【Codex 执行模式】/)
  assert.match(client, /必须立即调用 subagent_codex/)
  assert.match(client, /等待 Codex 完成，核验实际结果后再向用户汇报/)
})

test('requires an available logged-in runtime', () => {
  assert.equal(codexCanRun({ available: true, state: 'logged-in' }), true)
  assert.equal(codexCanRun({ available: true, state: 'logged-out' }), false)
  assert.equal(codexCanRun({ available: false, state: 'unavailable' }), false)
})
