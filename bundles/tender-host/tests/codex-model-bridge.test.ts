import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { spawnSync } from 'node:child_process'
import { PassThrough } from 'node:stream'
import { test } from 'node:test'
import { pathToFileURL } from 'node:url'
import { apply as applyProvider } from '../src/codex-provider.ts'
import { apply as applyTool } from '../src/codex-tool.ts'
import { dshFile, importDsh } from '../src/dsh.ts'

const officialRequire = createRequire(dshFile('packages/subagent/subagent/package.json'))
const { Context } = await import(pathToFileURL(officialRequire.resolve('@deepseek-ai/cordis')).href)
const { default: SubagentRuntime } = await importDsh<any>('packages/subagent/subagent/lib/index.js')
const { Session, SessionId } = await importDsh<any>('packages/core/session/lib/index.js')

async function harness(t: any, { holdTurn = false, holdDirectory = false, answers = [{ text: 'done', phase: 'final_answer' }] } = {}) {
  const threads: any[] = []
  const spawnSpecs: any[] = []
  const children: any[] = []
  const notices: any[] = []
  const lifecycle: any[] = []
  const directory = Promise.withResolvers<void>()
  const directoryRequests: any[] = []
  const ctx = new Context()
  t.after(() => ctx.fiber.dispose())
  const parent = {
    id: SessionId('parent'), ctx, status: 'running',
    options: { provider: 'deepseek', model: 'deepseek-chat' },
    session: Session.create(SessionId('parent')),
    steer(message: any) { notices.push(message) },
    followup(message: any) { notices.push(message) },
    inject(message: any) { notices.push(message) },
  }
  let tool: any
  ctx.provide('agents', { get: (id: string) => id === parent.id ? parent : undefined, list: () => [parent] })
  ctx.provide('tools', { register(value: unknown) { tool = value; return () => {} } })
  ctx.provide('systemPrompt', { section() {}, context() {}, getSectionOrder: () => 0, getContextOrder: () => 0 })
  ctx.provide('sessionProjections', { register() {} })
  ctx.provide('llm', { resolveModelInfo() { throw new Error('Native Codex models must never resolve a DSH LLM route') } })
  ctx.provide('workingDirectory', {
    async ensure(agent: unknown, signal: AbortSignal) {
      assert.equal(agent, parent)
      directoryRequests.push(agent)
      // Exercise the real alpha.2 directory await before provider dispatch.
      if (holdDirectory) await directory.promise
      else await new Promise((resolve) => setImmediate(resolve))
      signal.throwIfAborted()
      return process.cwd()
    },
  })
  await ctx.plugin(SubagentRuntime)
  ctx.on('subagent/start', (info: any) => { lifecycle.push({ type: 'start', ...info }) })
  ctx.on('subagent/end', (info: any) => { lifecycle.push({ type: 'end', ...info }) })
  ctx.provide('subprocess', {
    spawn(spec: any) {
      spawnSpecs.push(spec)
      const stdin = new PassThrough()
      const stdout = new PassThrough()
      const stderr = new PassThrough()
      const done = Promise.withResolvers<any>()
      const turnStarted = Promise.withResolvers<void>()
      const child = { terminated: 0, turnStarted: turnStarted.promise }
      children.push(child)
      const threadId = `thread-${children.length}`
      const turnId = `turn-${children.length}`
      let buffer = ''
      const send = (frame: unknown) => stdout.write(`${JSON.stringify(frame)}\n`)
      stdin.on('data', (chunk) => {
        buffer += chunk.toString()
        let newline: number
        while ((newline = buffer.indexOf('\n')) >= 0) {
          const line = buffer.slice(0, newline)
          buffer = buffer.slice(newline + 1)
          if (!line.trim()) continue
          const frame = JSON.parse(line)
          setImmediate(() => {
            if (frame.method === 'initialize') send({ id: frame.id, result: { userAgent: 'codex-cli 0.163.0' } })
            if (frame.method === 'thread/start') {
              threads.push(frame.params)
              send({ id: frame.id, result: { thread: { id: threadId, ephemeral: true } } })
            }
            if (frame.method === 'turn/start') {
              send({ id: frame.id, result: { turn: { id: turnId } } })
              turnStarted.resolve()
              if (!holdTurn) setImmediate(() => {
                for (const answer of answers) send({ method: 'item/completed', params: { threadId, turnId, item: { type: 'agentMessage', ...answer } } })
                send({ method: 'turn/completed', params: { threadId, turn: { id: turnId, status: 'completed', error: null } } })
              })
            }
            if (frame.method === 'turn/interrupt') send({ id: frame.id, result: {} })
          })
        }
      })
      return {
        pid: 1000 + children.length, stdin, stdout, stderr, collected: {}, done: done.promise,
        terminate() { child.terminated += 1; done.resolve({ exitCode: 0, signal: null }) },
        async waitForExit() { await done.promise; return true },
      }
    },
  })
  const config = { providerName: 'codex', permissionMode: 'approve-for-me', env: { CODEX_HOME: 'isolated-codex-home' }, disposeGraceMs: 3000 }
  applyProvider(ctx, config)
  applyTool(ctx, { provider: 'codex', toolName: 'subagent_codex', maxDepth: 'provider-managed' })
  const execute = (args: Record<string, unknown>, signal = new AbortController().signal) => tool.execute({ description: 'test delegation', prompt: 'return done', ...args }, { agent: parent, signal })
  const settle = () => ctx.subagents.waitForChildren(parent)
  const interrupt = (id: string) => ctx.subagents.interrupt(id, { kind: 'ancestor', agent: parent })
  return { tool, execute, threads, spawnSpecs, children, config, notices, lifecycle, settle, interrupt, directoryRequests, releaseDirectory: directory.resolve }
}

test('official adapters import under the packaged default Node mode without a TypeScript transform loader', () => {
  const entries = ['codex-tool.ts', 'codex-provider.ts', 'goal-round-driver.ts'].map(file => new URL('../src/' + file, import.meta.url).href)
  const script = `for (const entry of ${JSON.stringify(entries)}) { const plugin = await import(entry); if (typeof plugin.apply !== 'function') throw new Error('Invalid official wrapper'); }`
  const result = spawnSync(process.execPath, ['--input-type=module', '--eval', script], {
    encoding: 'utf8', timeout: 15_000, windowsHide: true, env: { ...process.env, NODE_OPTIONS: '' },
  })
  assert.equal(result.error, undefined)
  assert.equal(result.status, 0, result.stderr)
})

test('official Codex wire receives each concurrent activation model while default remains omitted', { timeout: 5000 }, async (t) => {
  const h = await harness(t)
  assert.equal(h.tool.parameters.properties.model.type, 'string')
  assert.equal(h.tool.parameters.properties.provider, undefined)
  assert.equal(h.tool.parameters.required.includes('model'), false)
  const results = await Promise.all([
    h.execute({ model: 'gpt-5.6-sol' }),
    h.execute({ model: 'gpt-5.4-mini' }),
    h.execute({}),
  ])
  await h.settle()
  assert.deepEqual(h.threads.map((thread) => thread.model).sort(), ['gpt-5.4-mini', 'gpt-5.6-sol', undefined])
  assert.equal(h.threads.filter((thread) => !Object.hasOwn(thread, 'model')).length, 1)
  const wrapper = createRequire(import.meta.url).resolve('@openai/codex/bin/codex.js')
  for (const spec of h.spawnSpecs) {
    assert.equal(spec.argv[0], process.execPath)
    assert.equal(spec.argv[1], wrapper)
    assert.deepEqual(spec.argv.slice(2), ['app-server', '--stdio'])
  }
  for (const thread of h.threads) {
    assert.equal(thread.approvalPolicy, 'on-request')
    assert.equal(thread.approvalsReviewer, 'auto_review')
    assert.equal(thread.sandbox, 'workspace-write')
    assert.equal(thread.ephemeral, true)
  }
  assert.ok(results.every((result) => result.kind === 'activation' && typeof result.subagentId === 'string'))
  assert.equal(h.notices.length, 3)
  assert.ok(h.notices.every((message) => message.source.kind === 'subagent-settled' && message.content.at(-1).text === 'done'))
  assert.deepEqual(h.notices.map((message) => message.source.senderSessionId).sort(), results.map((result) => result.subagentId).sort())
  assert.equal(h.lifecycle.filter((edge) => edge.type === 'end' && edge.stopReason === 'completed').length, 3)
  assert.ok(h.children.every((child) => child.terminated === 1))
  assert.ok(h.spawnSpecs.every((spec) => spec.env.CODEX_HOME === 'isolated-codex-home'))
  assert.equal(Object.hasOwn(h.config, 'model'), false)
})

test('official Codex wire settles a partial answer when no final answer was emitted', { timeout: 5000 }, async (t) => {
  const h = await harness(t, { answers: [{ text: 'Verified partial result', phase: 'partial_answer' }] })
  const result = await h.execute({})
  await h.settle()
  assert.equal(h.notices.length, 1)
  assert.equal(h.notices[0].source.senderSessionId, result.subagentId)
  assert.equal(h.notices[0].content.at(-1).text, 'Verified partial result')
  assert.equal(h.lifecycle.at(-1).stopReason, 'completed')
})

test('official Codex wire retains the final answer over a later partial answer', { timeout: 5000 }, async (t) => {
  const h = await harness(t, { answers: [
    { text: 'Verified final result', phase: 'final_answer' },
    { text: 'Later partial result', phase: 'partial_answer' },
  ] })
  await h.execute({})
  await h.settle()
  assert.equal(h.notices.length, 1)
  assert.equal(h.notices[0].content.at(-1).text, 'Verified final result')
  assert.equal(h.lifecycle.at(-1).stopReason, 'completed')
})

test('alpha.2 activation returns before completion and reports the result to its parent', { timeout: 5000 }, async (t) => {
  const h = await harness(t, { holdTurn: true })
  const controller = new AbortController()
  const result = await h.execute({ model: 'gpt-5.6-sol' }, controller.signal)
  assert.equal(result.kind, 'activation')
  await h.children[0].turnStarted
  assert.equal(h.children[0].terminated, 0)
  assert.equal(h.notices.length, 0)
  // The invocation signal owns admission only; accepted children have their own lifecycle.
  controller.abort('tool invocation finished')
  await new Promise((resolve) => setImmediate(resolve))
  assert.equal(h.children[0].terminated, 0)
  h.interrupt(result.subagentId)
  await h.settle()
  assert.equal(h.threads[0].model, 'gpt-5.6-sol')
  assert.equal(h.children[0].terminated, 1)
  assert.equal(h.lifecycle.at(-1).stopReason, 'aborted')
  assert.equal(h.notices[0].source.senderSessionId, result.subagentId)
})

test('cancelling delayed activation admission starts no subprocess or later model override', { timeout: 5000 }, async (t) => {
  const h = await harness(t, { holdDirectory: true })
  const controller = new AbortController()
  const pending = h.execute({ model: 'gpt-5.6-sol', reasoningEffort: 'ultra' }, controller.signal)
  const rejected = assert.rejects(pending, /cancelled|aborted/)
  while (!h.directoryRequests.length) await new Promise((resolve) => setImmediate(resolve))
  controller.abort(new Error('test cancellation aborted'))
  h.releaseDirectory()
  await rejected
  assert.equal(h.children.length, 0)
  await h.execute({})
  await h.settle()
  assert.equal(Object.hasOwn(h.threads[0], 'model'), false)
  assert.equal(h.spawnSpecs[0].argv.includes('--config'), false)
})

test('blank native model is rejected before a subprocess starts', async (t) => {
  const h = await harness(t)
  assert.throws(() => h.execute({ model: '   ' }), /non-empty model id/)
  assert.equal(h.children.length, 0)
})

test('concurrent reasoning overrides survive delayed alpha.2 activation dispatch', { timeout: 5000 }, async (t) => {
  const h = await harness(t, { holdDirectory: true })
  assert.equal(h.tool.parameters.properties.reasoningEffort.type, 'string')
  const pending = Promise.all([
    h.execute({ model: 'gpt-5.6-sol', reasoningEffort: 'ultra' }),
    h.execute({ model: 'gpt-5.6-luna', reasoningEffort: 'low' }),
    h.execute({ reasoningEffort: 'max' }),
    h.execute({}),
  ])
  assert.equal(h.directoryRequests.length, 4)
  assert.equal(h.children.length, 0)
  // Resolve outside the tool's AsyncLocalStorage scope, after every call is parked.
  h.releaseDirectory()
  await pending
  await h.settle()
  const overrides = h.spawnSpecs.map((spec) => {
    const index = spec.argv.indexOf('--config')
    assert.equal(spec.argv.at(-2), 'app-server')
    assert.equal(spec.argv.at(-1), '--stdio')
    return index === -1 ? undefined : spec.argv[index + 1]
  })
  assert.deepEqual(overrides, [
    'model_reasoning_effort="ultra"', 'model_reasoning_effort="low"',
    'model_reasoning_effort="max"', undefined,
  ])
  assert.deepEqual(h.threads.map((thread, index) => [thread.model, overrides[index]]), [
    ['gpt-5.6-sol', 'model_reasoning_effort="ultra"'],
    ['gpt-5.6-luna', 'model_reasoning_effort="low"'],
    [undefined, 'model_reasoning_effort="max"'],
    [undefined, undefined],
  ])
  assert.equal(Object.hasOwn(h.config, 'reasoningEffort'), false)
  assert.ok(h.children.every((child) => child.terminated === 1))
  assert.ok(h.threads.every((thread) => thread.sandbox === 'workspace-write'))
})

test('invalid reasoning effort is rejected before spawning Codex', async (t) => {
  const h = await harness(t)
  for (const reasoningEffort of ['', ' ', 'high\nmodel="other"', 3, null]) {
    assert.throws(() => h.execute({ reasoningEffort }), /supported effort id/)
  }
  assert.equal(h.children.length, 0)
})
