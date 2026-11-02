import assert from 'node:assert/strict'
import { createServer } from 'node:http'
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { test } from 'node:test'
import { mountMarketRoutes } from '../vendor/dshmarket/lib/routes.js'
import { forgetCatalog } from '../vendor/dshmarket/lib/registry.js'
import { invalidateUpdates, setUpdateRegistry } from '../vendor/dshmarket/lib/updates.js'

async function fixture(t, { catalog = 'ready', npm = 'ready', marketSpec = '1.73.6' } = {}) {
  const root = mkdtempSync(join(tmpdir(), 'ap-market-network-'))
  const profile = join(root, 'home/profiles/tender'), calls = []
  const write = (file, value) => { mkdirSync(dirname(file), { recursive: true }); writeFileSync(file, typeof value === 'string' ? value : JSON.stringify(value)) }
  write(join(profile, 'package.json'), { name: 'neutral-network-profile', private: true, dependencies: { dshmarket: marketSpec, '@xmanrui/dsh-im': '4.35.1' }, dsh: { profile: { bundles: ['dshmarket', '@xmanrui/dsh-im'] } } })
  for (const [name, version] of [['dshmarket', '1.73.6'], ['@xmanrui/dsh-im', '4.35.1']]) write(join(profile, 'node_modules', name, 'package.json'), { name, version, dsh: { bundle: { patch: './cordis.patch.yml' } } })
  write(join(profile, 'pnpm-workspace.yaml'), 'packages: []\n')
  const catalogBody = { updated: 'neutral-fixture', count: 1, categories: { tools: { en: 'Tools' } }, plugins: [{ name: 'dshmarket', npm: 'dshmarket', owner: 'dsh-market', url: 'https://github.com/dsh-market/dsh-market', category: 'tools', description: { en: 'Neutral fixture' } }] }
  const server = createServer((req, res) => {
    calls.push(req.url)
    if (req.url === '/catalog') {
      if (catalog === 'stalled') return
      res.writeHead(200, { 'content-type': 'application/json' }); res.end(JSON.stringify(catalogBody)); return
    }
    if (npm === 'failed') { res.writeHead(503); res.end('{}'); return }
    const name = decodeURIComponent(req.url.slice(1).replace(/\/latest$/, ''))
    const version = name === 'dshmarket' ? '1.73.9' : '5.9.1'
    res.writeHead(200, { 'content-type': 'application/json' }); res.end(JSON.stringify({ name, version, 'dist-tags': { latest: version } }))
  })
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve))
  const origin = 'http://127.0.0.1:' + server.address().port
  const names = ['DSH_HOME', 'DSHM_REGISTRY_URL', 'DSHM_NPM_MIRROR'], old = Object.fromEntries(names.map(name => [name, process.env[name]]))
  Object.assign(process.env, { DSH_HOME: join(root, 'home'), DSHM_REGISTRY_URL: origin + '/catalog', DSHM_NPM_MIRROR: origin })
  const routes = new Map()
  forgetCatalog(); invalidateUpdates(); setUpdateRegistry(origin)
  const dispose = mountMarketRoutes({ webServer: { register(route) { routes.set(route.path, route.handler); return () => routes.delete(route.path) } }, loader: { entries: () => [] }, plugin: () => ({ await: async () => undefined, dispose: async () => undefined }) }, { profile: 'tender', profileDirectory: profile, region: 'global' }, {
    runPlugin: async () => { throw new Error('This read-only fixture must never run a command') }, probePnpm: async () => true, provisionPnpm: async () => ({ ok: true }), cancelActive: () => false,
  })
  t.after(async () => {
    dispose(); server.closeAllConnections(); await new Promise(resolve => server.close(resolve))
    for (const name of names) { if (old[name] === undefined) delete process.env[name]; else process.env[name] = old[name] }
    rmSync(root, { recursive: true, force: true })
  })
  const request = async query => {
    let status, body
    await routes.get('/dsh-market/updates')({ method: 'GET', url: '/dsh-market/updates' + query, headers: { host: '127.0.0.1:3000' }, socket: { remoteAddress: '127.0.0.1' } }, { writeHead(value) { status = value }, end(value) { body = JSON.parse(value) } })
    return { status, body }
  }
  return { calls, request, profile }
}

test('explicit market check bypasses a stalled catalog and unrelated plugins', { timeout: 5000 }, async t => {
  const f = await fixture(t, { catalog: 'stalled' }), started = Date.now()
  const result = await f.request('?force=1&scope=market')
  assert.equal(result.status, 200)
  assert.equal(result.body.updates.dshmarket.latest, '1.73.9')
  assert.deepEqual(Object.keys(result.body.updates), ['dshmarket'])
  assert.ok(Date.now() - started < 2500, 'Self-check must finish within its 30s client budget')
  assert.deepEqual(f.calls, ['/dshmarket/latest'])
})

test('a scoped cache never hides plugins from the full check, which reads the catalog once', { timeout: 5000 }, async t => {
  const f = await fixture(t)
  await f.request('?scope=market')
  const result = await f.request('')
  assert.equal(result.status, 200)
  assert.equal(result.body.updates['@xmanrui/dsh-im'].latest, '5.9.1')
  assert.equal(f.calls.filter(path => path === '/catalog').length, 1)
  assert.ok(f.calls.includes('/%40xmanrui%2Fdsh-im/latest'))
})

test('an unavailable npm source remains unknown rather than reporting the installed version as latest', { timeout: 5000 }, async t => {
  const f = await fixture(t, { catalog: 'stalled', npm: 'failed' })
  const result = await f.request('?force=1&scope=market')
  assert.equal(result.status, 200)
  assert.equal(result.body.updates.dshmarket.latest, null)
  assert.equal(result.body.updates.dshmarket.updateAvailable, false)
  assert.ok(f.calls.includes('/dshmarket/latest'))
  assert.equal(f.calls.includes('/catalog'), false)
})

test('a private same-name link gains no registry authority from the self-check scope', { timeout: 5000 }, async t => {
  const f = await fixture(t, { catalog: 'stalled', marketSpec: 'link:./private-dshmarket' })
  const before = readFileSync(join(f.profile, 'package.json'))
  const result = await f.request('?force=1&scope=market')
  assert.equal(result.status, 200)
  assert.equal(result.body.updates.dshmarket.kind, 'linked')
  assert.equal(result.body.updates.dshmarket.latest, null)
  assert.equal(result.body.updates.dshmarket.restoreRequired, undefined)
  assert.deepEqual(f.calls, [])
  assert.deepEqual(readFileSync(join(f.profile, 'package.json')), before)
})
