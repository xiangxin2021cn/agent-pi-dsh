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
  const frames = []
  const requestFrame = (fn) => {
    if (options.queuedRaf) {
      frames.push(fn)
      return frames.length
    }
    fn()
    return 1
  }
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
    requestAnimationFrame: requestFrame,
  }
  const React = {
    createElement(type, props, ...children) { return { type, props, children } },
    useState(value) { return [typeof value === 'function' ? value() : value, () => {}] },
    useEffect(effect) { effect() },
    useRef(value) { return { current: value } },
    useCallback(fn) { return fn },
  }
  const source = client
    .replace(
      '      actions.__apLatestProps = props',
      "      actions.__apLatestProps = props\n      ;(window.__apCodexTurnProps || (window.__apCodexTurnProps = new Map())).set(codexTurnKey(props), props)",
    )
    .replace(
      "    exports.name = 'tender-web'",
      "    window.__apCodexTurnTest = { ComposerTools, codexTurnControllers, codexTurnArmed, setCodexTurnArmed, setAttachItems, attachItemsOf, attachState };\n\n    exports.name = 'tender-web'",
    )
  vm.runInNewContext(source, {
    window,
    document,
    requestAnimationFrame: requestFrame,
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
  const fallbackSessions = new Map()
  const fallbackSessionFor = (sessionId) => {
    let session = fallbackSessions.get(sessionId)
    if (!session) {
      session = Object.assign(observable({ nodes: [], promptError: null }), { prompt() {} })
      fallbackSessions.set(sessionId, session)
    }
    return session
  }
  const fallbackRuntime = {
    sessions: {
      scope(sessionId) { return window.__apCodexTurnProps?.has(sessionId) ? { sessionId } : undefined },
      binding(sessionId) { return window.__apCodexTurnProps?.has(sessionId) ? { session: fallbackSessionFor(sessionId) } : undefined },
    },
    conversation: {
      input: {
        for(scope) {
          return { state: {
            getSnapshot() { return window.__apCodexTurnProps?.get(scope.sessionId)?.input },
            subscribe() { return () => {} },
          } }
        },
      },
    },
  }
  const runtime = options.runtime || fallbackRuntime
  bundle.apply({
    slots: { inject() {} },
    inject(names, install) {
      if (names.includes('sessions')) install({ sessions: runtime.sessions })
      if (names.includes('conversation')) install({ conversation: runtime.conversation })
    },
  })
  return {
    api: window.__apCodexTurnTest,
    runTimers() { timers.splice(0).forEach((fn) => fn()) },
    runFrames() { frames.splice(0).forEach((fn) => fn()) },
    publishFallbackSession(sessionId, snapshot) { fallbackSessionFor(sessionId).set(snapshot) },
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
  const input = observable({ draft, phase: 'plain', imageIds: [], draftRev: 0 })
  const session = Object.assign(observable({ nodes: [], promptError: null }), { prompt() {} })
  const scope = { sessionId }
  const sent = []
  const actions = {
    setDraft(text) {
      const current = input.getSnapshot()
      input.set({ ...current, draft: text, draftRev: current.draftRev + 1 })
    },
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
    remove(sessionId) { byId.delete(sessionId) },
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

function controllerPhase(api, sessionId) {
  return api.codexTurnControllers.get(sessionId)?.phase
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
  const { api, runTimers, publishFallbackSession } = loadShippedComposer()
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
  publishFallbackSession('one', { nodes: [userNode(1, sent[0])], promptError: null })
  runTimers()
  assert.equal(controllerPhase(api, 'one'), 'idle')
})

test('shipped composer does not clear an unsettled Codex turn after 280ms', async () => {
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
  assert.equal(controllerPhase(api, 'deferred'), 'submitting')
  assert.equal(api.attachItemsOf('deferred').length, 1)
})

test('shipped composer restores a failed Codex submission for retry without nesting', async () => {
  const { api, runTimers, publishFallbackSession } = loadShippedComposer()
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
  publishFallbackSession('failure', { nodes: [], promptError: { op: 'send', error: { code: 'rejected' } } })
  runTimers()
  assert.equal(controllerPhase(api, 'failure'), 'armed')
  assert.equal(state.draft, 'retry task')
  assert.equal(api.codexTurnArmed(props), true)
  assert.equal(api.attachItemsOf('failure').length, 1)
  assert.deepEqual(state.imageIds, ['host-image'])
})

test('shipped composer clears only after a matching user node confirms success', async () => {
  const { api, runTimers, publishFallbackSession } = loadShippedComposer()
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
  const framed = state.draft
  api.ComposerTools(props)
  state.draft = ''
  state.phase = 'plain'
  api.ComposerTools(props)
  publishFallbackSession('success', { nodes: [userNode(1, framed)], promptError: null })
  assert.equal(api.codexTurnArmed(props), false)
  assert.equal(api.attachItemsOf('success').length, 0)
  assert.equal(controllerPhase(api, 'success'), 'idle')
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
  assert.equal(controllerPhase(api, 'fold-edit'), 'armed')
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
  assert.equal(controllerPhase(api, 'fold-error'), 'armed')
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
  composer.input.set({
    ...composer.input.getSnapshot(),
    phase: 'plain',
    draft: '',
    draftRev: composer.input.getSnapshot().draftRev + 1,
  })
  composer.session.set({ nodes: [userNode(1, framed)], promptError: null })
  assert.equal(api.codexTurnArmed(composer.props()), false)
  assert.equal(api.attachItemsOf('background').length, 0)
  assert.equal(controllerPhase(api, 'background'), 'idle')
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
  assert.equal(controllerPhase(api, 'late-failure'), 'armed')
  assert.equal(composer.input.subscriberCount, 0)
  assert.equal(composer.session.subscriberCount, 0)
})

test('shipped composer rearms after a local pre-prompt rejection without promptError', async () => {
  const composer = publicComposer('local-pre-prompt', 'retry local task')
  composer.input.set({ ...composer.input.getSnapshot(), imageIds: ['missing-host-image'] })
  const { api } = loadShippedComposer({ runtime: publicRuntime(composer) })
  const attachment = { id: 'local-doc', name: 'scope.pdf', kind: 'image', path: 'C:/workspace/scope.pdf' }
  api.ComposerTools(composer.props())
  api.setAttachItems([attachment], composer.props())
  api.setCodexTurnArmed(composer.props(), true)
  composer.actions.submit()
  await flush()

  const submitting = composer.input.getSnapshot()
  assert.equal(submitting.phase, 'submitting')
  assert.match(submitting.draft, /retry local task$/)
  composer.input.set({ ...submitting, phase: 'plain' })

  assert.equal(controllerPhase(api, 'local-pre-prompt'), 'armed')
  assert.equal(composer.input.getSnapshot().draft, 'retry local task')
  assert.deepEqual(composer.input.getSnapshot().imageIds, ['missing-host-image'])
  assert.deepEqual(api.attachState.bySession.get('local-pre-prompt'), [attachment])
  assert.equal(composer.input.subscriberCount, 0)
  assert.equal(composer.session.subscriberCount, 0)
})

test('shipped composer rearms a local rejection without overwriting a concurrent edit', async () => {
  const composer = publicComposer('local-edit-rejection', 'original local task')
  const { api } = loadShippedComposer({ runtime: publicRuntime(composer) })
  const attachment = { id: 'edit-doc', name: 'scope.pdf', kind: 'image', path: 'C:/workspace/scope.pdf' }
  api.ComposerTools(composer.props())
  api.setAttachItems([attachment], composer.props())
  api.setCodexTurnArmed(composer.props(), true)
  composer.actions.submit()
  await flush()

  const framed = composer.input.getSnapshot().draft
  composer.actions.setDraft(framed + '\nnewer user work')
  const edited = composer.input.getSnapshot()
  assert.equal(edited.phase, 'submitting')
  composer.input.set({ ...edited, phase: 'plain' })

  assert.equal(controllerPhase(api, 'local-edit-rejection'), 'armed')
  assert.equal(composer.input.getSnapshot().draft, framed + '\nnewer user work')
  assert.deepEqual(api.attachState.bySession.get('local-edit-rejection'), [attachment])
  assert.equal(composer.input.subscriberCount, 0)
  assert.equal(composer.session.subscriberCount, 0)
})

test('shipped composer waits for its matching node after accepted input settlement', async () => {
  const composer = publicComposer('accepted-before-node', 'accepted local task')
  const { api } = loadShippedComposer({ runtime: publicRuntime(composer) })
  const attachment = { id: 'accepted-doc', name: 'scope.pdf', kind: 'image', path: 'C:/workspace/scope.pdf' }
  api.ComposerTools(composer.props())
  api.setAttachItems([attachment], composer.props())
  api.setCodexTurnArmed(composer.props(), true)
  composer.actions.submit()
  await flush()

  const framed = composer.sent[0]
  const submitting = composer.input.getSnapshot()
  composer.input.set({ ...submitting, phase: 'plain', draft: '', draftRev: submitting.draftRev + 1 })
  assert.equal(controllerPhase(api, 'accepted-before-node'), 'submitting')
  assert.deepEqual(api.attachState.bySession.get('accepted-before-node'), [attachment])

  composer.session.set({ nodes: [userNode(1, framed)], promptError: null })
  assert.equal(controllerPhase(api, 'accepted-before-node'), 'idle')
  assert.deepEqual(api.attachState.bySession.get('accepted-before-node'), [])
  assert.equal(composer.input.subscriberCount, 0)
  assert.equal(composer.session.subscriberCount, 0)
})

test('shipped composer ignores a stale send error until the current input attempt settles', async () => {
  const composer = publicComposer('stale-send-error', 'retry after stale error')
  composer.session.set({ nodes: [], promptError: { op: 'send', error: { code: 'old-rejection' } } })
  const { api } = loadShippedComposer({ runtime: publicRuntime(composer) })
  const attachment = { id: 'stale-doc', name: 'scope.pdf', kind: 'image', path: 'C:/workspace/scope.pdf' }
  api.ComposerTools(composer.props())
  api.setAttachItems([attachment], composer.props())
  api.setCodexTurnArmed(composer.props(), true)
  composer.actions.submit()
  await flush()

  assert.equal(controllerPhase(api, 'stale-send-error'), 'submitting')
  const framed = composer.sent[0]
  assert.equal(composer.input.getSnapshot().draft, framed)
  composer.session.set({ nodes: [], promptError: null })
  composer.session.set({ nodes: [], promptError: { op: 'send', error: { code: 'current-rejection' } } })
  assert.equal(controllerPhase(api, 'stale-send-error'), 'submitting')
  composer.input.set({ ...composer.input.getSnapshot(), phase: 'plain' })

  assert.equal(controllerPhase(api, 'stale-send-error'), 'armed')
  assert.equal(composer.input.getSnapshot().draft, 'retry after stale error')
  assert.deepEqual(api.attachState.bySession.get('stale-send-error'), [attachment])
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

test('shipped composer aborts before queued RAF when its session authority disappears', async () => {
  const composer = publicComposer('removed-before-raf', 'keep this task')
  composer.input.set({ ...composer.input.getSnapshot(), imageIds: ['host-image'] })
  const runtime = publicRuntime(composer)
  const { api, runFrames } = loadShippedComposer({ runtime, queuedRaf: true })
  const doc = { id: 'doc-old', name: 'scope.pdf', kind: 'image', path: 'C:/workspace/scope.pdf' }
  api.ComposerTools(composer.props())
  api.setAttachItems([doc], composer.props())
  api.setCodexTurnArmed(composer.props(), true)
  composer.actions.submit()
  await flush()
  runtime.remove('removed-before-raf')
  assert.doesNotThrow(() => runFrames())
  assert.equal(composer.sent.length, 0)
  assert.equal(composer.input.getSnapshot().draft, 'keep this task')
  assert.deepEqual(composer.input.getSnapshot().imageIds, ['host-image'])
  assert.equal(api.codexTurnArmed(composer.props()), false)
  assert.deepEqual(api.attachState.bySession.get('removed-before-raf'), [doc])
  assert.equal(controllerPhase(api, 'removed-before-raf'), undefined)
  assert.equal(composer.input.subscriberCount, 0)
  assert.equal(composer.session.subscriberCount, 0)
})

test('shipped composer rejects a resident removed session before draft mutation or submit', async () => {
  const composer = publicComposer('resident-removed', 'keep resident draft')
  composer.session.set({ nodes: [], promptError: null, removed: true })
  const { api, runFrames } = loadShippedComposer({ runtime: publicRuntime(composer), queuedRaf: true })
  api.ComposerTools(composer.props())
  api.setCodexTurnArmed(composer.props(), true)
  composer.actions.submit()
  await flush()
  assert.equal(composer.input.getSnapshot().draft, 'keep resident draft')
  assert.equal(composer.sent.length, 0)
  assert.doesNotThrow(() => runFrames())
  assert.equal(composer.input.getSnapshot().draft, 'keep resident draft')
  assert.equal(composer.sent.length, 0)
  assert.equal(api.codexTurnArmed(composer.props()), false)
  assert.equal(composer.input.subscriberCount, 0)
  assert.equal(composer.session.subscriberCount, 0)
})

test('shipped composer keeps busy input armed and retries only after it returns to plain', async (t) => {
  for (const phase of ['submitting', 'adjudicating']) {
    await t.test(phase, async () => {
      const composer = publicComposer('busy-' + phase, phase + ' draft')
      composer.input.set({ ...composer.input.getSnapshot(), phase })
      const { api, runFrames } = loadShippedComposer({ runtime: publicRuntime(composer), queuedRaf: true })
      api.ComposerTools(composer.props())
      api.setCodexTurnArmed(composer.props(), true)
      composer.actions.submit()
      await flush()
      assert.equal(composer.input.getSnapshot().draft, phase + ' draft')
      assert.doesNotThrow(() => runFrames())
      assert.equal(composer.input.getSnapshot().draft, phase + ' draft')
      assert.equal(composer.sent.length, 0)
      assert.equal(api.codexTurnArmed(composer.props()), true)

      composer.input.set({ ...composer.input.getSnapshot(), phase: 'plain' })
      api.ComposerTools(composer.props())
      composer.actions.submit()
      await flush()
      assert.doesNotThrow(() => runFrames())
      assert.equal(composer.sent.length, 1)
      assert.match(composer.sent[0], new RegExp(phase + ' draft$'))
    })
  }
})

test('shipped composer contains an input subscription failure inside queued RAF', async () => {
  const composer = publicComposer('input-subscribe-throws', 'restore me')
  const runtime = publicRuntime(composer)
  composer.input.subscribe = () => { throw new Error('input subscription failed') }
  const { api, runFrames } = loadShippedComposer({ runtime, queuedRaf: true })
  api.ComposerTools(composer.props())
  api.setCodexTurnArmed(composer.props(), true)
  composer.actions.submit()
  await flush()
  assert.doesNotThrow(() => runFrames())
  assert.equal(composer.sent.length, 0)
  assert.equal(composer.input.getSnapshot().draft, 'restore me')
  assert.equal(api.codexTurnArmed(composer.props()), true)
  assert.equal(controllerPhase(api, 'input-subscribe-throws'), 'armed')
})

test('shipped composer disposes a partial input subscription when session setup throws', async () => {
  const composer = publicComposer('session-subscribe-throws', 'restore me too')
  const runtime = publicRuntime(composer)
  composer.session.subscribe = () => { throw new Error('session subscription failed') }
  const { api, runFrames } = loadShippedComposer({ runtime, queuedRaf: true })
  api.ComposerTools(composer.props())
  api.setCodexTurnArmed(composer.props(), true)
  composer.actions.submit()
  await flush()
  assert.doesNotThrow(() => runFrames())
  assert.equal(composer.sent.length, 0)
  assert.equal(composer.input.getSnapshot().draft, 'restore me too')
  assert.equal(api.codexTurnArmed(composer.props()), true)
  assert.equal(controllerPhase(api, 'session-subscribe-throws'), 'armed')
  assert.equal(composer.input.subscriberCount, 0)
})

test('shipped composer contains an original submit failure inside queued RAF', async () => {
  const composer = publicComposer('original-throws', 'retry original')
  composer.actions.submit = () => { throw new Error('original submit failed') }
  const { api, runFrames } = loadShippedComposer({ runtime: publicRuntime(composer), queuedRaf: true })
  api.ComposerTools(composer.props())
  api.setCodexTurnArmed(composer.props(), true)
  composer.actions.submit()
  await flush()
  assert.doesNotThrow(() => runFrames())
  assert.equal(composer.input.getSnapshot().draft, 'retry original')
  assert.equal(api.codexTurnArmed(composer.props()), true)
  assert.equal(controllerPhase(api, 'original-throws'), 'armed')
  assert.equal(composer.input.subscriberCount, 0)
  assert.equal(composer.session.subscriberCount, 0)
})

test('shipped composer preserves a re-added same-path attachment with a new id', async () => {
  const composer = publicComposer('same-path-readd', 'send this')
  const { api } = loadShippedComposer({ runtime: publicRuntime(composer) })
  const oldItem = { id: 'old', name: 'scope.pdf', kind: 'image', path: 'C:/workspace/scope.pdf' }
  const newItem = { id: 'new', name: 'scope.pdf', kind: 'image', path: 'C:/workspace/scope.pdf' }
  api.ComposerTools(composer.props())
  api.setAttachItems([oldItem], composer.props())
  api.setCodexTurnArmed(composer.props(), true)
  composer.actions.submit()
  await flush()
  const framed = composer.sent[0]
  api.setAttachItems([newItem], composer.props())
  composer.input.set({
    ...composer.input.getSnapshot(),
    phase: 'plain',
    draft: '',
    draftRev: composer.input.getSnapshot().draftRev + 1,
  })
  composer.session.set({ nodes: [userNode(1, framed)], promptError: null })
  assert.deepEqual(api.attachState.bySession.get('same-path-readd'), [newItem])
  assert.equal(api.codexTurnArmed(composer.props()), false)
})

test('shipped composer cleans A without overwriting active B attachments', async () => {
  const left = publicComposer('attachment-left', 'left task')
  const right = publicComposer('attachment-right', 'right task')
  const { api } = loadShippedComposer({ runtime: publicRuntime(left, right) })
  const leftItem = { id: 'left-old', name: 'scope.pdf', kind: 'image', path: 'C:/workspace/scope.pdf' }
  const rightItem = { id: 'right-live', name: 'scope.pdf', kind: 'image', path: 'C:/workspace/scope.pdf' }
  api.ComposerTools(left.props())
  api.ComposerTools(right.props())
  api.setAttachItems([leftItem], left.props())
  api.setAttachItems([rightItem], right.props())
  api.setCodexTurnArmed(left.props(), true)
  left.actions.submit()
  await flush()
  const framed = left.sent[0]
  left.input.set({
    ...left.input.getSnapshot(),
    phase: 'plain',
    draft: '',
    draftRev: left.input.getSnapshot().draftRev + 1,
  })
  left.session.set({ nodes: [userNode(1, framed)], promptError: null })
  assert.deepEqual(api.attachState.bySession.get('attachment-left'), [])
  assert.deepEqual(api.attachState.bySession.get('attachment-right'), [rightItem])
  assert.deepEqual(api.attachState.items, [rightItem])
})

test('shipped composer aborts document folding when a same-path attachment instance changes', async () => {
  const read = deferred()
  const composer = publicComposer('same-path-fold', 'read this document')
  const { api } = loadShippedComposer({ runtime: publicRuntime(composer), fetch: async () => read.promise })
  const oldItem = { id: 'old-doc', name: 'scope.pdf', kind: 'file', path: 'C:/workspace/scope.pdf', relativePath: 'scope.pdf' }
  const newItem = { id: 'new-doc', name: 'scope.pdf', kind: 'file', path: 'C:/workspace/scope.pdf', relativePath: 'scope.pdf' }
  api.ComposerTools(composer.props())
  api.setAttachItems([oldItem], composer.props())
  api.setCodexTurnArmed(composer.props(), true)
  composer.actions.submit()
  await flush()
  api.setAttachItems([newItem], composer.props())
  read.resolve({ ok: true, json: async () => ({}) })
  await flush()
  await flush()
  assert.equal(composer.sent.length, 0)
  assert.equal(composer.input.getSnapshot().draft, 'read this document')
  assert.deepEqual(api.attachState.bySession.get('same-path-fold'), [newItem])
  assert.equal(api.codexTurnArmed(composer.props()), true)
  assert.equal(controllerPhase(api, 'same-path-fold'), 'armed')
})

test('shipped composer ignores a stop prompt error until a matching user node confirms success', async () => {
  const composer = publicComposer('stop-race', 'accepted task')
  const { api } = loadShippedComposer({ runtime: publicRuntime(composer) })
  api.ComposerTools(composer.props())
  api.setAttachItems([{ id: 'stop-doc', name: 'scope.pdf', kind: 'image', path: 'C:/workspace/scope.pdf' }], composer.props())
  api.setCodexTurnArmed(composer.props(), true)
  composer.actions.submit()
  await flush()
  const framed = composer.sent[0]
  composer.session.set({ nodes: [], promptError: { op: 'stop', error: { code: 'stop-failed' } } })
  assert.equal(api.codexTurnArmed(composer.props()), true)
  assert.equal(controllerPhase(api, 'stop-race'), 'submitting')
  composer.session.set({ nodes: [userNode(1, framed)], promptError: { op: 'stop', error: { code: 'stop-failed' } } })
  assert.equal(api.codexTurnArmed(composer.props()), false)
  assert.equal(controllerPhase(api, 'stop-race'), 'idle')
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
