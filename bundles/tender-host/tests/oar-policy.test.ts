import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { test } from 'node:test'
import { pathToFileURL } from 'node:url'
import Tools, { defineTool } from '../../../vendor/deepseek-harness/packages/core/tools/lib/index.js'
import { ToolExecutionPipeline } from '../../../vendor/deepseek-harness/packages/core/tools/lib/pipeline.js'
import SystemPrompt from '../../../vendor/deepseek-harness/packages/core/system-prompt/lib/index.js'
import { createScope } from '../../../vendor/deepseek-harness/packages/core/scope/lib/index.js'
import * as oarTool from '../../../vendor/deepseek-harness/packages/experimental/tool-subagent-oar/lib/index.js'
import { captureOarActorPolicy, registerOarPolicyGuard } from '../src/oar-policy.ts'

const nativeRequire = createRequire(new URL('../../../vendor/deepseek-harness/packages/core/tools/package.json', import.meta.url))
const { Context } = await import(pathToFileURL(nativeRequire.resolve('@deepseek-ai/cordis')).href)
const args = { runtime: 'codex', description: 'Inspect neutral fixture', prompt: 'Use only the neutral fixture.', cwd: '../other-fixture' }

async function fixture(t: any) {
  const ctx = new Context()
  t.after(() => ctx.fiber.dispose())
  await ctx.plugin(SystemPrompt, {})
  await ctx.plugin(Tools)
  const policy: any = { mode: 'danger-full-access', approval: 'never', preset: 'danger-full-access' }
  const session = { id: 'session-oar-policy', header: { cwd: 'isolated-fixture' } }
  const services = new Map<string, any>([
    ['sandboxPolicy', { resolve(input: any) { assert.equal(input.session, session); return { mode: policy.mode } } }],
    ['approval', { overrideOf(value: any) { assert.equal(value, session); return policy.approval }, config: { policy: 'ask' } }],
    ['permissionPresets', { current(value: any) { assert.equal(value, session); return policy.preset } }],
  ])
  const actor: any = { id: session.id, session, ctx: { get: (name: string) => services.get(name) } }
  await ctx.plugin(Object.assign((inner: any) => { createScope(inner, actor) }, { inject: ['tools', 'systemPrompt'] }))
  const activations: any[] = []
  oarTool.apply({ tools: ctx.tools, subagents: {
    getProvider: () => ({ inheritsParentContext: false }),
    async startActivation(input: any) { activations.push(input); return { childId: 'isolated-oar-child' } },
  } } as any, { providers: { codex: 'oar-codex', claude: 'oar-claude' } })
  registerOarPolicyGuard(ctx)
  // Even an upstream reviewer/listener returning allow cannot relax a guard.
  ctx.on('tools/pre-execute', async (_exec: any, next: any) => { await next(); return { kind: 'allow' } })
  let call = 0
  const run = async (name = 'subagent_oar', parent?: any, value: any = args) => {
    const pipeline = new ToolExecutionPipeline(ctx)
    const prepared = await pipeline.prepare({ agent: actor, name, arguments: value, callId: `call-${++call}`, signal: new AbortController().signal, ...(parent ? { parent } : {}) } as any)
    const outcome = prepared.kind === 'dispatch' ? await pipeline.dispatch(prepared.exec) : prepared
    return pipeline.complete(prepared.exec, outcome)
  }
  return { ctx, actor, policy, services, activations, run }
}

test('native pipeline denies constrained or unverifiable actors before official OAR activation', async t => {
  const f = await fixture(t)
  for (const [mode, approval, preset] of [
    ['read-only', 'never', 'read-only'], ['workspace-write', 'never', 'workspace-write'],
    ['danger-full-access', 'ask', 'danger-full-access'], ['danger-full-access', 'never', 'auto'],
    ['danger-full-access', 'never', undefined], ['danger-full-access', 'never', ''],
  ]) {
    Object.assign(f.policy, { mode, approval, preset })
    const result = await f.run()
    assert.equal(result.isError, true, `${mode}/${approval}/${preset}`)
    assert.match(JSON.stringify(result.content), /Continue with DSH native tools/)
  }
  Object.assign(f.policy, { mode: 'danger-full-access', approval: 'never', preset: 'danger-full-access' })
  for (const name of ['sandboxPolicy', 'approval', 'permissionPresets']) {
    const original = f.services.get(name)
    f.services.delete(name)
    assert.equal((await f.run()).isError, true, `missing ${name}`)
    f.services.set(name, original)
  }
  f.actor.id = 'different-session'
  assert.equal((await f.run()).isError, true, 'the actor and policy session identities must match')
  f.actor.id = f.actor.session.id
  const actorContext = f.actor.ctx
  f.actor.ctx = undefined
  assert.equal((await f.run()).isError, true, 'a missing actor context cannot borrow the privileged global context')
  f.actor.ctx = actorContext
  f.services.set('sandboxPolicy', { resolve() { throw new Error('unavailable policy') } })
  assert.equal((await f.run()).isError, true)
  assert.equal(f.activations.length, 0, 'no CLI or activation is started, including an outside relative cwd')
})

test('only full access, never approval and a non-Auto preset produce an immutable actor proof and delegate', async t => {
  const f = await fixture(t)
  const proof = captureOarActorPolicy(f.actor)
  assert.deepEqual(proof, { actorSessionId: f.actor.id, sandboxMode: 'danger-full-access', approvalPolicy: 'never', permissionPreset: 'danger-full-access' })
  assert.equal(Object.isFrozen(proof), true)
  const before = JSON.stringify(f.policy)
  assert.equal((await f.run()).isError, false)
  assert.equal(f.activations.length, 1)
  assert.equal(f.activations[0].request.parent, f.actor)
  assert.equal(f.activations[0].provider, 'oar-codex')
  assert.equal(JSON.stringify(f.policy), before, 'admission does not modify permissions')
  assert.deepEqual(f.ctx.get('agentPiOarPolicy'), { apiVersion: 1, toolName: 'subagent_oar', enforcement: 'admission-only' })
  f.policy.approval = undefined
  assert.equal((await f.run()).isError, true, 'missing override falls back to the real configured ask policy')
  f.services.get('approval').config.policy = 'never'
  assert.equal((await f.run()).isError, false)
})

test('the actual scoped actor policy governs nested calls while native DSH tools remain usable', async t => {
  const f = await fixture(t)
  f.policy.mode = 'read-only'
  // A privileged global policy cannot substitute for the actual actor's scope.
  f.ctx.provide('sandboxPolicy', { resolve: () => ({ mode: 'danger-full-access' }) })
  f.ctx.tools.register(defineTool({ name: 'native_read', description: 'Read neutral fixture', parameters: {},
    output: { schema: { type: 'string' }, render: (_args: any, value: any) => [{ type: 'text', text: value }] }, execute: async () => 'fixture text' }))
  let nested: any
  f.ctx.tools.register(defineTool({ name: 'fixture_composite', description: 'Nested dispatch fixture', parameters: {},
    output: { schema: { type: 'string' }, render: (_args: any, value: any) => [{ type: 'text', text: value }] },
    async execute(_args: any, exec: any) { nested = await f.run('subagent_oar', exec.token); return 'nested checked' } }))
  assert.equal((await f.run('fixture_composite', undefined, {})).isError, false)
  assert.equal(nested.isError, true)
  assert.equal(f.activations.length, 0)
  assert.equal((await f.run('native_read', undefined, {})).isError, false)
})

test('policy changes while pre-execute awaits are checked at final tool admission', async t => {
  const f = await fixture(t)
  const entered = Promise.withResolvers<void>(), release = Promise.withResolvers<void>()
  f.ctx.on('tools/pre-execute', async (_exec: any, next: any) => { entered.resolve(); await release.promise; return next() }, { prepend: true })
  const result = f.run()
  await entered.promise
  f.policy.mode = 'workspace-write'
  release.resolve()
  assert.equal((await result).isError, true)
  assert.equal(f.activations.length, 0)
})
