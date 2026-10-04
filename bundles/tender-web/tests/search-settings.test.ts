import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import { ANYSEARCH_KEY_CONSOLE, createSearchSettingsOperations } from '../src/client/search-settings.js'
import { searchSettingsLocales, searchSettingsText } from '../src/client/locales/search-settings.js'

test('search credentials use describe/set/unset only and preserve the configured plugin reference', async () => {
  const calls: unknown[] = []
  const remote = { credentials: {
    describe: async (refs: string[]) => { calls.push(['describe', refs]); return { ok: true, value: { CUSTOM_SEARCH_KEY: { configured: true, writable: true } } } },
    set: async (ref: string, value: string) => { calls.push(['set', ref, value]); return { ok: true } },
    unset: async (ref: string) => { calls.push(['unset', ref]); return { ok: true } },
  } }
  const ops = createSearchSettingsOperations(remote, async (...args: unknown[]) => { calls.push(args); return { active: true, apiKeyRef: 'CUSTOM_SEARCH_KEY' } })
  const view = await ops.view()
  assert.deepEqual(await ops.describe(view.apiKeyRef), { configured: true, writable: true })
  await ops.save(view.apiKeyRef, ' synthetic-key ')
  await ops.remove(view.apiKeyRef)
  await ops.probe()
  assert.deepEqual(calls, [['/api/agent-pi/search-settings'], ['describe', ['CUSTOM_SEARCH_KEY']], ['set', 'CUSTOM_SEARCH_KEY', 'synthetic-key'], ['unset', 'CUSTOM_SEARCH_KEY'], ['/api/agent-pi/search-settings', '', { method: 'POST' }]])
})

test('remote failure diagnostics are not displayed verbatim', async () => {
  const ops = createSearchSettingsOperations({ credentials: { set: async () => ({ ok: false, error: { message: 'password=secret' } }) } }, null)
  await assert.rejects(ops.save('REF', 'synthetic-key'), error => error.message === 'Credential operation failed')
})

test('all ten locales fully translate the settings and connection states', () => {
  assert.equal(ANYSEARCH_KEY_CONSOLE, 'https://anysearch.com/console/api-keys')
  const keys = Object.keys(searchSettingsLocales.en)
  assert.equal(Object.keys(searchSettingsLocales).length, 10)
  for (const [locale, values] of Object.entries(searchSettingsLocales)) {
    assert.deepEqual(Object.keys(values), keys)
    for (const value of Object.values(values)) {
      assert.ok(typeof value === 'string' && value.length > 0)
      if (locale !== 'zh' && locale !== 'ja') assert.doesNotMatch(value, /[\u4e00-\u9fff]/)
    }
  }
  assert.equal(searchSettingsText('fr-FR', 'save'), searchSettingsLocales.fr.save)
  assert.equal(searchSettingsText('unknown', 'save'), searchSettingsLocales.en.save)
})

test('key input is password-only, clears after commit, and never persists in browser storage', () => {
  const source = readFileSync(new URL('../src/client/search-settings.js', import.meta.url), 'utf8')
  assert.match(source, /type: 'password'/)
  assert.match(source, /setKey\(''\)/)
  assert.doesNotMatch(source, /localStorage|sessionStorage|credentials\.resolve|console\.log|JSON\.stringify\(key/)
})
