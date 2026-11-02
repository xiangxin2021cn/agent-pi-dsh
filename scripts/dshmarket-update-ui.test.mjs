import assert from 'node:assert/strict'
import { test } from 'node:test'
import { createRequire } from 'node:module'
import { mkdtempSync, readFileSync, readdirSync, realpathSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { basename, dirname, join, resolve, sep } from 'node:path'
import { AP_I18N, AP_LANGUAGE_DEFINITIONS } from '../bundles/tender-web/src/client/locales/catalog.js'

const root = resolve(import.meta.dirname, '..'), market = join(root, 'vendor/dshmarket/src/client')
const store = join(root, 'vendor/deepseek-harness/node_modules/.pnpm'), require = createRequire(import.meta.url)
function dependency(name, entry = '') {
  const folder = readdirSync(store).find(row => row.startsWith(name + '@'))
  assert.ok(folder, 'Existing test dependency missing: ' + name)
  return join(store, folder, 'node_modules', name, entry)
}

test('real MarketSection keeps explicit checks available and preserves update/source-confirmation requests', { timeout: 30000 }, async () => {
  const { build, stop } = require(dependency('esbuild', 'lib/main.js'))
  const { JSDOM } = require(dependency('jsdom')), React = require(dependency('react'))
  const react = dependency('react', 'index.js'), reactDom = dependency('react-dom', 'index.js')
  const scratch = mkdtempSync(join(tmpdir(), 'ap-market-ui-388-'))
  const primitiveNames = new Set()
  for (const file of readdirSync(market).filter(name => /\.(?:ts|tsx)$/.test(name))) {
    const text = readFileSync(join(market, file), 'utf8')
    for (const match of text.matchAll(/import\s*\{([^}]+)\}\s*from\s*['"]@deepseek-ai\/dsh-client-ui-primitives['"]/g)) {
      for (const item of match[1].split(',').map(value => value.trim()).filter(value => value && !value.startsWith('type '))) primitiveNames.add(item.split(/\s+as\s+/)[0])
    }
  }
  // Presentation primitives are simple DOM seats; all MarketSection hooks,
  // request handlers, source-matching logic and translations remain actual source.
  const primitiveStub = `import React from 'react';const h=React.createElement;
const components={Button:({children,onClick,disabled,title,type='button',...props})=>h('button',{onClick,disabled,title,type,'aria-label':props['aria-label']},children),Input:({value,onChange,placeholder,disabled,...props})=>h('input',{value,onChange,placeholder,disabled,'aria-label':props['aria-label']}),Modal:({open,title,description,children,footer})=>open?h('section',{role:'dialog','aria-label':title},h('h3',null,title),h('p',null,description),children,footer):null,Tooltip:({children})=>h(React.Fragment,null,children),Menu:({anchor,open,children})=>h('div',null,anchor,open?children:null),Toast:({text})=>h('span',null,text)};
${[...primitiveNames].map(name => `export const ${name}=components.${name}||(({children})=>h('span',null,children));`).join('\n')}`
  const dom = new JSDOM('<!doctype html><html><body><div id="root"></div></body></html>', { url: 'http://127.0.0.1/' })
  const previous = new Map(), calls = [], controllers = [], errors = []
  let view, loaded, checkReply, pendingCheck, installedSpec = '1.73.6', restoreRequired = false, holdInstalled = true
  const pendingInstalled = []
  const self = { name: 'dshmarket', owner: 'dsh-market', url: 'https://github.com/dsh-market/dsh-market', npm: 'dshmarket', category: 'tools', description: { zh: '隔离市场案例' } }
  const status = update => ({ version: '1.73.6', latest: update ? '1.73.7' : '1.73.6', updateAvailable: update, ...(update ? { eligibleVersion: '1.73.7' } : {}), ...(restoreRequired ? { restoreRequired: true, productBundled: true } : {}) })
  let updates = { dshmarket: status(false) }
  const response = (body, code = 200) => ({ ok: code >= 200 && code < 300, status: code, json: async () => structuredClone(body) })
  const globals = {
    window: dom.window, document: dom.window.document, navigator: dom.window.navigator,
    HTMLElement: dom.window.HTMLElement, Element: dom.window.Element, Node: dom.window.Node,
    MutationObserver: dom.window.MutationObserver, localStorage: dom.window.localStorage,
    sessionStorage: dom.window.sessionStorage, getComputedStyle: dom.window.getComputedStyle.bind(dom.window),
    IS_REACT_ACT_ENVIRONMENT: true,
    fetch: async (input, init = {}) => {
      const url = new URL(String(input), dom.window.location.href)
      assert.equal(url.origin, 'http://127.0.0.1', 'Fixture must not contact external HTTP')
      const call = { path: url.pathname + url.search, method: init.method || 'GET', init, body: init.body ? JSON.parse(init.body) : undefined }; calls.push(call)
      if (url.pathname === '/dsh-market/updates' && init.signal) {
        assert.equal(url.search, '?force=1'); assert.equal(init.cache, 'no-store')
        return await new Promise((resolveReply, reject) => {
          pendingCheck = { resolve: resolveReply, reject }
          init.signal.addEventListener('abort', () => reject(init.signal.reason), { once: true })
          if (checkReply) checkReply(resolveReply, reject)
        })
      }
      if (url.pathname === '/dsh-market/installed') {
        if (holdInstalled) await new Promise(resolveInstalled => pendingInstalled.push(resolveInstalled))
        return response({ installed: { dshmarket: installedSpec }, present: ['dshmarket'], live: [], disabled: [], bundles: ['dshmarket'], repoIdentities: { dshmarket: ['dsh-market/dsh-market'] } })
      }
      if (url.pathname === '/dsh-market/updates') return response({ updates })
      if (url.pathname === '/dsh-market/registry') return response({ registry: { updated: 'isolated-388', count: 1, categories: { tools: { zh: '工具', en: 'Tools' } }, plugins: [self] }, hostVersion: '0.2.2-alpha.2' })
      if (url.pathname === '/dsh-market/status') return response({ busy: false, active: false, boot: 'isolated-388', pnpm: true, version: '1.73.6', installed: { dshmarket: installedSpec }, runningAgents: [] })
      if (url.pathname === '/dsh-market/update') return response({ ok: true, skipped: 'current' })
      if (url.pathname === '/dsh-market/discovery-compatibility') return response({ hostVersion: '0.2.2-alpha.2', results: {} })
      assert.equal(call.method, 'GET', 'Unexpected mutation request: ' + call.path)
      return response({})
    },
  }
  const timeoutDescriptor = Object.getOwnPropertyDescriptor(AbortSignal, 'timeout')
  const oldConsoleError = console.error
  try {
    for (const [key, value] of Object.entries(globals)) { previous.set(key, Object.getOwnPropertyDescriptor(globalThis, key)); Object.defineProperty(globalThis, key, { value, configurable: true, writable: true }) }
    Object.defineProperty(AbortSignal, 'timeout', { configurable: true, value: ms => { assert.equal(ms, 30000); const controller = new AbortController(); controllers.push(controller); return controller.signal } })
    console.error = (...args) => errors.push(args.map(String).join(' '))
    await build({ stdin: { contents: `export {MarketSection,resetHostCompatibilityCache} from ${JSON.stringify(join(market, 'MarketSection.tsx'))};export {zh,en,ja,maintenanceLocales} from ${JSON.stringify(join(market, 'locales.ts'))}`, resolveDir: root, loader: 'ts' }, bundle: true, platform: 'node', format: 'cjs', jsx: 'automatic', outfile: join(scratch, 'market.cjs'), logLevel: 'silent', plugins: [{ name: 'isolated-dom-seats', setup(bundler) {
      bundler.onResolve({ filter: /^@deepseek-ai\/dsh-client-ui-primitives$/ }, () => ({ path: 'primitives', namespace: 'fixture' }))
      bundler.onLoad({ filter: /.*/, namespace: 'fixture' }, () => ({ contents: primitiveStub, loader: 'js' }))
      bundler.onResolve({ filter: /\.css$/ }, () => ({ path: 'css', namespace: 'fixture-css' }))
      bundler.onLoad({ filter: /.*/, namespace: 'fixture-css' }, () => ({ contents: 'export default new Proxy({}, {get:(_target,key)=>String(key)})', loader: 'js' }))
      bundler.onResolve({ filter: /^(?:react|react-dom)(?:\/.*)?$/ }, args => {
        const domPackage = args.path.startsWith('react-dom'), prefix = domPackage ? 'react-dom' : 'react', directory = dirname(domPackage ? reactDom : react)
        return { path: join(directory, args.path === prefix ? 'index.js' : args.path.slice(prefix.length + 1) + '.js'), external: true }
      })
    } }] }); stop()
    loaded = require(join(scratch, 'market.cjs'))
    const { createRoot } = require(dependency('react-dom', 'client.js')), { act } = React
    let localeSnapshot = { active: 'zh' }
    const localeListeners = new Set(), locale = { subscribe: fn => { localeListeners.add(fn); return () => localeListeners.delete(fn) }, getSnapshot: () => localeSnapshot }
    const dictionaries = { zh: loaded.zh, en: loaded.en, ja: loaded.ja, ...loaded.maintenanceLocales }
    const props = { t: key => dictionaries[localeSnapshot.active]?.[key] || loaded.en[key] || key, locale, theme: { setTheme() {} }, themeStore: { subscribe: () => () => {}, getSnapshot: () => null }, surface: 'plugins' }
    const tick = async () => { await act(async () => { await new Promise(resolveTick => setTimeout(resolveTick, 15)) }) }
    const button = label => [...dom.window.document.querySelectorAll('button')].find(node => node.textContent.trim() === label)
    const click = async node => { assert.ok(node, 'Expected button is rendered'); await act(async () => node.click()); await tick() }
    const selectLanguage = async definition => {
      await act(async () => { localeSnapshot = { active: definition.id }; dom.window.document.documentElement.lang = definition.documentLang; dom.window.document.documentElement.dir = definition.rtl ? 'rtl' : 'ltr'; localeListeners.forEach(fn => fn()) })
      await tick()
    }
    const maintenanceKeys = ['marketCheck', 'marketChecking', 'marketCheckAvailable', 'marketCheckCurrent', 'marketCheckFailed', 'marketUpdate', 'updating', 'restoreOnline', 'restoreProceed', 'cancel', 'restoreHint', 'restoreNameOnlyHint', 'restoreProductMarketHint']
    for (const { id } of AP_LANGUAGE_DEFINITIONS) {
      for (const key of maintenanceKeys) {
        assert.equal(typeof dictionaries[id]?.[key], 'string', id + ':' + key)
        assert.deepEqual(dictionaries[id][key].match(/\{\d+\}/g) || [], loaded.en[key].match(/\{\d+\}/g) || [], 'Placeholder contract ' + id + ':' + key)
      }
      for (const key of ['files.expand', 'files.collapse', 'lang.switchFailed']) assert.equal(typeof AP_I18N[id]?.[key], 'string', id + ':' + key)
    }
    const mount = async () => { loaded.resetHostCompatibilityCache(); view = createRoot(dom.window.document.querySelector('#root')); await act(async () => view.render(React.createElement(loaded.MarketSection, props))); await tick(); await tick() }
    await mount()
    assert.ok(button(loaded.zh.marketCheck), 'Check remains present with no available update'); assert.equal(button(loaded.zh.marketCheck).disabled, false); assert.equal(button(loaded.zh.marketUpdate), undefined)
    checkReply = undefined; await click(button(loaded.zh.marketCheck))
    assert.equal(button(loaded.zh.marketChecking).disabled, true)
    await act(async () => pendingCheck.resolve(response({ updates }))); await tick()
    assert.equal(button(loaded.zh.marketCheck).disabled, false); assert.match(dom.window.document.body.textContent, /没有确认到更高版本/)
    holdInstalled = false
    await act(async () => pendingInstalled.splice(0).forEach(resolveInstalled => resolveInstalled())); await tick()
    checkReply = resolveReply => resolveReply(response({}, 503)); await click(button(loaded.zh.marketCheck))
    assert.equal(button(loaded.zh.marketCheck).disabled, false); assert.ok(dom.window.document.body.textContent.includes(loaded.zh.marketCheckFailed))
    checkReply = resolveReply => resolveReply(response({ updates: { dshmarket: { updateAvailable: false } } })); await click(button(loaded.zh.marketCheck))
    assert.equal(button(loaded.zh.marketCheck).disabled, false); assert.ok(dom.window.document.body.textContent.includes(loaded.zh.marketCheckFailed), 'Missing latest is failure rather than latest-version claim')
    checkReply = undefined; await click(button(loaded.zh.marketCheck)); assert.equal(button(loaded.zh.marketChecking).disabled, true)
    await act(async () => controllers.at(-1).abort(new DOMException('Isolated timeout', 'TimeoutError'))); await tick()
    assert.equal(button(loaded.zh.marketCheck).disabled, false); assert.ok(dom.window.document.body.textContent.includes(loaded.zh.marketCheckFailed))
    assert.equal(calls.filter(row => row.path === '/dsh-market/update').length, 0, 'Checks never install')
    updates = { dshmarket: status(true) }; checkReply = resolveReply => resolveReply(response({ updates })); await click(button(loaded.zh.marketCheck))
    for (const language of AP_LANGUAGE_DEFINITIONS) {
      await selectLanguage(language)
      const dictionary = dictionaries[language.id]
      assert.ok(button(dictionary.marketCheck)); assert.ok(button(dictionary.marketUpdate))
      assert.ok(dom.window.document.querySelector('[role=status]').textContent.includes(dictionary.marketCheckAvailable.replace('{0}', '1.73.7')), 'Existing result follows locale changes: ' + language.id)
      checkReply = resolveReply => resolveReply(response({}, 503)); await click(button(dictionary.marketCheck))
      assert.equal(button(dictionary.marketCheck).disabled, false); assert.ok(dom.window.document.body.textContent.includes(dictionary.marketCheckFailed))
      checkReply = resolveReply => resolveReply(response({ updates })); await click(button(dictionary.marketCheck))
      assert.ok(button(dictionary.marketUpdate)); assert.ok(dom.window.document.body.textContent.includes(dictionary.marketCheckAvailable.replace('{0}', '1.73.7')))
    }
    await selectLanguage(AP_LANGUAGE_DEFINITIONS[0])
    assert.ok(button(loaded.zh.marketUpdate)); await click(button(loaded.zh.marketUpdate))
    assert.deepEqual(calls.filter(row => row.path === '/dsh-market/update').map(row => [row.method, row.body]), [['POST', { name: 'dshmarket', eligibleVersion: '1.73.7' }]])
    await act(async () => view.unmount()); view = undefined; dom.window.sessionStorage.clear()
    installedSpec = 'link:C:/isolated-neutral-market'; restoreRequired = true; updates = { dshmarket: status(true) }
    await mount(); const before = calls.filter(row => row.path === '/dsh-market/update').length
    await click(button(loaded.zh.restoreOnline))
    assert.ok(dom.window.document.querySelector('[role=dialog]')); assert.equal(calls.filter(row => row.path === '/dsh-market/update').length, before, 'Source replacement waits for explicit confirmation')
    await click(button(loaded.zh.cancel)); assert.equal(dom.window.document.querySelector('[role=dialog]'), null)
    assert.equal(calls.filter(row => row.path === '/dsh-market/update').length, before)
    await click(button(loaded.zh.restoreOnline)); await click(button(loaded.zh.restoreProceed))
    assert.deepEqual(calls.filter(row => row.path === '/dsh-market/update').at(-1).body, { name: 'dshmarket', restore: true })
    for (const language of AP_LANGUAGE_DEFINITIONS) {
      await selectLanguage(language)
      const dictionary = dictionaries[language.id]
      await click(button(dictionary.restoreOnline))
      const dialog = dom.window.document.querySelector('[role=dialog]')
      assert.ok(dialog.textContent.includes(dictionary.restoreProductMarketHint), 'Product source-confirmation explanation: ' + language.id)
      assert.ok(button(dictionary.restoreProceed)); await click(button(dictionary.cancel)); assert.equal(dom.window.document.querySelector('[role=dialog]'), null)
    }
    assert.equal(calls.filter(row => row.path === '/dsh-market/update').length, 2, 'Language changes and cancelled confirmations never install')
    assert.equal(errors.length, 0, errors.join('\n'))
    console.log(JSON.stringify({ marketDom: { languages: AP_LANGUAGE_DEFINITIONS.map(row => row.id), maintenancePlaceholderParity: true, liveResultLanguage: true, alwaysAvailable: true, initialInstalledAliasRace: true, forceGet: true, pendingDisabled: true, successFailureMalformedAndTimeoutRelease: true, unchangedExistingPost: true, sourceReplacementConfirmationAndCancel: true, pageErrors: errors.length, realHttpRequests: 0, realInstallations: 0, modelRequests: 0 } }))
  } finally {
    if (view) await React.act(async () => view.unmount())
    stop(); dom.window.close(); console.error = oldConsoleError
    if (timeoutDescriptor) Object.defineProperty(AbortSignal, 'timeout', timeoutDescriptor)
    for (const [key, descriptor] of previous) { if (descriptor) Object.defineProperty(globalThis, key, descriptor); else delete globalThis[key] }
    const safe = realpathSync(scratch), parent = realpathSync(tmpdir()) + sep
    assert.ok(safe.startsWith(parent) && basename(safe).startsWith('ap-market-ui-388-')); rmSync(safe, { recursive: true, force: true })
  }
})
