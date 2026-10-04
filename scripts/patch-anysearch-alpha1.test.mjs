import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { mkdtempSync, cpSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { pathToFileURL } from 'node:url'
import { test } from 'node:test'
import { patchAnySearchDirectory, patchAnySearchManifest, verifyAnySearchDirectory } from './patch-anysearch-alpha1.mjs'
import { AnySearchClient, AnySearchClientError } from '../vendor/anysearch-dsh/lib/client.js'
import { parseAdvancedSearchArgs } from '../vendor/anysearch-dsh/lib/tools/search.js'
import { executeBatchSearch, parseBatchSearchItems } from '../vendor/anysearch-dsh/lib/tools/batch.js'
import { AnySearchProvider } from '../vendor/anysearch-dsh/lib/provider.js'
import { AnySearchFetchProvider } from '../vendor/anysearch-dsh/lib/fetch-provider.js'
import { apply } from '../vendor/anysearch-dsh/lib/index.js'

const vendor = new URL('../vendor/anysearch-dsh/', import.meta.url)
const requestId = '5a3f8c27-1e64-4b90-a752-6d9e2f41c083'
const searchResponse = { code: 0, message: 'success', request_id: requestId, data: { results: [{ title: 'Official source', url: 'https://example.com/tender', snippet: 'Source', content: 'Original text' }], metadata: { total_results: 1, search_time_ms: 2 } } }
const client = resolveApiKey => new AnySearchClient({ baseURL: 'https://api.anysearch.com', resolveApiKey: resolveApiKey || (async () => undefined) })

test('the exact reviewed peers retain upstream ranges and reject unknown versions/ranges', () => {
  const source = readFileSync(new URL('package.json', vendor), 'utf8')
  const result = patchAnySearchManifest(source)
  assert.equal(patchAnySearchManifest(result), result)
  const manifest = JSON.parse(result)
  assert.match(manifest.peerDependencies['@deepseek-ai/dsh-tools'], /0\.1\.6-alpha\.2 \|\| 0\.2\.1-alpha\.1$/)
  assert.match(manifest.peerDependencies['@deepseek-ai/cordis'], /4\.0\.5-alpha\.1$/)
  assert.match(manifest.dependencies['@deepseek-ai/schemastery'], /3\.18\.5-alpha\.1$/)
  assert.throws(() => patchAnySearchManifest(JSON.stringify({ ...manifest, version: '0.1.7' })), /Unreviewed/)
  manifest.peerDependencies['@deepseek-ai/dsh-tools'] = '*'
  assert.throws(() => patchAnySearchManifest(JSON.stringify(manifest)), /Unexpected/)
})

test('source hashes make adaptation idempotent and reject partial or edited code', () => {
  const root = mkdtempSync(join(tmpdir(), 'agent-pi-anysearch-'))
  cpSync(vendor, root, { recursive: true, filter: path => !path.includes('node_modules') })
  const first = patchAnySearchDirectory(root)
  assert.deepEqual(patchAnySearchDirectory(root), first)
  assert.equal(verifyAnySearchDirectory(root).version, '0.1.6')
  writeFileSync(join(root, 'lib/client.js'), readFileSync(join(root, 'lib/client.js'), 'utf8') + '\n// unreviewed change\n')
  assert.throws(() => patchAnySearchDirectory(root), /Unreviewed AnySearch source/)
  assert.throws(() => verifyAnySearchDirectory(root), /hash mismatch/)
})

test('search parsers enforce official count, region, format and scalar parameters before requests', () => {
  assert.equal(parseAdvancedSearchArgs({ query: 'source', maxResults: 10 }).request.format, 'markdown')
  assert.equal(parseAdvancedSearchArgs({ query: 'source', format: 'json' }).request.format, 'json')
  for (const maxResults of [0, 11, 1.5]) assert.throws(() => parseAdvancedSearchArgs({ query: 'source', maxResults }), /1 to 10/)
  assert.throws(() => parseAdvancedSearchArgs({ query: 'source', zone: 'us' }), /zone/)
  assert.throws(() => parseAdvancedSearchArgs({ query: 'source', format: 'html' }), /format/)
  assert.throws(() => parseBatchSearchItems([{ query: 'source' }, { query: 'source', maxResults: 11 }]), /1 to 10/)
  assert.throws(() => parseAdvancedSearchArgs({ query: 'source', params: { nested: {} } }), /finite number/)
})

test('client request validation, native cap and write-only key rotation match the official HTTP contract', async t => {
  let key = 'synthetic-first-key'
  const sent = []
  t.mock.method(globalThis, 'fetch', async (url, init) => {
    sent.push({ url, auth: init.headers.authorization, body: JSON.parse(init.body) })
    return Response.json(searchResponse)
  })
  const runtime = client(async () => key)
  await runtime.search({ query: 'facts', maxResults: 10 })
  key = 'synthetic-second-key'
  const native = await new AnySearchProvider(runtime).search({ query: 'facts', maxResults: 20 })
  key = undefined
  await runtime.search({ query: 'facts', format: 'json' })
  assert.deepEqual(sent.map(value => value.auth), ['Bearer synthetic-first-key', 'Bearer synthetic-second-key', undefined])
  assert.deepEqual(sent.map(value => value.body.format), ['markdown', 'markdown', 'json'])
  assert.equal(sent[1].body.max_results, 10)
  assert.equal(native.sources[0].url, 'https://example.com/tender')
  await assert.rejects(runtime.search({ query: 'facts', maxResults: 11 }), /1 to 10/)
  await assert.rejects(runtime.search({ query: 'facts', zone: 'us' }), /zone/)
  await assert.rejects(runtime.search({ query: 'facts', format: 'html' }), /format/)
  assert.equal(sent.length, 3, 'invalid input must not consume network quota')
})

test('extract sends exactly url and rejects URL credentials without a request', async t => {
  const sent = []
  t.mock.method(globalThis, 'fetch', async (_url, init) => {
    sent.push(JSON.parse(init.body))
    return Response.json({ code: 0, message: 'success', data: { url: 'https://example.com/tender', title: 'Tender', content: 'Original source' } })
  })
  const runtime = client()
  const result = await new AnySearchFetchProvider(runtime).fetch({ url: 'https://example.com/tender' })
  assert.deepEqual(sent, [{ url: 'https://example.com/tender' }])
  assert.equal(result.body.content, 'Original source')
  await assert.rejects(runtime.extract({ url: 'https://name:secret@example.com/' }), /without credentials/)
  assert.equal(sent.length, 1)
})

test('quota, authentication and malformed errors never carry upstream credentials into model/log diagnostics', async t => {
  const secret = 'username=auto-user\npassword=sensitive-password\napi_key=as_sk_sensitive-key'
  for (const status of [401, 402, 403, 429, 502]) {
    t.mock.method(globalThis, 'fetch', async () => Response.json({ code: -1, message: secret, request_id: requestId, error_code: secret }, { status }))
    const failure = await client().search({ query: 'facts' }).catch(error => error)
    assert.ok(failure instanceof AnySearchClientError)
    assert.equal(failure.httpStatus, status)
    assert.equal(failure.requestId, requestId)
    assert.doesNotMatch(JSON.stringify(failure) + failure.stack + failure.message, /sensitive|auto-user|api_key|password/)
    assert.equal(failure.cause, undefined)
  }
  t.mock.method(globalThis, 'fetch', async () => new Response(secret, { status: 200 }))
  const invalid = await client().search({ query: 'facts' }).catch(error => error)
  assert.doesNotMatch(JSON.stringify(invalid) + invalid.stack + invalid.message, /sensitive|auto-user|api_key|password/)
  t.mock.method(globalThis, 'fetch', async () => Response.json({ code: -1, message: secret, request_id: secret }, { status: 402 }))
  const requestInjection = await client().search({ query: 'facts' }).catch(error => error)
  assert.equal(requestInjection.requestId, undefined)
  assert.doesNotMatch(requestInjection.message, /sensitive|auto-user|password/)
})

test('batch preserves ordered independent success and safe quota failures', async t => {
  t.mock.method(globalThis, 'fetch', async (_url, init) => JSON.parse(init.body).query === 'blocked'
    ? Response.json({ code: -1, message: 'password=secret', request_id: requestId }, { status: 402 }) : Response.json(searchResponse))
  const parsed = parseBatchSearchItems([{ query: 'ok', format: 'markdown' }, { query: 'blocked' }])
  const result = await executeBatchSearch(client(), parsed, undefined, 12000)
  assert.deepEqual(result.summary, { total: 2, succeeded: 1, failed: 1 })
  assert.equal(result.items[0].ok, true)
  assert.equal(result.items[1].error.httpStatus, 402)
  assert.doesNotMatch(JSON.stringify(result), /password|secret/)
})

test('actual pinned DSH registry accepts all input schemas and exposes shared plugin client', async () => {
  const require = createRequire(new URL('../vendor/anysearch-dsh/package.json', import.meta.url))
  const { Context } = await import(pathToFileURL(require.resolve('@deepseek-ai/cordis')).href)
  const { default: SystemPrompt } = await import(pathToFileURL(require.resolve('@deepseek-ai/dsh-system-prompt')).href)
  const { default: ToolRuntime } = await import(pathToFileURL(require.resolve('@deepseek-ai/dsh-tools')).href)
  const ctx = new Context()
  try {
    await ctx.plugin(SystemPrompt)
    await ctx.plugin(ToolRuntime)
    ctx.provide('credentials', { resolve: async () => undefined })
    const search = [], fetch = []
    ctx.provide('web', { registerSearchProvider: value => search.push(value), registerFetchProvider: value => fetch.push(value) })
    apply(ctx, { apiKeyEnv: 'CUSTOM_SEARCH_KEY' })
    const schemas = ctx.tools.schemas()
    for (const schema of schemas) assert.equal(schema.parameters.type, 'object', schema.name)
    assert.deepEqual(schemas.map(value => value.name).sort(), ['anysearch_batch_search', 'anysearch_capabilities', 'anysearch_search', 'web_fetch'])
    assert.equal(ctx.get('agentPiAnySearch').apiKeyRef, 'CUSTOM_SEARCH_KEY')
    assert.equal(search[0].id, 'anysearch')
    assert.equal(fetch[0].id, 'anysearch')
  } finally { await ctx.fiber.dispose() }
})
