import assert from 'node:assert/strict'
import { test } from 'node:test'
import { createNativeCodexExecution } from '../src/client/codex-execution.js'

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
