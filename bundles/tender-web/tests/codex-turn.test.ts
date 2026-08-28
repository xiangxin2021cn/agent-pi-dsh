import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'
import vm from 'node:vm'
import { buildCodexTurnDelegation, codexCanRun } from '../src/codex-turn.ts'

const client = readFileSync(join(dirname(fileURLToPath(import.meta.url)), '../lib/client.js'), 'utf8')

function loadShippedComposer() {
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
    fetch: async () => ({ ok: true, json: async () => ({}) }),
    MutationObserver: class { observe() {} disconnect() {} },
    AbortController,
    URLSearchParams,
    console,
  })
  definition.factory((name) => name === 'react' ? React : {})
  return {
    api: window.__apCodexTurnTest,
    runTimers() { timers.splice(0).forEach((fn) => fn()) },
  }
}

function composerProps(sessionId, state, actions) {
  return { sessionId, input: state, inputActions: actions }
}

async function flush() {
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
