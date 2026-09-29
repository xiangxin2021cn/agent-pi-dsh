import type { Capability } from '../../../packages/professional-tasks/types.ts'

const capabilities: Record<string, Array<Omit<Capability, 'owner' | 'version'>>> = {
  tender: [
    { id: 'tender:full-analysis', title: '招标全文解析与要求覆盖', description: '原文定位、页表图附件补遗覆盖、计量与评分及递交要求', professions: ['tender'], tools: ['tender_workspace', 'tender_capability'], skills: ['tender-intelligence-core'], inputs: ['Actual tender source versions'], outputs: ['Coverage and source-located requirements'], limitations: ['Unreadable or missing sources remain gaps'], supplements: ['Use document/table/image parsing suited to the input'], module: 'tender' },
    { id: 'tender:item-derivation', title: 'BOQ 成本与资源逐项推导', description: '项目范围、计量、工法工效、资源消耗和价格及对账', professions: ['tender'], tools: ['tender_capability', 'tender_pricing_workbook'], skills: ['tender-boq-five-step-pricing'], inputs: ['Actual BOQ, applicable measurement rules, local productivity and rate evidence'], outputs: ['Item workpapers, formula workbook, cost and resource totals'], limitations: ['Commercial transfer items require separate treatment; total consumption does not determine resource peaks'], supplements: ['Targeted local diligence and explicit calculation scenarios'], module: 'tender' },
    { id: 'tender:execution-plan', title: '投标实施策划', description: '由实际工作包、资源和项目条件形成详实策划', professions: ['tender'], tools: ['tender_capability'], skills: ['tender-execution-planning'], inputs: ['Validated BOQ/resource baseline and project constraints'], outputs: ['Method, programme, resources, procurement, cost and cashflow as requested'], limitations: ['Unconfirmed bidder commitments stay provisional'], supplements: ['Clarify resources/method decisions and update affected calculations'], module: 'tender' },
    { id: 'tender:returnables', title: '招标递交文件与表单', description: '按实际必交清单、评分点及模板派生递交文件', professions: ['tender'], tools: ['tender_capability'], skills: ['tender-submission-documents', 'tender-submission-audit'], inputs: ['Actual returnable schedule, scoring points and approved planning'], outputs: ['Reports, declarations, qualification/commitment/deviation/personnel/plant forms'], limitations: ['Generation cannot establish signature or authorization'], supplements: ['Requirement-by-file review and customer signature confirmation'], module: 'tender' },
  ],
  delivery: [
    { id: 'delivery:drawing', title: '施工图专业读图', description: '识别图号、版本、单位、构件及施工约束', professions: ['drawing', 'quantity', 'method'], tools: ['read'], skills: ['construction-drawing-quantity'], inputs: ['Selected drawing versions and professional scope'], outputs: ['Located geometry, dimensions and unresolved conditions'], limitations: ['A text reader cannot prove image or CAD geometry; actual native tools must be checked'], supplements: ['Use available CAD/vision/document tools or request the missing source format'] },
    { id: 'delivery:quantity', title: '工程量计算', description: '图纸位置、构件、计算式、单位、扣减及清单范围关联', professions: ['quantity'], tools: [], skills: ['construction-drawing-quantity'], inputs: ['Verified geometry and applicable measurement rules'], outputs: ['Traceable calculation workpapers and quantities'], limitations: ['Missing dimensions or duplicate views cannot be guessed'], supplements: ['Native calculation and source verification'] },
    { id: 'delivery:method', title: '项目施工方案', description: '本项目作业条件、工法步骤、资源参数和检验及异常处理', professions: ['method'], tools: [], skills: ['project-method-statement'], inputs: ['Project conditions, drawing/quantity/resource basis'], outputs: ['Executable method statement as requested'], limitations: ['Missing project conditions remain explicit assumptions'], supplements: ['Task-specific standards research and professional review'] },
  ],
  investment: [
    { id: 'investment:research', title: '专业调研与决策报告', description: '按当次问题、地区、时点和受众组织调查与判断', professions: ['research', 'report'], tools: [], skills: ['professional-report'], inputs: ['Research objective, constraints and evidence scope'], outputs: ['Sourced analysis and requested report'], limitations: ['Unavailable live sources and forecasts require explicit uncertainty'], supplements: ['Check actual search/fetch providers and evidence currency'] },
  ],
}

/** Optional dependency: existing workbenches remain usable without the guide. */
export function registerProfessionalDomain(ctx: any, domain: string) {
  ctx.inject?.(['professionalCapabilities'], (scope: any) => {
    for (const capability of capabilities[domain] || []) scope.effect(() => scope.professionalCapabilities.register({ ...capability, owner: `dsh-agent-pi-workbench-${domain}`, version: '3.7.7' }))
  })
}
