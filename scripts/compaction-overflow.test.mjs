import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { test } from 'node:test'
import { pathToFileURL } from 'node:url'

const harness = new URL('../vendor/deepseek-harness/', import.meta.url)
const loadFrom = (path, spec) => import(pathToFileURL(createRequire(new URL(path, harness)).resolve(spec)))
const load = spec => loadFrom('packages/bundle/base/package.json', `@deepseek-ai/${spec}`)
const { Context } = await load('cordis')
const { default: LlmRuntime, createUserMessage } = await load('dsh-llm')
const { default: SessionStore, SessionId } = await load('dsh-session')
const { default: Projections } = await load('dsh-session-projection')
const { default: SystemPrompt } = await load('dsh-system-prompt')
const { default: ToolRuntime } = await load('dsh-tools')
const NativeToolExecutor = await load('dsh-tool-executor-native')
const { default: AgentRegistry } = await load('dsh-agent')
const { default: AgentLoop } = await load('dsh-agent-loop')
const { default: TokenMeter } = await load('dsh-token-meter')
const { default: ToolResultPruner } = await load('dsh-compaction-tool-result-pruner')
const { defineContentToolFixture } = await loadFrom('packages/core/agent-loop/package.json', '@deepseek-ai/dsh-tool-testkit')
const { DeepSeekAdapter, resolveAdapterOptions } = await import(new URL('packages/llm/llm-deepseek/lib/index.js', harness))
const { default: Compaction } = await import(new URL('../bundles/agent-pi-compaction/lib/index.js', import.meta.url))

const MODEL = 'deepseek-flash'
const PROVIDER = 'deepseek-official'
const ORIGINAL_CAP = 256_000
const REDUCED_CAP = 240_759
const OVERFLOW = "This model's maximum context length is 1048576 tokens. However, you requested 1062793 tokens (806793 in the messages, 256000 in the completion). Please reduce the length of the messages or completion."
const PERSISTENT_ERROR = "This model's maximum context length is 1048576 tokens. However, you requested 1050552 tokens (809793 in the messages, 240759 in the completion)."
const sse = events => events.map(event => `event: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`).join('')
const textBlock = text => ({ type: 'text', text })
const start = { type: 'message_start', message: { id: 'msg_fixture', model: MODEL, usage: { input_tokens: 12, output_tokens: 0 } } }
function end(reason) {
  return [
    { type: 'content_block_stop', index: 0 },
    { type: 'message_delta', delta: { stop_reason: reason }, usage: { output_tokens: 5 } },
    { type: 'message_stop' },
  ]
}
const toolCall = sse([
  start,
  { type: 'content_block_start', index: 0, content_block: { type: 'tool_use', id: 'call_once', name: 'echo', input: { text: 'ping' } } },
  ...end('tool_use'),
])
function textReply(text) {
  return sse([
    start,
    { type: 'content_block_start', index: 0, content_block: { type: 'text', text: '' } },
    { type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text } },
    ...end('end_turn'),
  ])
}

function invalid(message) {
  return Response.json({ type: 'error', error: { type: 'invalid_request_error', message } }, { status: 400 })
}

function stream(body) {
  return new Response(body, { headers: { 'Content-Type': 'text/event-stream' } })
}

async function verify(scenario, expectedCaps) {
  const withTool = ['tool-continuation', 'next-step-default', 'native-compacts'].includes(scenario)
  const ctx = new Context()
  const requests = []
  let toolExecutions = 0
  const originalFetch = globalThis.fetch
  const baseURL = 'https://context-fixture.invalid/anthropic'
  globalThis.fetch = async (url, options) => {
    const endpoint = new URL(url)
    assert.equal(endpoint.hostname, 'context-fixture.invalid')
    if (options?.method !== 'POST') {
      return Response.json({ object: 'list', data: [{ id: MODEL, context_window: 1_048_576, max_output_tokens: ORIGINAL_CAP }] })
    }
    const body = JSON.parse(options.body)
    const data = JSON.stringify(body.messages)
    const isSummary = data.includes('compaction engine for') || data.includes('Condense')
    const hasToolResult = data.includes('echo: ping')
    const hasCheckpoint = data.includes('durable checkpoint')
    assert.equal(endpoint.pathname, '/anthropic/v1/messages')
    requests.push({ body, isSummary, hasToolResult })
    if (isSummary) return scenario === 'native-compacts'
      ? stream(textReply('durable checkpoint'))
      : invalid('fixture rejects compaction summary')
    if (scenario === 'next-step-default') {
      if (hasToolResult) return stream(textReply('same step completed'))
      return body.max_tokens === ORIGINAL_CAP ? invalid(OVERFLOW) : stream(toolCall)
    }
    if (hasCheckpoint) return stream(textReply('same step completed'))
    if (withTool && !hasToolResult) return stream(toolCall)
    if (body.max_tokens === ORIGINAL_CAP) return invalid(OVERFLOW)
    if (scenario === 'persistent-overflow') return invalid(PERSISTENT_ERROR)
    return stream(textReply('same step completed'))
  }
  try {
    await ctx.plugin(LlmRuntime)
    await ctx.plugin(SessionStore)
    await ctx.plugin(Projections)
    await ctx.plugin(SystemPrompt, { personaPrefix: 'Reply to the fixture.' })
    await ctx.plugin(ToolRuntime)
    await ctx.plugin(NativeToolExecutor)
    await ctx.plugin(AgentRegistry)
    await ctx.plugin(AgentLoop, { agents: [] })
    await ctx.plugin(TokenMeter)
    await ctx.plugin(ToolResultPruner)
    await ctx.plugin(Compaction, { thresholdRatio: 0.72 })
    const options = resolveAdapterOptions({ baseURL, models: [{ id: MODEL, contextWindow: 1_048_576, maxTokens: ORIGINAL_CAP, toolUpdate: 'addition-only' }] })
    const adapter = new DeepSeekAdapter({
      options: () => options,
      resolveAuth: async () => ({ headers: { 'x-api-key': 'local-fixture-only' } }),
      resolveUserId: () => '00000000-0000-4000-8000-000000000001',
      prepareExtensions: async () => ({ fields: {}, accept: async () => {} }),
    })
    ctx.llm.registerAdapter([PROVIDER], adapter)
    if (withTool) {
      ctx.tools.register(defineContentToolFixture({
        name: 'echo',
        description: 'echo back',
        parameters: { text: { type: 'string' } },
        async execute(args) {
          toolExecutions += 1
          return [textBlock(`echo: ${args.text}`)]
        },
      }))
    }
    const agent = await ctx.agentLoop.create(SessionId(`context-overflow-${scenario}`), { provider: PROVIDER, model: MODEL })
    const idle = new Promise(resolve => {
      const dispose = ctx.on('agent/status', ({ agent: subject, status }) => {
        if (subject === agent && status === 'idle') {
          dispose()
          resolve()
        }
      })
    })
    agent.followup(createUserMessage({ content: [textBlock('继续当前任务 '.repeat(8_000))], source: { kind: 'user' } }))
    await idle
    const events = agent.session.snapshotEvents()
    const userEntries = events.filter(event => event.type === 'user/message' && event.data.source.kind === 'user')
    const steps = events.filter(event => event.type === 'step/start')
    const turns = events.filter(event => event.type === 'turn/start')
    const turnEnd = events.findLast(event => event.type === 'turn/end')
    const callEntries = events.filter(event => event.type === 'tool/call')
    const resultEntries = events.filter(event => event.type === 'tool/result')
    const turnRequests = requests.filter(request => !request.isSummary)
    const caps = turnRequests.map(request => request.body.max_tokens)
    const summaries = requests.filter(request => request.isSummary).length
    const finalText = agent.session.deriveMessages().findLast(message => message.role === 'assistant')
      ?.content.filter(block => block.type === 'text')
    assert.equal(turns.length, 1)
    assert.equal(userEntries.length, 1)
    assert.equal(steps.length, withTool ? 2 : 1)
    assert.equal(toolExecutions, withTool ? 1 : 0)
    assert.equal(callEntries.length, withTool ? 1 : 0)
    assert.equal(resultEntries.length, withTool ? 1 : 0)
    if (['tool-continuation', 'native-compacts'].includes(scenario)) assert.ok(summaries >= 1)
    assert.deepEqual(caps, expectedCaps)
    const retryIndex = scenario === 'next-step-default' ? 1 : caps.length - 1
    const rejected = turnRequests[retryIndex - 1]
    const retried = turnRequests[retryIndex]
    assert.deepEqual(retried.body.tools, rejected.body.tools)
    if (scenario === 'native-compacts') {
      assert.ok(events.some(event => event.type === 'compaction/summary'))
      assert.ok(JSON.stringify(retried.body.messages).includes('durable checkpoint'))
    } else {
      assert.deepEqual(retried.body.messages, rejected.body.messages)
    }
    assert.equal(retried.hasToolResult, ['tool-continuation', 'native-compacts'].includes(scenario))
    if (scenario === 'persistent-overflow') {
      assert.equal(turnEnd.data.reason.kind, 'error')
      assert.equal(turnEnd.data.reason.error.code, 'CONTEXT_WINDOW_EXCEEDED')
    } else {
      assert.equal(turnEnd.data.reason.kind, 'completed')
      assert.deepEqual(finalText, [textBlock('same step completed')])
    }
  } finally {
    globalThis.fetch = originalFetch
    await ctx.fiber.dispose()
  }
}

for (const [scenario, expectedCaps] of Object.entries({
  'new-prompt': [ORIGINAL_CAP, REDUCED_CAP],
  'tool-continuation': [ORIGINAL_CAP, ORIGINAL_CAP, REDUCED_CAP],
  'persistent-overflow': [ORIGINAL_CAP, REDUCED_CAP],
  'next-step-default': [ORIGINAL_CAP, REDUCED_CAP, ORIGINAL_CAP],
  'native-compacts': [ORIGINAL_CAP, ORIGINAL_CAP, ORIGINAL_CAP],
})) {
  test(`context recovery: ${scenario}`, { timeout: 15_000 }, () => verify(scenario, expectedCaps))
}
