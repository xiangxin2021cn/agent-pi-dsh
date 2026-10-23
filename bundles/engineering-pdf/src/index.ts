import { importDsh } from '../../tender-host/src/dsh.ts'
import { registerEngineeringPdf } from './plugin.ts'

export const name = 'agent-pi-engineering-pdf'
export const inject = ['tools', 'systemPrompt']
const { defineTool } = await importDsh<any>('packages/core/tools/lib/index.js')
export function apply(ctx: any) { registerEngineeringPdf(ctx, defineTool) }
