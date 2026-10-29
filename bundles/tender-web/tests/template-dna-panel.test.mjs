import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { readdirSync } from 'node:fs'
import { resolve, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { test } from 'node:test'
import { createTemplateDnaPanel } from '../src/client/template-dna-panel.js'
import { createKnowledgeBasePanel } from '../src/client/knowledge-base-panel.js'
const store = resolve(fileURLToPath(new URL('../../../vendor/deepseek-harness/node_modules/.pnpm/', import.meta.url)))
function dependency(name, entry = '') {
  const folder = readdirSync(store).find(row => row === name || row.startsWith(name + '@'))
  assert.ok(folder, 'Missing existing ' + name)
  return createRequire(import.meta.url)(join(store, folder, 'node_modules', name, entry))
}
async function fixture() {
  const { JSDOM } = dependency('jsdom'), dom = new JSDOM('<div id="root"></div>', { url: 'http://127.0.0.1/' }), previous = {}
  for (const [key, value] of Object.entries({ window: dom.window, document: dom.window.document, sessionStorage: dom.window.sessionStorage, IS_REACT_ACT_ENVIRONMENT: true })) {
    previous[key] = Object.getOwnPropertyDescriptor(globalThis, key); Object.defineProperty(globalThis, key, { configurable: true, writable: true, value })
  }
  const React = dependency('react'), { createRoot } = dependency('react-dom', 'client.js'), root = createRoot(dom.window.document.getElementById('root'))
  return { React, root, dom, document: dom.window.document, async render(View, props) { await React.act(async () => root.render(React.createElement(View, props))) }, async close() {
    await React.act(async () => root.unmount()); dom.window.close()
    for (const [key, value] of Object.entries(previous)) { if (value) Object.defineProperty(globalThis, key, value); else delete globalThis[key] }
  } }
}
const version = 'a'.repeat(64), dna = 'b'.repeat(64)
const entry = { slug: 'user-template', name: '企业范本.docx', category: '用户模板', parseStatus: 'ready', versionId: version }
function profile(overrides = {}) { return { schemaVersion: 1, dnaId: dna, createdAt: '2026-10-29T10:00:00Z', source: { slug: entry.slug, versionId: version, name: entry.name }, coverage: { sampleCount: 1, fullAuthorDna: false }, warnings: ['单份范本不代表完整作者风格'], layers: [{ id: 'L1', title: '语言', status: 'observed', observations: ['使用客观陈述'], evidence: [{ locator: '第一段', excerpt: '<script>oldFacts()</script>' }], unknowns: [] }, { id: 'L6', title: '视觉', status: 'unknown', observations: [], evidence: [], unknowns: ['扫描件无法确认字号'] }], ...overrides } }
const button = (f, text) => [...f.document.querySelectorAll('button')].find(row => row.textContent === text)
async function click(f, control) { assert.ok(control, 'Expected control'); await f.React.act(async () => control.click()) }
async function expand(f) { const details = f.document.querySelector('.ap-template-dna'); assert.ok(details); await f.React.act(async () => { details.open = true; details.dispatchEvent(new f.dom.window.Event('toggle')) }) }

test('template extraction stays explicit, renders evidence safely, and binds only after user choice', async () => {
  const f = await fixture(), actions = [], used = [], events = []
  try {
    f.dom.window.addEventListener('agent-pi-project-state-changed', event => events.push(event.detail))
    const View = createTemplateDnaPanel({ React: f.React, api: async (_path, _cwd, options) => { const body = JSON.parse(options.body); actions.push(body); return body.action === 'template_dna_list' ? { profiles: [] } : { profile: profile() } } })
    await f.render(View, { cwd: 'C:/isolated', entry, onUseProfile: value => used.push(value) })
    assert.equal(actions.length, 0); await expand(f); assert.deepEqual(actions.map(row => row.action), ['template_dna_list'])
    await click(f, button(f, '提取范本规则'))
    assert.equal(used.length, 0); assert.ok(f.document.body.textContent.includes('扫描件无法确认字号')); assert.equal(f.document.querySelector('script'), null)
    assert.deepEqual(actions.map(row => row.action), ['template_dna_list', 'template_dna_distill']); assert.equal(actions[1].intelligent, false); assert.equal(actions[1].localOnly, true)
    await click(f, button(f, '本次按此范本'))
    assert.equal(used[0].dnaId, dna); assert.equal(used[0].source.versionId, version); assert.ok(events.every(row => row.cwd === 'C:/isolated'))
  } finally { await f.close() }
})

test('a late template response cannot replace another source and fixed historical bindings remain visible', async () => {
  const f = await fixture(); let finishOld
  try {
    const View = createTemplateDnaPanel({ React: f.React, api: async (_path, _cwd, options) => {
      const body = JSON.parse(options.body)
      if (body.action === 'template_dna_read') return { profile: profile() }
      if (body.versionId === version) return new Promise(resolve => { finishOld = resolve })
      return { profiles: [profile({ dnaId: 'd'.repeat(64), source: { ...profile().source, versionId: 'c'.repeat(64), name: '新版范本' } })] }
    } })
    await f.render(View, { cwd: 'C:/isolated', entry }); await expand(f)
    await f.render(View, { cwd: 'C:/isolated', entry: { ...entry, versionId: 'c'.repeat(64) } })
    await f.React.act(async () => finishOld({ profiles: [profile()] }))
    assert.ok(f.document.body.textContent.includes('新版范本')); assert.equal(f.document.body.textContent.includes('企业范本.docx · 固定来源'), false)
    await f.render(View, { cwd: 'C:/isolated', entry: { ...entry, versionId: 'c'.repeat(64) }, binding: { slug: entry.slug, versionId: version, dnaId: dna } })
    assert.match(f.document.body.textContent, /历史范本版本/); assert.ok(f.document.body.textContent.includes(version.slice(0, 12)))
  } finally { await f.close() }
})

test('KB draft DNA binding moves only to its created session and unchecking removes the constraint', async () => {
  const f = await fixture(), selected = new Map(), requests = []
  try {
    const api = async (path, _cwd, options) => {
      if (options.method === 'GET') { const state = selected.get(new URL(path, 'http://localhost/').searchParams.get('sessionId')) || { selectedSlugs: [], templateBindings: [] }; return { entries: [entry, { ...entry, slug: 'other-template', name: '另一份范本.docx' }], folders: [], skills: [], mineru: {}, ...state } }
      const body = JSON.parse(options.body); requests.push(body)
      const value = profile({ dnaId: body.dnaId || (body.slug === 'other-template' ? 'e'.repeat(64) : dna), source: { ...profile().source, slug: body.slug, name: body.slug === 'other-template' ? '另一份范本.docx' : entry.name } })
      if (body.action === 'template_dna_list') return { profiles: [value] }
      if (body.action === 'template_dna_read') return { profile: value }
      if (body.action === 'template_dna_distill') return { profile: { ...value, dnaId: 'd'.repeat(64) } }
      assert.equal(body.action, 'select')
      const state = { selectedSlugs: body.slugs, templateBindings: body.templateBindings }; selected.set(body.sessionId, state); return state
    }
    const deps = new Proxy({ React: f.React, h: f.React.createElement, api, runtime: {}, KB_PRESET_CATEGORIES: [], kbPickState: { entries: [], listeners: new Set() }, tAp: key => key, kbTitle: row => row.name, mergeKbEntries: (rows, local) => [...rows, ...local], sortKbCategories: rows => rows, groupKbEntries: rows => ({ folders: [], loose: rows }), kbChatImportCopy: () => ({ say: '' }), kbLandingCardVisible: () => false, kbCategoryLabel: value => value, kbIngestKind: () => 'local', Icon: () => null }, { get: (target, key) => key in target ? target[key] : () => '' })
    const panel = createKnowledgeBasePanel(deps)
    await f.render(panel.KnowledgeBasePanel, { cwd: 'C:/isolated' }); await expand(f); await click(f, button(f, '本次按此范本'))
    const draftKey = panel.kbDraftKey(), binding = { slug: entry.slug, versionId: version, dnaId: dna }
    assert.deepEqual(panel.kbTaskOf(draftKey).templateBindings, [binding]); assert.equal(requests.filter(row => row.action === 'select').length, 0)
    await panel.claimDraftKbTask('old-session'); assert.equal(selected.has('old-session'), false)
    await panel.claimDraftKbTask('created-session', true, draftKey); await panel.flushKbTaskSelection('created-session')
    assert.deepEqual(selected.get('created-session').templateBindings, [binding]); assert.deepEqual(panel.kbTaskOf(panel.kbDraftKey()).templateBindings, [])
    await f.render(panel.KnowledgeBasePanel, { cwd: 'C:/isolated', sessionId: 'created-session' })
    const before = panel.kbTemplateSelectionKey('created-session')
    await click(f, button(f, '重新提取当前范本')); await click(f, button(f, '本次按此范本')); await panel.flushKbTaskSelection('created-session')
    assert.notEqual(panel.kbTemplateSelectionKey('created-session'), before, 'same material slug with another DNA invalidates the send snapshot')
    assert.deepEqual(selected.get('created-session').selectedSlugs, [entry.slug])
    const secondPanel = f.document.querySelectorAll('.ap-template-dna')[1]
    await f.React.act(async () => { secondPanel.open = true; secondPanel.dispatchEvent(new f.dom.window.Event('toggle')) })
    await click(f, button(f, '本次按此范本')); await panel.flushKbTaskSelection('created-session')
    assert.deepEqual(selected.get('created-session').selectedSlugs, [entry.slug, 'other-template'])
    assert.deepEqual(selected.get('created-session').templateBindings.map(row => row.slug), ['other-template'], 'one strict primary, multiple materials remain reference-only')
    assert.match(f.document.body.textContent, /本次主范本：另一份范本/)
    const checkboxes = f.document.querySelectorAll('input[title="kb.taskSelect"]')
    await click(f, checkboxes[0]); await panel.flushKbTaskSelection('created-session')
    assert.equal(selected.get('created-session').templateBindings.length, 1, 'removing a reference does not clear the primary')
    await click(f, checkboxes[1]); await panel.flushKbTaskSelection('created-session')
    assert.deepEqual(selected.get('created-session').templateBindings, [])
    await f.render(panel.KnowledgeBasePanel, { cwd: 'C:/isolated', sessionId: 'other-session' })
    assert.deepEqual(panel.kbTaskOf('other-session').templateBindings, [])
  } finally { await f.close() }
})


test('AI distillation is explicit and a failed analysis keeps the local profile without rebinding', async () => {
  const f = await fixture(), requests = [], used = []; let succeed = false
  try {
    const local = profile({ method: 'deterministic', ai: { status: 'not_requested' } })
    const View = createTemplateDnaPanel({ React: f.React, api: async (_path, _cwd, options) => {
      const body = JSON.parse(options.body); requests.push(body)
      if (body.action === 'template_dna_list') return { profiles: [local] }
      if (body.action === 'template_dna_read') return { profile: local }
      assert.equal(body.action, 'template_dna_distill'); assert.equal(body.intelligent, true); assert.equal(body.localOnly, false)
      return { profile: succeed ? profile({ dnaId: 'f'.repeat(64), method: 'grounded-ai' }) : local, ai: succeed ? { status: 'completed' } : { status: 'failed', reason: '中立夹具模拟超时，未进行真实模型请求' } }
    } })
    await f.render(View, { cwd: 'C:/isolated', entry, binding: { slug: entry.slug, versionId: version, dnaId: dna }, onUseProfile: value => used.push(value) }); await expand(f)
    assert.equal(requests.some(row => row.action === 'template_dna_distill'), false)
    await click(f, button(f, 'AI蒸馏表达与深度（当前模型）'))
    assert.match(f.document.body.textContent, /AI分析未形成有效规则/); assert.match(f.document.body.textContent, /模拟超时/); assert.equal(used.length, 0)
    succeed = true; await click(f, button(f, 'AI蒸馏表达与深度（当前模型）'))
    assert.match(f.document.body.textContent, /AI有据分析候选/); assert.equal(used.length, 0)
    await click(f, button(f, '本次按此范本')); assert.equal(used[0].dnaId, 'f'.repeat(64))
  } finally { await f.close() }
})


test('a failed primary-template save keeps the previous binding and can be retried without dispatching a task', async () => {
  const f = await fixture(), original = { slug: entry.slug, versionId: version, dnaId: dna }, replacement = profile({ dnaId: 'f'.repeat(64) }); let fail = true, state = { selectedSlugs: [entry.slug], templateBindings: [original] }
  try {
    const api = async (_path, _cwd, options) => {
      if (options.method === 'GET') return { entries: [entry], folders: [], skills: [], mineru: {}, ...state }
      const body = JSON.parse(options.body)
      if (body.action === 'template_dna_list') return { profiles: [replacement] }
      if (body.action === 'template_dna_read') return { profile: body.dnaId === dna ? profile() : replacement }
      assert.equal(body.action, 'select')
      if (fail) { fail = false; throw new Error('范本绑定保存失败，请重试') }
      state = { selectedSlugs: body.slugs, templateBindings: body.templateBindings }; return state
    }
    const deps = new Proxy({ React: f.React, h: f.React.createElement, api, runtime: {}, KB_PRESET_CATEGORIES: [], kbPickState: { entries: [], listeners: new Set() }, tAp: key => key, kbTitle: row => row.name, mergeKbEntries: (rows, local) => [...rows, ...local], sortKbCategories: rows => rows, groupKbEntries: rows => ({ folders: [], loose: rows }), kbChatImportCopy: () => ({ say: '' }), kbLandingCardVisible: () => false, kbCategoryLabel: value => value, kbIngestKind: () => 'local', Icon: () => null }, { get: (target, key) => key in target ? target[key] : () => '' })
    const panel = createKnowledgeBasePanel(deps)
    await f.render(panel.KnowledgeBasePanel, { cwd: 'C:/isolated', sessionId: 'session' }); await expand(f)
    const chooseReplacement = async () => { const select = f.document.querySelector('.ap-template-dna select'); await f.React.act(async () => { select.value = replacement.dnaId; select.dispatchEvent(new f.dom.window.Event('change', { bubbles: true })) }) }
    await chooseReplacement(); await click(f, button(f, '本次按此范本'))
    await assert.rejects(panel.flushKbTaskSelection('session'), /保存失败/)
    assert.deepEqual(panel.kbTaskOf('session').templateBindings, [original]); assert.match(f.document.body.textContent, /保存失败/)
    await chooseReplacement(); await click(f, button(f, '本次按此范本')); await panel.flushKbTaskSelection('session')
    assert.equal(panel.kbTaskOf('session').templateBindings[0].dnaId, replacement.dnaId)
  } finally { await f.close() }
})
