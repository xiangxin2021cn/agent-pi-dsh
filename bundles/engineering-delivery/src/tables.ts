import type { EngineeringProject } from '../../../packages/engineering-core/index.ts'

export type ExportRun = { id: string; providerId: string; providerVersion: string; title: string; createdAt: string; status?: string; executionStatus?: string; providerAvailable?: boolean; providerChanged?: boolean; dependencies: unknown[]; input: unknown; output: { summary: string; issues: any[]; details: any } }
export type ExportState = { revision: number; project: EngineeringProject; runs: ExportRun[]; sourceChecks?: any[]; scope?: { sessionId: string; projectId?: string; module?: string }; providers?: unknown[] }
export type ExportTable = { id: string; title: string; rows: Record<string, unknown>[] }
const array = (value: unknown): any[] => Array.isArray(value) ? value : []
const record = (value: unknown): Record<string, any> => value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, any> : {}
export const currentRun = (run: ExportRun) => run.status === 'current' && run.executionStatus === 'executed' && run.providerAvailable !== false && !run.providerChanged

/** Tables are projections only; snapshot.json retains original values and every provider field. */
export function engineeringTables(state: ExportState): ExportTable[] {
  const project = state.project, tables: ExportTable[] = []
  const add = (id: string, title: string, rows: Record<string, unknown>[]) => { tables.push({ id, title, rows }); return rows }
  add('project', '项目与导出说明', [{ projectId: project.id, title: project.title, revision: state.revision, notice: '工程数据快照，仍待专业复核；不构成客户验收或加工批准。null 为未知，未提供为字段缺失，0 保留为数值零。各次计算独立，不跨运行自动累计。', fabricationApproved: false, customerAccepted: false }])
  add('sources', '来源版本', project.sources.map(source => ({ ...source, fileCheck: state.sourceChecks?.find(check => check.sourceId === source.id) ?? null })))
  add('objects', '对象参数', project.objects.flatMap(object => Object.entries(object.parameters).map(([parameter, data]) => ({ objectId: object.id, type: object.type, title: object.title, parameter, ...data, objectSources: object.sources }))))
  add('quantities', '分口径数量', project.quantities.map(quantity => ({ ...quantity, exportReview: '保留登记口径、状态和算式；不把 draft/stale/blocked 当作已批准合计。' })))
  add('rules', '采用规则版本', project.ruleAdoptions.map(rule => ({ ...rule })))
  add('coverage', '覆盖与待核实', project.coverage.map(row => ({ ...row })))
  add('runs', '计算运行记录', state.runs.map(run => ({ runId: run.id, provider: run.providerId, version: run.providerVersion, title: run.title, createdAt: run.createdAt, status: run.status ?? 'unknown', executionStatus: run.executionStatus ?? 'unknown', currentKnownSubtotal: currentRun(run), summary: run.output.summary, dependencies: run.dependencies, snapshotPointer: `/runs/${state.runs.indexOf(run)}`, review: '未因导出而变为已复核/已验收' })))
  const issues = add('issues', '问题与缺口', [
    ...(state.sourceChecks || []).filter(row => row.status !== 'current').map(row => ({ scope: 'source', ...row })),
    ...project.coverage.filter(row => !['reviewed', 'excluded'].includes(row.status)).map(row => ({ scope: 'coverage', id: row.id, status: row.status, message: row.reason ?? '覆盖未复核' })),
    ...project.quantities.flatMap(row => row.issues.map(message => ({ scope: 'quantity', id: row.id, status: row.status, message }))),
  ])
  const rebarRows = add('rebar-groups', '钢筋逐组分口径', []), rebarTotals = add('rebar-totals', '钢筋已知小计', [])
  const roadRows = add('road-intervals', '道路逐段几何量', []), roadTotals = add('road-totals', '道路已知小计', [])
  const civilRows = add('civil-objects', '土建市政逐对象几何量', []), civilTotals = add('civil-totals', '土建市政分口径小计', [])
  const civilCatalog = add('civil-catalog', '土建市政独立预期目录', []), civilCoverage = add('civil-coverage', '土建市政目录覆盖', [])
  const calibrations = add('pdf-calibrations', 'PDF视口标定依据', [])
  const ifcRows = add('ifc', 'IFC构件与几何', []), responses = add('china-responses', '中国要求响应矩阵', [])
  const baselines = add('china-baselines', '中国原始清单快照', []), differences = add('china-differences', '中国原量与复算差异', [])
  const rules = tables.find(t => t.id === 'rules')!.rows
  for (const [runIndex, run] of state.runs.entries()) {
    const details = record(run.output.details), current = currentRun(run)
    const common = { runId: run.id, runStatus: run.status ?? 'unknown', currentKnownSubtotal: current, review: '待专业复核' }
    issues.push(...run.output.issues.map(issue => ({ scope: 'run', runId: run.id, runStatus: run.status ?? 'unknown', ...issue })))
    if (!current) issues.push({ scope: 'run', runId: run.id, runStatus: run.status ?? 'unknown', message: '此运行不作为当前小计依据；原值仅作历史快照保留。' })
    if (run.providerId === 'rebar') {
      const calculation = record(details.calculation || details)
      for (const row of array(calculation.rows)) for (const [basis, values] of Object.entries(record(row.quantities))) {
        const quantities = record(values)
        rebarRows.push({ ...common, groupId: row.id, hostId: row.hostId, mark: row.mark, role: row.role, diameterMm: row.diameterMm, steelGrade: row.steelGrade, basis, count: row.count, ...quantities, includedInTotals: current && row.includedInTotals === true, currentTotalLengthM: current && row.includedInTotals ? quantities.totalLengthM : null, currentTotalMassKg: current && row.includedInTotals ? quantities.totalMassKg : null, rowStatus: row.status, missingInputs: row.missingInputs, sourceRefs: row.sourceRefs, rule: row.rule, derivation: row.derivation, fabricationApproved: false })
      }
      for (const [basis, values] of Object.entries(record(calculation.totalsByBasis))) {
        const totals = record(values)
        rebarTotals.push({ ...common, basis, currentKnownLengthM: current ? totals.knownLengthM : null, currentKnownMassKg: current ? totals.knownMassKg : null, recordedKnownLengthM: totals.knownLengthM, recordedKnownMassKg: totals.knownMassKg, lengthRows: totals.lengthRows, massRows: totals.massRows, incompleteRows: totals.incompleteRows, coverage: calculation.coverage, fabricationApproved: false })
      }
      if (details.ruleFingerprint) rules.push({ runId: run.id, ruleFingerprint: details.ruleFingerprint, adoptedRules: record(record(run.input).data).ruleSet ?? null })
    } else if (run.providerId === 'road') {
      roadRows.push(...array(details.rows).map(row => ({ ...row, ...common, purpose: details.purpose, unit: details.unit, currentVolumeM3: current && row.includedInSubtotal ? row.volumeM3 : null, includedInSubtotal: current && row.includedInSubtotal === true })))
      roadTotals.push(...array(details.subtotals).map(row => ({ ...common, scope: row.scope, purpose: details.purpose, unit: details.unit, currentKnownVolumeM3: current ? row.knownVolumeM3 : null, recordedKnownVolumeM3: row.knownVolumeM3, includedIntervals: row.includedIntervals, unresolvedIntervals: row.unresolvedIntervals, coverageComplete: details.coverageComplete })))
    } else if (run.providerId === 'civil-quantities') {
      if (details.action === 'calculate') {
        const catalog = record(record(record(run.input).data).catalog)
        civilRows.push(...array(details.rows).map(row => ({ ...row, ...common, catalogId: details.catalogId, currentQuantity: current && row.status === 'calculated' ? row.quantity : null, currentKnownPortion: current && row.status === 'partial' ? row.knownPortion : null })))
        civilTotals.push(...array(details.totals).map(row => ({ ...row, ...common, catalogId: details.catalogId, purpose: 'geometric', algorithmVersion: details.algorithmVersion, currentCompleteSubtotal: current ? row.completeSubtotal : null, currentKnownPartialSubtotal: current ? row.knownPartialSubtotal : null, currentKnownQuantitySubtotal: current ? row.knownSubtotal : null, note: '原记录小计与当前可用小计分别保留；按 kind、unit、quantityBasis 分组，平面 2D 与空间 3D 不混算，局部已知量不代表完整量。' })))
        civilCatalog.push(...array(catalog.items).map(item => ({ ...item, ...common, catalogId: catalog.id, catalogTitle: catalog.title, catalogSources: catalog.sources, resultStatus: array(details.rows).find(row => row.physicalId === item.physicalId)?.status ?? 'missing', note: '独立预期目录，排除理由与未算对象保留；不以已识别对象替代目录分母。' })))
        civilCoverage.push({ ...record(details.coverage), ...common, catalogId: details.catalogId, catalogTitle: catalog.title, catalogSources: catalog.sources, algorithmVersion: details.algorithmVersion, currentCompleteWithinDeclaredCatalog: current && details.coverage?.completeWithinDeclaredCatalog === true, snapshotPointer: `/runs/${runIndex}/input/data/catalog`, note: '仅反映所声明目录，不等于全项目、全图纸或专业复核完成。' })
      } else if (details.action === 'calibrate_pdf') {
        calibrations.push({ ...details, ...common, currentMetersPerViewportPixel: current && details.status === 'calibrated' ? details.metersPerViewportPixel : null, currentMetersPerNormalizedX: current && details.status === 'calibrated' ? details.metersPerNormalizedX : null, currentMetersPerNormalizedY: current && details.status === 'calibrated' ? details.metersPerNormalizedY : null, snapshotPointer: `/runs/${runIndex}/output/details/basis` })
      }
    } else if (run.providerId === 'bim-ifc') {
      const elements = array(details.elements).length ? array(details.elements) : array(details.items)
      if (!elements.length) ifcRows.push({ ...common, action: details.action, engine: details.engine, source: details.source, snapshotPointer: `/runs/${runIndex}/output/details`, note: '完整 IFC 结果保留在 snapshot.json；生成/目录/引擎检查不自动算作构件算量。' })
      for (const [i, row] of elements.entries()) {
        const { mesh, vertices, triangles, ...metadata } = record(row)
        ifcRows.push({ ...metadata, ...common, action: details.action, currentNetVolumeM3: current && row.status !== 'failed' ? row.netVolumeM3 ?? null : null, currentGrossVolumeM3: current && row.status !== 'failed' ? row.grossVolumeM3 ?? null : null, vertexCoordinates: array(record(mesh).vertices || vertices).length, triangleIndices: array(record(mesh).triangles || triangles).length, snapshotPointer: `/runs/${runIndex}/output/details/${Array.isArray(details.elements) ? 'elements' : 'items'}/${i}`, note: '原生 QTO、几何体积和合同计量分别保留；不跨运行累计。' })
      }
    } else if (run.providerId === 'china-tender') {
      responses.push(...array(details.responseMatrix).map(row => ({ ...row, ...common, procedureAdvice: details.profileAssessment ?? null })))
      if (details.baselineId && details.fingerprint && Array.isArray(details.rows)) baselines.push(...details.rows.map((row: any) => ({ ...row, ...common, baselineId: details.baselineId, baselineFingerprint: details.fingerprint, baselineSource: details.source, note: '原量快照；不得被复算量覆盖，不代表正式批准。' })))
      if (details.boqComparison) differences.push(...array(details.boqComparison.differences).map(row => ({ ...row, ...common, baselineId: details.boqComparison.baselineId, baselineFingerprint: details.boqComparison.baselineFingerprint, comparisonKind: details.boqComparison.kind, note: details.boqComparison.note })))
      rules.push(...array(details.ruleAssessments).map(row => ({ runId: run.id, ...row })))
    }
  }
  return tables
}
