import { importDsh } from './dsh.ts'
import { applyCodexModelTool } from './codex-model-bridge.ts'

const official = await importDsh<any>('packages/subagent/tool-subagent/lib/index.js')
export const name = 'agent-pi-codex-tool'
export const inject = official.inject
export const Config = official.Config

export function apply(ctx: any, config: any): void {
  applyCodexModelTool(ctx, config, official.apply)
}
