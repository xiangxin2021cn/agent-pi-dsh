/**
 * Compatibility gate for the canonical tender analysis base.
 *
 * 3.4.1 replaces five overlapping long reports with one source-indexed model.
 * Optional topic views are derived from it and are no longer completion gates.
 */
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

export const ANALYSIS_SUITE_STAGE_ID = 'tender-document-analysis'
export const ANALYSIS_SUITE_MIN_CHARS = 1200

export interface AnalysisSuiteFileSpec {
  fileName: string
  /** Each entry is one required topic; `|` means any alternative counts. */
  mustHave: string[]
  outlineZh: string[]
}

export const ANALYSIS_SUITE: AnalysisSuiteFileSpec[] = [
  {
    fileName: '投标分析底稿.md',
    mustHave: ['来源|索引', '边界|项目特征', '资格|评分', '合同|保函|保险', '规范|技术', 'BOQ|清单', '提交|Form', '风险|缺口'],
    outlineZh: [
      '来源索引及卷册/文件关系',
      '项目边界、项目特征和资料缺口',
      '资格、评分、关键日期及必交材料',
      '合同、保函、保险、支付及重大商业风险',
      '技术规范体系、工程范围和关键修订',
      'BOQ 分册/章节/行级覆盖及与规范的映射',
      '提交合规清单、风险与待澄清事项',
      '可按需派生的专题视图',
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
 * Disk check for the canonical analysis base in one official folder.
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
  return `投标分析底稿未达标：${status.shortGaps}。禁止重扫已完成源文件，只补列出的来源、章节或 BOQ 覆盖缺口。`
}

export function renderAnalysisSuiteBlock(status: AnalysisSuiteStatus, folder = 'document-analysis'): string {
  const rows = status.files.map((file) => {
    if (!file.exists) return `- 《${file.fileName}》：缺`
    if (!file.longEnough) return `- 《${file.fileName}》：过短（${file.chars} 字）`
    if (file.missingTerms.length > 0) return `- 《${file.fileName}》：缺章节 ${file.missingTerms.join('、')}`
    return `- 《${file.fileName}》：已就位`
  })
  return [
    `投标分析底稿（写入 Agent Pi Outputs/…/${folder}/；专题视图按需派生）：`,
    ...rows,
    status.ok ? '- 底稿已齐，不要重扫已完成源文件。' : `- 未齐：${status.shortGaps}`,
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
