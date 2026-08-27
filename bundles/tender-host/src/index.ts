import { delimiter, join } from 'node:path'
import { registerTools } from './tools.ts'
import { attachHttp, setHttpLlm } from './http.ts'
import { registerPrompt } from './prompt.ts'
import { importDsh } from './dsh.ts'
import { repairKimiCodingSettings } from './llm-settings.ts'
import type { LlmStreamRuntime } from './prompt-optimize.ts'

/**
 * Packaged Electron often hands the host a PATH that has System32 but not
 * PowerShell. Chat file links then fail with `spawn pwsh.exe ENOENT`.
 * Prefer PowerShell 7; keep Windows PowerShell 5.1 as fallback.
 */
function ensureWindowsNativeOpenPath(): void {
  if (process.platform !== 'win32') return
  const root = process.env.SystemRoot || process.env.WINDIR || 'C:\\Windows'
  if (!process.env.SystemRoot) process.env.SystemRoot = root
  const programFiles = process.env.ProgramFiles || 'C:\\Program Files'
  const extra = [
    join(programFiles, 'PowerShell', '7'),
    join(root, 'System32', 'WindowsPowerShell', 'v1.0'),
    join(root, 'System32'),
  ]
  const current = process.env.PATH || ''
  const lower = current.toLowerCase()
  const prefix = extra.filter((dir) => dir && !lower.includes(dir.toLowerCase()))
  if (prefix.length === 0) return
  process.env.PATH = [...prefix, current].filter(Boolean).join(delimiter)
}

export const name = 'tender-host'
export const inject = ['tools', 'systemPrompt']

const { defineTool } = await importDsh<{ defineTool: (options: Record<string, unknown>) => unknown }>('packages/core/tools/src/index.ts')

export function apply(ctx: {
  tools: { register: (definition: unknown) => unknown }
  systemPrompt?: {
    section: (section: { name: string; order: number; text: string }) => unknown
    context?: (context: { name: string; order: number; text: string | (() => string) }) => unknown
  }
  get?: (name: string) => unknown
  inject: (deps: string[], callback: (inner: {
    webServer?: { register: (route: unknown) => unknown }
    llm?: LlmStreamRuntime
  }) => void) => void
}): void {
  ensureWindowsNativeOpenPath()
  repairKimiCodingSettings()
  registerPrompt(ctx)
  registerTools({ tools: ctx.tools }, defineTool)
  ctx.inject(['webServer'], (inner) => {
    attachHttp({
      webServer: inner.webServer,
      getUniver: () => {
        try {
          const service = ctx.get?.('univer')
          return service && typeof service === 'object' ? service as import('./univer-office-open.ts').UniverOfficeService : undefined
        } catch {
          return undefined
        }
      },
    })
  })
  ctx.inject(['llm'], (inner) => {
    setHttpLlm(inner.llm)
  })
}
