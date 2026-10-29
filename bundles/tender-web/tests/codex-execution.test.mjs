import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import { runInNewContext } from 'node:vm'
import { createNativeCodexExecution, codexExecutionErrorMessage } from '../src/client/codex-execution.js'
import { tCodexExecution } from '../src/client/locales/codex-execution.js'

function fixture() {
  const callbacks = [], cleanup = [], rendered = [], opened = [], sent = []
  let event, off = 0, lang = 'en', hookCalls = 0
  const stored = new Map()
  globalThis.localStorage = { getItem: (key) => stored.get(key), setItem: (key, value) => stored.set(key, value) }
  const desktop = {
    onCodexExecution(listener) { event = listener; return () => off++ },
    async codexExecutionStatus(sessionId) { return { sessionId, cwd: 'C:/project', phase: 'idle', messages: [], requests: [] } },
    async codexExecutionSubmit(input) { sent.push(input); return { ...input, phase: 'running', messages: [], requests: [] } },
  }
  const React = {
    createElement(type, props, ...children) { return { type, props, children } },
    useState(value) { return [value, (update) => callbacks.push(update)] },
    useEffect(install) { const off = install(); if (off) cleanup.push(off) },
  }
  const make = () => createNativeCodexExecution({ React, desktop, language: () => lang, useLanguage: () => { hookCalls++; return lang }, renderMessage: (text) => { rendered.push(text); return text }, openFile: (cwd, path) => opened.push({ cwd, path }) })
  const api = make()
  return { api, make, stored, rendered, opened, sent, cleanup, callbacks, emit: (state) => event(state), language(value) { lang = value }, get off() { return off }, get hookCalls() { return hookCalls } }
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
  f.emit({ sessionId: 'one', cwd: 'C:/project', phase: 'failed', errorCode: 'requestFailed',
    error: "Error invoking remote method 'codex-execution-submit': Error: Shared task context unavailable; token=panel-secret",
    requests: [], messages: [] })
  const alert = nodes(f.api.View({ sessionId: 'one' })).find(row => row.props?.role === 'alert')
  assert.match(content(alert), /Request failed\. Please retry\./)
  assert.match(content(alert), /Shared task context unavailable/)
  assert.doesNotMatch(content(alert), /panel-secret|invoking remote/)
  f.api.dispose()
})

test('real composer native-submit failures retain the draft and attachments and show the specific cause', async () => {
  // Run the production composer handler with isolated stores; no model or credentials.
  const source = readFileSync(new URL('../src/client/index.js', import.meta.url), 'utf8')
  const start = source.indexOf('async function submitCodexTurn(props) {')
  const end = source.indexOf('\n    function wrapComposerSubmit(props)', start)
  assert.ok(start >= 0 && end > start)
  for (const authState of ['logged-in', 'logged-out', 'dna-changed']) {
    let draft = '核查原图并保留我的任务描述'
    let attachments = [{ id: 'original-drawing', path: 'C:/project/original.dwg' }]
    const controller = {}, toasts = [], consumed = []
    let submissions = 0, templateKey = 'pinned-dna-one'
    const authority = { session: {}, inputStore: { getSnapshot: () => ({ draft }) } }
    const handler = runInNewContext('(' + source.slice(start, end) + ')', {
      codexTurnKey: () => 'one', codexTurnController: () => controller, attachmentTurnControllers: new Map(),
      codexTurnAuthorities: () => authority, sessionSnapshotWithChat: () => ({}), snapshotIsBusy: () => false,
      codexAttachItems: () => attachments, nativeCodexAttachmentIds: () => [], kbTaskOf: () => ({ slugs: ['neutral-template'] }), kbTemplateSelectionKey: () => templateKey,
      codexAttachmentIds: rows => rows.map(row => row.id), sameCodexAttachmentIds: (a, b) => JSON.stringify(a) === JSON.stringify(b),
      flushKbTaskSelection: async () => {}, window: { agentPiDesktop: { codexAuthStatus: async () => { if (authState === 'dna-changed') templateKey = 'pinned-dna-two'; return { state: authState === 'logged-out' ? 'logged-out' : 'logged-in' } } } },
      resolveCodexTurnSelection: () => ({ model: 'fixture-model', reasoningEffort: 'high' }), workspaceCwd: () => 'C:/project',
      runtime: { conversation: { resolveDraftAttachments: () => [], releaseDraftAttachments: () => consumed.push('release') } },
      stripMentionArtifacts: text => text, nativeCodex: { async submit() { submissions++; throw new Error("Error invoking remote method 'codex-execution-submit': Error: Shared context refused; token=submit-secret") } },
      setComposerDraft: (_props, next) => { draft = next }, setAttachItemsFor: (_id, next) => { attachments = next },
      codexAttachmentToken: row => row.id, openNativeCodexView: () => consumed.push('open'), showToast: text => toasts.push(text),
      tCodexExecution, codexExecutionErrorMessage, langState: { lang: 'zh' }, notifyCodexTurn: () => {},
    })
    await handler({ inputActions: { removeAttachment: () => consumed.push('remove') } })
    assert.equal(draft, '核查原图并保留我的任务描述')
    assert.equal(attachments.length, 1)
    assert.equal(attachments[0].path, 'C:/project/original.dwg')
    assert.deepEqual(consumed, [])
    assert.equal(controller.nativePreparing, false)
    assert.equal(submissions, authState === 'logged-in' ? 1 : 0)
    assert.equal(toasts.length, 1)
    assert.doesNotMatch(toasts[0], /submit-secret|invoking remote/)
    if (authState === 'dna-changed') assert.equal(toasts[0], tCodexExecution('sessionBusy', 'zh'))
    else assert.match(toasts[0], authState === 'logged-in' ? /Shared context refused/ : /请先在 Codex 设置中登录账户/)
  }
})

test('main engine choice survives remount, remains separate per task, and cannot switch while running', async () => {
  const f = fixture()
  f.api.setEnabled('one', true)
  assert.equal(f.make().enabled('one'), true)
  assert.equal(f.api.enabled('two'), false)
  await f.api.submit({ sessionId: 'one', cwd: 'C:/project', text: 'Calculate BOQ', attachments: [] })
  assert.equal(f.sent.length, 1)
  assert.throws(() => f.api.setEnabled('one', false), /Stop/)
  assert.equal(f.api.enabled('one'), true)
  f.api.dispose()
})

test('native answers render Markdown with actionable original file links and complete professional tool details', async () => {
  const f = fixture()
  await f.api.load('one')
  f.emit({ sessionId: 'one', cwd: 'C:/project', phase: 'idle', requests: [], messages: [{ id: 'answer', role: 'assistant', text: '**Verified** [BOQ](<C:/project/original BOQ.xlsx>) completed.' }, { id: 'cost', role: 'tool', text: 'tender_price completed\n{"cost":42,"source":"original BOQ"}' }] })
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
  assert.equal(f.off, 1)
})

test('native approval previews the concrete extra file permissions and network destination', async () => {
  const f = fixture()
  await f.api.load('one')
  f.emit({ sessionId: 'one', cwd: 'C:/project', phase: 'waiting', messages: [], requests: [{ id: 12, method: 'item/commandExecution/requestApproval', params: { command: 'fetch official source', cwd: 'C:/project', additionalPermissions: { fileSystem: { write: ['C:/approved/export'] } }, networkApprovalContext: { host: 'official-source.example', protocol: 'https' } } }] })
  const question = nodes(f.api.View({ sessionId: 'one' })).find((row) => typeof row.type === 'function')
  assert.ok(question)
  const preview = content(question.type(question.props))
  assert.match(preview, /C:\/approved\/export/)
  assert.match(preview, /official-source\.example/)
  assert.match(preview, /fetch official source/)
  f.api.dispose()
})

test('a transient native reply failure is reported without claiming the interaction expired', async () => {
  const errors=[]
  const React={createElement(type,props,...children){return {type,props,children}},useState(value){return [value,update=>errors.push(update)]},useEffect(){}}
  const api=createNativeCodexExecution({React,language:()=> 'en',desktop:{onCodexExecution:()=>()=>{},codexExecutionStatus:async()=>({cwd:'C:/project',phase:'waiting',messages:[],requests:[{id:1,params:{questions:[{id:'q',question:'Latest version?'}]}}]}),codexExecutionReply:async()=>{throw new Error('temporary write failure')}}})
  await api.load('one')
  const question=nodes(api.View({sessionId:'one'})).find(row=>typeof row.type==='function')
  const send=nodes(question.type(question.props)).find(row=>row.type==='button')
  await send.props.onClick()
  assert.ok(errors.includes('Your response could not be submitted. Retry or load the latest task state.'))
  assert.ok(!errors.some(row=>typeof row==='string'&&row.includes('expired')))
  api.dispose()
})
