import { WorkbenchRegistry } from '../../../packages/business-projects/workbench-registry.ts'
import { registerWorkbenchTools } from './tools.ts'
import { attachHttp } from '../../tender-host/src/http.ts'
import { registerWorkbenchPrompt } from '../../tender-host/src/prompt.ts'
import { registerBusinessActivation } from '../../tender-host/src/business-activation.ts'
import { registerLongTaskHost } from '../../tender-host/src/long-task-host.ts'
import { importDsh } from '../../tender-host/src/dsh.ts'

const { createUserMessage } = await importDsh<any>('packages/llm/llm/src/message.ts')

export const name = 'agent-pi-workbench'
export const inject = ['tools', 'systemPrompt']

export function apply(ctx: any): void {
  const registry = new WorkbenchRegistry(() => Boolean(ctx.get('agentPiKnowledge')))
  ctx.provide('workbench', registry)
  registerWorkbenchTools(ctx, registry, 'workbench')
  registerWorkbenchPrompt(ctx, registry)
  registerBusinessActivation(ctx)
  const longTasks = registerLongTaskHost(ctx, createUserMessage)
  ctx.inject(['webServer'], (inner: any) => {
    attachHttp({ webServer: inner.webServer, effect: (fn: any) => inner.effect(fn), run: (fn: any) => registry.run(fn),
      syncWorkbenchProject: (cwd, projectId, module) => ctx.get('taskGuide')?.syncWorkbenchProject?.(cwd, projectId, module),
      registerControlPrompt: (sessionId, text) => ctx.get('taskGuide')?.registerControlPrompt?.(sessionId, text),
      longTasks,
      get taskGuide() { return ctx.get('taskGuide') },
      getAgent: id => ctx.get('agents')?.get(id),
    }, 'workbench')
  })
}
