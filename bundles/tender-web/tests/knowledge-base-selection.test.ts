import assert from 'node:assert/strict'
import { readdirSync } from 'node:fs'
import { createRequire } from 'node:module'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { test } from 'node:test'
import { createKnowledgeBasePanel } from '../src/client/knowledge-base-panel.js'

const store = fileURLToPath(new URL('../../../vendor/deepseek-harness/node_modules/.pnpm/', import.meta.url))
function dependency(name: string, entry = '') {
  const folder = readdirSync(store).find((path) => path.startsWith(name + '@'))
  assert.ok(folder, `Missing existing ${name} test dependency`)
  return createRequire(import.meta.url)(join(store, folder, 'node_modules', name, entry))
}

test('KB selection stays empty by default, survives its first message, and never claims a historical session', async () => {
  const { JSDOM } = dependency('jsdom')
  const React = dependency('react')
  const { createRoot } = dependency('react-dom', 'client.js')
  const dom = new JSDOM('<div id="root"></div>', { url: 'http://127.0.0.1/' })
  const globals = { window: dom.window, document: dom.window.document, sessionStorage: dom.window.sessionStorage, IS_REACT_ACT_ENVIRONMENT: true }
  const previous = new Map(Object.keys(globals).map((key) => [key, Object.getOwnPropertyDescriptor(globalThis, key)]))
  for (const [key, value] of Object.entries(globals)) Object.defineProperty(globalThis, key, { configurable: true, writable: true, value })
  const entries = ['a', 'b'].map((slug) => ({ slug, name: slug.toUpperCase(), category: '规范', parseStatus: 'ready' }))
  const selections = new Map<string, string[]>([['old-session', ['b']]])
  const posted: Array<{ sessionId: string; slugs: string[] }> = []
  const body = (slugs: string[]) => ({ entries, selectedSlugs: slugs, folders: [], skills: [], mineru: {} })
  let delayedGet: ((value: unknown) => void) | undefined
  let delayNextGet = false
  let failNextPost = false
  let holdPosts = false
  const heldPosts: Array<() => void> = []
  let finishParse: ((value: unknown) => void) | undefined
  const api = async (path: string, _cwd: string, options: { method: string; body?: string }) => {
    if (options.method === 'GET') {
      if (delayNextGet) { delayNextGet = false; return new Promise((resolve) => { delayedGet = resolve }) }
      return body(selections.get(new URL(path, 'http://127.0.0.1').searchParams.get('sessionId') || '') || [])
    }
    const value = JSON.parse(options.body || '{}')
    if (value.action === 'parse') {
      entries[0]!.parseStatus = 'parsing'
      return new Promise((resolve) => { finishParse = resolve })
    }
    posted.push(value)
    if (failNextPost) { failNextPost = false; throw new Error('selection save failed') }
    if (holdPosts) return new Promise((resolve) => { heldPosts.push(() => {
      selections.set(value.sessionId, value.slugs)
      resolve({ selectedSlugs: value.slugs })
    }) })
    selections.set(value.sessionId, value.slugs)
    return { selectedSlugs: value.slugs }
  }
  const deps = new Proxy({
    React, h: React.createElement, api, runtime: {}, KB_PRESET_CATEGORIES: [],
    kbPickState: { entries: [], listeners: new Set() },
    tAp: (key: string) => key,
    kbTitle: (entry: { name: string }) => entry.name,
    mergeKbEntries: (items: unknown[], local: unknown[]) => [...items, ...local],
    sortKbCategories: (categories: string[]) => categories,
    groupKbEntries: (items: unknown[]) => ({ folders: [], loose: items }),
    kbChatImportCopy: () => ({ say: '' }),
    kbLandingCardVisible: () => false,
    kbCategoryLabel: (category: string) => category,
    kbIngestKind: () => 'local',
    Icon: () => null,
  } as Record<string, unknown>, { get: (target, key: string) => key in target ? target[key] : () => '' })
  const panel = createKnowledgeBasePanel(deps)
  const root = createRoot(dom.window.document.getElementById('root'))
  const render = async (sessionId?: string) => React.act(async () => { root.render(React.createElement(panel.KnowledgeBasePanel, { sessionId })) })
  const boxes = () => [...dom.window.document.querySelectorAll('input[title="kb.taskSelect"]')] as HTMLInputElement[]
  const click = async (index: number) => React.act(async () => { boxes()[index]!.click() })
  const refresh = async () => React.act(async () => { dom.window.dispatchEvent(new dom.window.Event('agent-pi-kb-changed')) })
  try {
    dom.window.sessionStorage.setItem('ap-kb-task:active', '["b"]')
    dom.window.sessionStorage.setItem('ap-kb-task:new-session', '["b"]')
    dom.window.sessionStorage.setItem('ap-kb-task:old-session', '["b"]')
    await render('new-session')
    assert.deepEqual(boxes().map((box) => box.checked), [false, false])
    assert.deepEqual(panel.kbTaskOf('new-session').slugs, [], 'server empty selection overrides stale local B')
    assert.equal(panel.formatKbTaskBlock('new-session'), '')
    assert.equal(panel.hasKbTaskSelectionSave('new-session'), false)

    delayNextGet = true
    await refresh()
    await click(0)
    await panel.flushKbTaskSelection('new-session')
    await React.act(async () => { delayedGet!(body(['b'])) })
    assert.deepEqual(boxes().map((box) => box.checked), [true, false])
    assert.deepEqual(panel.kbTaskOf('new-session').slugs, ['a'], 'old in-flight B response cannot override the user choosing A')
    selections.set('new-session', [])
    await refresh()
    assert.deepEqual(boxes().map((box) => box.checked), [false, false])

    holdPosts = true
    const postsBeforeRapidSelection = posted.length
    await click(0)
    let flushed = false
    const saving = panel.flushKbTaskSelection('new-session').then(() => { flushed = true })
    await click(1)
    assert.equal(posted.length, postsBeforeRapidSelection + 1, 'the second selection waits until the first server write completes')
    assert.equal(panel.hasKbTaskSelectionSave('new-session'), true)
    await React.act(async () => { heldPosts.shift()!() })
    assert.equal(posted.length, postsBeforeRapidSelection + 2)
    assert.equal(flushed, false, 'flush must cover the entire selection queue')
    await React.act(async () => { heldPosts.shift()!() })
    await saving
    assert.equal(panel.hasKbTaskSelectionSave('new-session'), false)
    holdPosts = false
    assert.deepEqual(selections.get('new-session'), ['a', 'b'])
    assert.deepEqual(panel.kbTaskOf('new-session').slugs, ['a', 'b'])

    delayNextGet = true
    await refresh()
    await render('other-new-session')
    assert.deepEqual(boxes().map((box) => box.checked), [false, false])
    await React.act(async () => { delayedGet!(body(['a'])) })
    assert.deepEqual(boxes().map((box) => box.checked), [false, false], 'a late response from A cannot set the selection UI for B')
    await click(1)
    await panel.flushKbTaskSelection('other-new-session')
    assert.deepEqual(selections.get('other-new-session'), ['b'], 'the next toggle must use only the current session selection')

    await render()
    assert.deepEqual(boxes().map((box) => box.checked), [false, false], 'legacy active selection is not a new draft')
    const requestsBeforeDraft = posted.length
    await click(0)
    assert.equal(posted.length, requestsBeforeDraft, 'a draft selection stays local until its session exists')
    assert.match(panel.formatKbTaskBlock(), /— a/)
    await panel.claimDraftKbTask('old-session')
    assert.deepEqual(panel.kbTaskOf('old-session').slugs, ['b'])
    assert.deepEqual(panel.kbTaskOf().slugs, ['a'])
    const selectedDraftKey = panel.kbDraftKey()
    await panel.claimDraftKbTask('created-from-draft', true, selectedDraftKey)
    await panel.flushKbTaskSelection('created-from-draft')
    assert.deepEqual(selections.get('created-from-draft'), ['a'])
    assert.match(panel.formatKbTaskBlock('created-from-draft'), /— a/)
    assert.doesNotMatch(panel.formatKbTaskBlock('created-from-draft'), /— b/)
    assert.equal(panel.formatKbTaskBlock(), '')
    await panel.claimDraftKbTask('late-created-session', true, selectedDraftKey)
    assert.equal(selections.has('late-created-session'), false, 'a late create result cannot claim a different draft')
    selections.set('another-new-session', ['b'])
    await panel.claimDraftKbTask('another-new-session', true)
    assert.deepEqual(selections.get('another-new-session'), [], 'native reused blank starts with the current empty draft selection')
    assert.equal(panel.formatKbTaskBlock('another-new-session'), '')

    selections.set('failed-empty-blank', ['b'])
    failNextPost = true
    await assert.rejects(panel.claimDraftKbTask('failed-empty-blank', true), /selection save failed/)
    assert.deepEqual(selections.get('failed-empty-blank'), ['b'])
    assert.deepEqual(panel.kbTaskOf('failed-empty-blank').slugs, [])
    assert.equal(panel.hasKbTaskSelectionSave('failed-empty-blank'), true)
    await assert.rejects(panel.flushKbTaskSelection('failed-empty-blank'), /selection save failed/)

    await render()
    await click(0)
    const abandonedDraftKey = panel.kbDraftKey()
    panel.resetDraftKbTask()
    await panel.claimDraftKbTask('created-after-abandon', true, abandonedDraftKey)
    assert.equal(panel.formatKbTaskBlock('created-after-abandon'), '')
    assert.equal(panel.formatKbTaskBlock(), '', 'a newly started draft does not reuse its predecessor selection')

    await render('parse-owner-session')
    await React.act(async () => { dom.window.document.querySelector('button[title="kb.reparseTitle"]')!.click() })
    assert.ok(finishParse)
    await render('parse-observer-session')
    await React.act(async () => { finishParse!({ started: ['a'], skipped: [] }) })
    await panel.flushKbTaskSelection('parse-owner-session')
    assert.deepEqual(selections.get('parse-owner-session'), ['a'])
    entries[0]!.parseStatus = 'ready'
    await refresh()
    assert.deepEqual(panel.kbTaskOf('parse-observer-session').slugs, [], 'a global parse completion cannot opt another session into its KB')
    assert.deepEqual(boxes().map((box) => box.checked), [false, false])

    await render('failed-save-session')
    failNextPost = true
    await click(0)
    await assert.rejects(panel.flushKbTaskSelection('failed-save-session'), /selection save failed/)
    assert.deepEqual(panel.kbTaskOf('failed-save-session').slugs, ['a'], 'failed persistence retains the explicit selection for retry')
    assert.match(dom.window.document.body.textContent || '', /selection save failed/)
    assert.equal(selections.has('failed-save-session'), false)
    assert.equal(panel.hasKbTaskSelectionSave('failed-save-session'), true)
    failNextPost = true
    await click(0)
    await assert.rejects(panel.flushKbTaskSelection('failed-save-session'), /selection save failed/)
    assert.deepEqual(panel.kbTaskOf('failed-save-session').slugs, [])
    assert.equal(panel.hasKbTaskSelectionSave('failed-save-session'), true, 'a failed deselection still has to block sending')
    await click(0)
    await panel.flushKbTaskSelection('failed-save-session')
    await click(0)
    await panel.flushKbTaskSelection('failed-save-session')
    assert.deepEqual(selections.get('failed-save-session'), [])
    assert.doesNotMatch(dom.window.document.body.textContent || '', /selection save failed/)
  } finally {
    await React.act(async () => { root.unmount() })
    dom.window.close()
    for (const [key, descriptor] of previous) {
      if (descriptor) Object.defineProperty(globalThis, key, descriptor)
      else Reflect.deleteProperty(globalThis, key)
    }
  }
})
