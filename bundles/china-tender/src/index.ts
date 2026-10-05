import { analyzeChinaTender, createChinaBoqBaseline, verifyChinaBoqBaseline } from '../../../packages/china-tender/index.ts'
import type { BoqBaselineRow, BoqBaselineSource, ChinaBoqBaseline, ChinaTenderInput } from '../../../packages/china-tender/index.ts'
import type { EngineeringExecutionContext, EngineeringIssue, EngineeringProvider } from '../../../packages/engineering-core/index.ts'
import { chinaTenderWorkflow } from './workflow.ts'

export const name = 'agent-pi-china-tender'
export const inject = ['engineering']

export type ChinaTenderProviderInput =
  | { action: 'analyze'; data: ChinaTenderInput }
  | { action: 'create_baseline'; data: { baselineId: string; source: BoqBaselineSource; rows: BoqBaselineRow[] } }

function parse(input: unknown): ChinaTenderProviderInput {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new Error('中国招投标输入需要对象。')
  const value = input as Record<string, unknown>
  if (!['analyze', 'create_baseline'].includes(String(value.action))
    || !value.data || typeof value.data !== 'object' || Array.isArray(value.data)) {
    throw new Error('中国招投标输入需要明确 action 和 data。')
  }
  const data = value.data as Record<string, unknown>
  if (value.action === 'analyze') {
    if (!data.profile || typeof data.profile !== 'object' || Array.isArray(data.profile)) throw new Error('analyze 需要项目 profile。')
    for (const key of ['requirements', 'evidence', 'responses', 'rules']) {
      if (data[key] !== undefined && !Array.isArray(data[key])) throw new Error(`${key} 必须是数组。`)
    }
  } else if (!Array.isArray(data.rows) || !data.source || typeof data.source !== 'object' || Array.isArray(data.source)) {
    throw new Error('create_baseline 需要 baselineId、source 和 rows 数组。')
  }
  return structuredClone(value) as ChinaTenderProviderInput
}

function historyBaselines(context?: EngineeringExecutionContext): Map<string, ChinaBoqBaseline> {
  if (!context || !Array.isArray(context.previousRuns)) throw new Error('清单基线操作需要宿主提供本项目历史，不能仅凭输入自行覆盖基线。')
  const result = new Map<string, ChinaBoqBaseline>()
  for (const run of context.previousRuns) {
    if (run.providerId !== 'china-tender') continue
    const details = run.output.details as Partial<ChinaBoqBaseline> | null
    if (!details || typeof details !== 'object' || !('baselineId' in details) || !('rows' in details)) continue
    verifyChinaBoqBaseline(details as ChinaBoqBaseline)
    const prior = result.get(details.baselineId!)
    if (prior && prior.fingerprint !== details.fingerprint) throw new Error(`历史清单基线 ${details.baselineId} 存在版本冲突，需先处理历史记录。`)
    result.set(details.baselineId!, details as ChinaBoqBaseline)
  }
  return result
}

function assertBaselineIdentity(baseline: ChinaBoqBaseline, context: EngineeringExecutionContext | undefined, requireExisting: boolean) {
  verifyChinaBoqBaseline(baseline)
  const previous = historyBaselines(context).get(baseline.baselineId)
  if (previous && previous.fingerprint !== baseline.fingerprint) {
    throw new Error(`清单基线 ${baseline.baselineId} 已绑定另一指纹，不得覆盖；有效新补遗应使用新的 baselineId 并保留旧版本。`)
  }
  if (requireExisting && !previous) throw new Error(`清单基线 ${baseline.baselineId} 尚未在本项目登记，请先 create_baseline。`)
}

export const chinaTenderProvider: EngineeringProvider = {
  id: 'china-tender', version: '3.8.0', title: '中国招投标要求与清单复核', dependencies: [],
  limitations: [
    '制度和规则适用均为辅助建议；内置三个国家或公路来源，未覆盖各地全部规定。',
    '外部查询不到不等于不合格；证据语义、真实性及复核人记录需由实际核验提供。',
    '清单快照登记不构成招标人批准或最终报价；本插件不进行交易提交或签章。',
  ],
  inputDescription: [
    'Input {action:"analyze"|"create_baseline",data:{...}}.',
    'analyze data={profile:{context:"government_procurement"|"enterprise_procurement"|"unknown",subject:"construction"|"engineering_goods"|"engineering_services"|"goods"|"services"|"unknown",method:"tender"|"non_tender"|"unknown",mandatoryTender?:"yes"|"no"|"unknown",province?,industry?,projectDate?},requirements?,evidence?,responses?,rules?,boq?:{baseline,comparedRows,kind:"recalculation"|"submission"}}.',
    'Dates are YYYY-MM-DD. province uses matching province codes (e.g. CN-44); built-in highway industry is "highway". Context and engineering relation require actual project evidence.',
    'requirement={id,title,category:"qualification"|"mandatory"|"scored"|"technical"|"pricing"|"format"|"other",source,ruleId?,evaluationDate?}; source={documentId,status:"active"|"superseded"|"withdrawn",sha256?,page?,clause?,excerpt?}.',
    'evidence={id,source,verification:"verified"|"unverified"|"not_found",checkedAt?,validFrom?,validUntil?}; response={requirementId,evidenceIds,assessment:"supports"|"contradicts"|"unknown",responseLocation?,reviewedBy?,reviewedAt?,note?,requirementSourceSha256?}. Never invent verification or reviewer records. Missing evidence stays unresolved. Bind response requirementSourceSha256 to the source actually reviewed.',
    'Optional rule={id,title,status:"effective"|"pending"|"draft"|"repealed",effectiveFrom?,effectiveTo?,checkedAt,source:{title,url,article?},provinces?,industries?,contexts?,subjects?,methods?,mandatoryTenderOnly?}; effectiveTo is exclusive. Custom provincial rules require a verified official source.',
    'create_baseline data={baselineId,source:{documentId,sha256,revision?,issuedAt?},rows:[{id,code,description,unit,quantity:decimalString,features?,fixedAmount?}]}. source sha256 is the original file hash; row IDs remain stable across comparisons. Preserve zero quantities and leading zeros in item codes.',
    'Register the original source in engineering_project first. A baselineId binds one immutable fingerprint in this project. Repeating identical content is allowed; changed content must use a new ID for the new document version. Snapshot registration is not approval. Analyze must reference a baseline already recorded in this project.',
  ].join('\n'),
  parse,
  audit(raw, project) {
    const input = parse(raw)
    if (input.action !== 'create_baseline') return []
    const source = project.sources.find(row => row.id === input.data.source.documentId)
    if (!source) return [{ code: 'baseline-source-unregistered', severity: 'warning', message: '清单来源尚未绑定工程项目文件；快照不能证明源文件覆盖或真实性。' }]
    if (source.sha256.toLowerCase() !== input.data.source.sha256?.toLowerCase()) {
      return [{ code: 'baseline-source-version', severity: 'warning', message: '清单快照来源哈希与工程项目当前文件不同，需核对原始文件及补遗版本。' }]
    }
    return source.status === 'active' ? [] : [{ code: 'baseline-source-status', severity: 'warning', message: '清单快照对应文件当前非有效状态；此登记只保留历史，不代表可用于当前投标。' }]
  },
  execute(raw, _project, context?: EngineeringExecutionContext) {
    const input = parse(raw)
    if (input.action === 'create_baseline') {
      const { baselineId, source, rows } = input.data
      const baseline = createChinaBoqBaseline(baselineId, source, rows)
      assertBaselineIdentity(baseline, context, false)
      return {
        summary: `已生成清单快照 ${baseline.baselineId}（${baseline.rows.length} 行）；同编号仅接受相同指纹。快照登记不构成招标人批准或最终报价。`,
        issues: [], details: baseline,
      }
    }
    if (input.data.boq) assertBaselineIdentity(input.data.boq.baseline, context, true)
    const details = analyzeChinaTender(input.data)
    const issues: EngineeringIssue[] = [
      ...details.profileAssessment.missing.map(field => ({ code: 'profile-missing', severity: 'warning' as const, message: `项目画像缺少 ${field}。` })),
      ...(details.profileAssessment.procedure === 'undetermined' ? [{ code: 'procedure-review', severity: 'warning' as const, message: details.profileAssessment.reasons.join('；') }] : []),
      ...details.ruleAssessments.filter(row => row.status === 'needs_review').map(row => ({ code: 'rule-review', severity: 'warning' as const, message: `${row.ruleId}：${row.reasons.join('；')}` })),
      ...details.responseMatrix.filter(row => row.status !== 'supported').map(row => ({
        code: `response-${row.status}`, severity: row.status === 'conflict' ? 'error' as const : 'warning' as const,
        message: `${row.title}：${row.reasons.join('；') || '已记录证据与要求的矛盾，请复核；不自动认定不合格。'}`,
      })),
      ...(details.summary.hasRequirements ? [] : [{ code: 'requirements-empty', severity: 'warning' as const, message: '尚未登记具体招标要求，不能据此判定响应已覆盖。' }]),
      ...(details.boqComparison?.differences || []).map(row => ({ code: 'boq-difference', severity: 'warning' as const, message: `清单 ${row.rowId} 存在差异：${row.fields.join('、')}；原始基线未修改。` })),
    ]
    return {
      summary: `已核对 ${details.summary.requirements} 项要求，${details.summary.supported} 项有已复核支持关系、${details.summary.conflicts} 项记录矛盾；${issues.length} 项提示待处理。结果为资料核对与制度建议，不是资格或评标结论。`,
      issues, details,
    }
  },
}

export function apply(ctx: any) {
  ctx.effect(() => ctx.engineering.providers.register(chinaTenderProvider))
  ctx.inject?.(['workbench'], (scope: any) => {
    scope.effect(() => scope.workbench.registerModule({ owner: 'dsh-agent-pi-china-tender', workflow: chinaTenderWorkflow }))
  })
  ctx.inject?.(['professionalCapabilities'], (scope: any) => {
    scope.effect(() => scope.professionalCapabilities.register({
      id: 'china-tender:response-review', owner: 'dsh-agent-pi-china-tender', version: '3.8.0',
      title: '中国招投标规则、证据与清单核对',
      description: '按项目制度、地区、专业与时点检查规则适用，定位要求与响应证据，保留招标原始清单。',
      professions: ['tender', 'quantity'], tools: ['engineering_project'], skills: [],
      inputs: ['实际招标及补遗版本、采购制度信息、复核证据及原始清单'],
      outputs: ['制度建议、要求证据响应矩阵、独立清单快照与差异'],
      limitations: [...chinaTenderProvider.limitations],
      supplements: ['逐项处理规则适用、证据与版本缺口，并由专业人员复核'],
      applicability: { countries: ['CN'] },
    }))
  })
}
