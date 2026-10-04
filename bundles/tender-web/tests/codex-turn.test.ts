import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'
import vm from 'node:vm'
import { buildCodexTurnDelegation, codexCanRun, resolveCodexTurnSelection } from '../src/codex-turn.ts'

const client = readFileSync(join(dirname(fileURLToPath(import.meta.url)), '../lib/client.js'), 'utf8')

function okJsonResponse(body = {}, payload = {}) {
  const result = body.action === 'status'
    ? { state: 'committed', sessionId: body.sessionId, transactionId: body.transactionId, ...payload }
    : body.action === 'commit'
    ? { committed: true, sessionId: body.sessionId, transactionId: body.transactionId }
    : body.action === 'cancel'
      ? { cleared: true, sessionId: body.sessionId, transactionId: body.transactionId }
      : Array.isArray(body.files) || Array.isArray(body.folders)
        ? { stored: true, sessionId: body.sessionId, transactionId: body.transactionId, ...payload }
        : payload
  return { ok: true, json: async () => result }
}

function attachmentTransactionMarker(transactionId) {
  return `<!--agent-pi-attachment-tx:${encodeURIComponent(transactionId)}-->`
}

function loadShippedComposer(options = {}) {
  const timers = []
  const setTimer = (fn) => {
    const timer = { fn, active: true }
    timers.push(timer)
    return timer
  }
  const clearTimer = (timer) => {
    if (timer) timer.active = false
  }
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
    documentElement: {
      classList: { add() {}, remove() {}, toggle() {} },
      setAttribute() {},
      removeAttribute() {},
    },
  }
  const window = {
    __ModuleLoader__: { load(next) { definition = next } },
    __apFlushKbSelection: options.flushKbSelection,
    __apHasKbSelectionSave: options.hasKbSelectionSave,
    agentPiDesktop: {
      codexAuthStatus: options.codexAuthStatus || (async () => ({ available: true, state: 'logged-in', defaultModel: 'codex-default', models: [{ id: 'codex-default' }] })),
      codexExecutionSubmit: options.nativeSubmit || (async (input) => ({ ...input, phase: 'idle', messages: [], requests: [] })),
      codexExecutionStatus: async () => ({ phase: 'idle', messages: [], requests: [] }),
      onCodexExecution: () => () => {},
      pathForFile: (file) => file.path || '',
    },
    addEventListener() {},
    removeEventListener() {},
    dispatchEvent() {},
    setTimeout: setTimer,
    clearTimeout: clearTimer,
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
    .replaceAll('await flushKbTaskSelection(key);', options.flushKbSelection ? 'await window.__apFlushKbSelection(key);' : 'await flushKbTaskSelection(key);')
    .replaceAll('hasKbTaskSelectionSave(sid)', options.hasKbSelectionSave ? 'window.__apHasKbSelectionSave(sid)' : 'hasKbTaskSelectionSave(sid)')
    .replace(
      /actions\.__apLatestProps\s*=\s*props;?/,
      "$&\n      ;(window.__apCodexTurnProps || (window.__apCodexTurnProps = new Map())).set(codexTurnKey(props), props)",
    )
    .replace(
      /(\s*return module\.exports;)/,
      "\n    window.__apCodexTurnTest = { ComposerTools, codexTurnControllers, codexTurnArmed, setCodexTurnArmed, setCodexTurnModel, setCodexTurnReasoningEffort, setAttachItems: (items, props) => setAttachItemsFor(attachSessionId(props), items), attachItemsOf, attachState, mergeImportedItems, attachmentTurnControllers: typeof attachmentTurnControllers === 'undefined' ? null : attachmentTurnControllers };\n$1",
    )
  vm.runInNewContext(source, {
    window,
    document,
    requestAnimationFrame: requestFrame,
    setTimeout: setTimer,
    clearTimeout: clearTimer,
    setInterval: () => 1,
    clearInterval() {},
    CustomEvent: class { constructor(type, init) { this.type = type; this.detail = init?.detail } },
    Event: class { constructor(type) { this.type = type } },
    fetch: async (url, init = {}) => {
      if (String(url).includes('/api/agent-pi/capabilities')) return okJsonResponse({}, { workbench: true, knowledge: true })
      if (options.fetch) return options.fetch(url, init)
      const body = JSON.parse(String(init.body || '{}'))
      return okJsonResponse(body)
    },
    localStorage: { getItem() { return null }, setItem() {} },
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
  runtime.sessions.list ||= { getSnapshot: () => ({ byId: {} }), subscribe: () => () => {} }
  bundle.apply({
    effect(install) { install() },
    slots: { inject() {} },
    inject(names, install) {
      if (names.every((name) => runtime[name])) install({ ...Object.fromEntries(names.map((name) => [name, runtime[name]])), slots: this.slots, on() {} })
    },
  })
  return {
    api: window.__apCodexTurnTest,
    window,
    runTimers() { timers.splice(0).forEach((timer) => { if (timer.active) timer.fn() }) },
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
    add(composer) { byId.set(composer.sessionId, composer) },
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

function attachmentControllerPhase(api, sessionId) {
  return api.attachmentTurnControllers?.get(sessionId)?.phase
}

async function flush() {
  await new Promise((resolve) => setImmediate(resolve))
}

const modelStatus = () => Promise.resolve({
  available: true, state: 'logged-in', defaultModel: 'codex-default',
  models: [{ id: 'codex-default' }, { id: 'codex-override' }],
})

const effortStatus = {
  available: true, state: 'logged-in', defaultModel: 'codex-default', selectedReasoningEffort: 'ultra',
  models: [
    { id: 'codex-default', defaultReasoningEffort: 'medium', supportedReasoningEfforts: [{ reasoningEffort: 'medium' }, { reasoningEffort: 'ultra' }, { reasoningEffort: 'future-effort' }] },
    { id: 'codex-override', defaultReasoningEffort: 'low', supportedReasoningEfforts: [{ reasoningEffort: 'low' }, { reasoningEffort: 'high' }] },
  ],
}

test('normal sends wait for KB selection persistence and retain drafts on failure', async (t) => {
  assert.ok(client.includes('await flushKbTaskSelection(key);'))
  for (const mode of ['normal attachment', 'empty KB selection', 'native attachment']) await t.test(mode, async () => {
    const draft = mode === 'native attachment' ? '' : 'keep this draft'
    const composer = publicComposer('kb-save-' + mode, draft)
    if (mode === 'native attachment') composer.input.set({ ...composer.input.getSnapshot(), attachmentIds: ['native-file'] })
    const saving = deferred()
    let retry = false
    let saves = 0
    const { api } = loadShippedComposer({
      runtime: publicRuntime(composer),
      hasKbSelectionSave: ['empty KB selection', 'native attachment'].includes(mode) ? () => true : undefined,
      flushKbSelection: (sessionId) => {
        assert.equal(sessionId, composer.sessionId)
        saves++
        return retry ? Promise.resolve() : saving.promise
      },
    })
    api.ComposerTools(composer.props())
    if (mode === 'Codex') api.setCodexTurnArmed(composer.props(), true)
    else if (mode === 'normal attachment') api.setAttachItems([{ id: 'kb-file', name: 'photo.png', kind: 'image' }], composer.props())
    composer.actions.submit()
    await flush()
    assert.equal(composer.sent.length, 0)
    saving.reject(new Error('KB save failed'))
    await flush()
    assert.equal(composer.sent.length, 0)
    assert.equal(composer.input.getSnapshot().draft, draft)
    retry = true
    composer.actions.submit()
    await flush()
    assert.equal(saves, 2)
    assert.equal(composer.sent.length, 1)
    if (mode === 'native attachment') assert.deepEqual(composer.input.getSnapshot().attachmentIds, ['native-file'])
  })
})

test('ordinary native attachments and KB choices cannot change during a pending send', async (t) => {
  for (const change of ['native attachment', 'KB selection']) await t.test(change, async () => {
    const composer = publicComposer('kb-change-' + change, '')
    composer.input.set({ ...composer.input.getSnapshot(), attachmentIds: ['native-original'] })
    const saved = deferred()
    const { api, window } = loadShippedComposer({
      runtime: publicRuntime(composer), hasKbSelectionSave: () => true, flushKbSelection: () => saved.promise,
    })
    api.ComposerTools(composer.props())
    composer.actions.submit()
    await flush()
    if (change === 'native attachment') composer.input.set({ ...composer.input.getSnapshot(), attachmentIds: ['native-replacement'] })
    else window.__apKbTask = { bySession: { [composer.sessionId]: { slugs: ['new-choice'], entries: [] } } }
    saved.resolve()
    await flush()
    assert.equal(composer.sent.length, 0)
    assert.equal(composer.input.getSnapshot().draft, '')
    assert.equal(attachmentControllerPhase(api, composer.sessionId), undefined)
  })
})

test('reasoning inheritance follows the selected model without leaking an incompatible saved effort', () => {
  assert.deepEqual(resolveCodexTurnSelection(effortStatus), { model: 'codex-default', reasoningEffort: 'ultra' })
  assert.deepEqual(resolveCodexTurnSelection(effortStatus, 'codex-override'), { model: 'codex-override', reasoningEffort: 'low' })
  assert.equal(resolveCodexTurnSelection(effortStatus, null, 'future-effort').reasoningEffort, 'future-effort')
  assert.throws(() => resolveCodexTurnSelection(effortStatus, 'codex-override', 'ultra'), /思考等级当前不可用/)
  assert.throws(() => resolveCodexTurnSelection({ ...effortStatus, modelError: 'stale catalog' }), /无法确认默认/)
  assert.equal(resolveCodexTurnSelection({ ...effortStatus, selectedReasoningEffort: null }).reasoningEffort, 'medium')
})

test('switching the one-turn model clears incompatible reasoning and keeps compatible selections', () => {
  const composer = publicComposer('effort-switch', 'model switch')
  const { api } = loadShippedComposer({ runtime: publicRuntime(composer) })
  api.setCodexTurnArmed(composer.props(), true)
  api.setCodexTurnReasoningEffort(composer.props(), 'ultra')
  api.setCodexTurnModel(composer.props(), 'codex-default', effortStatus)
  assert.equal(api.codexTurnControllers.get(composer.sessionId).selectedReasoningEffort, 'ultra')
  api.setCodexTurnModel(composer.props(), 'codex-override', effortStatus)
  assert.equal(api.codexTurnControllers.get(composer.sessionId).selectedReasoningEffort, '')
})

test('normal attachment turn waits for host delivery after its matching durable user node', async () => {
  const calls = []
  let hostState = 'committed'
  const composer = publicComposer('attachment-success', '请读取附件并继续。')
  const { api, runTimers } = loadShippedComposer({
    runtime: publicRuntime(composer),
    fetch: async (url, init = {}) => {
      const body = JSON.parse(String(init.body || '{}'))
      calls.push({ url: String(url), body })
      return body.action === 'status'
        ? okJsonResponse(body, { state: hostState })
        : okJsonResponse(body)
    },
  })
  const attachment = { id: 'success-doc', name: 'scope.pdf', kind: 'file', path: 'C:/workspace/scope.pdf', relativePath: 'scope.pdf' }
  api.ComposerTools(composer.props())
  api.setAttachItems([attachment], composer.props())

  composer.actions.submit()
  await flush()
  await flush()
  runTimers()
  await flush()
  await flush()

  assert.equal(composer.sent.length, 1)
  assert.equal(attachmentControllerPhase(api, composer.sessionId), 'submitting')
  assert.deepEqual(api.attachState.bySession.get(composer.sessionId), [attachment])

  const framed = composer.sent[0]
  composer.input.set({
    ...composer.input.getSnapshot(),
    phase: 'plain',
    draft: '',
    draftRev: composer.input.getSnapshot().draftRev + 1,
  })
  composer.session.set({ nodes: [userNode(1, '另一条无关用户消息')], promptError: null })

  assert.equal(attachmentControllerPhase(api, composer.sessionId), 'submitting')
  assert.deepEqual(api.attachState.bySession.get(composer.sessionId), [attachment])

  composer.session.set({ nodes: [
    userNode(1, '另一条无关用户消息'),
    userNode(2, framed),
  ], promptError: null })

  assert.equal(attachmentControllerPhase(api, composer.sessionId), 'submitting')
  assert.deepEqual(api.attachState.bySession.get(composer.sessionId), [attachment])
  assert.equal(calls.filter((call) => call.body.action === 'cancel').length, 0)

  hostState = 'delivered'
  runTimers()
  await flush()
  await flush()

  assert.equal(attachmentControllerPhase(api, composer.sessionId), undefined)
  assert.deepEqual(api.attachState.bySession.get(composer.sessionId), [])
  assert.equal(calls.filter((call) => call.body.action === 'cancel').length, 0)
  assert.equal(composer.input.subscriberCount, 0)
  assert.equal(composer.session.subscriberCount, 0)
})

test('normal attachment turn restores retry state and cancels its host stash after send failure', async () => {
  const calls = []
  const composer = publicComposer('attachment-failure', '失败后保留这段话。')
  const { api } = loadShippedComposer({
    runtime: publicRuntime(composer),
    fetch: async (url, init = {}) => {
      calls.push({ url: String(url), body: JSON.parse(String(init.body || '{}')) })
      return okJsonResponse(calls.at(-1).body)
    },
  })
  const attachment = { id: 'retry-doc', name: 'retry.pdf', kind: 'file', path: 'C:/workspace/retry.pdf', relativePath: 'retry.pdf' }
  api.ComposerTools(composer.props())
  api.setAttachItems([attachment], composer.props())

  composer.actions.submit()
  await flush()
  await flush()
  assert.equal(composer.sent.length, 1)

  composer.input.set({ ...composer.input.getSnapshot(), phase: 'plain' })
  composer.session.set({ nodes: [], promptError: { op: 'send', error: { code: 'rejected' } } })
  await flush()

  assert.equal(attachmentControllerPhase(api, composer.sessionId), undefined)
  assert.equal(composer.input.getSnapshot().draft, '失败后保留这段话。')
  assert.deepEqual(api.attachState.bySession.get(composer.sessionId), [attachment])
  const prepare = calls.find((call) => Array.isArray(call.body.files))
  const commits = calls.filter((call) => call.body.action === 'commit')
  const cancels = calls.filter((call) => call.body.action === 'cancel')
  assert.ok(prepare?.body.transactionId)
  assert.match(composer.sent[0], new RegExp(attachmentTransactionMarker(prepare.body.transactionId).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')))
  assert.equal(commits.length, 1)
  assert.equal(commits[0].body.transactionId, prepare.body.transactionId)
  assert.equal(cancels.length, 1)
  assert.equal(cancels[0].body.transactionId, prepare.body.transactionId)
})

test('normal attachment transaction detects a detached DSH send failure while input stays plain', async () => {
  const composer = publicComposer('attachment-detached-failure', 'detached send must restore this task')
  composer.actions.submit = () => {
    const framed = composer.input.getSnapshot()
    composer.sent.push(framed.draft)
    composer.input.set({ ...framed, phase: 'plain', draft: '', draftRev: framed.draftRev + 1 })
  }
  const { api } = loadShippedComposer({ runtime: publicRuntime(composer) })
  const attachment = { id: 'detached-doc', name: 'scope.pdf', kind: 'file', path: 'C:/workspace/scope.pdf', relativePath: 'scope.pdf' }
  api.ComposerTools(composer.props())
  api.setAttachItems([attachment], composer.props())

  composer.actions.submit()
  await flush()
  await flush()
  assert.equal(composer.input.getSnapshot().phase, 'plain')
  assert.equal(composer.input.getSnapshot().draft, '')
  assert.equal(attachmentControllerPhase(api, composer.sessionId), 'submitting')

  composer.session.set({ nodes: [], promptError: { op: 'send', error: { code: 'detached-rejected' } } })

  assert.equal(attachmentControllerPhase(api, composer.sessionId), undefined)
  assert.equal(composer.input.getSnapshot().draft, 'detached send must restore this task')
  assert.deepEqual(api.attachState.bySession.get(composer.sessionId), [attachment])
})

test('detached attachment failure never overwrites text entered after the accepted clear', async () => {
  const composer = publicComposer('attachment-detached-edit', 'original detached task')
  composer.actions.submit = () => {
    const framed = composer.input.getSnapshot()
    composer.sent.push(framed.draft)
    composer.input.set({ ...framed, phase: 'plain', draft: '', draftRev: framed.draftRev + 1 })
  }
  const { api } = loadShippedComposer({ runtime: publicRuntime(composer) })
  const attachment = { id: 'detached-edit-doc', name: 'scope.pdf', kind: 'file', path: 'C:/workspace/scope.pdf', relativePath: 'scope.pdf' }
  api.ComposerTools(composer.props())
  api.setAttachItems([attachment], composer.props())

  composer.actions.submit()
  await flush()
  await flush()
  composer.actions.setDraft('new work typed after send')
  composer.session.set({ nodes: [], promptError: { op: 'send', error: { code: 'detached-rejected' } } })

  assert.equal(attachmentControllerPhase(api, composer.sessionId), undefined)
  assert.equal(composer.input.getSnapshot().draft, 'new work typed after send')
  assert.deepEqual(api.attachState.bySession.get(composer.sessionId), [attachment])
})

test('host transaction failure settles a blocked detached turn without a fixed queue timeout', async () => {
  const composer = publicComposer('attachment-host-blocked', 'restore after host blocked')
  composer.actions.submit = () => {
    const framed = composer.input.getSnapshot()
    composer.sent.push(framed.draft)
    composer.input.set({ ...framed, phase: 'plain', draft: '', draftRev: framed.draftRev + 1 })
  }
  const { api, runTimers } = loadShippedComposer({
    runtime: publicRuntime(composer),
    fetch: async (_url, init = {}) => {
      const body = JSON.parse(String(init.body || '{}'))
      return body.action === 'status'
        ? okJsonResponse(body, { state: 'failed' })
        : okJsonResponse(body)
    },
  })
  const attachment = { id: 'blocked-doc', name: 'blocked.pdf', kind: 'file', path: 'C:/workspace/blocked.pdf', relativePath: 'blocked.pdf' }
  api.ComposerTools(composer.props())
  api.setAttachItems([attachment], composer.props())

  composer.actions.submit()
  await flush()
  await flush()
  runTimers()
  await flush()
  await flush()

  assert.equal(attachmentControllerPhase(api, composer.sessionId), undefined)
  assert.equal(composer.input.getSnapshot().draft, 'restore after host blocked')
  assert.deepEqual(api.attachState.bySession.get(composer.sessionId), [attachment])
})

test('normal attachment transactions are isolated across sessions', async () => {
  const calls = []
  const hostStates = new Map()
  const left = publicComposer('attachment-left-normal', '左侧任务')
  const right = publicComposer('attachment-right-normal', '右侧任务')
  const { api, runTimers } = loadShippedComposer({
    runtime: publicRuntime(left, right),
    fetch: async (url, init = {}) => {
      const body = JSON.parse(String(init.body || '{}'))
      calls.push({ url: String(url), body })
      return body.action === 'status'
        ? okJsonResponse(body, { state: hostStates.get(body.sessionId) || 'committed' })
        : okJsonResponse(body)
    },
  })
  const leftItem = { id: 'left-doc', name: 'left.pdf', kind: 'file', path: 'C:/workspace/left.pdf', relativePath: 'left.pdf' }
  const rightItem = { id: 'right-doc', name: 'right.pdf', kind: 'file', path: 'C:/workspace/right.pdf', relativePath: 'right.pdf' }
  api.ComposerTools(left.props())
  api.setAttachItems([leftItem], left.props())
  api.ComposerTools(right.props())
  api.setAttachItems([rightItem], right.props())

  left.actions.submit()
  right.actions.submit()
  await flush()
  await flush()
  assert.equal(left.sent.length, 1)
  assert.equal(right.sent.length, 1)
  assert.match(left.sent[0], /@left\.pdf/)
  assert.doesNotMatch(left.sent[0], /right\.pdf/)
  assert.match(right.sent[0], /@right\.pdf/)
  assert.doesNotMatch(right.sent[0], /left\.pdf/)
  const prepares = calls.filter((call) => Array.isArray(call.body.files))
  assert.deepEqual(prepares.map((call) => [call.body.sessionId, call.body.files.map((file) => file.relativePath)]), [
    [left.sessionId, ['left.pdf']],
    [right.sessionId, ['right.pdf']],
  ])

  left.input.set({ ...left.input.getSnapshot(), phase: 'plain', draft: '', draftRev: left.input.getSnapshot().draftRev + 1 })
  left.session.set({ nodes: [userNode(1, left.sent[0])], promptError: null })

  assert.deepEqual(api.attachState.bySession.get(left.sessionId), [leftItem])
  assert.deepEqual(api.attachState.bySession.get(right.sessionId), [rightItem])
  assert.equal(attachmentControllerPhase(api, left.sessionId), 'submitting')
  assert.equal(attachmentControllerPhase(api, right.sessionId), 'submitting')

  hostStates.set(left.sessionId, 'delivered')
  runTimers()
  await flush()
  await flush()

  assert.deepEqual(api.attachState.bySession.get(left.sessionId), [])
  assert.deepEqual(api.attachState.bySession.get(right.sessionId), [rightItem])
  assert.equal(attachmentControllerPhase(api, left.sessionId), undefined)
  assert.equal(attachmentControllerPhase(api, right.sessionId), 'submitting')
  assert.equal(calls.filter((call) => call.body.action === 'cancel').length, 0)
})

test('normal attachment turn keeps retry attachments when session authority is temporarily unavailable', async () => {
  const composer = publicComposer('attachment-authority-gap', '会话恢复后继续。')
  const runtime = publicRuntime(composer)
  const { api } = loadShippedComposer({ runtime })
  const attachment = { id: 'authority-gap-doc', name: 'scope.pdf', kind: 'file', path: 'C:/workspace/scope.pdf', relativePath: 'scope.pdf' }
  api.ComposerTools(composer.props())
  api.setAttachItems([attachment], composer.props())

  composer.actions.submit()
  await flush()
  await flush()
  assert.equal(attachmentControllerPhase(api, composer.sessionId), 'submitting')

  runtime.remove(composer.sessionId)
  composer.input.set({ ...composer.input.getSnapshot(), phase: 'plain' })
  await flush()

  assert.deepEqual(api.attachState.bySession.get(composer.sessionId), [attachment])
  assert.deepEqual(api.attachItemsOf(composer.sessionId), [attachment])
})

test('a session without an attachment map never inherits another session attachment rail', () => {
  const left = publicComposer('attachment-owned-left', '左侧任务')
  const right = publicComposer('attachment-unseen-right', '右侧任务')
  const { api } = loadShippedComposer({ runtime: publicRuntime(left, right) })
  const leftItem = { id: 'owned-left-doc', name: 'left.pdf', kind: 'file', path: 'C:/workspace/left.pdf', relativePath: 'left.pdf' }

  api.ComposerTools(left.props())
  api.setAttachItems([leftItem], left.props())

  assert.equal(api.attachState.bySession.has(right.sessionId), false)
  assert.equal(api.attachItemsOf(right.sessionId).length, 0)
})

test('async attachment enrichment preserves the existing attachment identity', () => {
  const composer = publicComposer('attachment-enrichment-id', '处理附件')
  const { api } = loadShippedComposer({ runtime: publicRuntime(composer) })
  const existing = {
    id: 'stable-attachment-id',
    name: 'scope.pdf',
    kind: 'file',
    path: '',
    relativePath: 'scope.pdf',
    uploaded: false,
  }
  const enriched = {
    id: 'replacement-enrichment-id',
    name: 'scope.pdf',
    kind: 'file',
    path: 'C:/workspace/Agent Pi Uploads/scope.pdf',
    relativePath: 'Agent Pi Uploads/scope.pdf',
    uploaded: true,
  }
  api.ComposerTools(composer.props())
  api.setAttachItems([existing], composer.props())

  api.mergeImportedItems(composer.props(), [enriched])

  const [result] = api.attachState.bySession.get(composer.sessionId)
  assert.equal(result.id, existing.id)
  assert.equal(result.path, enriched.path)
  assert.equal(result.uploaded, true)
})

test('normal attachment transaction admits only one in-flight turn per session', async () => {
  const read = deferred()
  const calls = []
  const composer = publicComposer('attachment-single-flight', '同一会话只提交一次。')
  const { api } = loadShippedComposer({
    runtime: publicRuntime(composer),
    fetch: async (url, init = {}) => {
      const body = JSON.parse(String(init.body || '{}'))
      calls.push({ url: String(url), body })
      if (body.action === 'commit') return okJsonResponse(body)
      return read.promise
    },
  })
  const attachment = { id: 'single-flight-doc', name: 'once.pdf', kind: 'file', path: 'C:/workspace/once.pdf', relativePath: 'once.pdf' }
  api.ComposerTools(composer.props())
  api.setAttachItems([attachment], composer.props())

  composer.actions.submit()
  composer.actions.submit()
  await flush()

  assert.equal(attachmentControllerPhase(api, composer.sessionId), 'preparing')
  assert.equal(calls.filter((call) => Array.isArray(call.body.files)).length, 1)
  assert.equal(composer.sent.length, 0)

  const prepare = calls.find((call) => Array.isArray(call.body.files))
  assert.ok(prepare)
  read.resolve(okJsonResponse(prepare.body))
  await flush()
  await flush()

  assert.equal(composer.sent.length, 1)
  assert.equal(attachmentControllerPhase(api, composer.sessionId), 'submitting')
})

test('normal and Codex attachment transactions are mutually exclusive within one session', async () => {
  const calls = []
  const composer = publicComposer('attachment-normal-codex-exclusive', '同一会话只允许一个附件事务。')
  const { api } = loadShippedComposer({
    runtime: publicRuntime(composer),
    queuedRaf: true,
    fetch: async (url, init = {}) => {
      const body = JSON.parse(String(init.body || '{}'))
      calls.push({ url: String(url), body })
      return okJsonResponse(body)
    },
  })
  const attachment = { id: 'exclusive-doc', name: 'exclusive.pdf', kind: 'file', path: 'C:/workspace/exclusive.pdf', relativePath: 'exclusive.pdf' }
  api.ComposerTools(composer.props())
  api.setAttachItems([attachment], composer.props())

  composer.actions.submit()
  await flush()
  assert.equal(attachmentControllerPhase(api, composer.sessionId), 'preparing')
  assert.equal(calls.filter((call) => Array.isArray(call.body.files)).length, 1)

  api.setCodexTurnArmed(composer.props(), true)
  composer.actions.submit()
  await flush()

  assert.equal(attachmentControllerPhase(api, composer.sessionId), 'preparing')
  assert.equal(controllerPhase(api, composer.sessionId), undefined)
  assert.equal(calls.filter((call) => Array.isArray(call.body.files)).length, 1)
  assert.equal(composer.sent.length, 0)
})

test('normal attachment transaction aborts when its session is destroyed during preparation', async () => {
  const read = deferred()
  const calls = []
  const composer = publicComposer('attachment-removed', '不要发送已销毁会话。')
  const { api } = loadShippedComposer({
    runtime: publicRuntime(composer),
    fetch: async (url, init = {}) => {
      const body = JSON.parse(String(init.body || '{}'))
      calls.push({ url: String(url), body })
      if (body.action === 'cancel') return { ok: true, json: async () => ({ cleared: true }) }
      return read.promise
    },
  })
  const attachment = { id: 'removed-doc', name: 'removed.pdf', kind: 'file', path: 'C:/workspace/removed.pdf', relativePath: 'removed.pdf' }
  api.ComposerTools(composer.props())
  api.setAttachItems([attachment], composer.props())

  composer.actions.submit()
  await flush()
  assert.equal(attachmentControllerPhase(api, composer.sessionId), 'preparing')
  composer.session.set({ nodes: [], promptError: null, removed: true })
  const prepare = calls.find((call) => Array.isArray(call.body.files))
  assert.ok(prepare)
  read.resolve(okJsonResponse(prepare.body))
  await flush()
  await flush()

  assert.equal(composer.sent.length, 0)
  assert.equal(attachmentControllerPhase(api, composer.sessionId), undefined)
  assert.equal(composer.input.subscriberCount, 0)
  assert.equal(composer.session.subscriberCount, 0)
  assert.equal(calls.filter((call) => call.body.action === 'cancel').length, 1)
  assert.equal(api.attachState.bySession.has(composer.sessionId), false)
  assert.equal(api.attachItemsOf(composer.sessionId).length, 0)
})

test('normal attachment preparation failure keeps retry state and releases its controller', async () => {
  const calls = []
  const composer = publicComposer('attachment-prepare-failure', '读取失败后保留这段话。')
  const { api } = loadShippedComposer({
    runtime: publicRuntime(composer),
    fetch: async (url, init = {}) => {
      const body = JSON.parse(String(init.body || '{}'))
      calls.push({ url: String(url), body })
      if (body.action === 'cancel') return { ok: true, json: async () => ({ cleared: true }) }
      throw new Error('document reader unavailable')
    },
  })
  const attachment = { id: 'prepare-failure-doc', name: 'failure.pdf', kind: 'file', path: 'C:/workspace/failure.pdf', relativePath: 'failure.pdf' }
  api.ComposerTools(composer.props())
  api.setAttachItems([attachment], composer.props())

  composer.actions.submit()
  await flush()
  await flush()

  assert.equal(composer.sent.length, 0)
  assert.equal(composer.input.getSnapshot().draft, '读取失败后保留这段话。')
  assert.deepEqual(api.attachState.bySession.get(composer.sessionId), [attachment])
  assert.equal(attachmentControllerPhase(api, composer.sessionId), undefined)
  assert.equal(composer.input.subscriberCount, 0)
  assert.equal(composer.session.subscriberCount, 0)
  const prepares = calls.filter((call) => call.url.includes('/api/agent-pi/llm/vision/read') && call.body.action !== 'cancel')
  assert.equal(prepares.length, 1)
  assert.ok(Array.isArray(prepares[0].body.files))
  const cancels = calls.filter((call) => call.body.action === 'cancel')
  assert.equal(cancels.length, 1)
  assert.ok(prepares[0].body.transactionId)
  assert.equal(cancels[0].body.transactionId, prepares[0].body.transactionId)
})

test('normal attachment rejects an abnormal 2xx prepare acknowledgement and cancels the same transaction', async (t) => {
  const cases = [
    ['stored false', (body) => okJsonResponse(body, { stored: false })],
    ['transaction mismatch', (body) => okJsonResponse(body, { transactionId: 'attachment-turn-other' })],
  ]
  for (const [name, prepareResponse] of cases) {
    await t.test(name, async () => {
      const calls = []
      const composer = publicComposer(`attachment-prepare-ack-${String(name).replace(/\s+/g, '-')}`, '异常确认后保留任务。')
      const { api } = loadShippedComposer({
        runtime: publicRuntime(composer),
        fetch: async (url, init = {}) => {
          const body = JSON.parse(String(init.body || '{}'))
          calls.push({ url: String(url), body })
          if (body.action === 'cancel') return okJsonResponse(body)
          if (body.action === 'commit') return okJsonResponse(body)
          return prepareResponse(body)
        },
      })
      const attachment = { id: `prepare-ack-${name}`, name: 'ack.pdf', kind: 'file', path: 'C:/workspace/ack.pdf', relativePath: 'ack.pdf' }
      api.ComposerTools(composer.props())
      api.setAttachItems([attachment], composer.props())

      composer.actions.submit()
      await flush()
      await flush()

      const prepare = calls.find((call) => Array.isArray(call.body.files))
      const commits = calls.filter((call) => call.body.action === 'commit')
      const cancels = calls.filter((call) => call.body.action === 'cancel')
      assert.ok(prepare?.body.transactionId)
      assert.equal(composer.sent.length, 0)
      assert.equal(commits.length, 0)
      assert.equal(cancels.length, 1)
      assert.equal(cancels[0].body.transactionId, prepare.body.transactionId)
      assert.equal(attachmentControllerPhase(api, composer.sessionId), undefined)
      assert.equal(composer.input.getSnapshot().draft, '异常确认后保留任务。')
      assert.deepEqual(api.attachState.bySession.get(composer.sessionId), [attachment])
    })
  }
})

test('normal attachment commit failure restores retry state and cancels its prepared host stash', async () => {
  const calls = []
  const composer = publicComposer('attachment-commit-failure', '提交失败后保留这段话。')
  composer.actions.submit = () => { throw new Error('submit unavailable') }
  const { api } = loadShippedComposer({
    runtime: publicRuntime(composer),
    fetch: async (url, init = {}) => {
      const body = JSON.parse(String(init.body || '{}'))
      calls.push({ url: String(url), body })
      return okJsonResponse(body)
    },
  })
  const attachment = { id: 'commit-failure-doc', name: 'commit.pdf', kind: 'file', path: 'C:/workspace/commit.pdf', relativePath: 'commit.pdf' }
  api.ComposerTools(composer.props())
  api.setAttachItems([attachment], composer.props())

  composer.actions.submit()
  await flush()
  await flush()

  assert.equal(composer.sent.length, 0)
  assert.equal(composer.input.getSnapshot().draft, '提交失败后保留这段话。')
  assert.deepEqual(api.attachState.bySession.get(composer.sessionId), [attachment])
  assert.equal(attachmentControllerPhase(api, composer.sessionId), undefined)
  assert.equal(composer.input.subscriberCount, 0)
  assert.equal(composer.session.subscriberCount, 0)
  assert.equal(calls.filter((call) => call.body.action === 'cancel').length, 1)
})

test('normal attachment rolls back when the host refuses or cannot complete commit', async (t) => {
  for (const mode of ['committed-false', 'http-error']) {
    await t.test(mode, async () => {
      const calls = []
      const composer = publicComposer(`attachment-host-commit-${mode}`, '主机提交失败后保留任务。')
      const { api } = loadShippedComposer({
        runtime: publicRuntime(composer),
        fetch: async (url, init = {}) => {
          const body = JSON.parse(String(init.body || '{}'))
          calls.push({ url: String(url), body })
          if (body.action === 'cancel') return okJsonResponse(body)
          if (body.action === 'commit') {
            if (mode === 'http-error') throw new Error('commit transport unavailable')
            return { ok: true, json: async () => ({ committed: false }) }
          }
          return okJsonResponse(body)
        },
      })
      const attachment = { id: `host-commit-${mode}`, name: 'commit.pdf', kind: 'file', path: 'C:/workspace/commit.pdf', relativePath: 'commit.pdf' }
      api.ComposerTools(composer.props())
      api.setAttachItems([attachment], composer.props())

      composer.actions.submit()
      await flush()
      await flush()

      const prepare = calls.find((call) => Array.isArray(call.body.files))
      const commits = calls.filter((call) => call.body.action === 'commit')
      const cancels = calls.filter((call) => call.body.action === 'cancel')
      assert.ok(prepare?.body.transactionId)
      assert.equal(commits.length, 1)
      assert.equal(commits[0].body.transactionId, prepare.body.transactionId)
      assert.equal(cancels.length, 1)
      assert.equal(cancels[0].body.transactionId, prepare.body.transactionId)
      assert.equal(composer.sent.length, 0)
      assert.equal(composer.input.getSnapshot().draft, '主机提交失败后保留任务。')
      assert.deepEqual(api.attachState.bySession.get(composer.sessionId), [attachment])
      assert.equal(attachmentControllerPhase(api, composer.sessionId), undefined)
    })
  }
})

test('normal attachment preparation aborts after draft or attachment edits and cancels its stash', async () => {
  const read = deferred()
  const calls = []
  const composer = publicComposer('attachment-edited', '原始任务')
  const { api } = loadShippedComposer({
    runtime: publicRuntime(composer),
    fetch: async (url, init = {}) => {
      const body = JSON.parse(String(init.body || '{}'))
      calls.push({ url: String(url), body })
      if (body.action === 'cancel') return { ok: true, json: async () => ({ cleared: true }) }
      return read.promise
    },
  })
  const oldItem = { id: 'edited-old', name: 'old.pdf', kind: 'file', path: 'C:/workspace/old.pdf', relativePath: 'old.pdf' }
  const newItem = { id: 'edited-new', name: 'new.pdf', kind: 'file', path: 'C:/workspace/new.pdf', relativePath: 'new.pdf' }
  api.ComposerTools(composer.props())
  api.setAttachItems([oldItem], composer.props())

  composer.actions.submit()
  await flush()
  assert.equal(attachmentControllerPhase(api, composer.sessionId), 'preparing')
  composer.input.set({ ...composer.input.getSnapshot(), draft: '用户修改后的任务' })
  api.setAttachItems([oldItem, newItem], composer.props())
  const prepare = calls.find((call) => Array.isArray(call.body.files))
  assert.ok(prepare)
  read.resolve(okJsonResponse(prepare.body))
  await flush()
  await flush()

  assert.equal(composer.sent.length, 0)
  assert.equal(composer.input.getSnapshot().draft, '用户修改后的任务')
  assert.deepEqual(api.attachState.bySession.get(composer.sessionId), [oldItem, newItem])
  assert.equal(attachmentControllerPhase(api, composer.sessionId), undefined)
  assert.equal(calls.filter((call) => call.body.action === 'cancel').length, 1)
})

test('normal attachment success removes only the captured attachment instance', async () => {
  const composer = publicComposer('attachment-readd-normal', '处理旧附件')
  const { api, runTimers } = loadShippedComposer({
    runtime: publicRuntime(composer),
    fetch: async (_url, init = {}) => {
      const body = JSON.parse(String(init.body || '{}'))
      return body.action === 'status'
        ? okJsonResponse(body, { state: 'delivered' })
        : okJsonResponse(body)
    },
  })
  const oldItem = { id: 'old-normal', name: 'scope.pdf', kind: 'file', path: 'C:/workspace/scope.pdf', relativePath: 'scope.pdf' }
  const newItem = { id: 'new-normal', name: 'scope.pdf', kind: 'file', path: 'C:/workspace/scope.pdf', relativePath: 'scope.pdf' }
  api.ComposerTools(composer.props())
  api.setAttachItems([oldItem], composer.props())

  composer.actions.submit()
  await flush()
  await flush()
  assert.equal(composer.sent.length, 1)
  assert.equal(attachmentControllerPhase(api, composer.sessionId), 'submitting')
  api.setAttachItems([newItem], composer.props())
  composer.input.set({ ...composer.input.getSnapshot(), phase: 'plain', draft: '', draftRev: composer.input.getSnapshot().draftRev + 1 })
  composer.session.set({ nodes: [userNode(1, composer.sent[0])], promptError: null })
  runTimers()
  await flush()
  await flush()

  assert.deepEqual(api.attachState.bySession.get(composer.sessionId), [newItem])
  assert.equal(attachmentControllerPhase(api, composer.sessionId), undefined)
})

test('builds a foreground one-shot delegation without changing the task', () => {
  const task = '修复 C:\\work\\app.ts，并运行测试。'
  const prompt = buildCodexTurnDelegation(task)
  assert.match(prompt, /subagent_codex/)
  assert.match(prompt, /run_in_background=false/)
  assert.match(prompt, /等待 Codex 完成/)
  assert.match(prompt, /核验实际结果/)
  assert.ok(prompt.endsWith(task))
  // Explicit subagent delegation remains available separately from the native main composer.
  assert.match(client, /codexExecutionSubmit/)
})

test('requires an available logged-in runtime', () => {
  assert.equal(codexCanRun({ available: true, state: 'logged-in' }), true)
  assert.equal(codexCanRun({ available: true, state: 'logged-out' }), false)
  assert.equal(codexCanRun({ available: false, state: 'unavailable' }), false)
})

test('main composer submits directly to native Codex and keeps the selected engine for follow-up turns', async () => {
  const composer = publicComposer('native-main', 'Review the BOQ')
  const received = []
  const { api } = loadShippedComposer({ runtime: publicRuntime(composer), codexAuthStatus: modelStatus, nativeSubmit: async (input) => { received.push(input); return { ...input, phase: 'idle', messages: [], requests: [] } } })
  api.ComposerTools(composer.props())
  api.setCodexTurnArmed(composer.props(), true)
  api.setAttachItems([{ id: 'boq-original', name: 'BOQ.xlsx', path: 'C:/originals/BOQ.xlsx', kind: 'file' }], composer.props())
  composer.actions.submit()
  await flush()
  assert.equal(received.length, 1)
  assert.equal(composer.sent.length, 0)
  assert.equal(received[0].sessionId, composer.sessionId)
  assert.equal(received[0].cwd, 'C:/workspace')
  assert.equal(received[0].text, 'Review the BOQ')
  assert.equal(received[0].attachments[0].path, 'C:/originals/BOQ.xlsx')
  assert.equal(received[0].model, 'codex-default')
  assert.equal(composer.input.getSnapshot().draft, '')
  assert.equal(api.codexTurnArmed(composer.props()), true)
  composer.actions.setDraft('Continue the plan')
  composer.actions.submit()
  await flush()
  assert.equal(received[1].text, 'Continue the plan')
  assert.equal(composer.sent.length, 0)
})

test('native preparation waits for KB persistence and retains the draft and original attachments on failure', async () => {
  const composer = publicComposer('native-kb', 'Keep my original task')
  const received = [], saving = deferred()
  let retry = false
  const { api } = loadShippedComposer({ runtime: publicRuntime(composer), flushKbSelection: () => retry ? Promise.resolve() : saving.promise, nativeSubmit: async (input) => { received.push(input); return { ...input, phase: 'idle', messages: [], requests: [] } } })
  api.ComposerTools(composer.props())
  api.setCodexTurnArmed(composer.props(), true)
  api.setAttachItems([{ id: 'source', name: 'plan.pdf', path: 'C:/source/plan.pdf', kind: 'file' }], composer.props())
  composer.actions.submit()
  await flush()
  assert.equal(received.length, 0)
  saving.reject(new Error('KB failed'))
  await flush()
  assert.equal(composer.input.getSnapshot().draft, 'Keep my original task')
  assert.equal(api.attachItemsOf(composer.sessionId).length, 1)
  retry = true
  composer.actions.submit()
  await flush()
  assert.equal(received.length, 1)
  assert.equal(composer.sent.length, 0)
})

test('native model discovery does not send tasks whose draft, KB, attachments or session changed', async (t) => {
  for (const change of ['draft', 'KB', 'attachment', 'session']) await t.test(change, async () => {
    const composer = publicComposer('native-drift-' + change, 'Original requirement')
    const runtime = publicRuntime(composer), discovered = deferred(), received = []
    const { api, window } = loadShippedComposer({ runtime, codexAuthStatus: () => discovered.promise, nativeSubmit: async (input) => { received.push(input); return input } })
    api.ComposerTools(composer.props())
    api.setCodexTurnArmed(composer.props(), true)
    composer.actions.submit()
    await flush()
    if (change === 'draft') composer.actions.setDraft('New requirement')
    if (change === 'KB') window.__apKbTask = { bySession: { [composer.sessionId]: { slugs: ['changed'], entries: [] } } }
    if (change === 'attachment') api.setAttachItems([{ id: 'new-original', name: 'other.pdf', path: 'C:/other.pdf', kind: 'file' }], composer.props())
    if (change === 'session') runtime.remove(composer.sessionId)
    discovered.resolve(await modelStatus())
    await flush()
    assert.equal(received.length, 0)
    assert.equal(composer.sent.length, 0)
    assert.equal(composer.input.getSnapshot().draft, change === 'draft' ? 'New requirement' : 'Original requirement')
  })
})

test('native submit failure preserves retry state and an accepted turn preserves concurrent edits', async () => {
  const composer = publicComposer('native-retry', 'Original task')
  let reject = true, waiting = null
  const received = []
  const { api } = loadShippedComposer({ runtime: publicRuntime(composer), nativeSubmit: async (input) => { received.push(input); if (reject) throw new Error('Native failed'); if (waiting) await waiting.promise; return { ...input, phase: 'idle', messages: [], requests: [] } } })
  api.ComposerTools(composer.props())
  api.setCodexTurnArmed(composer.props(), true)
  api.setAttachItems([{ id: 'one', name: 'source.pdf', path: 'C:/source.pdf', kind: 'file' }], composer.props())
  composer.actions.submit()
  await flush()
  assert.equal(composer.input.getSnapshot().draft, 'Original task')
  assert.equal(api.attachItemsOf(composer.sessionId)[0].id, 'one')
  reject = false
  waiting = deferred()
  composer.actions.submit()
  await flush()
  composer.actions.setDraft('Later task')
  api.setAttachItems([{ id: 'two', name: 'source.pdf', path: 'C:/source.pdf', kind: 'file' }], composer.props())
  waiting.resolve()
  await flush()
  assert.equal(composer.input.getSnapshot().draft, 'Later task')
  assert.equal(api.attachItemsOf(composer.sessionId)[0].id, 'two')
  assert.equal(composer.sent.length, 0)
})
