import { importDsh } from './dsh.ts'
import { withBusinessGoalBoundary } from './business-activation.ts'

const official = await importDsh<any>('packages/goal/goal-round-driver/src/index.ts')
export const name = 'agent-pi-goal-round-driver'
export const inject = official.inject

export function apply(ctx: any): void {
  official.apply(withBusinessGoalBoundary(ctx))
}
