import assert from 'node:assert/strict'
import { existsSync, lstatSync, realpathSync, rmSync } from 'node:fs'
import { createServer } from 'node:http'
import { tmpdir } from 'node:os'
import { basename, dirname } from 'node:path'
import { test } from 'node:test'
import { withOfficePdfSafety } from '../src/office-pdf-safety.ts'

function fixture() {
  const launches: any[] = [], requests: any[] = [], pages: any[] = []
  let pdfCalls = 0, closed = 0
  function page() {
    const frame = {}, handlers: Record<string, any> = {}
    const value = {
      cspViolations: 0, bootstrap: '', intercepted: false,
      async setRequestInterception(value: boolean) { this.intercepted = value },
      on(name: string, handler: any) { handlers[name] = handler },
      mainFrame: () => frame, isClosed: () => false,
      async evaluateOnNewDocument(source: string) { this.bootstrap = source },
      async evaluate() { return this.cspViolations },
      async pdf() { pdfCalls++; return Buffer.from('%PDF-1.7\nnative') },
      async request(url: string, method = 'GET', navigation = false, mainFrame = true) {
        assert.equal(this.intercepted, true)
        const request = { url: () => url, method: () => method, isNavigationRequest: () => navigation, frame: () => mainFrame ? frame : {},
          continued: false, aborted: false, response: null as any,
          async continue() { this.continued = true }, async abort() { this.aborted = true }, async respond(response: any) { this.response = response } }
        requests.push(request)
        await handlers.request(request)
        return request
      },
    }
    pages.push(value)
    return value
  }
  const launcher = { async launch(options: any) {
    launches.push(options)
    let connected = true
    return { async newPage() { return page() }, async close() { closed++; connected = false }, get connected() { return connected }, process: () => ({ exitCode: 0, signalCode: null, once() {} }) }
  } }
  const original = launcher.launch
  const native = async (action?: (page: ReturnType<typeof page>) => Promise<void>) => {
    const browser = await launcher.launch({ executablePath: '/fixture/browser', args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-gpu'] })
    const p = await browser.newPage()
    await p.request('http://127.0.0.1:42420/', 'GET', true)
    await action?.(p)
    const bytes = await p.pdf()
    await browser.close()
    return bytes
  }
  const dependencies = { launcher, readHtml: async () => '<html>native render entry</html>' }
  const assertClean = () => { assert.equal(launcher.launch, original); for (const options of launches) if (options.userDataDir) assert.equal(existsSync(options.userDataDir), false) }
  return { launcher, launches, requests, pages, native, dependencies, original, assertClean, pdfCalls: () => pdfCalls, closed: () => closed }
}

test('native PDF callback keeps its bytes while sandbox, pipe, page policy and profile lifetime are enforced', async () => {
  const f = fixture()
  let callbacks = 0
  const result = await withOfficePdfSafety(async () => { callbacks++; return f.native(async page => {
    assert.equal((await page.request('http://127.0.0.1:42420/assets/render.js')).continued, true)
    assert.equal((await page.request('data:image/png;base64,AA')).continued, true)
    assert.equal((await page.request('blob:http://127.0.0.1:42420/fixture')).continued, true)
  }) }, f.dependencies)
  assert.equal(result.toString(), '%PDF-1.7\nnative')
  assert.equal(callbacks, 1); assert.equal(f.pdfCalls(), 1)
  assert.deepEqual(f.launches[0].args, ['--disable-gpu']); assert.equal(f.launches[0].pipe, true)
  assert.match(basename(f.launches[0].userDataDir), /^agent-pi-office-pdf-/)
  assert.equal(f.requests[0].response.status, 200)
  for (const directive of ["connect-src 'none'", "worker-src 'none'", "frame-src 'none'"]) assert.ok(f.requests[0].response.headers['content-security-policy'].includes(directive))
  assert.match(f.pages[0].bootstrap, /securitypolicyviolation/)
  f.assertClean()
})

test('Puppeteer 25 connected getter cleans up a browser without the removed isConnected method', async () => {
  const f = fixture()
  const result = await withOfficePdfSafety(async () => {
    const browser = await f.launcher.launch({})
    assert.equal('isConnected' in browser, false)
    assert.equal(browser.connected, true)
    const page = await browser.newPage()
    await page.request('http://127.0.0.1:42420/', 'GET', true)
    return page.pdf()
  }, f.dependencies)
  assert.equal(result.toString(), '%PDF-1.7\nnative')
  assert.equal(f.closed(), 1)
  assert.equal(f.pdfCalls(), 1)
  f.assertClean()
})

test('ambient Puppeteer sandbox bypass is rejected without changing the environment or launching a child', async () => {
  const f = fixture(), previous = process.env.PUPPETEER_DANGEROUS_NO_SANDBOX
  process.env.PUPPETEER_DANGEROUS_NO_SANDBOX = 'true'
  try {
    await assert.rejects(withOfficePdfSafety(() => f.native(), f.dependencies), { code: 'OFFICE_PDF_SAFETY' })
    assert.equal(process.env.PUPPETEER_DANGEROUS_NO_SANDBOX, 'true')
    assert.equal(f.launches.length, 0); assert.equal(f.pdfCalls(), 0)
    f.assertClean()
  } finally {
    if (previous === undefined) delete process.env.PUPPETEER_DANGEROUS_NO_SANDBOX
    else process.env.PUPPETEER_DANGEROUS_NO_SANDBOX = previous
  }
})

for (const [label, url, method, navigation, mainFrame] of [
  ['external image', 'https://external.invalid/image.png', 'GET', false, true],
  ['local file', 'file:///C:/private.txt', 'GET', false, true],
  ['different loopback service', 'http://127.0.0.1:42421/image', 'GET', false, true],
  ['POST', 'http://127.0.0.1:42420/write', 'POST', false, true],
  ['frame navigation', 'http://127.0.0.1:42420/', 'GET', true, false],
] as const) test('PDF fails explicitly for ' + label + ' instead of silently dropping it', async () => {
  const f = fixture()
  await assert.rejects(withOfficePdfSafety(() => f.native(async page => {
    assert.equal((await page.request(url, method, navigation, mainFrame)).aborted, true)
  }), f.dependencies), { code: 'OFFICE_PDF_SAFETY' })
  assert.equal(f.pdfCalls(), 0)
  f.assertClean()
})

test('CSP violations fail printing before Page.pdf even when no request event is emitted', async () => {
  const f = fixture()
  await assert.rejects(withOfficePdfSafety(() => f.native(async page => { page.cspViolations = 1 }), f.dependencies), { code: 'OFFICE_PDF_SAFETY' })
  assert.equal(f.pdfCalls(), 0)
  f.assertClean()
})

test('callback errors close this browser, restore the singleton and remove only its verified profile', async () => {
  const f = fixture(), expected = new Error('native callback failed')
  await assert.rejects(withOfficePdfSafety(() => f.native(async () => { throw expected }), f.dependencies), error => error === expected)
  assert.equal(f.closed(), 1)
  f.assertClean()
})

test('failed launch retains its profile because child exit cannot be proved', async () => {
  const f = fixture()
  let profile = ''
  f.launcher.launch = async options => { profile = options.userDataDir; throw Error('launch failed') }
  const original = f.launcher.launch
  await assert.rejects(withOfficePdfSafety(() => f.native(), f.dependencies), { code: 'OFFICE_PDF_SAFETY' })
  assert.equal(f.launcher.launch, original)
  assert.equal(existsSync(profile), true)
  assert.equal(lstatSync(profile).isSymbolicLink(), false)
  assert.equal(realpathSync(dirname(profile)), realpathSync(tmpdir()))
  assert.match(basename(profile), /^agent-pi-office-pdf-/)
  rmSync(profile, { recursive: true })
})

test('PDF scopes serialize and do not alter an unrelated launch in another async context', async () => {
  const f = fixture()
  let release!: () => void, started!: () => void
  const gate = new Promise<void>(resolve => { release = resolve }), entered = new Promise<void>(resolve => { started = resolve })
  const first = withOfficePdfSafety(async () => { started(); await gate; return f.native() }, f.dependencies)
  await entered
  const second = withOfficePdfSafety(() => f.native(), f.dependencies)
  const outside = await f.launcher.launch({ outside: true })
  await outside.close()
  assert.deepEqual(f.launches, [{ outside: true }])
  release()
  await Promise.all([first, second])
  assert.equal(f.pdfCalls(), 2)
  assert.notEqual(f.launches[1].userDataDir, f.launches[2].userDataDir)
  f.assertClean()
})

test('first HTML proxy performs only one local GET and never follows an external redirect', async t => {
  const requests: Array<{ method?: string; url?: string }> = []
  const server = createServer((req, res) => { requests.push({ method: req.method, url: req.url }); res.writeHead(302, { location: 'https://external.invalid/' }); res.end() })
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve))
  t.after(() => new Promise<void>(resolve => { server.closeAllConnections(); server.close(() => resolve()) }))
  const origin = 'http://127.0.0.1:' + (server.address() as { port: number }).port
  const f = fixture()
  await assert.rejects(withOfficePdfSafety(async () => {
    const browser = await f.launcher.launch({}), page = await browser.newPage()
    assert.equal((await page.request(origin + '/', 'GET', true)).aborted, true)
    return page.pdf()
  }, { launcher: f.launcher }), { code: 'OFFICE_PDF_SAFETY' })
  assert.deepEqual(requests, [{ method: 'GET', url: '/' }])
  assert.equal(f.pdfCalls(), 0)
  f.assertClean()
})

for (const options of [{ ignoreDefaultArgs: true }, { args: ['--disable-web-security'] }, { args: ['--remote-debugging-port=9222'] }, { env: { NODE_TLS_REJECT_UNAUTHORIZED: '0' } }]) test('non-native browser launch options fail before launching or creating a profile', async () => {
  const f = fixture()
  await assert.rejects(withOfficePdfSafety(async () => {
    await f.launcher.launch(options)
    return null
  }, f.dependencies), { code: 'OFFICE_PDF_SAFETY' })
  assert.equal(f.launches.length, 0)
  f.assertClean()
})

test('an unbound Office service is rejected before the native callback can launch', async () => {
  let calls = 0
  await assert.rejects(withOfficePdfSafety(async () => { calls++; return null }, { service: {} }), { code: 'OFFICE_PDF_SAFETY' })
  assert.equal(calls, 0)
})

test('the real Cordis Office service proxy passes identity binding without starting a Gateway or browser', async () => {
  const { createRequire } = await import('node:module')
  const require = createRequire(new URL('../../../vendor/dsh-univer-office/package.json', import.meta.url))
  const { Context } = require('@deepseek-ai/cordis')
  const office = await import('../../../vendor/dsh-univer-office/lib/index.js')
  const ctx = new Context()
  new office.GatewayUniverService(ctx, office.resolveConfig({ autoStartGateway: false, telemetry: false }))
  const service = ctx.get('univer'), expected = new Error('stop-before-browser')
  let calls = 0
  await assert.rejects(withOfficePdfSafety(async () => { calls++; throw expected }, { service }), error => error === expected)
  assert.equal(calls, 1)
  await ctx.fiber.dispose()
})
