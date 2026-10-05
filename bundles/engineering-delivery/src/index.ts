import { importDsh } from '../../tender-host/src/dsh.ts'
import { registerEngineeringDelivery } from './plugin.ts'
export const name = 'agent-pi-engineering-delivery'
export const inject = ['engineering', 'tools', 'systemPrompt']
const { defineTool } = await importDsh<any>('packages/core/tools/src/index.ts')
export function apply(ctx: any) { registerEngineeringDelivery(ctx, defineTool) }
