import assert from 'node:assert/strict'
import { test } from 'node:test'
import { createRequire } from 'node:module'
import { mkdtempSync, readdirSync, realpathSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { basename, dirname, join, resolve, sep } from 'node:path'

const root = resolve(import.meta.dirname, '..'), market = join(root, 'vendor/dshmarket/src/client')
const require = createRequire(import.meta.url), store = join(root, 'vendor/deepseek-harness/node_modules/.pnpm')
function dependency(name, entry = '') {
  const directory = readdirSync(store).find(value => value.startsWith(name + '@'))
  assert.ok(directory, 'Existing dependency missing: ' + name)
  return join(store, directory, 'node_modules', name, entry)
}

test('restored failed operations retain their evidence and distinguish history from current inventory', async () => {
  const { build, stop } = require(dependency('esbuild', 'lib/main.js'))
  const React = require(dependency('react')), { renderToStaticMarkup } = require(dependency('react-dom', 'server.js'))
  const { JSDOM } = require(dependency('jsdom')), scratch = mkdtempSync(join(tmpdir(), 'ap-market-history-'))
  const originalFetch = globalThis.fetch
  let calls = 0
  globalThis.fetch = () => { calls++; throw new Error('Isolated UI must not fetch') }
  try {
    await build({ stdin: { contents: `export {OperationsPanel} from ${JSON.stringify(join(market, 'OperationsPanel.tsx'))};export * from ${JSON.stringify(join(market, 'operations.ts'))};export {zh,en,ja,maintenanceLocales} from ${JSON.stringify(join(market, 'locales.ts'))}`, resolveDir: root, loader: 'ts' }, bundle: true, platform: 'node', format: 'cjs', jsx: 'automatic', outfile: join(scratch, 'history.cjs'), logLevel: 'silent', plugins: [{ name: 'isolated-presentation', setup(builder) {
      builder.onResolve({ filter: /^@deepseek-ai\/dsh-client-ui-primitives$/ }, () => ({ path: 'primitive', namespace: 'fixture' }))
      builder.onResolve({ filter: /^\.\/icons\.ts$/ }, () => ({ path: 'icons', namespace: 'fixture' }))
      builder.onLoad({ filter: /.*/, namespace: 'fixture' }, args => ({ loader: 'js', contents: args.path === 'primitive'
        ? `import React from 'react';export const Button=({children,onClick,disabled,...props})=>React.createElement('button',{onClick,disabled,'aria-label':props['aria-label']},children)`
        : ['IconCheckOutline16','IconLoadingOutline16','IconWarningOutline16','IconChevronDownOutline14','IconChevronUpOutline14'].map(name => `export const ${name}=()=>null`).join(';') }))
      builder.onResolve({ filter: /\.css$/ }, () => ({ path: 'css', namespace: 'fixture-css' }))
      builder.onLoad({ filter: /.*/, namespace: 'fixture-css' }, () => ({ contents: 'export default new Proxy({}, {get:(_object,key)=>String(key)})', loader: 'js' }))
      builder.onResolve({ filter: /^react(?:\/.*)?$/ }, args => ({ path: join(dirname(dependency('react', 'index.js')), args.path === 'react' ? 'index.js' : args.path.slice(6) + '.js'), external: true }))
    } }] }); stop()
    const source = require(join(scratch, 'history.cjs'))
    const old = { id: 'op-7', kind: 'update', name: '@xmanrui/dsh-im', url: 'https://github.com/isolated/im', state: 'failed', reason: '更新失败，且更新前的构建未能验证恢复（ERR_PNPM_UNEXPECTED_STORE）', detail: '原始日志仍保留' }
    const raw = JSON.stringify([old]), records = source.restoreSettled(raw)
    const dictionaries = { zh: source.zh, en: source.en, ja: source.ja, ...source.maintenanceLocales }
    const render = (locale, rows, currentInstalled) => {
      const dictionary = dictionaries[locale], t = key => dictionary[key] ?? source.en[key] ?? key
      return new JSDOM(renderToStaticMarkup(React.createElement(source.OperationsPanel, {
        t, lang: locale === 'zh' ? 'zh' : 'en', describe: name => ({ title: name }), records: rows,
        currentInstalled, open: true, replacing: false, envReady: true, onOpenChange() {}, onClearSettled() {}, onCancel() {}, onDismiss() {}, onRefresh() {}, onResolveConflict() {},
      })))
    }
    const dom = render('zh', records, { '@xmanrui/dsh-im': '5.9.1' })
    try {
      assert.ok(dom.window.document.body.textContent.includes(old.reason), 'The exact historical failure is retained')
      assert.ok(dom.window.document.body.textContent.includes('历史操作结果'), 'Storage-restored failure must be labelled historical')
      assert.ok(dom.window.document.body.textContent.includes(source.zh.opCurrentInstalled.replace('{0}', '5.9.1')))
    } finally { dom.window.close() }
    assert.equal(records[0].restoredFromStorage, true)
    assert.equal(records[0].state, 'failed'); assert.equal(records[0].reason, old.reason); assert.equal(records[0].detail, old.detail)
    assert.equal(raw, JSON.stringify([old]), 'Original evidence remains unchanged')
    assert.deepEqual(source.serializeSettled(records), [old], 'The transient history marker is not written into stored evidence')
    assert.equal(source.recordForUrl(records, old.url), null, 'Historical failure does not paint a current card as failed')
    const live = { ...old, id: 'op-8', restoredFromStorage: undefined }
    assert.equal(source.recordForUrl([...records, live], old.url), live, 'A fresh failure remains the current card state')
    for (const [locale, dictionary] of Object.entries(dictionaries)) {
      for (const key of ['opHistorical', 'opCurrentInstalled']) {
        assert.equal(typeof dictionary[key], 'string', locale + ':' + key)
        assert.deepEqual(dictionary[key].match(/\{\d+\}/g) ?? [], source.en[key].match(/\{\d+\}/g) ?? [])
      }
      const unknown = render(locale, records, undefined), fresh = render(locale, [live], { '@xmanrui/dsh-im': '5.9.1' })
      try {
        assert.ok(unknown.window.document.body.textContent.includes(dictionary.opHistorical))
        assert.ok(!unknown.window.document.body.textContent.includes(dictionary.opCurrentInstalled.replace('{0}', '5.9.1')), 'No current version is guessed without fresh inventory')
        assert.ok(!fresh.window.document.body.textContent.includes(dictionary.opHistorical), 'Fresh failures are not relabelled history')
        assert.ok(!fresh.window.document.body.textContent.includes(dictionary.opCurrentInstalled.replace('{0}', '5.9.1')), 'A current failure is not disguised by installed inventory')
      } finally { unknown.window.close(); fresh.window.close() }
    }
    assert.equal(calls, 0)
  } finally {
    globalThis.fetch = originalFetch; stop()
    const actual = realpathSync(scratch)
    assert.ok(actual.startsWith(realpathSync(tmpdir()) + sep) && basename(actual).startsWith('ap-market-history-'))
    rmSync(actual, { recursive: true, force: true })
  }
})
