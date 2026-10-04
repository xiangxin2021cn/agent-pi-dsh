import assert from 'node:assert/strict'
import { test } from 'node:test'
import { Context } from '../vendor/deepseek-harness/vendor/cordis/lib/index.js'
import SystemPrompt, { renderPrompt } from '../vendor/deepseek-harness/packages/core/system-prompt/lib/index.js'
import { createScope } from '../vendor/deepseek-harness/packages/core/scope/lib/index.js'
import { assembleContextFor } from '../vendor/deepseek-harness/packages/core/agent/lib/index.js'
import * as persona from '../vendor/deepseek-harness/packages/preset/persona/lib/index.js'
import * as router from '../vendor/dsh-router-standard/preset/router-bootstrap.mjs'
import { personaFor, sessionMode } from '../vendor/dsh-router-standard/preset/router-core.mjs'
import { registerPrompt } from '../bundles/tender-host/src/prompt.ts'

for (const preset of ['standard', 'router-standard']) {
  for (const afterToolCall of [false, true]) {
    test(`${preset} preserves one professional judgment section ${afterToolCall ? 'after' : 'before'} the first tool call`, async t => {
      const ctx = new Context()
      t.after(() => ctx.fiber.dispose())
      await ctx.plugin(SystemPrompt, {})
      ctx.provide('tools', { register: () => () => {} })
      ctx.provide('llm', {})
      const events = [{ type: 'user/message', data: { content: [{ type: 'text', text: '修复这个故障' }] } }]
      if (afterToolCall) events.push({ type: 'tool/call', data: {} })
      const agent = { session: { id: `${preset}-${afterToolCall}`, snapshotEvents: () => events }, options: { model: 'deepseek-v4-flash' } }
      let scope
      await ctx.plugin(Object.assign(inner => { scope = createScope(inner, agent) }, { inject: ['systemPrompt', 'tools', 'llm'] }))
      await scope.ctx.plugin(persona, { prefix: 'You are a helpful software engineer assistant.' })
      if (preset === 'router-standard') await scope.ctx.plugin(router, {})
      const app = await ctx.plugin(Object.assign(inner => registerPrompt(inner, value => value), { inject: ['systemPrompt'] }))
      const tools = ['read', 'edit', 'glob', 'grep', 'pwsh', 'extra'].map(name => ({ name, description: name, parameters: { type: 'object', properties: {} } }))
      ctx.systemPrompt.tools(() => ({ schemas: tools }))
      const assemble = () => ctx.systemPrompt.assemble(assembleContextFor(agent))
      const assembly = await assemble()
      const prompt = renderPrompt(assembly)
      assert.equal(assembly.sections.filter(section => section.name === 'agent-pi:professional-judgment').length, 1)
      assert.equal(assembly.contexts.filter(section => section.name === 'agent-pi:professional-judgment').length, 0)
      assert.equal(prompt.split('Professional judgment:').length - 1, 1)
      assert.match(prompt, /Model training memory and common practice are leads, not verified project evidence/)
      assert.match(prompt, /do not mechanically label every sentence or append a rules self-check unless the user requests it/)
      assert.match(prompt, /You are an AI agent powered by DeepSeek Harness/)
      if (preset === 'router-standard') {
        assert.equal(assembly.sections.find(section => section.name === 'router-persona').text, personaFor(sessionMode(agent.session), agent.options.model))
        assert.deepEqual(assembly.contexts, [], 'the actual router clears dynamic contexts')
        assert.equal(assembly.tools.some(tool => tool.name === 'extra'), afterToolCall, 'the application policy must not alter router promotion')
      } else {
        assert.equal(assembly.sections.find(section => section.name === 'deployment:persona-prefix').text, 'You are a helpful software engineer assistant.')
        assert.equal(assembly.tools.some(tool => tool.name === 'extra'), true)
      }
      await app.dispose()
      const unmounted = await assemble()
      assert.equal(unmounted.sections.some(section => section.name === 'agent-pi:professional-judgment'), false)
      assert.match(renderPrompt(unmounted), /helpful software engineer assistant/)
    })
  }
}
