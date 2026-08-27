/**
 * BOQ pricing extras: site-bound supplier diligence and bilingual RFQs.
 * Chapter Markdown and the formula workbook stay required; this pack cannot
 * be replaced by the pricing summary alone.
 */
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { BOQ_PRICING_STAGE_ID } from './pricing-workbook.ts'
export const PRICING_DILIGENCE_FILE = '当地供应商尽调.md'
export const PRICING_PRODUCTIVITY_FILE = '当地工效尽调.md'
export const PRICING_RFQ_INDEX_FILE = '询价单总表.md'
export const PRICING_WAIVER_FILE = '组价依据说明.md'
export const PRICING_RFQ_DIR = '询价单'
export const PRICING_DILIGENCE_MIN_CHARS = 1800
export const PRICING_PRODUCTIVITY_MIN_CHARS = 1200
export const PRICING_RFQ_INDEX_MIN_CHARS = 600
export const PRICING_RFQ_MIN_CHARS = 500
export const PRICING_WAIVER_MIN_CHARS = 600

export interface PricingIntelFileSpec {
  fileName: string
  minChars: number
  mustHave: string[]
  outlineZh: string[]
}

export const PRICING_INTEL_MEMOS: PricingIntelFileSpec[] = [
  {
    fileName: PRICING_DILIGENCE_FILE,
    minChars: PRICING_DILIGENCE_MIN_CHARS,
    mustHave: ['项目地址|地点|location', 'AnySearch|anysearch', '供应商', '邮箱|email', '电话|联系', '材料', '设备', '检索|来源'],
    outlineZh: [
      '本标地址（省 / 都会 / 走廊，摘自项目特征）',
      'AnySearch 检索记录（capabilities → search / batch，zone=intl）',
      '当地人工、柴油、水、机械、骨料市场摘录（带 url 与日期）',
      '材料与设备供应商名录：电话、邮箱、网址、可询价范围',
      '仍须人工询价的资源清单',
    ],
  },
  {
    fileName: PRICING_PRODUCTIVITY_FILE,
    minChars: PRICING_PRODUCTIVITY_MIN_CHARS,
    mustHave: ['项目地址|地点|location', 'AnySearch|anysearch', '工效|产量|productivity', '当地|local', '国际|international', '中国|定额'],
    outlineZh: [
      '本标地址、工时、雨季、运距（摘自项目特征）',
      '企业登记工效文件最高优先；文件已有的日产禁止用网页覆盖',
      'AnySearch 只补企业文件没有的工序（capabilities → batch，zone=intl）',
      '当地核到的日产 / 循环 / 有效系数（url + accessedAt）',
      '当地无公开产量时：国际手册 × 当地特征推定，禁止套中国定额',
      '写入 planningBasis 的 source：enterprise / human_reviewed / local_verified / international_adjusted',
    ],
  },
  {
    fileName: PRICING_RFQ_INDEX_FILE,
    minChars: PRICING_RFQ_INDEX_MIN_CHARS,
    mustHave: ['询价', '材料|设备', '中文', 'English|英文'],
    outlineZh: [
      '待发询价总表（资源、规格、数量、指向的 RFQ 文件）',
      '每个询价对象对应 询价单/ 下一份中英双语询价单',
    ],
  },
]

const RFQ_MUST_HAVE = ['中文', 'English|英文', '规格|Specification', '数量|Quantity']

const WAIVER_SPEC: PricingIntelFileSpec = {
  fileName: PRICING_WAIVER_FILE,
  minChars: PRICING_WAIVER_MIN_CHARS,
  mustHave: ['网络询价', '推导|推定', '策划', '非正式|未回价|缺口', '工效'],
  outlineZh: [
    '哪些尽调 / 询价单 / 工效文件未齐，以及强制放行的原因',
    '策划将采用网络询价摘录与工效推导，非正式供应商回价',
    '当地未核到的工效如何按国际手册 × 当地特征推定',
    '缺口保持标注，回价到达后回写单价与工期',
  ],
}

export interface PricingIntelFileStatus {
  fileName: string
  exists: boolean
  chars: number
  longEnough: boolean
  missingTerms: string[]
  ok: boolean
}

export interface PricingLocalIntelStatus {
  ok: boolean
  files: PricingIntelFileStatus[]
  rfqs: PricingIntelFileStatus[]
  digest: string
  shortGaps: string
}

export interface PricingIntelGate {
  intel: PricingLocalIntelStatus
  waiver: PricingIntelFileStatus
  waived: boolean
  ready: boolean
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

function assessNamedFile(dir: string, spec: PricingIntelFileSpec): PricingIntelFileStatus {
  const path = join(dir, spec.fileName)
  const exists = existsSync(path)
  const text = exists ? fileText(path) : ''
  const chars = text.length
  const longEnough = chars >= spec.minChars
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

function assessRfqFile(dir: string, fileName: string): PricingIntelFileStatus {
  const text = fileText(join(dir, PRICING_RFQ_DIR, fileName))
  const chars = text.length
  const missingTerms = RFQ_MUST_HAVE.filter((term) => !termHits(text, term))
  return {
    fileName: `${PRICING_RFQ_DIR}/${fileName}`,
    exists: true,
    chars,
    longEnough: chars >= PRICING_RFQ_MIN_CHARS,
    missingTerms,
    ok: chars >= PRICING_RFQ_MIN_CHARS && missingTerms.length === 0,
  }
}

function listRfqNames(dir: string): string[] {
  const folder = join(dir, PRICING_RFQ_DIR)
  if (!existsSync(folder)) return []
  try {
    return readdirSync(folder, { withFileTypes: true })
      .filter((entry) => entry.isFile() && /\.md$/i.test(entry.name))
      .map((entry) => entry.name)
      .sort()
  } catch {
    return []
  }
}

function describeGaps(status: PricingLocalIntelStatus): string {
  const bits: string[] = []
  for (const file of status.files) {
    if (!file.exists) bits.push(`缺《${file.fileName}》`)
    else if (!file.longEnough) bits.push(`《${file.fileName}》过短（${file.chars} 字）`)
    else if (file.missingTerms.length > 0) bits.push(`《${file.fileName}》缺章节：${file.missingTerms.join('、')}`)
  }
  if (status.rfqs.length === 0) bits.push(`缺 ${PRICING_RFQ_DIR}/ 下的中英双语询价单`)
  for (const file of status.rfqs) {
    if (!file.longEnough) bits.push(`《${file.fileName}》过短（${file.chars} 字）`)
    else if (file.missingTerms.length > 0) bits.push(`《${file.fileName}》缺中英双语块：${file.missingTerms.join('、')}`)
  }
  return bits.join('；')
}

/**
 * Disk check for the pricing-stage supplier pack.
 * @param dir `Agent Pi Outputs/<projectId>/boq-pricing/`
 */
export function assessPricingLocalIntel(dir: string): PricingLocalIntelStatus {
  const files = PRICING_INTEL_MEMOS.map((spec) => assessNamedFile(dir, spec))
  const rfqs = listRfqNames(dir).map((name) => assessRfqFile(dir, name))
  const digest = [
    ...files.map((file) => `${file.fileName}:${file.exists ? 1 : 0}:${file.ok ? 1 : 0}`),
    `rfq:${rfqs.length}:${rfqs.filter((file) => file.ok).length}`,
  ].join(',')
  const status: PricingLocalIntelStatus = {
    ok: files.every((file) => file.ok) && rfqs.length > 0 && rfqs.every((file) => file.ok),
    files,
    rfqs,
    digest,
    shortGaps: '',
  }
  status.shortGaps = describeGaps(status)
  return status
}

export function pricingLocalIntelApplies(stageId: string): boolean {
  return stageId === BOQ_PRICING_STAGE_ID
}

export function assessPricingWaiverNote(dir: string): PricingIntelFileStatus {
  return assessNamedFile(dir, WAIVER_SPEC)
}

/**
 * Disk + waiver check. Characteristic evidence waive does not set `waived`.
 * @param waived `evidencePolicy.pricingIntelWaived` from `tender_evidence waive_pricing` or pricing-stage `force_pass`.
 */
export function evaluatePricingIntelGate(dir: string, waived: boolean): PricingIntelGate {
  const intel = assessPricingLocalIntel(dir)
  const waiver = assessPricingWaiverNote(dir)
  const ready = intel.ok || (waived && waiver.ok)
  const digest = `${intel.digest};waive:${waived ? 1 : 0}:${waiver.ok ? 1 : 0}`
  let shortGaps = intel.shortGaps
  if (ready && !intel.ok) {
    shortGaps = '已强制放行：策划依据为网络询价与工效推导，非正式供应商回价。'
  } else if (!ready && waived && !waiver.ok) {
    shortGaps = waiver.exists
      ? `已强制放行，但《${PRICING_WAIVER_FILE}》未达标：${[
          !waiver.longEnough ? `过短（${waiver.chars} 字）` : '',
          waiver.missingTerms.length > 0 ? `缺 ${waiver.missingTerms.join('、')}` : '',
        ].filter(Boolean).join('；')}`
      : `已强制放行当地尽调 / 询价单 / 工效包，但必须先写《${PRICING_WAIVER_FILE}》，注明策划依据是网络询价与工效推导，非正式供应商回价。`
  }
  return { intel, waiver, waived, ready, digest, shortGaps }
}

export function pricingLocalIntelRejectReason(status: PricingLocalIntelStatus): string {
  return `组价当地供应商尽调 / 工效尽调 / 询价单未达标：${status.shortGaps}。读 local-site-intel.md、local-productivity.md、supplier-rfq.md。条件不具备时可 tender_evidence waive_pricing（或对本阶段 tender_stage force_pass），再写《${PRICING_WAIVER_FILE}》后进入策划。禁止用 C5.1 范文供应商或中国定额填空。`
}

export function pricingIntelGateRejectReason(gate: PricingIntelGate): string {
  if (gate.waived && !gate.intel.ok) return gate.shortGaps
  return pricingLocalIntelRejectReason(gate.intel)
}

export function renderPricingIntelBlock(status: PricingLocalIntelStatus, folder = 'boq-pricing'): string {
  const rows = [
    ...status.files.map((file) => {
      if (!file.exists) return `- 《${file.fileName}》：缺`
      if (!file.longEnough) return `- 《${file.fileName}》：过短（${file.chars} 字）`
      if (file.missingTerms.length > 0) return `- 《${file.fileName}》：缺章节 ${file.missingTerms.join('、')}`
      return `- 《${file.fileName}》：已就位`
    }),
    status.rfqs.length === 0
      ? `- ${PRICING_RFQ_DIR}/：还没有中英双语询价单`
      : `- ${PRICING_RFQ_DIR}/：${status.rfqs.filter((file) => file.ok).length}/${status.rfqs.length} 份达标`,
  ]
  return [
    `当地供应商尽调、工效尽调与询价单（写入 Agent Pi Outputs/…/${folder}/；总报告不能代替）：`,
    ...rows,
    status.ok
      ? '- 尽调、工效与询价单已齐。'
      : `- 未齐：${status.shortGaps}。条件不具备时 tender_evidence waive_pricing，再写《${PRICING_WAIVER_FILE}》。`,
  ].join('\n')
}

export function buildPricingIntelDraft(
  projectId: string,
  status: PricingLocalIntelStatus,
): string {
  const outlines = PRICING_INTEL_MEMOS.map((spec) => {
    const row = status.files.find((file) => file.fileName === spec.fileName)
    const mark = !row || !row.exists ? '缺' : row.ok ? '已齐' : '未达标'
    return `- 《${spec.fileName}》${mark}\n${spec.outlineZh.map((line) => `  - ${line}`).join('\n')}`
  }).join('\n')
  return `【补齐组价当地情报 — 请在本项目主会话继续】

项目: ${projectId}
${renderPricingIntelBlock(status)}

必须补的文件：
${outlines}
- ${PRICING_RFQ_DIR}/ 下至少一份中英双语询价单（规格、数量、交货地）

先 anysearch_capabilities，再用 anysearch_batch_search（zone=intl, language=en）搜本标地址的机械/材料商与当地工效；电话和邮箱必须 web_fetch 官方页后才写入。禁止抄 C5.1 范文、中国厂商或中国定额。已完成的章节组价不要重做。

询价回不齐或当地工效网页核不到时：tender_evidence waive_pricing（或 tender_stage force_pass，stageId=boq-five-step-pricing），再写《${PRICING_WAIVER_FILE}》，注明策划依据是网络询价 + 工效推导。`
}

export function buildPricingWaiverDraft(projectId: string, gate: PricingIntelGate): string {
  return `【补齐组价强制放行说明 — 请在本项目主会话继续】

项目: ${projectId}
${renderPricingIntelBlock(gate.intel)}

已强制放行当地尽调 / 询价单 / 工效包。进入策划前必须写《${PRICING_WAIVER_FILE}》：
${WAIVER_SPEC.outlineZh.map((line) => `- ${line}`).join('\n')}

写明：策划采用网络询价摘录与工效推导（当地无公开产量则国际手册 × 当地特征），非正式供应商回价；缺口保持标注。不要把未回价写成已成交。`
}

/** Test / smoke helper: bodies that clear the mechanical bar without live quotes. */
export function fixturePricingDiligenceMarkdown(): string {
  const spec = PRICING_INTEL_MEMOS[0]!
  const headings = spec.mustHave.map((term) => {
    const title = term.split('|')[0]
    return `## ${title}\n\n本标地址示例。AnySearch zone=intl。供应商联系方式以检索页为准，邮箱 email 电话待核实。材料与设备分列。来源 url。\n${'当地检索摘录，不是上一单数字。'.repeat(40)}\n`
  })
  return `# 当地供应商尽调\n\n${spec.outlineZh.map((line) => `- ${line}`).join('\n')}\n\n${headings.join('\n')}`
}

export function fixturePricingRfqIndexMarkdown(): string {
  const spec = PRICING_INTEL_MEMOS.find((item) => item.fileName === PRICING_RFQ_INDEX_FILE)!
  return `# 询价单总表\n\n${spec.outlineZh.map((line) => `- ${line}`).join('\n')}\n\n## 询价\n\n| 资源 | 规格 | 数量 | RFQ |\n|---|---|---|---|\n| 柴油 | 50ppm | 待定 | 询价单/RFQ-01-diesel.md |\n\n材料与设备均需向当地供应商发出中文 + English 双语询价单。\n${'待发询价，不是已成交价。'.repeat(50)}\n`
}

export function fixturePricingRfqMarkdown(): string {
  return `# RFQ-01 Diesel / 柴油询价单

## 中文

- 项目地点：以本标项目特征为准
- 规格：50ppm 柴油，现场散装
- 数量：按组价消耗汇总，单位升
- 交货：运至现场，不含增值税报价
- 请回复单价、运费、账期与有效期

${'中文询价正文，便于投标人员直接发出。'.repeat(12)}

## English

- Project location: as stated in the project characteristics memo
- Specification: 50ppm diesel, bulk to site
- Quantity: from the BOQ resource schedule, litres
- Delivery: delivered to site, price exclusive of VAT
- Please quote unit rate, haulage, payment terms, and validity

${'English RFQ body for the local supplier. '.repeat(16)}
`
}

export function fixturePricingProductivityMarkdown(): string {
  const spec = PRICING_INTEL_MEMOS.find((item) => item.fileName === PRICING_PRODUCTIVITY_FILE)!
  return `# 当地工效尽调

${spec.outlineZh.map((line) => `- ${line}`).join('\n')}

## 项目地址

本标地点摘自项目特征。工时、雨季、运距决定有效系数，不抄 C5.1 示意日产。

## AnySearch

anysearch_capabilities 后 anysearch_batch_search（zone=intl, language=en）搜当地碾压 / 开挖 / 运循环。local 网页核不到再 international handbook × 当地特征。

## 工效 / productivity

当地产量以打开的页面为准。禁止套用中国公路定额或国内台班。未核到则推定并标 international_adjusted。

${'当地工效检索摘录，不是上一单日产。'.repeat(55)}
`
}

export function fixturePricingWaiverMarkdown(): string {
  return `# 组价依据说明

本标在供应商书面回价与当地工效网页核验未齐套时强制放行。

策划阶段依据：网络询价摘录 + 工效推导（当地无公开产量则国际手册结合当地雨季、运距、工时推定），非正式供应商回价。缺口保持标注，回价到达后回写单价与工期。

未齐文件与原因写在本节，不得把未回价写成已成交。

${'网络询价与工效推导仅作策划输入，待正式回价替换。'.repeat(20)}
`
}

export const PRICING_LOCAL_INTEL_DRAFT_ZH =
  '本标地址绑定：工效优先级为企业登记文件 > 本标人工复核 > 当地网页 > 国际手册×当地特征。禁止抄 C5.1 范文日产、兰特价或中国定额。创建项目时若已附企业工效表，直接采用文件数字，只对文件没有的资源做 anysearch_capabilities → anysearch_search / anysearch_batch_search（每条 zone=intl、language=en）。web_fetch 官方页后写入 rateBasis.webEvidence 与《当地工效尽调.md》。用户在章节稿改过的工效/关键资源价是本标人工复核准确数，保存确认后全局重算数量。收阶段交付《当地供应商尽调.md》《当地工效尽调.md》《询价单总表.md》和 询价单/ 中英询价单。询价回不齐时 tender_evidence waive_pricing（或对本阶段 tender_stage force_pass），再写《组价依据说明.md》，注明策划依据是网络询价+推导。读 local-site-intel.md、local-productivity.md、supplier-rfq.md。'

export const PRICING_LOCAL_INTEL_CHECK = {
  required: true,
  tools: ['anysearch_capabilities', 'anysearch_search', 'anysearch_batch_search', 'web_search', 'web_fetch'] as const,
  zone: 'intl' as const,
  language: 'en',
  skillReferences: [
    'skills/tender-boq-five-step-pricing/references/local-site-intel.md',
    'skills/tender-boq-five-step-pricing/references/local-productivity.md',
    'skills/tender-boq-five-step-pricing/references/supplier-rfq.md',
  ],
  officialOutputs: [
    PRICING_DILIGENCE_FILE,
    PRICING_PRODUCTIVITY_FILE,
    PRICING_RFQ_INDEX_FILE,
    `${PRICING_RFQ_DIR}/*.md`,
    PRICING_WAIVER_FILE,
  ],
  note: 'Discover AnySearch tags with anysearch_capabilities before anysearch_search. Bind productivity to this tender site; do not apply Chinese norms. Write supplier emails and phones only after web_fetch. Deliver diligence, the productivity memo, and bilingual RFQs before complete_stage. If those cannot be completed, waive_pricing plus 组价依据说明.md lets planning use web quotes and derived outputs.',
}

export function writePricingIntelFixtures(dir: string): void {
  mkdirSync(join(dir, PRICING_RFQ_DIR), { recursive: true })
  writeFileSync(join(dir, PRICING_DILIGENCE_FILE), fixturePricingDiligenceMarkdown())
  writeFileSync(join(dir, PRICING_PRODUCTIVITY_FILE), fixturePricingProductivityMarkdown())
  writeFileSync(join(dir, PRICING_RFQ_INDEX_FILE), fixturePricingRfqIndexMarkdown())
  writeFileSync(join(dir, PRICING_RFQ_DIR, 'RFQ-01-diesel.md'), fixturePricingRfqMarkdown())
}

export function writePricingWaiverFixture(dir: string): void {
  mkdirSync(dir, { recursive: true })
  writeFileSync(join(dir, PRICING_WAIVER_FILE), fixturePricingWaiverMarkdown())
}
