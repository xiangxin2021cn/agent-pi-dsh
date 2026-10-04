import assert from 'node:assert/strict'
import { test } from 'node:test'
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
  const calls: any[] = [], appended: any[] = [], pending: any[] = []
  let registered: any, idle = Promise.resolve(), boundProject = false, activation = false
  const registry = {
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
    tools: registry, get: (name: string) => services[name],
    systemPrompt: { assemble: async () => ({ sections: [{ name: 'agent-pi:task', content: 'native professional task' }, { name: 'ptc', content: 'DSH run_code' }], contexts: [] }) },
    on(name: string, listener: any, options: any) { handlers.set(name, listener); if (name === 'agent/pre-step') assert.equal(options.prepend, true); return () => handlers.delete(name) },
    emit(name: string, payload: any) { assert.equal(name, 'agent-pi/business-activation-sync'); assert.equal(payload.agent, agent); activation = boundProject },
  }
  let seq = 0
  const bridge = createCodexToolBridge(ctx, (row) => row, (assembly) => JSON.stringify(assembly), () => '', (row) => ({ id: 'user-' + ++seq, ...row }))
  const identity = { sessionId: sid, cwd, text: 'Calculate from the original BOQ' }
  return { bridge, ctx, agent, services, identity, calls, appended, pending, handlers, block() { blocked = deferred(); return blocked }, bindProject() { boundProject = true } }
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

test('native and both PTC flavors preserve output and the actual execution parent', async (t) => {
  for (const config of [{}, { ptc: true }, { ptc: true, python: true }]) await t.test(JSON.stringify(config), async () => {
    const f = fixture(config)
    const context = await f.bridge.context(f.identity)
    const result = await f.bridge.tool({ ...context, action: 'call', tool: 'task_brief', args: { objective: 'local cost' }, callId: 'c1' })
    assert.equal(result.value.cost, 42)
    const business = f.calls.at(-1)
    assert.equal(business.name, 'task_brief')
    assert.equal(business.parent, config.ptc ? 'ptc-parent' : 'native-parent')
    assert.equal(business.agent, f.agent)
    if (config.ptc) assert.match(f.calls[0].arguments.code, /return await/)
    await f.bridge.release(context)
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
