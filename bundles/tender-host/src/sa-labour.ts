import type { BusinessProjectRecord } from '../../../packages/business-projects/index.ts'
import type { BindingFile } from './knowledge.ts'

/** AnySearch zone/language that keeps wage hits in South Africa, not PRC. */
export const SA_LABOUR_ANYSEARCH = {
  zone: 'intl' as const,
  language: 'en',
  tools: ['anysearch_batch_search', 'anysearch_search', 'web_search', 'web_fetch'] as const,
  batchQueries: [
    'BCCEI Civil Engineering Industry wage determination South Africa current task grades',
    'BCCEI hourly rate general worker plant operator artisan foreman civil construction',
    'South Africa national minimum wage current gazette Department of Employment and Labour',
    'SANRAL contract local labour EPWP community worker wage rate',
  ],
}

export const SA_LABOUR_WAGE_CHECK = {
  requiredWhen: 'Confirmed South African project and applicable civil-engineering wage scope; currency and reference templates alone are not jurisdiction evidence',
  skillReference: 'skills/tender-boq-five-step-pricing/references/sa-labour-wages.md',
  writePath: 'itemBuildUps[].costComponents[kind=labour].rateBasis.webEvidence',
  anysearch: SA_LABOUR_ANYSEARCH,
  grades: ['general worker', 'flagman', 'plant operator', 'artisan', 'foreman'],
  doNotCopy: ['C5.1 exemplar R250/R550/R650/R850', 'Chinese construction day-rates', 'NMW for operators or artisans'],
  note: 'South African civil wages are grade- and area-specific. Search BCCEI (current determination) plus the gazetted National Minimum Wage as a floor. Contract local-labour / EPWP rates override for the people they cover. Use anysearch_batch_search with zone=intl and language=en; never zone=cn. Then web_fetch the official page. Do not reuse the bundled C5.1 路床 wage table.',
}

export const SA_LABOUR_WAGE_DRAFT_ZH =
  '仅在南非法域及适用工资制度已核实的项目使用 BCCEI / SANRAL / COTO 参考；ZAR 币种不能单独决定法域。人工不得抄 C5.1 范文 R250/R550/R650/R850，也不得直接套不适用的外国定额工日。读 skills/tender-boq-five-step-pricing/references/sa-labour-wages.md。遵守本次任务联网策略；允许且 AnySearch 可用时用 anysearch_batch_search（每条 zone=intl、language=en，最多 5 路），否则用可用原生 web_search/web_fetch 核现行 BCCEI 和国家最低工资；写入 labour 组件 rateBasis.webEvidence。普工不等于国家最低工资；具体工资等级、属地工/EPWP 均以适用制度及本合同为准。'

export function looksLikeSouthAfricaPricing(
  project: Pick<BusinessProjectRecord, 'name' | 'projectId' | 'inputPaths'>,
  _bindings: BindingFile[] = [],
  extras: { currency?: string; jurisdiction?: string } = {},
): boolean {
  if (extras.jurisdiction?.trim()) return /\b(?:south[ -]africa|ZA|ZAF)\b|南非/i.test(extras.jurisdiction)
  const blob = [
    project.name,
    project.projectId,
    extras.jurisdiction ?? '',
    ...(project.inputPaths ?? []),
  ].join(' ')
  return /\b(?:south[ -]africa|ZA|ZAF)\b|南非/i.test(blob) || (/sanral|bccei|kwazulu|gauteng|ethekwini/i.test(blob) && !/namibia|纳米比亚|china|中国/i.test(blob))
}
