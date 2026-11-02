import assert from 'node:assert/strict'
import { test } from 'node:test'
import { createNativeCodexHistory, codexExecutionErrorMessage } from '../src/client/codex-execution.js'

function fixture() {
  const callbacks = [], cleanup = [], rendered = [], opened = [], forbidden = []
  let lang = 'en', hookCalls = 0, snapshot = { cwd: 'C:/project', messages: [] }
  const stored = new Map([['agent-pi:main-engine:one', 'codex']])
  globalThis.localStorage = { getItem: () => { forbidden.push('storage read'); return 'codex' }, setItem: () => forbidden.push('storage write') }
  const desktop = {
    async codexHistoryStatus(sessionId) { return { ...snapshot, sessionId } },
  }
  for (const name of ['codexExecutionSubmit', 'codexExecutionReply', 'codexExecutionInterrupt', 'codexTaskAction', 'codexAuthStatus', 'onCodexExecution']) desktop[name] = () => { forbidden.push(name); throw new Error('Historical reader cannot execute') }
  const React = {
    createElement(type, props, ...children) { return { type, props, children } },
    useState(value) { return [value, (update) => callbacks.push(update)] },
    useEffect(install) { const off = install(); if (off) cleanup.push(off) },
  }
  const make = () => createNativeCodexHistory({ React, desktop, language: () => lang, useLanguage: () => { hookCalls++; return lang }, renderMessage: (text) => { rendered.push(text); return text }, openFile: (cwd, path) => opened.push({ cwd, path }) })
  const api = make()
  return { api, make, stored, rendered, opened, forbidden, desktop, cleanup, callbacks, async emit(state) { snapshot = state; await api.load(state.sessionId) }, language(value) { lang = value }, get hookCalls() { return hookCalls } }
}
const nodes = (tree) => typeof tree !== 'object' || !tree ? [] : [tree, ...(tree.children || []).flat(Infinity).flatMap(nodes)]
const content = (tree) => typeof tree === 'string' ? tree : (tree?.children || []).flat(Infinity).map(content).join(' ')

test('Codex errors retain the useful IPC cause without exposing credentials or stacks', () => {
  const error = new Error("Error invoking remote method 'codex-execution-submit': Error: Shared context refused: Authorization: Bearer auth-fixture; OPENAI_API_KEY=key-fixture; url=https://localhost/?token=query-fixture&api_key=api-fixture; sk-fixtureabcdef; eyJfixture.payload.signature\n    at internalSecret (C:/private/stack.js:1)")
  const visible = codexExecutionErrorMessage(error, 'en')
  assert.match(visible, /^Shared context refused:/)
  assert.doesNotMatch(visible, /invoking remote|auth-fixture|key-fixture|query-fixture|api-fixture|sk-fixtureabcdef|eyJfixture|internalSecret|private/)
  assert.match(visible, /\[REDACTED\]/)
  const jsonHeader = codexExecutionErrorMessage('{"Authorization": "Basic header-secret", "access_token":"access-secret", "password":"password-secret"}', 'en')
  assert.doesNotMatch(jsonHeader, /header-secret|access-secret|password-secret/)
  assert.ok(codexExecutionErrorMessage('x'.repeat(900), 'en').length <= 501)
  for (const value of [null, undefined, {}, { message: 42 }, '', 'Error', 'Unknown error', new Error('Error invoking remote method "codex-execution-submit": Error:')]) {
    assert.equal(codexExecutionErrorMessage(value, 'zh'), '请求失败，请重试。')
  }
})

test('native Codex failure panel shows the retained sanitized cause beneath its localized summary', async () => {
  const f = fixture()
  await f.api.load('one')
  await f.emit({ sessionId: 'one', cwd: 'C:/project', phase: 'failed', errorCode: 'requestFailed',
    error: "Error invoking remote method 'codex-execution-submit': Error: Shared task context unavailable; token=panel-secret",
    requests: [], messages: [] })
  const alert = nodes(f.api.View({ sessionId: 'one' })).find(row => row.props?.role === 'alert')
  assert.match(content(alert), /Request failed\. Please retry\./)
  assert.match(content(alert), /Shared task context unavailable/)
  assert.doesNotMatch(content(alert), /panel-secret|invoking remote/)
  f.api.dispose()
})

test('historical Codex readers expose no execution or engine-selection methods and leave old preferences intact', async () => {
  const f = fixture()
  for (const method of ['submit', 'taskAction', 'enabled', 'setEnabled', 'busy']) assert.equal(f.api[method], undefined)
  await f.api.load('one')
  assert.equal(f.stored.get('agent-pi:main-engine:one'), 'codex')
  assert.deepEqual(f.forbidden, [])
  f.api.dispose()
})

test('native answers render Markdown with actionable original file links and complete professional tool details', async () => {
  const f = fixture()
  await f.api.load('one')
  await f.emit({ sessionId: 'one', cwd: 'C:/project', phase: 'idle', requests: [], messages: [{ id: 'answer', role: 'assistant', text: '**Verified** [BOQ](<C:/project/original BOQ.xlsx>) completed.' }, { id: 'cost', role: 'tool', text: 'tender_price completed\n{"cost":42,"source":"original BOQ"}' }] })
  const view = f.api.View({ sessionId: 'one' })
  const link = nodes(view).find((node) => node.type === 'button' && content(node) === 'BOQ')
  assert.ok(link)
  link.props.onClick()
  assert.deepEqual(f.opened, [{ cwd: 'C:/project', path: 'C:/project/original BOQ.xlsx' }])
  assert.ok(f.rendered.includes('**Verified** '))
  assert.match(content(view), /"cost":42/)
  assert.ok(nodes(view).some((node) => node.type === 'details'))
  f.api.dispose()
})

test('native UI uses the live language hook and removes session listeners and its IPC subscription on disposal', async () => {
  const f = fixture()
  await f.api.load('one')
  assert.match(content(f.api.View({ sessionId: 'one' })), /Codex/)
  f.language('de')
  const german = content(f.api.View({ sessionId: 'one' }))
  assert.doesNotMatch(german, /[\u4e00-\u9fff]/)
  assert.ok(f.hookCalls >= 2)
  f.cleanup.forEach((off) => off())
  f.api.dispose()
  assert.deepEqual(f.forbidden, [])
})

test('stale running states and pending approvals are rendered only as historical messages', async () => {
  const f = fixture()
  await f.emit({ sessionId: 'one', cwd: 'C:/project', phase: 'waiting', messages: [{ id: 'old', role: 'assistant', text: 'Preserved prior answer' }], requests: [{ id: 12, params: { command: 'must never run', questions: [{ id: 'q', question: 'Approve?' }] } }] })
  const view = f.api.View({ sessionId: 'one' })
  assert.match(content(view), /read-only|Preserved prior answer/)
  assert.doesNotMatch(content(view), /Approve\?|must never run|Stop current execution/)
  assert.equal(nodes(view).some(row => ['button', 'input', 'select', 'form'].includes(row.type)), false)
  assert.equal(f.api.current('one').requests, undefined)
  assert.equal(f.api.current('one').phase, undefined)
  assert.deepEqual(f.forbidden, [])
  f.cleanup.forEach(off => off())
  f.api.dispose()
})

test('history prefers the new read-only endpoint and retains the legacy status read fallback', async () => {
  const f = fixture()
  let fallback = 0
  f.desktop.codexExecutionStatus = async sessionId => { fallback++; return { sessionId, messages: [{ id: 'legacy', role: 'user', text: 'Original task' }] } }
  await f.api.load('one')
  assert.equal(fallback, 0)
  delete f.desktop.codexHistoryStatus
  await f.api.load('two')
  assert.equal(fallback, 1)
  assert.equal(f.api.current('two').messages[0].text, 'Original task')
  assert.equal(f.api.current('one').messages.length, 0)
  f.api.dispose()
})
