import { importDsh } from './dsh.ts'
import { applyCodexModelProvider } from './codex-model-bridge.ts'

const official = await importDsh<any>('packages/subagent/subagent-codex/src/index.ts')
export const name = 'agent-pi-codex-provider'
export const inject = official.inject
export const Config = official.Config

export function apply(ctx: any, config: any): void {
  applyCodexModelProvider(ctx, config, official.apply)
}
