import { WORKFLOWS } from '../../tender-host/src/workflows.ts'
import type { WorkbenchRegistry } from '../../../packages/business-projects/workbench-registry.ts'
import { registerWorkbenchTools } from '../../workbench/src/tools.ts'
import { registerProfessionalDomain } from '../../task-guide/src/domain.ts'
export const name = 'agent-pi-workbench-tender'
export const inject = ['workbench', 'tools']
export function apply(ctx: { workbench: WorkbenchRegistry; effect: (install: () => (() => void)) => unknown }): void {
  ctx.effect(() => ctx.workbench.registerModule({ owner: 'dsh-agent-pi-workbench-tender', workflow: WORKFLOWS.tender }))
  registerWorkbenchTools(ctx, ctx.workbench, 'tender')
  registerProfessionalDomain(ctx, 'tender')
}
