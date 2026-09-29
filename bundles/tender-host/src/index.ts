import { delimiter, join } from 'node:path'
import { attachHttp, setHttpLlm } from './http.ts'
import { registerPrompt } from './prompt.ts'
import { importDsh } from './dsh.ts'
import { repairKimiCodingSettings, migrateRetiredDeepSeekSession } from './llm-settings.ts'
import type { LlmStreamRuntime } from './prompt-optimize.ts'
import { registerProfessionalDepth } from './professional-depth.ts'
import { registerReportSkillRouting } from './report-skill.ts'
import { convertDwgToDxf } from './cad-convert.ts'
import { sessionCwd, textResult } from './cwd.ts'

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
const { createUserMessage } = await importDsh<{
  createUserMessage: (input: {
    content: Array<{ type: 'text'; text: string }>
    source: { kind: 'plugin:tender-host'; form: 'instructions' }
  }) => unknown
}>('packages/llm/llm/src/message.ts')

export function apply(ctx: {
  tools: { register: (definition: unknown) => unknown; schemas: () => Array<{ name: string }> }
  on: (event: string, listener: (...args: any[]) => unknown) => unknown
  systemPrompt?: Parameters<typeof registerPrompt>[0]['systemPrompt']
  get?: (name: string) => unknown
  inject: (deps: string[], callback: (inner: {
    effect: (install: () => (() => void)) => unknown
    webServer?: { register: (route: unknown) => unknown }
    llm?: LlmStreamRuntime
  }) => void) => void
}): void {
  ensureWindowsNativeOpenPath()
  repairKimiCodingSettings()
  ctx.on('agent/created', ({ agent }) => migrateRetiredDeepSeekSession(agent.session))
  registerPrompt(ctx, createUserMessage)
  registerProfessionalDepth(ctx, defineTool)
  registerReportSkillRouting(ctx)
  ctx.tools.register(defineTool({
    name: 'cad_prepare',
    description: 'Convert a workspace DWG to a verified ASCII DXF using the bundled MLightCAD/LibreDWG viewer libraries. Returns the DXF path and source SHA-256; read the DXF for layers, geometry, dimensions, text and blocks, and check the original drawing visually.',
    parameters: { path: { type: 'string', required: true, description: 'Workspace DWG path' } },
    output: { schema: { type: 'json' }, render: (_args: unknown, value: unknown) => [{ type: 'text', text: textResult(value) }] },
    async execute(args: { path: string }, exec: { agent?: { session?: { header?: { cwd?: string } } } }) {
      return textResult(await convertDwgToDxf(sessionCwd(exec), args.path))
    },
  }))
  ctx.inject(['webServer'], (inner) => {
    attachHttp({
      webServer: inner.webServer,
      effect: (fn) => inner.effect(fn),
      getCapabilities: () => ({ workbench: Boolean(ctx.get?.('workbench')), knowledge: Boolean(ctx.get?.('agentPiKnowledge')), taskGuide: Boolean(ctx.get?.('taskGuide')) }),
      getDefaultModel: () => {
        const service = ctx.get?.('agentDefaultModel') as {
          currentSelection?: () => { provider: string; model: string; reasoningEffort?: string }
        } | undefined
        return service?.currentSelection?.()
      },
      getUniver: () => {
        try {
          const service = ctx.get?.('univer')
          return service && typeof service === 'object' ? service as import('./univer-office-open.ts').UniverOfficeService : undefined
        } catch {
          return undefined
        }
      },
    }, 'host')
  })
  ctx.inject(['llm'], (inner) => {
    setHttpLlm(inner.llm)
  })
}
