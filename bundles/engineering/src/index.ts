import { importDsh } from '../../tender-host/src/dsh.ts'
import { registerEngineering } from './plugin.ts'
import { engineeringWorkflow } from './workflow.ts'

export const name = 'agent-pi-engineering'
export const inject = ['tools', 'systemPrompt']
const { defineTool } = await importDsh<any>('packages/core/tools/src/index.ts')
export function apply(ctx: any) {
  registerEngineering(ctx, defineTool)
  ctx.inject(['workbench'], (scope: any) => scope.effect(() => scope.workbench.registerModule({ owner: 'dsh-agent-pi-engineering', workflow: engineeringWorkflow })))
}
