/**
 * Factory depth bar for `tender-document-analysis`.
 *
 * The five synthesis memos are the customer-facing analysis suite. Per-source
 * Markdown and `招标文件解析总报告.md` remain required; the suite cannot be
 * replaced by the summary alone. Structure and chapter words are generic —
 * never pre-load another project's contract numbers, amounts, or place names.
 */
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

export const ANALYSIS_SUITE_STAGE_ID = 'tender-document-analysis'
export const ANALYSIS_SUITE_MIN_CHARS = 3500

export interface AnalysisSuiteFileSpec {
  fileName: string
  /** Each entry is one required topic; `|` means any alternative counts. */
  mustHave: string[]
  outlineZh: string[]
}

export const ANALYSIS_SUITE: AnalysisSuiteFileSpec[] = [
  {
    fileName: '招标文件总结.md',
    mustHave: ['基本信息', '资格', '评标|评分|Stage', '合同', '返标|可退回|Form', '时间|日期|截标', '风险'],
    outlineZh: [
      '项目基本信息表（编号、业主、工期、合同形式、截标，全部带来源）',
      '卷册 / 文件体系',
      '资格门槛与关键人员（本标写什么就写什么，缺则标缺口）',
      '评标各阶段、分数线、商务权重',
      '合同与商业条件（分包、调价、保险、提交介质）',
      'A / B 返标清单',
      '时间节点与风险（逐条带来源，禁止用上一单数字填空）',
    ],
  },
  {
    fileName: '工程量清单分析.md',
    mustHave: ['总价', 'Schedule|清单|分册', 'PC Sum|Provisional|暂定|指定', '报价|策略', '风险'],
    outlineZh: [
      '总价构成（税前/税后、基金、或本标等价结构）',
      '各 Schedule / 分册金额与占比',
      'PC Sum / Provisional / 待报价项分层，结构物暂定 vs 须自算',
      '点名本标实际清单号（与 packs/boq-reconciliation.json 一致；禁止空话过关）',
      '报价敏感点与风险（带来源；没有金额就标缺口）',
    ],
  },
  {
    fileName: '工程范围与技术规范总结.md',
    mustHave: ['合同', '工期|保函|预付款|保留金', '规范', '范围', '安全|健康|HSE'],
    outlineZh: [
      '合同数据：工期、保函、预付款、保留金、CPA、罚则、分包上限、工时',
      '定价结构与主要结构物 / 工点清单',
      'C3 或等价范围 + 规范体系与项目修正',
      'HSE / 环境 / 本地化或目标企业条款（本标有则写，无则标缺口）',
    ],
  },
  {
    fileName: '合同特殊条款与规范修订总结.md',
    mustHave: ['特殊条款|Particular|FIDIC', '优先级|支付', '分包', '规范', '索赔|EOT|延期'],
    outlineZh: [
      '通用条件对照表（定义、文件优先级、支付、分包、EOT、罚则、CPA、索赔）',
      '规范逐章 / 逐节修订',
      '风险条款清单（带来源）',
    ],
  },
  {
    fileName: '技术标文件要求汇总.md',
    mustHave: ['返标|Returnable|Form', '评分|功能性', 'B8|工作计划|Methodology', 'A系列|行政|Form A'],
    outlineZh: [
      '返标总表',
      'A 系列逐项（行政 / 合规）',
      'B 系列字段与评分挂钩',
      '功能性评分表',
      '方法说明书（B8 或本标等价）深度与前后阶段联动',
    ],
  },
]

export interface AnalysisSuiteFileStatus {
  fileName: string
  exists: boolean
  chars: number
  longEnough: boolean
  missingTerms: string[]
  ok: boolean
}

export interface AnalysisSuiteStatus {
  ok: boolean
  files: AnalysisSuiteFileStatus[]
  missing: string[]
  short: string[]
  thinChapters: string[]
  digest: string
  shortGaps: string
}

function fileText(path: string): string {
  try {
    return readFileSync(path, 'utf8')
  } catch {
    return ''
  }
}

function termHits(text: string, term: string): boolean {
  return term.split('|').some((part) => part && text.includes(part))
}

export function assessAnalysisFile(dir: string, spec: AnalysisSuiteFileSpec): AnalysisSuiteFileStatus {
  const path = join(dir, spec.fileName)
  const exists = existsSync(path)
  const text = exists ? fileText(path) : ''
  const chars = text.length
  const longEnough = chars >= ANALYSIS_SUITE_MIN_CHARS
  const missingTerms = exists ? spec.mustHave.filter((term) => !termHits(text, term)) : [...spec.mustHave]
  return {
    fileName: spec.fileName,
    exists,
    chars,
    longEnough,
    missingTerms,
    ok: exists && longEnough && missingTerms.length === 0,
  }
}

function describeGaps(status: AnalysisSuiteStatus): string {
  const bits: string[] = []
  for (const file of status.files) {
    if (!file.exists) bits.push(`缺《${file.fileName}》`)
    else if (!file.longEnough) bits.push(`《${file.fileName}》过短（${file.chars} 字，至少 ${ANALYSIS_SUITE_MIN_CHARS}）`)
    else if (file.missingTerms.length > 0) bits.push(`《${file.fileName}》缺章节：${file.missingTerms.join('、')}`)
  }
  return bits.join('；')
}

/**
 * Disk check for the five analysis-suite memos in one official folder.
 * @param dir `Agent Pi Outputs/<projectId>/document-analysis/`
 */
export function assessAnalysisSuite(dir: string): AnalysisSuiteStatus {
  const files = ANALYSIS_SUITE.map((spec) => assessAnalysisFile(dir, spec))
  const missing = files.filter((file) => !file.exists).map((file) => file.fileName)
  const short = files.filter((file) => file.exists && !file.longEnough).map((file) => file.fileName)
  const thinChapters = files
    .filter((file) => file.exists && file.longEnough && file.missingTerms.length > 0)
    .map((file) => file.fileName)
  const digest = files
    .map((file) => `${file.fileName}:${file.exists ? 1 : 0}:${file.longEnough ? 1 : 0}:${file.missingTerms.length}`)
    .join(',')
  const status: AnalysisSuiteStatus = {
    ok: files.every((file) => file.ok),
    files,
    missing,
    short,
    thinChapters,
    digest,
    shortGaps: '',
  }
  status.shortGaps = describeGaps(status)
  return status
}

export function analysisSuiteApplies(stageId: string): boolean {
  return stageId === ANALYSIS_SUITE_STAGE_ID
}

export function analysisSuiteRejectReason(status: AnalysisSuiteStatus): string {
  return `招标解析深度套件未达标：${status.shortGaps}。《招标文件解析总报告.md》不能代替这五份。禁止重扫已完成源文件，只补列出的缺口。`
}

export function renderAnalysisSuiteBlock(status: AnalysisSuiteStatus, folder = 'document-analysis'): string {
  const rows = status.files.map((file) => {
    if (!file.exists) return `- 《${file.fileName}》：缺`
    if (!file.longEnough) return `- 《${file.fileName}》：过短（${file.chars} 字）`
    if (file.missingTerms.length > 0) return `- 《${file.fileName}》：缺章节 ${file.missingTerms.join('、')}`
    return `- 《${file.fileName}》：已就位`
  })
  return [
    `分析深度套件（写入 Agent Pi Outputs/…/${folder}/；总报告不能代替）：`,
    ...rows,
    status.ok ? '- 套件已齐，不要重扫已完成源文件。' : `- 未齐：${status.shortGaps}`,
  ].join('\n')
}

/** Test / smoke helper: a body that clears the mechanical bar without project facts. */
export function fixtureAnalysisSuiteMarkdown(fileName: string): string {
  const spec = ANALYSIS_SUITE.find((item) => item.fileName === fileName)
  if (!spec) throw new Error(`Unknown analysis-suite file ${fileName}`)
  const headings = spec.mustHave.map((term) => {
    const title = term.split('|')[0]
    return `## ${title}\n\n${'本项目摘录，带来源令牌。'.repeat(80)}\n`
  })
  const outline = spec.outlineZh.map((line) => `- ${line}`).join('\n')
  return `# ${fileName.replace(/\.md$/, '')}\n\n${outline}\n\n${headings.join('\n')}`
}
