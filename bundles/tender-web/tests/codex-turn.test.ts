import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'
import vm from 'node:vm'
import { buildCodexTurnDelegation, codexCanRun } from '../src/codex-turn.ts'

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
    agentPiDesktop: { codexAuthStatus: async () => ({ available: true, state: 'logged-in' }) },
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
    .replace(
      /actions\.__apLatestProps\s*=\s*props;?/,
      "$&\n      ;(window.__apCodexTurnProps || (window.__apCodexTurnProps = new Map())).set(codexTurnKey(props), props)",
    )
    .replace(
      /(\s*return module\.exports;)/,
      "\n    window.__apCodexTurnTest = { ComposerTools, codexTurnControllers, codexTurnArmed, setCodexTurnArmed, setAttachItems: (items, props) => setAttachItemsFor(attachSessionId(props), items), attachItemsOf, attachState, mergeImportedItems, attachmentTurnControllers: typeof attachmentTurnControllers === 'undefined' ? null : attachmentTurnControllers };\n$1",
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
    fetch: options.fetch || (async (_url, init = {}) => {
      const body = JSON.parse(String(init.body || '{}'))
      return okJsonResponse(body)
    }),
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

test('Codex document turn waits for delivered host status and does not cancel successful context', async () => {
  const calls = []
  let hostState = 'committed'
  const composer = publicComposer('codex-attachment-success', '请让 Codex 读取附件。')
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
  const attachment = { id: 'codex-success-doc', name: 'scope.pdf', kind: 'file', path: 'C:/workspace/scope.pdf', relativePath: 'scope.pdf' }
  api.ComposerTools(composer.props())
  api.setAttachItems([attachment], composer.props())
  api.setCodexTurnArmed(composer.props(), true)

  composer.actions.submit()
  await flush()
  await flush()
  runTimers()
  await flush()
  await flush()

  assert.equal(composer.sent.length, 1)
  const framed = composer.sent[0]
  composer.input.set({
    ...composer.input.getSnapshot(),
    phase: 'plain',
    draft: '',
    draftRev: composer.input.getSnapshot().draftRev + 1,
  })
  composer.session.set({ nodes: [userNode(1, framed)], promptError: null })

  assert.equal(controllerPhase(api, composer.sessionId), 'submitting')
  assert.equal(api.codexTurnArmed(composer.props()), true)
  assert.deepEqual(api.attachItemsOf(composer.sessionId), [attachment])
  assert.equal(calls.filter((call) => call.body.action === 'cancel').length, 0)

  hostState = 'delivered'
  runTimers()
  await flush()
  await flush()

  assert.equal(controllerPhase(api, composer.sessionId), 'idle')
  assert.equal(api.codexTurnArmed(composer.props()), false)
  assert.deepEqual(api.attachItemsOf(composer.sessionId), [])
  assert.equal(calls.filter((call) => call.body.action === 'cancel').length, 0)
})

test('Codex document turn cancels its matching host transaction after send failure', async () => {
  const calls = []
  const composer = publicComposer('codex-attachment-failure', '失败后重试 Codex 任务')
  const { api } = loadShippedComposer({
    runtime: publicRuntime(composer),
    fetch: async (url, init = {}) => {
      const body = JSON.parse(String(init.body || '{}'))
      calls.push({ url: String(url), body })
      return okJsonResponse(body)
    },
  })
  const attachment = { id: 'codex-failure-doc', name: 'scope.pdf', kind: 'file', path: 'C:/workspace/scope.pdf', relativePath: 'scope.pdf' }
  api.ComposerTools(composer.props())
  api.setAttachItems([attachment], composer.props())
  api.setCodexTurnArmed(composer.props(), true)

  composer.actions.submit()
  await flush()
  await flush()
  assert.equal(composer.sent.length, 1)

  composer.session.set({ nodes: [], promptError: { op: 'send', error: { code: 'rejected' } } })
  composer.input.set({ ...composer.input.getSnapshot(), phase: 'plain' })
  await flush()

  const prepare = calls.find((call) => Array.isArray(call.body.files))
  const commits = calls.filter((call) => call.body.action === 'commit')
  const cancels = calls.filter((call) => call.body.action === 'cancel')
  assert.ok(prepare)
  assert.ok(prepare.body.transactionId)
  assert.match(composer.sent[0], new RegExp(attachmentTransactionMarker(prepare.body.transactionId).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')))
  assert.equal(commits.length, 1)
  assert.equal(commits[0].body.transactionId, prepare.body.transactionId)
  assert.equal(cancels.length, 1)
  assert.equal(cancels[0].body.transactionId, prepare.body.transactionId)
  assert.deepEqual(api.attachState.bySession.get(composer.sessionId), [attachment])
})

test('Codex document turn cancels its matching host transaction when the session is destroyed during preparation', async () => {
  const read = deferred()
  const calls = []
  const composer = publicComposer('codex-attachment-destroyed', '不要发送已销毁的 Codex 会话')
  const { api } = loadShippedComposer({
    runtime: publicRuntime(composer),
    fetch: async (url, init = {}) => {
      const body = JSON.parse(String(init.body || '{}'))
      calls.push({ url: String(url), body })
      if (body.action === 'cancel') return { ok: true, json: async () => ({ cleared: true }) }
      return read.promise
    },
  })
  const attachment = { id: 'codex-destroyed-doc', name: 'destroyed.pdf', kind: 'file', path: 'C:/workspace/destroyed.pdf', relativePath: 'destroyed.pdf' }
  api.ComposerTools(composer.props())
  api.setAttachItems([attachment], composer.props())
  api.setCodexTurnArmed(composer.props(), true)

  composer.actions.submit()
  await flush()
  const prepare = calls.find((call) => Array.isArray(call.body.files))
  assert.ok(prepare)
  composer.session.set({ nodes: [], promptError: null, removed: true })
  read.resolve(okJsonResponse(prepare.body))
  await flush()
  await flush()

  const cancels = calls.filter((call) => call.body.action === 'cancel')
  const commits = calls.filter((call) => call.body.action === 'commit')
  assert.equal(composer.sent.length, 0)
  assert.ok(prepare.body.transactionId)
  assert.equal(commits.length, 0)
  assert.equal(cancels.length, 1)
  assert.equal(cancels[0].body.transactionId, prepare.body.transactionId)
})

test('Codex session removal clears that session attachment rail', () => {
  const composer = publicComposer('codex-removed-clears-attachments', '不会发送')
  const { api } = loadShippedComposer({ runtime: publicRuntime(composer) })
  const attachment = { id: 'codex-removed-doc', name: 'removed.pdf', kind: 'file', path: 'C:/workspace/removed.pdf', relativePath: 'removed.pdf' }
  api.ComposerTools(composer.props())
  api.setAttachItems([attachment], composer.props())
  api.setCodexTurnArmed(composer.props(), true)

  composer.session.set({ nodes: [], promptError: null, removed: true })

  assert.equal(api.codexTurnControllers.has(composer.sessionId), false)
  assert.equal(api.attachState.bySession.has(composer.sessionId), false)
  assert.equal(api.attachItemsOf(composer.sessionId).length, 0)
  assert.equal(api.attachState.items.length, 0)
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
  assert.equal(composer.session.subscriberCount, 1)
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
  assert.equal(composer.session.subscriberCount, 1)
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
  assert.equal(composer.session.subscriberCount, 1)
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
  assert.equal(composer.session.subscriberCount, 1)
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

test('shipped composer disposes an armed turn when its session is removed before submit', () => {
  const removed = publicComposer('recreated-before-submit', 'old one-shot task')
  const runtime = publicRuntime(removed)
  const { api } = loadShippedComposer({ runtime })
  api.ComposerTools(removed.props())
  api.setCodexTurnArmed(removed.props(), true)
  api.setCodexTurnArmed(removed.props(), true)
  assert.equal(removed.session.subscriberCount, 1)

  removed.session.set({ ...removed.session.getSnapshot(), removed: true })
  runtime.remove('recreated-before-submit')

  assert.equal(api.codexTurnControllers.has('recreated-before-submit'), false)
  assert.equal(removed.session.subscriberCount, 0)

  const replacement = publicComposer('recreated-before-submit', 'new ordinary task')
  runtime.add(replacement)
  api.ComposerTools(replacement.props())
  assert.equal(api.codexTurnArmed(replacement.props()), false)
  replacement.actions.submit()
  assert.deepEqual(replacement.sent, ['new ordinary task'])
  assert.equal(api.codexTurnControllers.size, 0)
})

test('shipped composer rearms before queued RAF when its session authority temporarily disappears', async () => {
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
  assert.equal(api.codexTurnArmed(composer.props()), true)
  assert.deepEqual(api.attachState.bySession.get('removed-before-raf'), [doc])
  assert.equal(controllerPhase(api, 'removed-before-raf'), 'armed')
  assert.equal(composer.input.subscriberCount, 0)
  assert.equal(composer.session.subscriberCount, 1)
  runtime.add(composer)
  api.setCodexTurnArmed(composer.props(), false)
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
  assert.equal(composer.session.subscriberCount, 1)
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
