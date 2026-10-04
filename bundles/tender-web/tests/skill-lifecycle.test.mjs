import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { readdirSync } from 'node:fs'
import { resolve, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { test } from 'node:test'
import { createSkillLifecycle, skillLifecycleCss } from '../src/client/skill-lifecycle.js'

function vendorPackage(name, entry = '') {
  const pnpm = resolve(fileURLToPath(new URL('../../../vendor/deepseek-harness/node_modules/.pnpm/', import.meta.url)))
  const folder = readdirSync(pnpm).find(row => row === name || row.startsWith(name + '@'))
  return createRequire(import.meta.url)(join(pnpm, folder, 'node_modules', name, entry))
}
async function domFixture() {
  const { JSDOM } = vendorPackage('jsdom'), dom = new JSDOM('<div id="root"></div>', { url: 'http://localhost/' }), previous = {}
  for (const [key, value] of Object.entries({ window: dom.window, document: dom.window.document, navigator: dom.window.navigator, HTMLElement: dom.window.HTMLElement, Event: dom.window.Event, MouseEvent: dom.window.MouseEvent, IS_REACT_ACT_ENVIRONMENT: true })) {
    previous[key] = Object.getOwnPropertyDescriptor(globalThis, key)
    Object.defineProperty(globalThis, key, { configurable: true, writable: true, value })
  }
  const React = vendorPackage('react'), { createRoot } = vendorPackage('react-dom', 'client.js'), root = createRoot(dom.window.document.getElementById('root'))
  return { React, root, act: React.act, document: dom.window.document, window: dom.window, async close() { await React.act(async () => root.unmount()); dom.window.close(); for (const [key, descriptor] of Object.entries(previous)) { if (descriptor) Object.defineProperty(globalThis, key, descriptor); else delete globalThis[key] } } }
}
const button = (f, text) => [...f.document.querySelectorAll('button')].find(row => row.textContent.includes(text))
async function click(f, element) { assert.ok(element); await f.act(async () => element.dispatchEvent(new f.window.MouseEvent('click', { bubbles: true }))) }
async function input(f, element, value) {
  const setter = Object.getOwnPropertyDescriptor(f.window.HTMLInputElement.prototype, 'value').set
  await f.act(async () => { setter.call(element, value); element.dispatchEvent(new f.window.Event('input', { bubbles: true })) })
}
function fixture() {
  const version = { slug: 'checked-method', versionId: 'a'.repeat(64), markdown: '---\nname: checked-method\n---\nVerify actual inputs.', sourceTaskId: 'source-session', sourceArtifact: { path: 'accepted.md' }, applicability: ['Matching fixed input'], failureModes: ['Stop on changed inputs'] }
  const lifecycle = { slug: version.slug, versions: [{ versionId: version.versionId, status: 'candidate' }], validations: [] }, calls = []
  const api = async (url, cwd, options) => {
    const body = options?.body ? JSON.parse(options.body) : { action: 'list' }
    calls.push({ url, cwd, body })
    if (body.action === 'list') return { skills: [{ slug: 'legacy-manual' }], lifecycles: [structuredClone(lifecycle)] }
    if (body.action === 'read') return { lifecycle: structuredClone(lifecycle), version: structuredClone(version), sourceReady: true }
    if (body.action === 'validate') lifecycle.validations.push({ versionId: version.versionId, caseId: body.caseId, passed: true, verificationMethod: 'independent-case-exact-bytes' })
    if (body.action === 'publish') { lifecycle.versions[0].status = 'published'; lifecycle.currentVersionId = version.versionId }
    if (body.action === 'retire') lifecycle.versions[0].status = 'retired'
    return { lifecycle: structuredClone(lifecycle) }
  }
  return { version, lifecycle, calls, api }
}

test('human-selected files, explicit publication and two-step retirement form the skill lifecycle', async () => {
  const f = await domFixture(), state = fixture(), changed = []
  const Panel = createSkillLifecycle({ React: f.React, api: state.api, cwd: () => 'workspace', sessionId: () => 'independent-session', language: () => 'zh', onChanged: () => changed.push(true) })
  try {
    await f.act(async () => f.root.render(f.React.createElement(Panel)))
    assert.match(f.document.body.textContent, /旧手工版本，未验证/)
    await click(f, button(f, '候选，尚未加载'))
    assert.match(f.document.body.textContent, /不证明任意任务的语义质量/)
    assert.equal(button(f, '批准并发布').disabled, true)
    const inputs = [...f.document.querySelectorAll('form input:not([type=checkbox])')]
    for (const [index, value] of ['fixed-case', 'independent.txt', 'gold.txt', 'actual.txt'].entries()) await input(f, inputs[index], value)
    assert.equal(button(f, '冻结案例并验证').disabled, true)
    await click(f, f.document.querySelector('form input[type=checkbox]'))
    await f.act(async () => f.document.querySelector('form').dispatchEvent(new f.window.Event('submit', { bubbles: true, cancelable: true })))
    const validation = state.calls.find(row => row.body.action === 'validate').body
    assert.equal(validation.sessionId, 'independent-session'); assert.equal(validation.humanSelected, true)
    assert.equal(validation.expectedOutputPath, 'gold.txt'); assert.equal(validation.taskId, undefined)
    assert.equal(button(f, '批准并发布').disabled, true)
    await click(f, [...f.document.querySelectorAll('input[type=checkbox]')].at(-1))
    await click(f, button(f, '批准并发布'))
    assert.equal(state.calls.find(row => row.body.action === 'publish').body.confirmPublish, true)
    await click(f, button(f, '退役此版本'))
    assert.equal(state.calls.filter(row => row.body.action === 'retire').length, 0)
    await click(f, button(f, '确认操作'))
    assert.equal(state.calls.find(row => row.body.action === 'retire').body.confirm, true)
    assert.equal(changed.length, 3)
    assert.match(skillLifecycleCss(), /ap-skill-lifecycle/)
  } finally { await f.close() }
})

test('source-session repetition is blocked and backend source problems remain visible', async () => {
  const f = await domFixture(), state = fixture()
  const api = async (...args) => { const value = await state.api(...args); return value.version ? { ...value, sourceReady: false, sourceReason: '审核输入已变化' } : value }
  const Panel = createSkillLifecycle({ React: f.React, api, language: 'zh' })
  try {
    await f.act(async () => f.root.render(f.React.createElement(Panel, { cwd: 'workspace', sessionId: 'source-session' })))
    await click(f, button(f, '候选，尚未加载'))
    assert.match(f.document.body.textContent, /请在另一个独立任务会话中验证/)
    assert.match(f.document.body.textContent, /审核输入已变化/)
    assert.equal(button(f, '冻结案例并验证').disabled, true)
    assert.equal(button(f, '批准并发布').disabled, true)
  } finally { await f.close() }
})

test('changing sessions discards delayed data and a pending human selection', async () => {
  const f = await domFixture(), state = fixture(); let resolveOld
  const api = async (url, ...args) => url.includes('sessionId=old') ? new Promise(resolve => { resolveOld = resolve }) : state.api(url, ...args)
  const Panel = createSkillLifecycle({ React: f.React, api, language: 'en' })
  try {
    await f.act(async () => f.root.render(f.React.createElement(Panel, { cwd: 'workspace', sessionId: 'old' })))
    await f.act(async () => f.root.render(f.React.createElement(Panel, { cwd: 'workspace', sessionId: 'independent-session' })))
    await click(f, button(f, 'Candidate, not loaded'))
    await input(f, f.document.querySelector('form input'), 'previous-case')
    await f.act(async () => resolveOld({ skills: [{ slug: 'stale-old-skill' }], lifecycles: [] }))
    assert.doesNotMatch(f.document.body.textContent, /stale-old-skill/)
    await f.act(async () => f.root.render(f.React.createElement(Panel, { cwd: 'other-workspace', sessionId: 'other-session' })))
    assert.equal(f.document.querySelector('form'), null)
    assert.match(f.document.body.textContent, /Skill versions and independent validation/)
  } finally { await f.close() }
})
