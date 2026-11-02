import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { createServer } from 'node:http'
import { createRequire } from 'node:module'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { test } from 'node:test'
import { agentPiBundledRegistrySource, agentPiBundledSourceFingerprint } from '../vendor/dshmarket/compatibility.js'
import { mountMarketRoutes } from '../vendor/dshmarket/lib/routes.js'
import { forgetCatalog } from '../vendor/dshmarket/lib/registry.js'
import { setUpdateRegistry, invalidateUpdates } from '../vendor/dshmarket/lib/updates.js'
import { requireManagedMigrationRange } from './migrate-profile-pnpm.mjs'

const root = fileURLToPath(new URL('../', import.meta.url))
const dsh = join(root, 'vendor/deepseek-harness')
const pnpm = process.env.AGENT_PI_TEST_NEW_PNPM
const enabled = pnpm && existsSync(pnpm)
const tar = createRequire(join(dirname(process.execPath), 'node_modules/npm/package.json'))('tar')
const write = (file, content) => { mkdirSync(dirname(file), { recursive: true }); writeFileSync(file, typeof content === 'string' ? content : JSON.stringify(content)) }

async function fixture(t, broken = false) {
  const dir = mkdtempSync(join(tmpdir(), 'market-link-'))
  t.after(() => rmSync(dir, { recursive: true, force: true }))
  const product = join(dir, 'product'), profile = join(dir, 'home/profiles/tender')
  const bundled = join(product, 'vendor/dshmarket'), archiveSource = join(dir, 'archive/package')
  const info = version => ({ name: 'dshmarket', version, type: 'module', main: 'lib/index.js', dsh: { bundle: { patch: './cordis.patch.yml' } } })
  write(join(product, 'package.json'), { agentPiProduct: { edition: 'mainline' }, version: '3.8.8' })
  write(join(bundled, 'package.json'), info('1.0.0'))
  write(join(bundled, 'lib/index.js'), 'export const marker = "original"\n')
  write(join(bundled, 'cordis.patch.yml'), '- insert: []\n')
  write(join(archiveSource, 'package.json'), info('2.0.0'))
  if (!broken) write(join(archiveSource, 'lib/index.js'), 'export const marker = "updated"\n')
  write(join(archiveSource, 'cordis.patch.yml'), '- insert: []\n')
  const archive = join(dir, 'new.tgz')
  await tar.c({ cwd: dirname(archiveSource), gzip: true, file: archive }, ['package'])
  const bytes = readFileSync(archive), integrity = 'sha512-' + createHash('sha512').update(bytes).digest('base64')
  const calls = []
  let origin
  const server = createServer((req, res) => {
    calls.push(req.url)
    const meta = { ...info('2.0.0'), dist: { tarball: origin + '/dshmarket/-/dshmarket-2.0.0.tgz', integrity } }
    let body
    if (req.url === '/dshmarket/-/dshmarket-2.0.0.tgz') { res.writeHead(200, { 'content-type': 'application/octet-stream' }); res.end(bytes); return }
    if (req.url === '/catalog') body = { updated: 'fixture', count: 1, categories: { tools: { en: 'Tools' } }, plugins: [{ name: 'dshmarket', npm: 'dshmarket', owner: 'dsh-market', url: 'https://github.com/dsh-market/dsh-market', category: 'tools', description: { en: 'Isolated fixture' } }] }
    else if (req.url === '/dshmarket/latest') body = meta
    else if (req.url === '/dshmarket') body = { name: 'dshmarket', 'dist-tags': { latest: '2.0.0' }, versions: { '2.0.0': meta }, time: { '2.0.0': '2020-01-01T00:00:00.000Z' } }
    else { res.writeHead(404); res.end('{}'); return }
    res.writeHead(200, { 'content-type': 'application/json' }); res.end(JSON.stringify(body))
  })
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve))
  origin = 'http://127.0.0.1:' + server.address().port
  t.after(() => new Promise(resolve => server.close(resolve)))
  const names = ['DSH_HOME', 'DSH_CHECKOUT', 'DSH_BUNDLED_SKILL_DIR', 'DSHM_REGISTRY_URL', 'DSHM_NPM_MIRROR']
  const oldEnv = Object.fromEntries(names.map(name => [name, process.env[name]]))
  Object.assign(process.env, { DSH_HOME: join(dir, 'home'), DSH_CHECKOUT: dsh, DSH_BUNDLED_SKILL_DIR: join(product, 'skills'), DSHM_REGISTRY_URL: origin + '/catalog', DSHM_NPM_MIRROR: origin })
  t.after(() => { for (const name of names) { if (oldEnv[name] === undefined) delete process.env[name]; else process.env[name] = oldEnv[name] } })
  write(join(profile, 'package.json'), { name: 'isolated-profile', private: true, dependencies: { dshmarket: 'link:' + bundled.replaceAll('\\', '/') }, dsh: { profile: { bundles: ['dshmarket'] } } })
  write(join(profile, 'pnpm-workspace.yaml'), `packages: []\nnodeLinker: hoisted\nautoInstallPeers: false\nstoreDir: ${join(dir, 'store').replaceAll('\\', '/')}\nminimumReleaseAge: 1440\n`)
  const require = createRequire(join(dsh, 'apps/cli/package.json'))
  const { Context } = await import(pathToFileURL(require.resolve('@deepseek-ai/cordis')).href)
  const { default: Subprocess } = await import(pathToFileURL(join(dsh, 'packages/subprocess/subprocess-local/lib/index.js')).href)
  const ctx = new Context(); await ctx.plugin(Subprocess); requireManagedMigrationRange(ctx.subprocess)
  t.after(() => ctx.fiber.dispose())
  const commands = []
  const runPlugin = async (_profile, args) => {
    commands.push(args)
    const child = ctx.subprocess.spawn({ argv: [process.execPath, pnpm, '--ignore-scripts', '--ignore-pnpmfile', '--registry=' + origin, ...args], cwd: profile,
      env: { CI: 'true', COREPACK_ENABLE_AUTO_PIN: '0', npm_config_ignore_pnpmfile: 'true', npm_config_ignore_scripts: 'true', PNPM_CONFIG_IGNORE_PNPMFILE: 'true' },
      stdio: { stdin: 'ignore', stdout: 'pipe', stderr: 'pipe' }, graceMs: 2000 })
    let stdout = '', stderr = '', timedOut = false
    child.stdout.on('data', chunk => { stdout = (stdout + chunk.toString()).slice(-65536) })
    child.stderr.on('data', chunk => { stderr = (stderr + chunk.toString()).slice(-65536) })
    const timer = setTimeout(() => { timedOut = true; child.terminate() }, 30000)
    try { const result = await child.done; await child.waitForExit(); return { ...result, timedOut, cancelled: false, stdout, stderr } } finally { clearTimeout(timer) }
  }
  const initial = await runPlugin('tender', ['install'])
  assert.equal(initial.exitCode, 0, initial.stdout + initial.stderr)
  commands.length = 0
  const routes = new Map()
  forgetCatalog(); invalidateUpdates(); setUpdateRegistry(origin)
  const stop = mountMarketRoutes({ webServer: { register(route) { routes.set(route.path, route.handler); return () => routes.delete(route.path) } }, loader: { entries: () => [] },
    plugin: () => ({ await: async () => undefined, dispose: async () => undefined }) }, { profile: 'tender', profileDirectory: profile }, {
    runPlugin, probePnpm: async () => true, provisionPnpm: async () => ({ ok: true }), cancelActive: () => false,
  })
  t.after(stop)
  const request = async (method, path, payload) => {
    let status, body
    const req = { method, url: path, headers: { host: '127.0.0.1:3080', origin: 'http://127.0.0.1:3080' }, socket: { remoteAddress: '127.0.0.1' }, async *[Symbol.asyncIterator]() { yield Buffer.from(JSON.stringify(payload)) } }
    await routes.get(path.split('?')[0])(req, { writeHead(value) { status = value }, end(value) { body = value === undefined ? null : JSON.parse(value) } })
    return { status, body }
  }
  return { dir, product, profile, bundled, calls, commands, request, spec: 'link:' + bundled.replaceAll('\\', '/') }
}

test('only the three exact product trees qualify; an identical private name never does', { skip: !enabled }, async t => {
  const f = await fixture(t)
  assert.equal(agentPiBundledRegistrySource(f.profile, 'dshmarket', f.spec), 'dshmarket')
  const privateCopy = join(f.dir, 'private/dshmarket')
  write(join(privateCopy, 'package.json'), { name: 'dshmarket', version: '1.0.0' })
  assert.equal(agentPiBundledRegistrySource(f.profile, 'dshmarket', 'link:' + privateCopy), null)
  assert.equal(agentPiBundledRegistrySource(f.profile, 'unapproved-name', f.spec), null)
  const p = JSON.parse(readFileSync(join(f.profile, 'package.json'), 'utf8')); p.dependencies.dshmarket = 'link:' + privateCopy; write(join(f.profile, 'package.json'), p)
  const result = await f.request('POST', '/dsh-market/update', { name: 'dshmarket', restore: true })
  assert.equal(result.status, 400)
  assert.equal(f.commands.length, 0)
  assert.equal(JSON.parse(readFileSync(join(privateCopy, 'package.json'), 'utf8')).version, '1.0.0')
})

test('real GET + confirmed update uses actual pnpm and changes a verified bundled link to its release', { skip: !enabled }, async t => {
  const f = await fixture(t)
  const check = await f.request('GET', '/dsh-market/updates?force=1')
  assert.equal(check.status, 200)
  assert.deepEqual([check.body.updates.dshmarket.latest, check.body.updates.dshmarket.restoreRequired, check.body.updates.dshmarket.productBundled], ['2.0.0', true, true])
  const refused = await f.request('POST', '/dsh-market/update', { name: 'dshmarket' })
  assert.equal(refused.status, 400)
  assert.equal(f.commands.length, 0)
  const result = await f.request('POST', '/dsh-market/update', { name: 'dshmarket', restore: true })
  assert.equal(result.body.ok, true, JSON.stringify(result))
  assert.equal(JSON.parse(readFileSync(join(f.profile, 'node_modules/dshmarket/package.json'), 'utf8')).version, '2.0.0')
  assert.equal((await import(pathToFileURL(join(f.profile, 'node_modules/dshmarket/lib/index.js')).href)).marker, 'updated')
  assert.equal(JSON.parse(readFileSync(join(f.bundled, 'package.json'), 'utf8')).version, '1.0.0')
  assert.ok(f.calls.includes('/dshmarket/-/dshmarket-2.0.0.tgz'))
})

test('a real installed release with a missing entry restores and verifies the retained bundled source', { skip: !enabled }, async t => {
  const f = await fixture(t, true)
  const before = agentPiBundledSourceFingerprint(f.profile, 'dshmarket', f.spec)
  const manifest = readFileSync(join(f.profile, 'package.json')), lock = readFileSync(join(f.profile, 'pnpm-lock.yaml'))
  const result = await f.request('POST', '/dsh-market/update', { name: 'dshmarket', restore: true })
  assert.equal(result.body.ok, false, JSON.stringify(result))
  assert.equal(agentPiBundledSourceFingerprint(f.profile, 'dshmarket', f.spec), before)
  assert.deepEqual(JSON.parse(readFileSync(join(f.profile, 'package.json'), 'utf8')), JSON.parse(manifest.toString()))
  assert.deepEqual(readFileSync(join(f.profile, 'pnpm-lock.yaml')), lock)
  assert.equal((await import(pathToFileURL(join(f.profile, 'node_modules/dshmarket/lib/index.js')).href)).marker, 'original')
})
