import { importDsh } from '../../tender-host/src/dsh.ts'
import { registerCad } from './plugin.ts'
export const name = 'agent-pi-engineering-cad'
export const inject = ['tools', 'systemPrompt']
const { defineTool } = await importDsh<any>('packages/core/tools/lib/index.js')
export function apply(ctx: any) { registerCad(ctx, defineTool) }
