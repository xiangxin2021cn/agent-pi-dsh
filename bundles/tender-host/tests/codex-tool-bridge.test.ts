import assert from 'node:assert/strict'
import { test } from 'node:test'
import { createRequire } from 'node:module'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { createCodexToolBridge } from '../src/codex-tool-bridge.ts'

const sid = 'native-task'
const cwd = process.cwd()
function deferred() {
  let resolve: (value?: any) => void
  const promise = new Promise<any>((done) => { resolve = done })
  return { promise, resolve: resolve! }
}
function fixture({ ptc = false, python = false } = {}) {
  const handlers = new Map<string, any>()
  const calls: any[] = [], appended: any[] = [], pending: any[] = [], presentations: string[] = []
  let registered: any, idle = Promise.resolve(), boundProject = false, activation = false
  const registry = {
    presentAs(mode: string) { presentations.push(mode); return () => presentations.push('restored') },
    register(tool: any) { registered = tool; return () => {} },
    schemas() { return [{ name: 'task_brief', parameters: { type: 'object' } }, ...(activation ? [{ name: 'tender_price', parameters: { type: 'object' } }] : []), { name: 'run_code' }, { name: 'subagent_codex' }, { name: 'workflow' }] },
    get(name: string) { return ptc && name === 'run_code' ? {} : null },
    async execute(call: any): Promise<any> {
      calls.push(call)
      if (call.name === 'run_code') {
        let args
        if (python) { const literal = call.arguments.code.match(/json\.loads\((.*)\)\)/)[1]; args = JSON.parse(JSON.parse(literal)) }
        else args = JSON.parse(call.arguments.code.match(/\((\{.*\})\)/)[1])
        const result = await registered.execute(args, { ...call, token: 'ptc-parent' })
        return { value: { result } }
      }
      if (call.name === registered.name) return { value: await registered.execute(call.arguments, { ...call, token: 'native-parent' }) }
      if (blocked) return blocked.promise
      return { value: { cost: 42, source: 'actual professional tool' } }
    },
  }
  let blocked: ReturnType<typeof deferred> | null = null
  const agent: any = {
    status: 'idle',
    session: { id: sid, header: { cwd }, append(type: string, data: any) { appended.push({ type, data }) }, deriveMessages: () => [] },
    inbox: { get hasPending() { return pending.length > 0 }, prepend(_target: any, message: any) { pending.unshift(message) } },
    ctx: { get: () => registry },
    send(message: any) {
      pending.push(message)
      idle = Promise.resolve().then(async () => {
        const messages = pending.splice(0)
        const outcome = await handlers.get('agent/pre-step')({ agent, messages }, () => { throw new Error('DSH LLM must never execute') })
        assert.equal(outcome.kind, 'reject')
      })
    },
    whenIdle: () => idle,
  }
  const services: any = { agents: { get: (id: string) => id === sid ? agent : null }, workspaceRegistry: { archivedSessionIds: [] }, sandboxPolicy: { resolve: () => ({ mode: 'read-only', workspaceRoot: cwd }) }, ptcRuntime: { language: python ? 'python' : 'typescript' }, taskGuide: { read: () => ({ brief: { objective: 'verified cost' }, requirements: [], plan: [], deliverables: [] }) } }
  const ctx: any = {
    tools: registry, get: (name: string) => services[name], provide: (name: string, value: any) => { services[name] = value },
    systemPrompt: { assemble: async () => ({ sections: [{ name: 'agent-pi:task', content: 'native professional task' }, { name: 'ptc', content: 'DSH run_code' }], contexts: [] }) },
    on(name: string, listener: any, options: any) { handlers.set(name, listener); if (name === 'agent/pre-step') assert.equal(options.prepend, true); return () => handlers.delete(name) },
    emit(name: string, payload: any) { assert.equal(name, 'agent-pi/business-activation-sync'); assert.equal(payload.agent, agent); activation = boundProject },
  }
  let seq = 0
  const bridge = createCodexToolBridge(ctx, (row) => row, (assembly) => JSON.stringify(assembly), () => '', (row) => ({ id: 'user-' + ++seq, role: 'user', ...row }))
  const identity = { sessionId: sid, cwd, text: 'Calculate from the original BOQ' }
  return { bridge, ctx, agent, services, identity, calls, appended, pending, handlers, presentations, transport: () => registered, block() { blocked = deferred(); return blocked }, bindProject() { boundProject = true } }
}

test('native context admits the real user message without a DSH model and inherits read-only permission', async () => {
  const f = fixture()
  const context = await f.bridge.context(f.identity)
  assert.equal(context.sandbox, 'read-only')
  assert.equal(f.appended.length, 1)
  assert.equal(f.appended[0].type, 'user/message')
  assert.equal(f.appended[0].data.source.kind, 'user')
  assert.equal(f.appended[0].data.content[0].text, f.identity.text)
  assert.match(context.developerInstructions, /Codex MAIN/)
  assert.doesNotMatch(context.developerInstructions, /"name":"ptc"/)
  assert.equal(context.dynamicTools[0].inputSchema.type, 'object')
  await assert.rejects(f.bridge.context(f.identity), /执行者/)
  await f.bridge.record({ ...context, text: 'Use verified local resource rates' })
  assert.equal(f.appended.length, 2)
  await f.bridge.release(context)
  await f.bridge.dispose()
})

test('unknown, archived, mismatched or pending sessions cannot acquire native tools', async () => {
  const f = fixture()
  await assert.rejects(f.bridge.context({ ...f.identity, sessionId: 'stranger' }), /加载/)
  await assert.rejects(f.bridge.context({ ...f.identity, cwd: cwd + '/stranger' }), /工作区/)
  f.services.workspaceRegistry.archivedSessionIds.push(sid)
  await assert.rejects(f.bridge.context(f.identity), /归档/)
  f.services.workspaceRegistry.archivedSessionIds = []
  f.pending.push({ id: 'existing-user-request' })
  await assert.rejects(f.bridge.context(f.identity), /待处理/)
  assert.equal(f.pending.length, 1)
  await f.bridge.dispose()
})

test('native requests and steering admit their original human identity to the shared task', async () => {
  const f = fixture()
  const admissions: any[] = []
  f.services.taskGuide.admitHumanMessage = (sessionId: string, text: string, messageId: string) => {
    admissions.push({ sessionId, text, messageId })
  }
  const context = await f.bridge.context({ ...f.identity, text: '确定投标，按计划推进' })
  await f.bridge.record({ ...context, text: '重点是对 BOQ 按页进行详细推导' })
  assert.deepEqual(admissions, f.appended.map(({ data }) => ({
    sessionId: sid, text: data.content[0].text, messageId: data.id,
  })))
  assert.equal(admissions[0].text, '确定投标，按计划推进')
  assert.equal(admissions[1].text, '重点是对 BOQ 按页进行详细推导')
  await f.bridge.release(context)
  await f.bridge.dispose()
})

test('catalogue refreshes the actual business scope after a project is bound; unavailable tools stay restricted', async () => {
  const f = fixture()
  const context = await f.bridge.context(f.identity)
  const request = { ...context, action: 'call', tool: 'tender_price', args: {} }
  assert.deepEqual((await f.bridge.tool({ ...context, action: 'catalogue' })).tools.map((row) => row.name), ['task_brief'])
  await assert.rejects(f.bridge.tool(request), /not available/)
  f.bindProject()
  assert.deepEqual((await f.bridge.tool({ ...context, action: 'catalogue' })).tools.map((row) => row.name), ['task_brief', 'tender_price'])
  assert.equal((await f.bridge.tool(request)).value.cost, 42)
  await assert.rejects(f.bridge.tool({ ...request, lease: 'foreign' }), /失效/)
  await f.bridge.release(context)
  await f.bridge.dispose()
})

test('native scope preserves output and the actual execution parent under every configured PTC flavor', async (t) => {
  for (const config of [{}, { ptc: true }, { ptc: true, python: true }]) await t.test(JSON.stringify(config), async () => {
    const f = fixture(config)
    const context = await f.bridge.context(f.identity)
    const result = await f.bridge.tool({ ...context, action: 'call', tool: 'task_brief', args: { objective: 'local cost' }, callId: 'c1' })
    assert.equal(result.value.cost, 42)
    const business = f.calls.at(-1)
    assert.equal(business.name, 'task_brief')
    assert.equal(business.parent, 'native-parent')
    assert.equal(business.agent, f.agent)
    assert.equal(f.calls[0].name, 'agent_pi_codex_bridge')
    assert.deepEqual(f.presentations, ['native'])
    await f.bridge.release(context)
    assert.deepEqual(f.presentations, ['native', 'restored'])
    await f.bridge.dispose()
  })
})

test('release aborts and drains in-flight professional work before another writer can acquire the task', async () => {
  const f = fixture()
  const context = await f.bridge.context(f.identity)
  const block = f.block()
  const running = f.bridge.tool({ ...context, action: 'call', tool: 'task_brief', args: {} })
  const release = f.bridge.release(context)
  assert.equal(f.calls.at(-1).signal.aborted, true)
  await assert.rejects(f.bridge.context(f.identity), /执行者/)
  block.resolve({ value: { completed: true } })
  await running
  await release
  const fresh = await f.bridge.context(f.identity)
  assert.notEqual(fresh.lease, context.lease)
  await f.bridge.release(fresh)
  await f.bridge.dispose()
})

test('other DSH entry points remain durable and session disposal wakes native cancellation', async () => {
  const f = fixture()
  const context = await f.bridge.context(f.identity)
  const foreign = [{ id: 'workbench-request-1' }, { id: 'workbench-request-2' }]
  await f.handlers.get('agent/pre-step')({ agent: f.agent, messages: foreign }, () => { throw new Error('DSH writer') })
  assert.deepEqual(f.pending, foreign)
  const watch = f.bridge.watch(context)
  f.handlers.get('agent/disposed')({ agent: f.agent })
  assert.deepEqual(await watch, { active: false })
  f.services.agents.get = () => null
  await f.bridge.release(context)
  assert.deepEqual(f.pending, foreign)
  await f.bridge.dispose()
})


test('task interaction is claimed once, preserves the admitted human identity and accepts a fast completed native receipt', async () => {
  const f = fixture(), acknowledgements: any[] = []
  const task = { control: { lastAction: { operationId: 'operation-1' } } }
  f.services.taskGuide = { read: () => task, status: async () => ({ task }), ackUserAction: async (...args: any[]) => { acknowledgements.push(args); return { task, interaction: args[2] } }, admitHumanMessage: () => { throw new Error('Human input was already admitted by task interaction') } }
  const message = { id: 'prepared-human', source: { kind: 'user' }, content: [{ type: 'text', text: 'Only revise the schedule' }] }
  const dispatch = await f.services.nativeTaskExecutor.dispatch({ sessionId: sid, operationId: 'operation-1', kind: 'adjust_request', message })
  assert.equal(dispatch.dispatch, 'requires_executor')
  const command = await f.bridge.interaction({ ...f.identity, operationId: 'operation-1' })
  await assert.rejects(f.bridge.interaction({ ...f.identity, operationId: 'operation-1' }), /正在/)
  await assert.rejects(f.bridge.acknowledgeInteraction({ ...f.identity, operationId: 'operation-1', claim: command.claim, dispatch: 'queued' }), /尚未交给/)
  const context = await f.bridge.context({ ...f.identity, text: message.content[0].text, taskOperationId: 'operation-1', taskClaim: command.claim })
  assert.equal(f.appended[0].data.id, message.id)
  assert.equal(f.appended.length, 1)
  await f.bridge.release(context)
  const receipt = await f.bridge.acknowledgeInteraction({ ...f.identity, lease: context.lease, operationId: 'operation-1', claim: command.claim, dispatch: 'queued', reason: 'Native accepted the turn' })
  assert.equal(receipt.interaction.dispatch, 'queued')
  assert.equal(acknowledgements.length, 1)
  assert.equal((await f.bridge.interaction({ ...f.identity, operationId: 'operation-1' })).completed, true)
  await f.bridge.dispose()
})

test('native pause receipt requires a stopped lease; wrong claims and superseded operations cannot control a task', async () => {
  const f = fixture(), task = { control: { lastAction: { operationId: 'pause-1' } } }
  f.services.taskGuide = { read: () => task, status: async () => ({ task }), ackUserAction: async (_sid: string, _op: string, receipt: any) => ({ task, interaction: receipt }) }
  const context = await f.bridge.context(f.identity)
  await f.services.nativeTaskExecutor.pause(sid, 'pause-1')
  const command = await f.bridge.interaction({ ...f.identity, operationId: 'pause-1' })
  await assert.rejects(f.bridge.acknowledgeInteraction({ ...f.identity, operationId: 'pause-1', claim: 'forged', dispatch: 'paused' }), /不属于/)
  await assert.rejects(f.bridge.acknowledgeInteraction({ ...f.identity, operationId: 'pause-1', claim: command.claim, dispatch: 'paused' }), /尚未确认停止/)
  await f.bridge.cancel(context)
  assert.equal((await f.bridge.acknowledgeInteraction({ ...f.identity, operationId: 'pause-1', claim: command.claim, dispatch: 'paused', reason: 'Stopped' })).interaction.dispatch, 'paused')
  await f.services.nativeTaskExecutor.dispatch({ sessionId: sid, operationId: 'old-operation', kind: 'continue', message: {} })
  assert.equal(f.services.nativeTaskExecutor.status(sid).pending, false)
  await assert.rejects(f.bridge.interaction({ ...f.identity, operationId: 'old-operation' }), /替代/)
  await f.bridge.release(context)
  await f.bridge.dispose()
})


test('native context awaits the official cold-session activation instead of rejecting the visible session', async () => {
  const f = fixture(), activation = deferred()
  let live = false, calls = 0
  f.services.agents.get = (id: string) => id === sid && live ? f.agent : null
  f.services.sessionController = { async resolveAgent(id: string) { calls++; assert.equal(id, sid); await activation.promise; live = true; return { agent: f.agent } } }
  const pending = f.bridge.context(f.identity)
  await Promise.resolve()
  assert.equal(calls, 1)
  assert.equal(f.appended.length, 0, 'no human input or DSH request precedes completed official activation')
  activation.resolve()
  const context = await pending
  assert.equal(context.sessionId, sid)
  assert.equal(f.appended.length, 1)
  await f.bridge.release(context); await f.bridge.dispose()
})

test('cold activation never creates unknown sessions or bypasses archive, cwd, root, or lease checks', async () => {
  for (const scenario of ['unknown', 'archived', 'cwd', 'child', 'lease']) {
    const f = fixture()
    let live = false, calls = 0
    f.services.agents.get = (id: string) => id === sid && live ? f.agent : null
    f.services.sessionController = { async resolveAgent() { calls++; if (scenario === 'unknown') return { error: new Error('session not found') }; live = true; return { agent: f.agent } } }
    if (scenario === 'archived') f.services.workspaceRegistry.archivedSessionIds.push(sid)
    if (scenario === 'child') f.agent.session.header.parentSession = 'real-parent'
    if (scenario === 'lease') await assert.rejects(f.bridge.tool({ ...f.identity, lease: 'unknown-owner', action: 'catalogue' }), /加载/)
    else await assert.rejects(f.bridge.context({ ...f.identity, ...(scenario === 'cwd' ? { cwd: cwd + '/other' } : {}) }), /not found|归档|工作区|主对话/)
    assert.equal(calls, ['archived', 'lease'].includes(scenario) ? 0 : 1)
    assert.equal(f.appended.length, 0)
    await f.bridge.dispose()
  }
})

const dshRequire = createRequire(new URL('../../../vendor/deepseek-harness/packages/core/tools/package.json', import.meta.url))
const dshModule = (name: string) => import(pathToFileURL(dshRequire.resolve(name)).href)

async function realRuntimeFixture(t: any) {
  const [{ Context }, { default: SystemPrompt }, { default: ToolRuntime, defineTool }, { createScope }, { Session, SessionId }, { PtcRuntime }] = await Promise.all([
    dshModule('@deepseek-ai/cordis'), dshModule('@deepseek-ai/dsh-system-prompt'), dshModule('@deepseek-ai/dsh-tools'), dshModule('@deepseek-ai/dsh-scope'), dshModule('@deepseek-ai/dsh-session'), dshModule('@deepseek-ai/dsh-ptc-runtime'),
  ])
  const runtime = new Context()
  await runtime.plugin(SystemPrompt)
  await runtime.plugin(ToolRuntime, { mode: 'ptc' })
  runtime.provide('workingDirectory', { ensure: async () => cwd })
  class TestPtcRuntime extends PtcRuntime {
    language = 'typescript'
    isolation = 'fixture'
    resolve(request: any) { return { ...request, cwd, timeoutMs: 1000 } }
    async run(request: any) { return { logs: [], value: await request.bindings[0].functions.task_brief({ objective: 'legacy' }) } }
  }
  await runtime.plugin(TestPtcRuntime)
  const f = fixture({ ptc: true })
  const session = Session.create(SessionId(sid), undefined, { version: 4, id: sid, createdAt: Date.now(), isSeeded: false, delegationDepth: 0, cwd })
  f.agent.session = session
  await runtime.plugin(Object.assign((inner: any) => { f.agent.ctx = createScope(inner, f.agent).ctx }, { inject: ['tools', 'systemPrompt'] }))
  const tools = f.agent.ctx.tools
  tools.register(defineTool(f.transport()))
  const effects: any[] = []
  let failure = false
  let blocked: ReturnType<typeof deferred> | undefined
  tools.register(defineTool({ name: 'task_brief', description: 'Actual professional fixture', parameters: { objective: { type: 'string' } }, output: { schema: { type: 'json' }, render: (_: any, value: any) => [{ type: 'text', text: JSON.stringify(value) }] },
    async execute(args: any, exec: any) { effects.push({ args, exec }); if (blocked) await blocked.promise; if (failure) throw new Error('professional tool failed'); return { cost: 42 } },
  }))
  let turn = 0, admission: Promise<any> = Promise.resolve()
  const send = f.agent.send.bind(f.agent), whenIdle = f.agent.whenIdle.bind(f.agent)
  f.agent.send = (message: any) => {
    session.append('turn/start', { turn: ++turn })
    send(message)
    admission = whenIdle().finally(() => session.append('turn/end', { turn, reason: { kind: 'blocked' } }))
  }
  f.agent.whenIdle = () => admission
  const root = await mkdtemp(join(tmpdir(), 'agent-pi-codex-bridge-'))
  const persistence = await import(new URL('../../../vendor/deepseek-harness/packages/session/session-persistence-jsonl/lib/index.js', import.meta.url).href)
  await runtime.plugin(persistence, { root, compression: 'zstd' })
  t.after(async () => { await f.bridge.dispose(); await runtime.fiber.dispose(); await rm(root, { recursive: true, force: true }) })
  async function reload() {
    const writer = await runtime.sessionPersistence.create(session.header)
    try { await writer.append(session.snapshotEvents()) } finally { await writer.close() }
    const reader = await runtime.sessionPersistence.open(session.id, 'read')
    try { return await reader.read() } finally { await reader.close() }
  }
  return { ...f, tools, runtime, session, effects, reload, fail() { failure = true }, block() { blocked = deferred(); return blocked } }
}

test('the former idle run_code strategy persists an invalid PTC tail rejected by the strict loader', async (t) => {
  const f = await realRuntimeFixture(t)
  f.session.append('turn/start', { turn: 1 })
  f.session.append('turn/end', { turn: 1, reason: { kind: 'completed' } })
  const result = await f.tools.execute({ name: 'run_code', callId: 'codex-legacy', arguments: { code: 'legacy', description: 'Legacy idle transport' }, agent: f.agent, signal: new AbortController().signal })
  assert.equal(result.isError, false)
  assert.deepEqual(f.session.snapshotEvents().slice(2).map((row: any) => row.type), ['tool/ptc-dispatch-start', 'tool/ptc-dispatch'])
  await assert.rejects(f.reload(), /ptc-dispatch-start is outside an open turn/)
})

test('real native scoped calls preserve policy and parent tokens and reload after success and failure', async (t) => {
  const f = await realRuntimeFixture(t)
  assert.ok(f.tools.get('run_code', f.agent))
  const context = await f.bridge.context(f.identity)
  assert.equal(f.tools.get('run_code', f.agent), undefined)
  const policy: string[] = []
  let denied = false, transportToken: any
  f.runtime.on('tools/pre-execute', (exec: any, next: any) => { policy.push(exec.name); if (exec.name === 'agent_pi_codex_bridge') transportToken = exec.token; return denied && exec.name === 'task_brief' ? { kind: 'deny', reason: 'scope denies this call' } : next() })
  const result = await f.bridge.tool({ ...context, action: 'call', tool: 'task_brief', args: { objective: 'verified' }, callId: 'native-success' })
  assert.equal(result.value.cost, 42)
  assert.equal(f.effects[0].exec.parent, transportToken)
  assert.equal(f.effects[0].exec.rootCallId, 'codex-native-success')
  assert.deepEqual(policy, ['agent_pi_codex_bridge', 'task_brief'])
  f.fail()
  const failure = await f.bridge.tool({ ...context, action: 'call', tool: 'task_brief', args: {}, callId: 'native-failure' })
  assert.equal(failure.isError, true)
  assert.equal(failure.error.message, 'professional tool failed')
  denied = true
  const denial = await f.bridge.tool({ ...context, action: 'call', tool: 'task_brief', args: {}, callId: 'native-denied' })
  assert.equal(denial.isError, true)
  assert.match(denial.error.message, /scope denies this call/)
  assert.equal(f.effects.length, 2)
  await f.bridge.release(context)
  assert.ok(f.tools.get('run_code', f.agent))
  assert.deepEqual(f.session.snapshotEvents().map((row: any) => row.type), ['turn/start', 'user/message', 'turn/end'])
  const restored = await f.reload()
  assert.deepEqual(restored.events, f.session.snapshotEvents())
})

test('native presentation restores after failed preparation, drained cancellation, scope conflict and disposal', async (t) => {
  const f = await realRuntimeFixture(t)
  const assemble = f.ctx.systemPrompt.assemble
  f.ctx.systemPrompt.assemble = async () => { throw new Error('context preparation failed') }
  await assert.rejects(f.bridge.context(f.identity), /context preparation failed/)
  assert.ok(f.tools.get('run_code', f.agent))
  f.ctx.systemPrompt.assemble = assemble
  const context = await f.bridge.context(f.identity), block = f.block()
  const running = f.bridge.tool({ ...context, action: 'call', tool: 'task_brief', args: {} })
  while (!f.effects.length) await new Promise(resolve => setImmediate(resolve))
  const cancel = f.bridge.cancel(context)
  assert.equal(f.effects[0].exec.signal.aborted, true)
  assert.equal(f.tools.get('run_code', f.agent), undefined)
  block.resolve()
  assert.equal((await running).isError, true)
  await cancel
  assert.ok(f.tools.get('run_code', f.agent))
  await f.bridge.release(context)
  const restore = f.tools.presentAs('ptc')
  await assert.rejects(f.bridge.context(f.identity), /conflicts/)
  assert.ok(f.tools.get('run_code', f.agent))
  restore()
  const fresh = await f.bridge.context(f.identity)
  await f.bridge.dispose()
  assert.ok(f.tools.get('run_code', f.agent))
  await assert.rejects(f.bridge.tool({ ...fresh, action: 'catalogue' }), /失效/)
  assert.deepEqual((await f.reload()).events, f.session.snapshotEvents())
})
