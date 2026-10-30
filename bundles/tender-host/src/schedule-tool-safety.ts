import { importDsh } from './dsh.ts'

const { HarnessError } = await importDsh<{ HarnessError: new (message: string, code: string) => Error }>('packages/llm/llm/lib/index.js')
const hostTaskTools = new Set(['schedule_create', 'schedule_list', 'schedule_view', 'schedule_edit'])

/** Old tasks have no stable owner; keep model calls from gaining host-wide authority. */
export function registerScheduleToolSafety(ctx: { inject: (deps: string[], callback: (scope: any) => void) => unknown }): void {
  ctx.inject(['tools'], scope => {
    scope.on('tools/execute', (exec: { name: string; signal: AbortSignal }, next: () => Promise<any>) => {
      if (!hostTaskTools.has(exec.name) || exec.signal.aborted) return next()
      throw new HarnessError('Manage automatic tasks in the Automation page. Model calls cannot manage host-wide tasks without a verifiable Session owner.', 'SCHEDULE_SESSION_SCOPE_UNVERIFIED')
    })
  })
}
