import { calculateRoadQuantities } from '../../../packages/engineering-road/index.ts'
import { engineeringDependencySourceIds } from '../../../packages/engineering-core/index.ts'
import type { RoadQuantityInput } from '../../../packages/engineering-road/index.ts'
import type { EngineeringProvider, EngineeringProject } from '../../../packages/engineering-core/index.ts'
import type { Capability } from '../../../packages/professional-tasks/types.ts'

export const name = 'agent-pi-engineering-road'
export const inject = ['engineering']
const limitations = ['仅按有来源的断面与明确桩号区间积分，不自动从平面图猜测地形或断面。', '挖方、填方、线路与材料分别划分计算范围；交叉和漏段需核对。', '几何数量不等同合同计量、压实或采购数量，结果待专业复核。']
export const roadProvider: EngineeringProvider = {
  id: 'road', version: '5.8.0', title: '道路断面与土方算量', dependencies: [], limitations,
  inputDescription: 'Input {schemaVersion:1,intervals:[{id,scope,startM,endM,startAreaM2:number|null,endAreaM2:number|null,method:"average_end_area"|"prismoidal",middleAreaM2?,middleStationM?,sources:[{sourceId,sourceHash,locator}]}],expectedRanges?:[{id,scope,startM,endM,excluded?:boolean,reason?:string}],maxIntervalM?:number}. Units: m, m2; output m3. scope uniquely identifies alignment + cut/fill/layer/work. Independent expected ranges must come from actual project scope; never infer complete scope from recognized intervals. Prismoidal requires a midpoint section. Sources must match registered project sources. No guessed areas or compaction factors.',
  parse(input: unknown) {
    if (!input || typeof input !== 'object' || Array.isArray(input)) throw new Error('道路计算需要结构化断面与范围清单。')
    return structuredClone(input) as RoadQuantityInput
  },
  audit(input: unknown, project: EngineeringProject) {
    const data = input as RoadQuantityInput
    return (data.intervals || []).flatMap(row => (row.sources || []).filter(ref => !project.sources.some(source => source.id === ref.sourceId && source.sha256 === ref.sourceHash && source.status === 'active')).map(() => ({ code: 'road_unregistered_source', severity: 'error' as const, message: '断面来源必须匹配工程账本内当前版本的资料。', entityId: row.id })))
  },
  execute(input: unknown, project, context) {
    if (context) {
      const ids = engineeringDependencySourceIds(project, context.dependencies || [])
      if ((input as RoadQuantityInput).intervals.some(row => row.sources.some(ref => !ids.has(ref.sourceId)))) throw new Error('道路计算 dependencies 未覆盖全部断面来源，无法保证换图后复核。')
    }
    const details = calculateRoadQuantities(input as RoadQuantityInput)
    return { summary: `已检查 ${details.rows.length} 个道路断面区间，按 ${details.subtotals.length} 个独立工作范围保存几何小计。${details.coverageComplete ? '已覆盖所声明区间' : '独立范围尚有缺口或待核实项'}；计算仍需专业复核。`, issues: details.issues, details }
  },
}
export const roadCapability: Capability = {
  id: 'engineering.road', owner: name, version: '5.8.0', title: '道路断面与土方算量', description: '可追溯断面积分、区间重叠与独立范围漏段检查。', professions: ['drawing', 'quantity'], tools: ['engineering_project'], skills: [], inputs: ['带来源的断面面积与桩号', '独立线路范围', '明确积分方法'], outputs: ['按范围区分的几何土方小计', '逐段算式与缺口'], limitations, supplements: ['原始地形与横断面', '合同计量规则', '专业复核'],
}
export function apply(ctx: any) {
  ctx.effect(() => ctx.engineering.providers.register(roadProvider))
  ctx.inject(['professionalCapabilities'], (scope: any) => scope.effect(() => scope.professionalCapabilities.register(roadCapability)))
}
