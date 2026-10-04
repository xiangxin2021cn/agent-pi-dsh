import assert from 'node:assert/strict'
import { test } from 'node:test'
import { anySearchView, probeAnySearch, registerAnySearchSettings } from '../src/anysearch-settings.ts'
const requestId = '5a3f8c27-1e64-4b90-a752-6d9e2f41c083'

test('search settings show only the active reference and safe connection facts', async () => {
  const service = { apiKeyRef: 'CUSTOM_KEY', client: { listDomains: async () => ({ domains: [{ secret: 'not-for-ui' }], requestId }) } }
  assert.deepEqual(anySearchView(), { active: false })
  assert.deepEqual(anySearchView(service), { active: true, apiKeyRef: 'CUSTOM_KEY' })
  assert.deepEqual(await probeAnySearch(service), { ok: true, state: 'connected', domainCount: 1, requestId })
})

test('probe classifies status without exposing upstream passwords, keys or raw failures', async () => {
  for (const [httpStatus, state] of [[401, 'invalid-key'], [402, 'quota-exhausted'], [403, 'access-denied'], [429, 'rate-limited'], [502, 'unavailable']] as const) {
    const result = await probeAnySearch({ apiKeyRef: 'ANYSEARCH_API_KEY', client: { listDomains: async () => { throw Object.assign(new Error('password=secret; api_key=sensitive'), { httpStatus, requestId }) } } })
    assert.deepEqual(result, { ok: false, state, httpStatus, requestId })
    assert.doesNotMatch(JSON.stringify(result), /password|secret|sensitive/)
  }
})

test('route reads the current service, rejects foreign origins and never accepts key writes', async () => {
  let route: any
  let calls = 0
  let service: any
  registerAnySearchSettings({ inject: (_deps: string[], install: any) => install({ webServer: { register: (value: any) => { route = value } } }), get: () => service })
  const run = async (method: string, headers = {}) => {
    let status = 0, body = ''
    await route.handler({ method, headers, on() {}, off() {} }, { writeHead: (value: number) => { status = value }, end: (value: string) => { body = value } })
    return { status, value: JSON.parse(body) }
  }
  assert.deepEqual(await run('GET'), { status: 200, value: { active: false } })
  service = { apiKeyRef: 'CUSTOM_KEY', client: { listDomains: async () => { calls++; return { domains: [] } } } }
  assert.equal((await run('GET')).value.apiKeyRef, 'CUSTOM_KEY')
  assert.equal((await run('POST', { origin: 'https://outside.test', host: '127.0.0.1:3000' })).status, 403)
  assert.equal(calls, 0)
  assert.equal((await run('POST', { origin: 'http://127.0.0.1:3000', host: '127.0.0.1:3000' })).value.state, 'connected')
  assert.equal(calls, 1)
  assert.equal((await run('PUT')).status, 405)
})

test('search policy requires original sources, jurisdiction/date verification and evidence gaps', () => {
  const sections: any[] = []
  registerAnySearchSettings({ systemPrompt: { section: (value: any) => sections.push(value) }, inject() {} })
  assert.equal(sections[0].name, 'agent-pi:search-verification')
  assert.match(sections[0].text, /original page/)
  assert.match(sections[0].text, /jurisdiction/)
  assert.match(sections[0].text, /effective date/)
  assert.match(sections[0].text, /existing task evidence record/)
  assert.match(sections[0].text, /untrusted evidence/)
})
