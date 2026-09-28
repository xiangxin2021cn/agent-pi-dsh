// Built-in workflow copy only. A customer's edited stage text remains untouched.
const stages = {
  'project-setup': ['项目资料登记', 'Upload and register tender files. Align PDF, Word and Excel with the knowledge-base parser into reviewable manuscripts; saving also updates the sidecar JSON. Continue once the sources are complete.'],
  'bid-risk-decision': ['投标决策与重大风险', 'Prepare a bid/no-bid recommendation, critical risks, clarifications and decision conditions. The customer decides whether to continue.'],
  'tender-document-analysis': ['招标文件解析', 'Analyze every file into one traceable tender analysis workpaper and extract the actual BOQ in full. Create specialist views from the workpaper only when needed.'],
  'pricing-basis-freeze': ['组价基准冻结', 'Record currency, taxes, wages, materials, equipment, productivity, risk allowances and gaps as a traceable pricing basis. The customer confirms it before detailed pricing.'],
  'boq-five-step-pricing': ['BOQ 逐页组价与资源汇总', 'Price each BOQ section against this project’s conditions. Record gaps instead of inventing figures.'],
  'planning-and-submission': ['施工与技术方案', 'Use the confirmed basis and detailed pricing to prepare construction methods, schedule, resources, cash flow and technical response. This stage does not establish submission readiness.'],
  'submission-compliance-freeze': ['合规检查与最终提交冻结', 'Check eligibility, forms, signatures and seals, prices, technical proposal and submission media. Freeze the version only after customer approval.'],
  'delivery-setup': ['实施工作区建立', 'Confirm delivery inputs, data date, contract scope, control baselines and deliverables.'],
  'delivery-controls': ['合同范围 / 进度 / 成本 / 风险', 'Update contract scope, schedule, procurement, cost, cash flow, risks, changes and period-end reporting with the delivery skills.'],
  'investment-setup': ['授权与工作区', 'Confirm investment stage, mandate, valuation date, source files and decision thresholds.'],
  'investment-diligence': ['尽调与决策包', 'Prepare technical, market, legal and ESG diligence, valuation and the investment decision pack.'],
}

const gateCopy = {
  'bid-risk-decision': {
    promptZh: ['请确认是否接受本轮投标建议并进入招标分析。', 'Confirm whether to accept the bid recommendation and proceed to tender analysis.'],
    approveLabelZh: ['确认投标，继续', 'Confirm bid and continue'],
    rejectLabelZh: ['不投标，暂停', 'Do not bid; pause'],
  },
  'pricing-basis-freeze': {
    promptZh: ['请确认组价基准和暂定假设，再进入详细 BOQ 组价。', 'Confirm the pricing basis and provisional assumptions before detailed BOQ pricing.'],
    approveLabelZh: ['确认基准，开始组价', 'Confirm basis and price BOQ'],
  },
  'submission-compliance-freeze': {
    promptZh: ['请核对合规记录并确认是否冻结为最终提交版本。', 'Review the compliance record and confirm the final submission version.'],
    approveLabelZh: ['确认合规，冻结提交', 'Confirm compliance and freeze'],
  },
}

export function stageLabel(stage, locale) {
  if (!stage) return ''
  if (String(locale || '').startsWith('zh')) return stage.labelZh || stage.label || stage.id
  const builtIn = stages[stage.id]
  return builtIn && stage.labelZh === builtIn[0] ? (stage.label || stage.labelZh) : (stage.labelZh || stage.label || stage.id)
}

export function stageHint(stage, locale) {
  if (!stage) return ''
  if (String(locale || '').startsWith('zh')) return stage.hintZh || stage.prompt || ''
  const builtIn = stages[stage.id]
  return builtIn && stage.labelZh === builtIn[0] ? builtIn[1] : (stage.hintZh || stage.prompt || '')
}

export function stageGate(stage, field, locale) {
  const value = stage?.approvalGate?.[field] || ''
  if (String(locale || '').startsWith('zh')) return value
  const pair = gateCopy[stage?.id]?.[field]
  return pair && value === pair[0] && stage.labelZh === stages[stage.id]?.[0] ? pair[1] : value
}
