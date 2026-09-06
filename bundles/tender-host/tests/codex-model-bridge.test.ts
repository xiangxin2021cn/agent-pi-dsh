import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { PassThrough } from 'node:stream'
import { test } from 'node:test'
import { apply as applyProvider } from '../src/codex-provider.ts'
import { apply as applyTool } from '../src/codex-tool.ts'

function harness({ holdTurn = false } = {}) {
  const threads: any[] = []
  const spawnSpecs: any[] = []
  const children: any[] = []
  const jobs: any[] = []
  const providers = new Map<string, any>()
  let tool: any
  const ctx: any = {
    logger: { info() {}, warn() {} },
    on() { return () => {} },
    sessionProjections: { register() {} },
    tools: { register(value: unknown) { tool = value; return () => {} } },
    systemPrompt: {},
    get(name: string) {
      if (name === 'llm') throw new Error('Native Codex models must never resolve a DSH LLM route')
      if (name === 'jobs') return {
        start(spec: any) { jobs.push(spec.run()); return `job-${jobs.length}` },
      }
    },
    subagents: {
      registerProvider(provider: any) { providers.set(provider.name, provider); return () => {} },
      getProvider(name: string) { return providers.get(name) },
      async start(name: string, request: any) {
        assert.equal(request.agentOptions, undefined)
        // Yield here so simultaneous explicit/default calls overlap before provider startup.
        await new Promise((resolve) => setImmediate(resolve))
        return providers.get(name).start(request)
      },
    },
    subprocess: {
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
              if (frame.method === 'initialize') send({ id: frame.id, result: { userAgent: 'codex-cli 0.149.1' } })
              if (frame.method === 'thread/start') {
                threads.push(frame.params)
                send({ id: frame.id, result: { thread: { id: threadId, ephemeral: true } } })
              }
              if (frame.method === 'turn/start') {
                send({ id: frame.id, result: { turn: { id: turnId } } })
                turnStarted.resolve()
                if (!holdTurn) setImmediate(() => {
                  send({ method: 'item/completed', params: { threadId, turnId, item: { type: 'agentMessage', text: 'done', phase: 'final_answer' } } })
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
    },
  }
  const config = { providerName: 'codex', permissionMode: 'approve-for-me', env: { CODEX_HOME: 'isolated-codex-home' }, disposeGraceMs: 3000 }
  applyProvider(ctx, config)
  applyTool(ctx, { provider: 'codex', toolName: 'subagent_codex', maxDepth: 'provider-managed' })
  const parent = { id: 'parent', options: { provider: 'deepseek', model: 'deepseek-chat' }, session: { header: { cwd: process.cwd() }, requestHeader() {} } }
  const execute = (args: Record<string, unknown>, signal = new AbortController().signal) => tool.execute({ description: 'test delegation', prompt: 'return done', ...args }, { agent: parent, signal })
  return { tool, execute, threads, spawnSpecs, children, config, jobs }
}

test('official Codex wire receives each concurrent task model while default remains omitted', { timeout: 5000 }, async () => {
  const h = harness()
  assert.equal(h.tool.parameters.properties.model.type, 'string')
  assert.equal(h.tool.parameters.properties.provider, undefined)
  assert.equal(h.tool.parameters.required.includes('model'), false)
  const results = await Promise.all([
    h.execute({ model: 'gpt-5.6-sol', run_in_background: false }),
    h.execute({ model: 'gpt-5.4-mini', run_in_background: false }),
    h.execute({ run_in_background: false }),
  ])
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
  assert.ok(results.every((result) => result.kind === 'foreground' && result.output[0].text === 'done'))
  assert.ok(h.children.every((child) => child.terminated === 1))
  assert.ok(h.spawnSpecs.every((spec) => spec.env.CODEX_HOME === 'isolated-codex-home'))
  assert.equal(Object.hasOwn(h.config, 'model'), false)
})

test('official background jobs retain the explicit native model and dispose the child', { timeout: 5000 }, async () => {
  const h = harness()
  const result = await h.execute({ model: 'gpt-5.6-sol', run_in_background: true })
  assert.equal(result.kind, 'background')
  assert.equal((await h.jobs[0].done).status, 'completed')
  assert.equal(h.threads[0].model, 'gpt-5.6-sol')
  assert.equal(h.children[0].terminated, 1)
})

test('foreground cancellation reaches the official run and releases its subprocess', { timeout: 5000 }, async () => {
  const h = harness({ holdTurn: true })
  const controller = new AbortController()
  const pending = h.execute({ model: 'gpt-5.6-sol' }, controller.signal)
  const rejected = assert.rejects(pending, /cancelled|aborted/)
  while (!h.children.length) await new Promise((resolve) => setImmediate(resolve))
  await h.children[0].turnStarted
  controller.abort('test cancellation')
  await rejected
  assert.equal(h.children[0].terminated, 1)
})

test('blank native model is rejected before a subprocess starts', () => {
  const h = harness()
  assert.throws(() => h.execute({ model: '   ' }), /non-empty model id/)
  assert.equal(h.children.length, 0)
})

test('concurrent reasoning overrides reach only their own official Codex process', { timeout: 5000 }, async () => {
  const h = harness()
  assert.equal(h.tool.parameters.properties.reasoningEffort.type, 'string')
  await Promise.all([
    h.execute({ model: 'gpt-5.6-sol', reasoningEffort: 'ultra', run_in_background: false }),
    h.execute({ model: 'gpt-5.6-luna', reasoningEffort: 'low', run_in_background: false }),
    h.execute({ reasoningEffort: 'max', run_in_background: false }),
    h.execute({ run_in_background: false }),
  ])
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
  assert.equal(Object.hasOwn(h.config, 'reasoningEffort'), false)
  assert.ok(h.children.every((child) => child.terminated === 1))
  assert.ok(h.threads.every((thread) => thread.sandbox === 'workspace-write'))
})

test('invalid reasoning effort is rejected before spawning Codex', () => {
  const h = harness()
  for (const reasoningEffort of ['', ' ', 'high\nmodel="other"', 3, null]) {
    assert.throws(() => h.execute({ reasoningEffort }), /supported effort id/)
  }
  assert.equal(h.children.length, 0)
})
