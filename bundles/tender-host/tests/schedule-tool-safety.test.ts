import assert from 'node:assert/strict'
import { test } from 'node:test'
import { registerScheduleToolSafety } from '../src/schedule-tool-safety.ts'
import { importDsh } from '../src/dsh.ts'

test('the real native pipeline denies host task tools and preserves other results, errors and cancellation', async () => {
  const { Context }: any = await importDsh('vendor/cordis/lib/index.js')
  const tools: any = await importDsh('packages/core/tools/lib/index.js')
  const prompt: any = await importDsh('packages/core/system-prompt/lib/index.js')
  const executor: any = await importDsh('packages/core/tool-executor-native/lib/index.js')
  const { HarnessError }: any = await importDsh('packages/llm/llm/lib/index.js')
  const ctx = new Context()
  let bodyCalls = 0, hostCalls = 0, failure = false
  const names = ['schedule_create', 'schedule_list', 'schedule_view', 'schedule_edit']
  const deferred = { id: 'neutral-context', role: 'user', content: [{ type: 'text', text: 'Keep this context.' }], source: { kind: 'plugin:schedule-safety-test', form: 'instructions' } }
  try {
    await ctx.plugin(prompt.default); await ctx.plugin(tools.default); await ctx.plugin(executor)
    for (const name of [...names, 'schedule_analysis']) ctx.tools.register(tools.defineTool({
      name, description: 'Isolated fixture only', parameters: {},
      output: { schema: { type: 'json' }, render: (_args: unknown, value: unknown) => [{ type: 'text', text: JSON.stringify(value) }] },
      execute(_args: unknown, exec: any) {
        if (names.includes(name)) { hostCalls++; throw new Error('Host task body must never run') }
        bodyCalls++
        if (failure) throw new HarnessError('original fixture failure', 'ORIGINAL_FAILURE')
        exec.deferContext(deferred); exec.concludeTurn(); return { preserved: true }
      },
    }))
    const run = async (name: string, signal = new AbortController().signal) => (await ctx.tools.execute({ calls: [{ type: 'tool-call', id: 'neutral-call', name, arguments: '{}' }], signal })).results[0].result
    const baseline = await run('schedule_analysis')
    registerScheduleToolSafety(ctx)
    await new Promise(resolve => setImmediate(resolve))
    const guarded = await run('schedule_analysis')
    assert.deepEqual(guarded, baseline)
    assert.deepEqual(guarded.additionalContexts, [deferred]); assert.equal(guarded.concludesTurn, true)
    for (const name of names) {
      const result = await run(name)
      assert.equal(result.isError, true)
      assert.equal(result.error.info.code, 'SCHEDULE_SESSION_SCOPE_UNVERIFIED')
    }
    assert.equal(hostCalls, 0)
    failure = true
    assert.equal((await run('schedule_analysis')).error.info.code, 'ORIGINAL_FAILURE')
    const controller = new AbortController(); controller.abort()
    const before = bodyCalls
    assert.equal((await run('schedule_list', controller.signal)).error.info.code, 'ABORTED_BEFORE_DISPATCH')
    assert.equal(bodyCalls, before); assert.equal(hostCalls, 0)
  } finally { await ctx.fiber.dispose() }
})
