import assert from 'node:assert/strict'
import { existsSync, lstatSync, realpathSync, rmSync } from 'node:fs'
import { createRequire } from 'node:module'
import { tmpdir } from 'node:os'
import { basename, dirname } from 'node:path'
import { test } from 'node:test'
import { registerOfficePdfToolSafety } from '../src/office-pdf-tool-safety.ts'
import { withOfficePdfSafety } from '../src/office-pdf-safety.ts'
import { importDsh } from '../src/dsh.ts'

function fixture() {
  const launches: any[] = [], service = {}, listeners: any[] = []
  let printed = 0
  const launcher = { async launch(options: any) {
    launches.push(options)
    let connected = true
    const handlers: any = {}, frame = {}
    const page = { async setRequestInterception() {}, on: (name: string, listener: any) => { handlers[name] = listener }, mainFrame: () => frame,
      async evaluateOnNewDocument() {}, async evaluate() { return 0 }, isClosed: () => false, async pdf() { printed++; return Buffer.from('%PDF-1.7') },
      async navigate() { await handlers.request({ url: () => 'http://127.0.0.1:42420/', method: () => 'GET', isNavigationRequest: () => true, frame: () => frame, async respond() {}, async abort() {}, async continue() {} }) } }
    return { async newPage() { return page }, async close() { connected = false }, get connected() { return connected }, process: () => ({ exitCode: 0, signalCode: null, once() {} }) }
  } }
  const original = launcher.launch
  const ctx = { inject(deps: string[], callback: any) { assert.deepEqual(deps, ['tools', 'univer']); callback({ univer: service, on(name: string, listener: any) { assert.equal(name, 'tools/execute'); listeners.push(listener) } }) } }
  const calls: any[] = []
  registerOfficePdfToolSafety(ctx, (operation, dependencies) => { calls.push(dependencies); return withOfficePdfSafety(operation, { launcher, readHtml: async () => '<html>native PDF test</html>' }) })
  const invoke = (name: string, next: () => Promise<any>, signal = new AbortController().signal) => listeners[0]({ name, signal }, next)
  const native = async () => {
    const browser = await launcher.launch({ args: ['--no-sandbox', '--disable-gpu'] }), page = await browser.newPage()
    await page.navigate(); const bytes = await page.pdf(); await browser.close(); return bytes
  }
  const clean = () => { assert.equal(launcher.launch, original); for (const row of launches) if (row.userDataDir) assert.equal(existsSync(row.userDataDir), false) }
  return { service, launcher, launches, calls, invoke, native, clean, printed: () => printed }
}

test('non-PDF tools and an already aborted PDF call bypass the guard unchanged', async () => {
  const f = fixture(), result = { isError: false, value: { unchanged: true } }, abort = new AbortController()
  abort.abort()
  assert.equal(await f.invoke('univer_export', async () => result), result)
  assert.equal(await f.invoke('univer_print_pdf', async () => result, abort.signal), result)
  assert.equal(f.calls.length, 0); assert.equal(f.launches.length, 0)
})

test('native PDF success preserves the entire canonical result and applies the existing print boundary', async () => {
  const f = fixture(), controller = new AbortController(), result = { isError: false, value: { ok: true }, content: [{ type: 'text', text: 'printed' }], additionalContexts: [{ id: 'context' }], concludesTurn: true }
  const actual = await f.invoke('univer_print_pdf', async () => { await f.native(); return result }, controller.signal)
  assert.equal(actual, result); assert.equal(f.calls[0].service, f.service)
  assert.deepEqual(f.launches[0].args, ['--disable-gpu']); assert.equal(f.launches[0].pipe, true); assert.equal(f.printed(), 1)
  assert.equal(controller.signal.aborted, false); f.clean()
})

test('normalized native errors, cancellation and thrown errors keep their original identities', async () => {
  const f = fixture()
  for (const code of ['NATIVE_PDF_FAILURE', 'ABORTED_BEFORE_DISPATCH', 'ABORTED']) {
    const result = { isError: true, content: [], error: { message: code, info: { name: 'NativeFailure', code } } }
    assert.equal(await f.invoke('univer_print_pdf', async () => result), result)
  }
  const expected = new Error('native around failure')
  await assert.rejects(f.invoke('univer_print_pdf', async () => { throw expected }), error => error === expected)
  assert.equal(f.launches.length, 0); f.clean()
})

test('cleanup failure takes precedence over a normalized native failure and retains an unproved profile', async () => {
  const f = fixture(); let profile = ''
  f.launcher.launch = async options => { profile = options.userDataDir; throw new Error('native child did not start cleanly') }
  const original = f.launcher.launch
  await assert.rejects(f.invoke('univer_print_pdf', async () => {
    try { await f.native() } catch {}
    return { isError: true, content: [], error: { message: 'native launch failed' } }
  }), { code: 'OFFICE_PDF_SAFETY' })
  assert.equal(f.launcher.launch, original); assert.ok(existsSync(profile))
  assert.equal(lstatSync(profile).isSymbolicLink(), false); assert.equal(realpathSync(dirname(profile)), realpathSync(tmpdir())); assert.match(basename(profile), /^agent-pi-office-pdf-/)
  rmSync(profile, { recursive: true })
})

test('queued cancellation drains without detaching and concurrent non-target launches keep their own scope', async () => {
  const f = fixture(), controller = new AbortController()
  let release!: () => void, started!: () => void, secondStarted = false
  const gate = new Promise<void>(resolve => { release = resolve }), entered = new Promise<void>(resolve => { started = resolve })
  const first = f.invoke('univer_print_pdf', async () => { started(); await gate; await f.native(); return { isError: false, value: 'first' } })
  await entered
  const cancelled = { isError: true, content: [], error: { message: 'cancelled', info: { code: 'ABORTED_BEFORE_DISPATCH' } } }
  const second = f.invoke('univer_print_pdf', async () => { secondStarted = true; assert.equal(controller.signal.aborted, true); return cancelled }, controller.signal)
  controller.abort(); assert.equal(secondStarted, false)
  await f.invoke('univer_export', async () => { const browser = await f.launcher.launch({ outside: true }); await browser.close(); return { isError: false } })
  assert.deepEqual(f.launches, [{ outside: true }])
  release(); await first; assert.equal(await second, cancelled)
  assert.equal(f.printed(), 1); assert.equal(secondStarted, true); f.clean()
})

test('the actual alpha.2 pipeline retains canonical values, deferred context, terminal markers and cancellation', async () => {
  const require = createRequire(new URL('../../../vendor/dsh-univer-office/package.json', import.meta.url))
  const { Context } = require('@deepseek-ai/cordis')
  const tools: any = await importDsh('packages/core/tools/lib/index.js')
  const prompt: any = await importDsh('packages/core/system-prompt/lib/index.js')
  const executor: any = await importDsh('packages/core/tool-executor-native/lib/index.js')
  const office = await import('../../../vendor/dsh-univer-office/lib/index.js')
  const ctx = new Context(), deferred = { id: 'pdf-tool-test-context', role: 'user', content: [{ type: 'text', text: 'Retain this actual tool context.' }], source: { kind: 'plugin:office-pdf-test', form: 'instructions' } }
  try {
    await ctx.plugin(prompt.default); await ctx.plugin(tools.default); await ctx.plugin(executor)
    new office.GatewayUniverService(ctx, office.resolveConfig({ autoStartGateway: false, telemetry: false }))
    let runnerCalls = 0, mode = 'success', bodyCalls = 0, expectedSignal: AbortSignal
    ctx.tools.register(tools.defineTool({ name: 'univer_print_pdf', description: 'neutral fixture only', parameters: {}, output: { schema: { type: 'json' }, render: (_args: unknown, value: unknown) => [{ type: 'text', text: JSON.stringify(value) }] }, async execute(_args: unknown, exec: any) {
      bodyCalls++; assert.equal(exec.signal, expectedSignal)
      if (mode === 'failure') throw Object.assign(new Error('original failure'), { code: 'ORIGINAL_PDF_FAILURE' })
      if (mode === 'cancel') controller.abort()
      exec.deferContext(deferred); exec.concludeTurn(); return { actualValue: 'preserved' }
    } }))
    let controller = new AbortController()
    const run = async () => { expectedSignal = controller.signal; return (await ctx.tools.execute({ calls: [{ type: 'tool-call', id: 'guarded-pdf', name: 'univer_print_pdf', arguments: '{}' }], signal: controller.signal })).results[0].result }
    const baseline = await run()
    registerOfficePdfToolSafety(ctx, async (operation, dependencies) => { runnerCalls++; assert.ok(dependencies.service); return operation() })
    const guarded = await run()
    assert.deepEqual(guarded, baseline); assert.deepEqual(guarded.value, { actualValue: 'preserved' }); assert.equal(guarded.concludesTurn, true); assert.deepEqual(guarded.additionalContexts, [deferred])
    mode = 'failure'; const failed = await run(); assert.equal(failed.isError, true); assert.match(failed.error.message, /original failure/)
    mode = 'cancel'; const cancelled = await run(); assert.equal(cancelled.isError, true); assert.equal(cancelled.error.info.code, 'ABORTED')
    const before = bodyCalls, wrappers = runnerCalls
    const aborted = await run(); assert.equal(aborted.error.info.code, 'ABORTED_BEFORE_DISPATCH'); assert.equal(bodyCalls, before); assert.equal(runnerCalls, wrappers)
  } finally { await ctx.fiber.dispose() }
})
