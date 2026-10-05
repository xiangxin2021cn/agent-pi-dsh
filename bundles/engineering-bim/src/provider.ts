import { runBim, BIM_LIMITS } from '../../../packages/engineering-bim/index.ts'
import type { BimRequest, BimEngineOptions } from '../../../packages/engineering-bim/index.ts'
import type { EngineeringProvider, EngineeringProject, EngineeringExecutionContext } from '../../../packages/engineering-core/index.ts'

export type BimProviderInput = Extract<BimRequest, { action: 'health' | 'generate' }>
  | { action: 'inventory' | 'query' | 'geometry' | 'preview'; sourceId: string; offset?: number; limit?: number; types?: string[]; globalIds?: string[]; maxTriangles?: number }

function parse(raw: unknown): BimProviderInput {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw new Error('BIM 输入需要明确动作对象。')
  const input = raw as BimProviderInput
  if (!['health', 'generate', 'inventory', 'query', 'geometry', 'preview'].includes(input.action)) throw new Error('未知 BIM 动作。')
  if (input.action !== 'health' && input.action !== 'generate' && (!input.sourceId || typeof input.sourceId !== 'string')) throw new Error('IFC 读取需要工程账本中的 sourceId。')
  if (input.action === 'generate' && (!input.outputPath || !Array.isArray(input.components))) throw new Error('参数建模需要新 outputPath 和明确 components。')
  return structuredClone(input)
}

export function createBimProvider(options: Omit<BimEngineOptions, 'signal'> = {}): EngineeringProvider {
  return {
    id: 'bim-ifc', version: '5.8.0', title: 'IFC 模型、几何算量与参数建模', dependencies: [],
    limitations: ['需已配置 Python 与 IfcOpenShell；已验证 0.8.5。', '当前仅处理本会话工作目录内的 IFC STEP；不读取 DWG/PDF，不自动从图纸完整建模。', '几何量、原生 QTO、合同量和下料量分别表达；开口失败、未选构件和缺失对象不按零计。', '参数建模限明确尺寸的矩形梁、板和代理构件；无结构验算、完整道路地形、钢筋节点或自动加工批准。'],
    inputDescription: [
      '{action:"health"} checks the actual configured engine.',
      '{action:"inventory"|"query"|"geometry"|"preview",sourceId,offset?:0,limit?,types?:["IfcBeam"],globalIds?:["..."],maxTriangles?}. First register the real IFC path/SHA in engineering_project.sources. Every read run MUST include dependencies:[{kind:"source",id:sourceId}]. File must be inside root session cwd.',
      `Query max ${BIM_LIMITS.queryElements} elements/page; geometry/preview max ${BIM_LIMITS.geometryElements}, default 10; triangle budget default 20000 for preview or 50000 for geometry, maximum 50000. Query returns nativeQTO separately; geometry yields GlobalId, sourceSha256, net/gross/opening volume, surface area, formula, errors and needs_review. Preview returns actual {originMeters,vertices,triangles} per GlobalId for local mesh rendering. No pixels rendered by this provider.`,
      '{action:"generate",outputPath:"new-model.ifc",projectName,components:[{id,type:"IfcBeam"|"IfcSlab"|"IfcBuildingElementProxy",name,sizeMeters:[lengthX,widthY,heightZ],positionMeters:[x,y,z],rotationDegrees?:0}]}. Position is the local minimum corner in explicit engineering metres; rotation about local Z. Output must be a NEW file inside cwd; parent directory must already exist. At most 200 components. No inferred dimensions.',
      'Generated result.source has actual path/hash; register it via engineering_project update before reading or calculating it. Generated source is not silently trusted as original drawing evidence. Preserve returned unsupported and unprocessed scopes. Worker has a default 30-second and maximum 120-second host timeout; absence of engine is an explicit capability gap.',
    ].join('\n'),
    parse,
    audit(raw, project) {
      const input = parse(raw)
      if (input.action === 'health' || input.action === 'generate') return []
      const source = project.sources.find(value => value.id === input.sourceId)
      return !source || !source.path || source.status !== 'active'
        ? [{ code: 'ifc-source-unavailable', severity: 'error', message: 'IFC 来源必须已登记实际文件路径、哈希及有效状态。' }] : []
    },
    async execute(raw: unknown, project: EngineeringProject, context?: EngineeringExecutionContext) {
      const input = parse(raw)
      if (!context?.cwd) throw new Error('IFC provider 缺少宿主可信工作目录，不能使用输入自行指定的 cwd。')
      let request: BimRequest
      if (input.action === 'health' || input.action === 'generate') request = input
      else {
        const source = project.sources.find(value => value.id === input.sourceId)
        if (!source?.path || source.status !== 'active') throw new Error('IFC 来源未登记或已失效。')
        if (!context.dependencies?.some(value => value.kind === 'source' && value.id === input.sourceId)) throw new Error('IFC 读取必须关联明确 source 依赖，避免图纸更新后继续使用旧算量。')
        const { sourceId: _sourceId, ...parameters } = input
        request = { ...parameters, sourcePath: source.path, expectedSha256: source.sha256 }
      }
      const details = await runBim(context.cwd, request, { ...options, signal: context.signal })
      const labels = { health: '引擎检查', inventory: '模型目录', query: '构件查询', geometry: '几何量核算', preview: '几何预览', generate: '参数模型生成' }
      return { summary: `IFC ${labels[input.action]}${details.engine.available ? '已完成' : '存在能力缺口'}；结果及覆盖缺口已保留，仍需专业复核。`, issues: details.issues, details }
    },
  }
}
