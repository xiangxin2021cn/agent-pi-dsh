import { withOfficePdfSafety } from './office-pdf-safety.ts'

/** Keep the native tool's authorized paths, arguments, result and cancellation unchanged. */
export function registerOfficePdfToolSafety(ctx: { inject: (deps: string[], callback: (scope: any) => void) => unknown }, runSafety = withOfficePdfSafety): void {
  ctx.inject(['tools', 'univer'], scope => {
    scope.on('tools/execute', async (exec: { name: string; signal: AbortSignal }, next: () => Promise<any>) => {
      if (exec.name !== 'univer_print_pdf' || exec.signal.aborted) return next()
      const nativeFailure = {}
      let failedResult: any
      try {
        return await runSafety(async () => {
          const result = await next()
          if (result.isError) { failedResult = result; throw nativeFailure }
          return result
        }, { service: scope.univer })
      } catch (error) {
        if (error === nativeFailure) return failedResult
        throw error
      }
    })
  })
}
