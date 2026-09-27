import { importDsh } from '../../tender-host/src/dsh.ts'
import { registerTaskGuide } from './plugin.ts'

export const name = 'agent-pi-task-guide'
export const inject = ['tools', 'systemPrompt']
const { defineTool } = await importDsh<any>('packages/core/tools/src/index.ts')
export function apply(ctx: any) { registerTaskGuide(ctx, defineTool, process.env.DSH_HOME || '.dsh-home') }
