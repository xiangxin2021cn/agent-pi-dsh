import { registerTools } from '../../tender-host/src/tools.ts'
import { attachHttp } from '../../tender-host/src/http.ts'
import { registerKnowledgePrompt } from '../../tender-host/src/prompt.ts'
import { importDsh } from '../../tender-host/src/dsh.ts'

export const name = 'agent-pi-knowledge'
export const inject = ['tools', 'systemPrompt']
const { defineTool } = await importDsh<any>('packages/core/tools/src/index.ts')
export function apply(ctx: any): void {
  ctx.provide('agentPiKnowledge', { apiVersion: 1 })
  registerTools(ctx, defineTool, 'knowledge')
  registerKnowledgePrompt(ctx)
  ctx.inject(['webServer'], (inner: any) => {
    attachHttp({ webServer: inner.webServer, effect: (fn: any) => inner.effect(fn) }, 'knowledge')
  })
}
