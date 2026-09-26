import { WORKFLOWS } from '../../tender-host/src/workflows.ts'
import type { WorkbenchRegistry } from '../../../packages/business-projects/workbench-registry.ts'
export const name = 'agent-pi-workbench-investment'
export const inject = ['workbench']
export function apply(ctx: { workbench: WorkbenchRegistry; effect: (install: () => (() => void)) => unknown }): void {
  ctx.effect(() => ctx.workbench.registerModule({ owner: 'dsh-agent-pi-workbench-investment', workflow: WORKFLOWS.investment }))
}
