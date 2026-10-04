import type { ProfessionalTask, Profession } from './types.ts'
import { verificationCurrent } from './verification.ts'

export function auditTask(task: ProfessionalTask) {
  const issues: Array<{ code: string; id: string; detail: string }> = []
  const add = (code: string, id: string, detail: string) => issues.push({ code, id, detail })
  if (!task.brief.objective.trim()) add('goal_missing', 'brief', '明确当次任务目标。')
  if (task.needsAssessment) add('assessment_stale', 'brief', '最新用户要求尚未评估。')
  if (task.pendingProjectSync) add('project_sync_pending', task.pendingProjectSync.id, '本次任务的要求尚未同步到工作台，暂不能审批或验收。')
  if (task.quality?.enabled) {
    if (task.quality.needsAssessment) add('quality_assessment_stale', 'quality', '专业深度要求尚未按当前目标评估。')
    if (!task.quality.criteria.length) add('quality_criteria_missing', 'quality', '专业深度尚未形成可检查的验收项。')
    for (const criterion of task.quality.criteria) {
      const check = task.quality.checks.find(row => row.id === criterion.id)
      if (!check || check.status !== 'passed' || check.stale) add('quality_check_pending', criterion.id, check?.detail || '尚未检查此验收项。')
    }
  }
  if (task.brief.profession === 'tender') {
    for (const key of ['country', 'location', 'contract', 'measurement'] as const) if (!task.brief.basis[key]) add('basis_gap', key, `项目适用依据待确认：${key}`)
    if (!task.coverage.length) add('coverage_missing', 'coverage', '尚未登记全文解析覆盖。')
  }
  for (const row of task.coverage) if (row.status === 'missing' || row.status === 'unreadable') add('coverage_gap', row.id, `${row.title}: ${row.status}`)
  for (const row of task.coverage) if (row.status === 'parsed' && row.review === 'pending') add('source_review_pending', row.id, '文本抽取尚未完成页表图及附件内容复核。')
  for (const row of task.evidence) if (row.status === 'conflict') add('evidence_conflict', row.id, row.title)
  for (const requirement of task.requirements.filter(row => row.mandatory)) {
    const files = task.deliverables.filter(row => row.requirementIds.includes(requirement.id))
    if (!files.length) { add('requirement_uncovered', requirement.id, requirement.title); continue }
    if (!files.some(row => row.status !== 'stale' && (row.checks || []).some(check => check.kind === 'coverage' && check.status === 'passed'))) add('requirement_unreviewed', requirement.id, '已生成文件尚未证明覆盖该要求。')
    if (requirement.signatureRequired && !files.some(row => row.signature === 'signed')) add('signature_pending', requirement.id, '必交文件待签署授权。')
  }
  for (const row of task.deliverables) {
    const verification = verificationCurrent(task, row)
    if (!verification.ready) add('verification_pending', row.id, [...verification.reasons, ...(row.verification?.unresolved || [])].join('；') || '当前成果尚未通过统一审核。')
    if (row.status === 'stale') add('deliverable_stale', row.id, '输入或要求变化，成果需复核。')
    for (const kind of ['file', 'professional', 'writing'] as const) if (!(row.checks || []).some(check => check.kind === kind && check.status === 'passed')) add('check_pending', row.id, `${kind}: 尚未检查实际成果。`)
    for (const check of row.checks) if (check.status !== 'passed') add('check_unresolved', row.id, check.detail)
  }
  if (!task.deliverables.length) add('deliverables_missing', 'deliverables', '没有实际交付成果。')
  if (task.plan.some(step => step.status !== 'done')) add('plan_unfinished', 'plan', '存在未完成、受阻或待复核工作。')
  return { readyForCustomerReview: issues.length === 0, customerAccepted: issues.length === 0 && task.deliverables.every(row => row.status === 'accepted'), issues }
}

export function writingPreset(profession: Profession, language: string) {
  const professional = {
    tender: '沿用本招标术语、条款、清单编码和指定表单；正式递交按业主目录与评分要求组织。',
    drawing: '按图号、版本、专业、构件及尺寸说明读图结果，区分可读取几何与视觉判断。',
    quantity: '按构件/清单列计算式、单位、计量范围和扣减；数量可追溯到图纸位置。',
    method: '写本项目作业条件、步骤、资源参数、检验点、责任与异常处理，保留待核实条件。',
    research: '围绕本次研究问题组织证据、比较与判断，说明来源日期和适用范围。',
    report: '围绕受众需要回答的问题组织结论与证据，保留客户指定格式。',
    spreadsheet: '说明输入、公式、单位、口径和核对结果，区分输入值与计算值。',
    general: '沿用用户术语与格式，直接完成当次目标。',
  }[profession]
  return `${professional}\n交付语言：${language || '沿用用户语言'}。专业写作要求自动适用：每段提供项目事实、判断依据、计算或可执行安排；删去空泛宣传、重复结论和无依据的具体承诺；不得靠补造数字让文字显得专业。术语、单位及数字与计算表一致。客户正文不暴露插件、JSON、内部账本或工具路径。引用保留可查原文定位；表单保留其规定措辞。模板中的旧项目事实不能带入本项目。`
}

export function inspectWriting(text: string, profession: Profession) {
  const findings: Array<{ line: number; kind: string; detail: string }> = []
  const boilerplate = /全方位|一站式|赋能|助力|确保万无一失|seamless|cutting-edge|it is important to note/iu
  const internal = /orchestration\/|documentId\s*[:=]|<skill_content|\.agent-pi\/business/iu
  const vague = /(?:加强|优化|强化|提升).{0,12}(?:管理|配置|效率|协同)|ensure.{0,20}(?:efficient|robust)/iu
  const concrete = /\d|[《「].+[》」]|[（(].+[）)]|(?:条款|图号|清单|检验|验收|复核|阈值|工序|clause|item\s+[A-Z0-9]|inspect|threshold)/iu
  for (const [index, line] of text.split(/\r?\n/).entries()) {
    if (boilerplate.test(line)) findings.push({ line: index + 1, kind: 'filler', detail: '删去宣传或套话，保留实际判断。' })
    if (internal.test(line)) findings.push({ line: index + 1, kind: 'internal', detail: '客户正文含内部系统说明。' })
    if (profession !== 'general' && vague.test(line) && !concrete.test(line)) findings.push({ line: index + 1, kind: 'vague', detail: '需以已知条件、依据、步骤或检查点说明，缺事实时保留缺口。' })
  }
  const paragraphs = text.split(/\n\s*\n/).map(value => value.trim()).filter(value => value.length > 80)
  const seen = new Set<string>()
  for (const paragraph of paragraphs) { if (seen.has(paragraph)) findings.push({ line: 0, kind: 'duplicate', detail: '存在重复长段落。' }); seen.add(paragraph) }
  return { findings, requiresProfessionalReview: true, note: '文字检查只指出待审内容，不能证明技术准确、计算正确或评分符合。' }
}
