import { importDsh } from '../../tender-host/src/dsh.ts'
import { createBimProvider } from './provider.ts'
import { runBim } from '../../../packages/engineering-bim/index.ts'
export const name = 'agent-pi-engineering-bim'
export const inject = ['engineering', 'tools']
const { defineTool } = await importDsh<any>('packages/core/tools/src/index.ts')

export function apply(ctx: any, config: { pythonPath?: string; timeoutMs?: number } = {}) {
  const provider = createBimProvider(config)
  ctx.effect(() => ctx.engineering.providers.register(provider))
  ctx.tools.register(defineTool({
    name: 'bim_engine_health', description: '检查本机实际 Python/IfcOpenShell 能力及预算；IFC 操作使用 engineering_project run 的 bim-ifc provider 保存来源、结果和缺口。',
    parameters: {},
    output: { schema: { type: 'json' }, render: (_args: unknown, value: unknown) => [{ type: 'text', text: JSON.stringify(value) }] },
    execute: (_args: unknown, exec: any) => {
      const cwd = exec.agent?.session?.header?.cwd
      if (!cwd) throw new Error('BIM 引擎检查需要当前会话工作目录。')
      return runBim(cwd, { action: 'health' }, { ...config, signal: exec.signal })
    },
  }))
  ctx.inject?.(['professionalCapabilities'], (scope: any) => scope.effect(() => scope.professionalCapabilities.register({
    id: 'engineering-bim:ifc', owner: 'dsh-agent-pi-engineering-bim', version: '3.8.0', title: provider.title,
    description: 'IFC 元素、空间、属性与原生数量查询，几何量和预览，显式参数生成矩形构件 IFC。',
    professions: ['quantity', 'construction'], tools: ['engineering_project', 'bim_engine_health'], skills: [],
    inputs: ['工作目录内实际 IFC 或明确的构件尺寸与坐标'], outputs: ['可定位构件记录、原生 QTO、几何量、预览网格或新 IFC'],
    limitations: provider.limitations, supplements: ['核对来源、比例、开口、未处理范围和专业规则'],
  })))
}
