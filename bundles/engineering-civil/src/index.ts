import { calculateCivil, calibratePdf } from '../../../packages/engineering-civil/index.ts'
import type { CivilCalculationInput, PdfCalibrationInput } from '../../../packages/engineering-civil/index.ts'
import type { EngineeringExecutionContext, EngineeringProvider } from '../../../packages/engineering-core/index.ts'

export const name = 'agent-pi-engineering-civil'
export const inject = ['engineering']
export type CivilProviderInput = { action: 'calculate'; data: CivilCalculationInput } | { action: 'calibrate_pdf'; data: PdfCalibrationInput }
function parse(raw: unknown): CivilProviderInput {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw new Error('道路市政计算需要 action 和 data 对象。')
  const input = raw as CivilProviderInput
  if (!['calculate', 'calibrate_pdf'].includes(input.action) || !input.data || typeof input.data !== 'object' || Array.isArray(input.data)) throw new Error('道路市政支持 calculate 或 calibrate_pdf，并需要 data。')
  return structuredClone(input)
}

export const civilProvider: EngineeringProvider = {
  id: 'civil-quantities', version: '3.8.0', title: '道路结构层、市政管沟与土建几何量', dependencies: [],
  limitations: ['仅按已提供真实资料计算，不自动识别全图，不是完整 Civil3D。', '路径限明确 2D/3D 折线；结构层限显式闭合无洞平面；矩形构件须明确无洞。曲线、洞口、复杂曲面及未知条件保留缺口。', '稳定 physicalId 表示同一实体或明确的计数范围，多视图需沿用该标识；本插件不自动识别空间重叠或同物异名。', '几何量与合同计量、开挖工作面、放坡、损耗、采购、造价和加工量分开；大范围结果仍需专业复核。'],
  inputDescription: [
    'Input {action:"calculate"|"calibrate_pdf",data:{...}}. Engineering runs must include explicit source dependencies for every input/catalog/calibration source: [{kind:"source",id:"drawing"}]. Sources must already be active engineering_project sources with real local path and matching SHA. Source reference={sourceId,sourceHash:64hex,locator:"sheet/page/chainage/detail/dimension"}. Missing or stale evidence blocks only affected objects; no guessed values.',
    'calculate data={catalog:{id,title,sources:[ref],items:[{physicalId,kind,title,sources:[ref],disposition:"include"|"exclude",reason?:"required for exclude"}]},objects:[object]}. The catalog must come from an INDEPENDENT expected-object inventory, not be synthesized from successfully calculated objects. Excluded inputs require reasons; unlisted objects stay outside totals. At most 1000 catalog items/200 calculation objects. physicalId must be stable per physical asset/component/layer or precisely bounded counting group; do not invent a new physicalId for another view of the same object.',
    'Every object={id,physicalId,title,sources:[ref],kind,...}. kind pipe|drain: {unit:"m"|"mm",dimension:"2d"|"3d",pathKind:"polyline"|"curved"|"unknown",points:[[x,y] or [x,y,z],null,...]}. 2..2000 points; null marks unknown breaks, never bridged. Only known contiguous segments yield a partial subtotal; total quantity remains null for gaps. Do not substitute 2D lengths for actual sloped 3D pipe lengths.',
    'kind road_layer: {unit:"m"|"mm",outline:[[x,y],...,[sameFirstX,sameFirstY]]|null,holes:"none"|"present"|"unknown",surface:"planar"|"curved"|"unknown",thickness:{value:number|null,unit:"m"|"mm"}}. 3..300 edges, explicit closure, non-self-intersecting; area × positive thickness. Holes/curvature unknown or present cannot be treated as no holes. The flat layer volume does not infer sloped normal thickness or a corridor surface.',
    'kind rectangular: {unit:"m"|"mm",length:number|null,width:number|null,height:number|null,voids:"none"|"present"|"unknown"}. Explicit positive dimensions only. Excavation depth, slopes and working-space allowances are never inferred.',
    'kind count: {count:integer|null}. Zero is allowed only when explicitly evidenced. physicalId identifies exactly one physical asset or disjoint counting group; do not submit overlapping groups. Missing, duplicate or unsupported objects have null quantity. Totals group by kind and quantityBasis (plan_2d, spatial_3d, plan_area_thickness, rectangular_solid, count, unknown); 2D and 3D lengths are NOT mixed. Totals separately label completeSubtotal and knownPartialSubtotal; none known remains null. completeWithinDeclaredCatalog does not certify all original drawings or professional review.',
    'calibrate_pdf data={source:ref,page:1,viewport:{id,width,height},coordinateSpace:"pixels"|"normalized",reference:{source:ref,page:1,viewportId,start:[x,y],end:[x,y],realLength:number|null,unit:"m"|"mm",label:"actual dimension text"}}. Page is 1-based; sourceId/hash/page/viewportId must match. Pixel coordinates lie within viewport; normalized coordinates lie in 0..1 and are multiplied by explicit viewport width/height before measuring. Return metres per viewport pixel and normalized X/Y scale, basis, hash-bound calibrationId. No DPI-to-real-size guessing. This action only calibrates one same-page/version/view; it does not measure new objects or authorize reuse across differently scaled details, crops, perspective images or nonuniform stretch.',
  ].join('\n'),
  parse,
  audit: () => [], // Evidence failures are retained per object so independent valid scopes still calculate.
  execute(raw, project, context?: EngineeringExecutionContext) {
    const input = parse(raw)
    if (!context || !Array.isArray(context.dependencies)) throw new Error('道路市政计算需要宿主提供当前运行的来源依赖。')
    context.signal?.throwIfAborted()
    const evidence = { sources: project.sources, dependencies: context.dependencies }
    if (input.action === 'calibrate_pdf') {
      const details = calibratePdf(input.data, evidence)
      return { summary: details.status === 'calibrated' ? '已登记同页同版本视口的标注比例；尚未进行全图量取，需核对原标注与适用范围。' : '标注比例未能成立，缺口已保留；不使用页面 DPI 猜测工程尺寸。', issues: details.issues, details }
    }
    const details = calculateCivil(input.data, evidence)
    return { summary: `独立目录 ${details.coverage.declared} 项：${details.coverage.calculated} 项已计算，${details.coverage.partial} 项仅有连续已知段，${details.coverage.incomplete} 项不完整，${details.coverage.unlisted} 项尚未列入目录。仅为几何量，仍需专业复核。`, issues: details.issues, details }
  },
}

export function apply(ctx: any) {
  ctx.effect(() => ctx.engineering.providers.register(civilProvider))
  ctx.inject?.(['professionalCapabilities'], (scope: any) => scope.effect(() => scope.professionalCapabilities.register({
    id: 'engineering-civil:quantities', owner: 'dsh-agent-pi-engineering-civil', version: '3.8.0', title: civilProvider.title,
    description: '有来源的折线管沟、平面结构层、矩形体积和构筑物数量；同页 PDF 标注比例标定。',
    professions: ['quantity', 'construction'], tools: ['engineering_project'], skills: [],
    inputs: ['真实来源定位与版本、独立预期对象目录、明确几何参数和单位'], outputs: ['逐对象几何量、已知部分小计、覆盖与重复缺口、PDF 比例依据'],
    limitations: civilProvider.limitations, supplements: ['对照独立目录核查漏项、同物异名、洞口与实际计量规则'],
  })))
}
