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
  requiredWhen: 'ZAR / SANRAL / COTO / South Africa highway tender',
  skillReference: 'skills/tender-boq-five-step-pricing/references/sa-labour-wages.md',
  writePath: 'itemBuildUps[].costComponents[kind=labour].rateBasis.webEvidence',
  anysearch: SA_LABOUR_ANYSEARCH,
  grades: ['general worker', 'flagman', 'plant operator', 'artisan', 'foreman'],
  doNotCopy: ['C5.1 exemplar R250/R550/R650/R850', 'Chinese construction day-rates', 'NMW for operators or artisans'],
  note: 'South African civil wages are grade- and area-specific. Search BCCEI (current determination) plus the gazetted National Minimum Wage as a floor. Contract local-labour / EPWP rates override for the people they cover. Use anysearch_batch_search with zone=intl and language=en; never zone=cn. Then web_fetch the official page. Do not reuse the bundled C5.1 路床 wage table.',
}

export const SA_LABOUR_WAGE_DRAFT_ZH =
  '南非公路 / ZAR / SANRAL / COTO：人工不得抄 C5.1 范文 R250/R550/R650/R850，也不得用中国定额工日。读 skills/tender-boq-five-step-pricing/references/sa-labour-wages.md。用 anysearch_batch_search（每条 zone=intl、language=en，最多 5 路）核现行 BCCEI 等级工资与现行国家最低工资，再 web_fetch 官方页；写入 labour 组件 rateBasis.webEvidence。普工≠国家最低工资；操作手/技工/工长走 BCCEI。招标属地工/EPWP 以本合同为准。'

const SA_HINT = /zar|south africa|south-africa|sanral|coto|colto|bccei|kwazulu|kzn|gauteng|ethekwini|limpopo|mpumalanga|free state|eastern cape|western cape|northern cape|\bn3\b|\bn2\b/i

export function looksLikeSouthAfricaPricing(
  project: Pick<BusinessProjectRecord, 'name' | 'projectId' | 'inputPaths'>,
  bindings: BindingFile[] = [],
  extras: { currency?: string; jurisdiction?: string } = {},
): boolean {
  if (/^ZAR$/i.test(extras.currency ?? '')) return true
  const blob = [
    project.name,
    project.projectId,
    extras.jurisdiction ?? '',
    ...(project.inputPaths ?? []),
    ...bindings.map((file) => `${file.title ?? ''} ${file.path}`),
  ].join(' ')
  return SA_HINT.test(blob)
}
