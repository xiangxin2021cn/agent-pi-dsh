import { calculateRebar, parsePingfa, expandPingfa, rebarFingerprint } from '../../../packages/engineering-rebar/index.ts'
import type { ExpandPingfaInput, PingfaRuleSet, RebarInput, RebarIssue, RebarSourceRef } from '../../../packages/engineering-rebar/index.ts'
import { engineeringDependencySourceIds } from '../../../packages/engineering-core/index.ts'
import type { EngineeringIssue, EngineeringProvider } from '../../../packages/engineering-core/index.ts'
import type { Capability } from '../../../packages/professional-tasks/types.ts'

export const name = 'agent-pi-engineering-rebar'
export const inject = ['engineering']

type RebarProviderInput =
  | { action: 'calculate'; data: RebarInput }
  | { action: 'parse_pingfa'; data: { text: string; sourceRefs?: RebarSourceRef[] } }
  | { action: 'expand_pingfa'; data: ExpandPingfaInput }
  | { action: 'inspect_rules'; data: { ruleSet: PingfaRuleSet } }

function parseInput(input: unknown): RebarProviderInput {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new TypeError('钢筋输入需要明确 action 和 data。')
  const value = input as Record<string, unknown>
  if (!['calculate', 'parse_pingfa', 'expand_pingfa', 'inspect_rules'].includes(String(value.action)) || !value.data || typeof value.data !== 'object' || Array.isArray(value.data)) throw new TypeError('钢筋输入需要 action: calculate | parse_pingfa | expand_pingfa | inspect_rules 和 data 对象。')
  return structuredClone(value) as RebarProviderInput
}

function hostIssues(issues: RebarIssue[]): EngineeringIssue[] {
  const distinct = new Map<string, EngineeringIssue>()
  for (const issue of issues) {
    const mapped: EngineeringIssue = { code: issue.code, severity: issue.severity === 'error' ? 'error' : 'warning', message: issue.message, ...(issue.rowId ? { entityId: issue.rowId } : {}) }
    distinct.set(JSON.stringify(mapped), mapped)
  }
  return [...distinct.values()]
}

export function executeRebar(value: unknown) {
  const input = parseInput(value)
  if (input.action === 'inspect_rules') {
    const ruleSet = input.data.ruleSet
    const inspected = expandPingfa({ hostId: 'rule-inspection', hostType: 'beam', scopeId: 'inspection', central: [], parameters: {}, ruleSet })
    return { summary: '已检查结构化规则格式并计算内容指纹；尚未替项目采用或批准加工。请核实图集版本、勘误、适用条件与专业审核依据，再登记锁定规则。', issues: [], details: { ruleSetId: ruleSet.id, version: ruleSet.version, ruleFingerprint: inspected.ruleFingerprint, standardRefs: ruleSet.standardRefs, supportedHostTypes: ruleSet.supportedHostTypes, requiredRoles: ruleSet.requiredRoles, declaredReviewStatus: ruleSet.reviewStatus, projectAdopted: false, fabricationApproved: false } }
  }
  if (input.action === 'calculate') {
    const details = calculateRebar(input.data)
    const incomplete = details.rows.filter(row => row.status !== 'calculated').length
    return {
      summary: `已检查 ${details.rows.length} 个钢筋组，${incomplete} 组有未解决项。三个口径分别保存已知小计；${details.coverage.complete ? '已覆盖本次声明的组清单' : '覆盖尚不完整或未声明独立清单'}。计算记录待专业复核，加工尚未批准。`,
      issues: hostIssues(details.issues), details,
    }
  }
  if (input.action === 'parse_pingfa') {
    const parsed = parsePingfa(input.data)
    return {
      summary: `${parsed.supported ? '当前标注形式已解析' : '标注未完整解析，保留不支持片段待核对'}，识别 ${parsed.tokens.length} 个标注项。这仅是结构化文字解析，构件、支座、作用范围及工程量尚未核定。`,
      issues: hostIssues(parsed.issues), details: { ...parsed, fabricationApproved: false as const },
    }
  }
  const expanded = expandPingfa(input.data)
  const calculation = calculateRebar({ schemaVersion: 1, rows: expanded.rows, coverage: expanded.coverage })
  const incomplete = calculation.rows.filter(row => row.status !== 'calculated').length
  const issues = hostIssues([...expanded.issues, ...calculation.issues, { code: 'project_coverage_not_verified', severity: 'warning', message: '展开清单仅涵盖当前构件作用域的声明角色；全项目完整性仍需独立图纸及构件覆盖清单。' }])
  return {
    summary: `已处理当前作用域 ${expanded.rows.length} 个钢筋组，${incomplete} 组有未解决项；已知结果按采用规则保留推导依据。此清单不证明全项目无漏项，加工尚未批准。`,
    issues, details: { ...expanded, coverageScope: 'declared_roles_only' as const, calculation },
  }
}

const limitations = ['仅处理已定位的结构化料表和支持的平法标注，不执行 CAD/PDF 图像识别。', '没有内置未经审校的 22G101 构造系数；必须提供有依据、经项目采用的明确参数和规则。', '多排标注、复杂节点、箍筋组合及连接构造需单独解析与专业核对，不能从简单标注推定完整配筋。', '几何、计量和加工量分别计算；没有自动采购损耗或加工批准。']

function inputReferences(input: RebarProviderInput): RebarSourceRef[] {
  const refs: RebarSourceRef[] = []
  const visit = (value: any) => {
    if (!value || typeof value !== 'object') return
    if (Array.isArray(value)) { value.forEach(visit); return }
    for (const [key, item] of Object.entries(value)) if (key === 'sourceRefs' && Array.isArray(item)) refs.push(...item); else visit(item)
  }
  visit(input.data)
  return refs
}

export const rebarProvider: EngineeringProvider = {
  id: 'rebar', version: '5.8.0', title: '钢筋料表与平法计算', dependencies: [], limitations,
  inputDescription: 'Input {action:calculate|parse_pingfa|expand_pingfa|inspect_rules,data:{...}}. calculate data={schemaVersion:1,rows:[{id,inputMode:"bbs"|"pingfa",hostId?,mark?,diameterMm?:decimalString,steelGrade?:string,sourceRefs:[{documentId,sha256,revision?,page?}],count?:integer,lengths?:{geometry?:{value:decimalString,unit:"mm"|"m"},measurement?:{value,unit},fabrication?:{value,unit}},unitMassKgPerM?:decimalString}],coverage?:{expectedGroupIds:string[]}}. parse_pingfa data={text:string,sourceRefs?:[]}. inspect_rules data={ruleSet} validates structured rule format and returns ruleFingerprint without adopting or calculating. expand_pingfa requires hostId,hostType,scopeId,central,parameters,ruleSet; see packages/engineering-rebar/types.ts. All calculation sourceRefs must identify registered current project sources with SHA; run dependencies must cover those sources. First inspect_rules, then register an independently reviewed project ruleAdoption with packId=ruleSet.id, version=ruleSet.version, contentHash=ruleFingerprint, scope, adoptedAt and actual review source refs; include its rule dependency in expand runs. The pack has explicit reviewStatus/adopted/standardRefs/version, no built-in G101 coefficients. Unknown quantities remain null; no automatic grade, mass, anchor, count or full-project coverage assumptions.',
  parse: parseInput,
  audit(value, project) {
    const input = parseInput(value)
    if (input.action === 'parse_pingfa' || input.action === 'inspect_rules') return []
    const issues: EngineeringIssue[] = []
    for (const ref of inputReferences(input)) if (!ref.sha256 || !project.sources.some(source => source.id === ref.documentId && source.sha256 === ref.sha256 && source.status === 'active')) issues.push({ code: 'rebar_source_unregistered', severity: 'error', message: `钢筋依据 ${ref.documentId} 需要与工程账本中当前来源及 SHA 对应。` })
    if (input.action === 'expand_pingfa' && !project.ruleAdoptions.some(rule => rule.packId === input.data.ruleSet.id && rule.version === input.data.ruleSet.version && rule.contentHash === rebarFingerprint(input.data.ruleSet))) issues.push({ code: 'rebar_rule_unpinned', severity: 'error', message: '平法规则尚未在本项目锁定同一版次与内容指纹；先 inspect_rules，再依据审校材料登记 ruleAdoptions。' })
    return issues
  },
  execute(value, project, context) {
    const input = parseInput(value)
    if (context && (input.action === 'calculate' || input.action === 'expand_pingfa')) {
      const ids = engineeringDependencySourceIds(project, context.dependencies || [])
      if (inputReferences(input).some(ref => !ids.has(ref.documentId))) throw new Error('钢筋计算的 dependencies 必须覆盖全部图纸、材料和规则来源，确保变更后定向复核。')
      if (input.action === 'expand_pingfa') {
        const adopted = project.ruleAdoptions.find(rule => rule.packId === input.data.ruleSet.id && rule.version === input.data.ruleSet.version && rule.contentHash === rebarFingerprint(input.data.ruleSet) && context.dependencies?.some(ref => ref.kind === 'rule' && ref.id === rule.id))
        if (!adopted) throw new Error('平法展开需要关联本项目实际采用的规则依赖。')
      }
    }
    return executeRebar(input)
  },
}

export const rebarCapability: Capability = {
  id: 'engineering.rebar', owner: name, version: '5.8.0', title: '钢筋料表与受控平法计算',
  description: '通过工程共享账本执行料表计算、有限标注解析、经审校规则展开，并把逐项缺口同步到本次任务。',
  professions: ['drawing', 'quantity'], tools: ['engineering_project'], skills: [],
  inputs: ['来源定位和版本', '明确根数或分区端点', '各口径长度或中心线形状', '平法作用域及已采用规则'],
  outputs: ['逐组已知小计和未知项', '独立覆盖差异', '规则指纹及逐项推导'], limitations,
  supplements: ['原图复核', '项目采用图集与勘误', '完整构件及钢筋组清单', '专业审核'],
}

export function apply(ctx: any) {
  ctx.effect(() => ctx.engineering.providers.register(rebarProvider))
  ctx.inject(['professionalCapabilities'], (scope: any) => scope.effect(() => scope.professionalCapabilities.register(rebarCapability)))
}
