/**
 * Analysis-stage hard gate: the project must have touched a real BOQ inventory.
 *
 * Five synthesis memos can pass the mechanical word bar with filler. That let a
 * run close document analysis on the wrong (or empty) bill. This gate reads
 * `packs/boq-reconciliation.json` and requires sourced line items that point at
 * a registered BOQ file and appear by code in 《投标分析底稿.md》.
 *
 * Not waivable. Feature-gate / pricing `force_pass` must not clear this.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  parseTenderBoqReconciliationData,
  parseTenderCapabilityEnvelope,
} from '../../../packages/business-core/src/tender/index.ts'
import type { TenderBoqItem, TenderBoqReconciliationData } from '../../../packages/business-core/src/tender/capabilities/boq/types.ts'
import type { TenderDocument } from '../../../packages/business-core/src/tender/types.ts'
import { ANALYSIS_SUITE_STAGE_ID } from './analysis-suite.ts'
import { CAPABILITY_FILE_NAMES, writeJson } from './fsutil.ts'
import { officialStageDir } from './outputs.ts'
import { findSetupRestore } from './setup-restore.ts'
import { loadWorkspace, workspacePaths } from './workspace.ts'

export const BOQ_INVENTORY_MEMO = '投标分析底稿.md'
export const BOQ_INVENTORY_MIN_ITEMS = 1
export const BOQ_INVENTORY_MEMO_CITATIONS = 3
export const BOQ_INVENTORY_MIN_DESC = 8

const PLACEHOLDER_CODE = /^(demo|template|sample|tbd|todo|xxx+|placeholder|n\/a|na|item[-_]?0*\d+|示例|范例|占位|清单项)$/i
const BOQ_NAME = /\bboq\b|bill[ _-]*of[ _-]*quantit|pricing[ _-]*schedule|工程量/i

export interface BoqInventoryItemView {
  id: string
  code: string
  touched: boolean
  cited: boolean
  reason?: string
}

export interface BoqInventoryGate {
  ready: boolean
  packExists: boolean
  parseError?: string
  itemCount: number
  touchedCount: number
  citedCount: number
  hasBoqDocument: boolean
  sourceCodeCount: number
  sourceRowCount: number
  missingRestoreDocuments: string[]
  unreadableRestoreDocuments: string[]
  codes: string[]
  missingCodes: string[]
  missingSourceCodes: string[]
  shortGaps: string
  digest: string
}

export const FIXTURE_BOQ_ROWS = [
  { code: 'C1.1', description: 'Clear and grub the road reserve including trees', unit: 'ha', quantity: '12.5', sheet: 'C1', cell: 'A12:G12' },
  { code: 'C1.2', description: 'Remove topsoil to a nominal depth of 150 mm', unit: 'm3', quantity: '850', sheet: 'C1', cell: 'A18:G18' },
  { code: 'C2.1', description: 'Cut to spoil in all materials to designated areas', unit: 'm3', quantity: '4200', sheet: 'C2', cell: 'A10:G10' },
] as const

function fileText(path: string): string {
  try {
    return readFileSync(path, 'utf8')
  } catch {
    return ''
  }
}

export function looksLikeBoqName(name: string): boolean {
  return BOQ_NAME.test(name)
}

export function isBoqSourceDocument(document: TenderDocument): boolean {
  return document.kind === 'boq' || looksLikeBoqName(document.name)
}

export function isUsableBoqCode(code: string): boolean {
  const trimmed = code.trim()
  if (trimmed.length < 2 || PLACEHOLDER_CODE.test(trimmed)) return false
  return /\d/.test(trimmed)
}

function quantityPositive(raw: string | undefined): boolean {
  if (!raw) return false
  const value = Number(raw)
  return Number.isFinite(value) && value > 0
}

function normalizedBoqCode(value: string): string {
  return value.trim().replace(/\s+/g, '').toUpperCase()
}

function isBoqUnitCell(value: string): boolean {
  const unit = value.trim().toLowerCase().replace(/[.\s]+/g, '')
  if (!unit) return false
  if (/lump\s*sum|provisional\s*sum|prime\s*cost|percentage/i.test(value)) return true
  return /^(?:no|number\(no\)|h|hr|hour|hours|day|days|month|months|manshift|personmonth|km|m|m2|m3|m2-km|m3-km|ha|kg|t|ton|tonne|l|litre|lsum|%)$/.test(unit)
}

/**
 * Conservative source-coverage lower bound. Every table row carrying a BOQ
 * unit counts, including inherited (a)/(b) sub-items; explicit full codes are
 * also collected for identity matching.
 */
function extractBoqSourceInventory(markdown: string): { codes: string[]; rowCount: number } {
  const found = new Map<string, string>()
  let rowCount = 0
  for (const line of markdown.split(/\r?\n/)) {
    if (!/^\s*\|/.test(line)) continue
    const cells = line.split('|').slice(1, -1).map((cell) => cell.trim())
    if (!cells.some(isBoqUnitCell)) continue
    rowCount += 1
    const code = cells.slice(0, 4).find((cell) => (
      /^(?:PC)?[A-Z]?\d+(?:\.\d+)+(?:\([A-Z0-9]+\))?$/i.test(cell)
      && !/^0\./.test(cell)
    ))
    if (!code) continue
    found.set(normalizedBoqCode(code), code.trim())
  }
  return { codes: [...found.values()], rowCount }
}

export function extractBoqSourceCodes(markdown: string): string[] {
  return extractBoqSourceInventory(markdown).codes
}

function restoredBoqCoverage(cwd: string, projectId: string, documents: TenderDocument[]): {
  codes: string[]
  rowCount: number
  missingDocuments: string[]
  unreadableDocuments: string[]
} {
  const found = new Map<string, string>()
  let rowCount = 0
  const missingDocuments: string[] = []
  const unreadableDocuments: string[] = []
  for (const document of documents) {
    if (document.status !== 'active' || !isBoqSourceDocument(document)) continue
    const restore = findSetupRestore(cwd, projectId, document.path)
    if (!restore) {
      missingDocuments.push(document.name)
      continue
    }
    const inventory = extractBoqSourceInventory(fileText(restore.manuscriptPath))
    if (inventory.codes.length === 0 || inventory.rowCount === 0) unreadableDocuments.push(document.name)
    rowCount += inventory.rowCount
    for (const code of inventory.codes) {
      found.set(normalizedBoqCode(code), code)
    }
  }
  return { codes: [...found.values()], rowCount, missingDocuments, unreadableDocuments }
}

function itemTouchReason(
  item: TenderBoqItem,
  documents: Map<string, TenderDocument>,
): string | undefined {
  if (!isUsableBoqCode(item.code)) return `清单号不可用（${item.code || '空'}）`
  if (item.description.trim().length < BOQ_INVENTORY_MIN_DESC) return `${item.code} 描述过短`
  if (!item.unit.trim()) return `${item.code} 缺单位`
  if (item.quantityBasis === 'not_provided' || !quantityPositive(item.quantity)) {
    return `${item.code} 没有从清单抽出的数量`
  }
  if (!item.source.sheet || !item.source.cell) return `${item.code} 缺 sheet/cell`
  const document = documents.get(item.source.documentId)
  if (!document) return `${item.code} 来源文件未登记`
  if (document.status !== 'active') return `${item.code} 来源文件已${document.status}`
  if (!existsSync(document.path)) return `${item.code} 来源文件不在磁盘`
  if (!isBoqSourceDocument(document)) return `${item.code} 来源不是工程量清单文件`
  return undefined
}

function loadBoqPack(cwd: string, projectId: string): {
  packExists: boolean
  parseError?: string
  data?: TenderBoqReconciliationData
} {
  const path = join(workspacePaths(cwd, projectId).packs, `${CAPABILITY_FILE_NAMES.boq_reconciliation}.json`)
  if (!existsSync(path)) return { packExists: false }
  try {
    const envelope = parseTenderCapabilityEnvelope(JSON.parse(readFileSync(path, 'utf8')))
    return { packExists: true, data: parseTenderBoqReconciliationData(envelope.data) }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    return { packExists: true, parseError: message.slice(0, 180) }
  }
}

function describeGaps(gate: Omit<BoqInventoryGate, 'shortGaps'>): string {
  const bits: string[] = []
  if (!gate.hasBoqDocument) bits.push('未登记工程量清单文件（文件名须含 BOQ / Bill of Quantities / Pricing Schedule / 工程量）')
  if (!gate.packExists) bits.push('缺 packs/boq-reconciliation.json')
  else if (gate.parseError) bits.push(`packs/boq-reconciliation.json 无法解析：${gate.parseError}`)
  else if (gate.itemCount === 0) bits.push('boq_reconciliation 没有清单行')
  else if (gate.touchedCount === 0) bits.push('清单行都是占位或对不上已登记的 BOQ 文件')
  if (gate.missingCodes.length > 0) {
    bits.push(`《${BOQ_INVENTORY_MEMO}》未点名实际清单号：${gate.missingCodes.slice(0, 8).join('、')}`)
  }
  if (gate.missingSourceCodes.length > 0) {
    bits.push(`BOQ 源表解析稿识别到 ${gate.sourceCodeCount} 个带单位清单号，能力包仍缺：${gate.missingSourceCodes.slice(0, 8).join('、')}`)
  }
  if (gate.sourceRowCount > gate.touchedCount) {
    bits.push(`BOQ 源表解析稿识别到至少 ${gate.sourceRowCount} 个带单位行，能力包只有 ${gate.touchedCount} 个有效行`)
  }
  if (gate.missingRestoreDocuments.length > 0) {
    bits.push(`BOQ 尚无可核对解析稿：${gate.missingRestoreDocuments.slice(0, 4).join('、')}`)
  }
  if (gate.unreadableRestoreDocuments.length > 0) {
    bits.push(`BOQ 解析稿未识别出带单位清单号：${gate.unreadableRestoreDocuments.slice(0, 4).join('、')}`)
  }
  return bits.join('；')
}

/**
 * Hard check: real BOQ lines exist, point at a registered BOQ file, and are named in the memo.
 * @param analysisDir `Agent Pi Outputs/<projectId>/document-analysis/`
 */
export function assessBoqInventoryGate(cwd: string, projectId: string, analysisDir: string): BoqInventoryGate {
  let documents: TenderDocument[] = []
  try {
    documents = loadWorkspace(cwd, projectId).documents
  } catch { /* workspace not inited: treat as no sources */ }
  const byId = new Map(documents.map((document) => [document.id, document]))
  const hasBoqDocument = documents.some((document) => (
    document.status === 'active' && existsSync(document.path) && isBoqSourceDocument(document)
  ))
  const loaded = loadBoqPack(cwd, projectId)
  const items = loaded.data?.items ?? []
  const memo = fileText(join(analysisDir, BOQ_INVENTORY_MEMO))
  const views: BoqInventoryItemView[] = items.map((item) => {
    const reason = itemTouchReason(item, byId)
    const cited = Boolean(item.code && memo.includes(item.code))
    return { id: item.id, code: item.code, touched: !reason, cited, reason }
  })
  const touched = views.filter((row) => row.touched)
  const needCite = Math.min(BOQ_INVENTORY_MEMO_CITATIONS, touched.length)
  const cited = touched.filter((row) => row.cited)
  const missingCodes = needCite > 0 && cited.length < needCite
    ? touched.filter((row) => !row.cited).map((row) => row.code)
    : []
  const sourceCoverage = restoredBoqCoverage(cwd, projectId, documents)
  const sourceCodes = sourceCoverage.codes
  const packCodes = new Set(touched.map((row) => normalizedBoqCode(row.code)))
  const missingSourceCodes = sourceCodes.filter((code) => !packCodes.has(normalizedBoqCode(code)))
  const ready = hasBoqDocument
    && loaded.packExists
    && !loaded.parseError
    && touched.length >= BOQ_INVENTORY_MIN_ITEMS
    && missingCodes.length === 0
    && missingSourceCodes.length === 0
    && touched.length >= sourceCoverage.rowCount
    && sourceCoverage.missingDocuments.length === 0
    && sourceCoverage.unreadableDocuments.length === 0
  const digest = [
    hasBoqDocument ? 1 : 0,
    loaded.packExists ? 1 : 0,
    loaded.parseError ? 1 : 0,
    items.length,
    touched.length,
    cited.length,
    sourceCodes.length,
    sourceCoverage.rowCount,
    missingSourceCodes.length,
    sourceCoverage.missingDocuments.length,
    sourceCoverage.unreadableDocuments.length,
  ].join(':')
  const gate: BoqInventoryGate = {
    ready,
    packExists: loaded.packExists,
    parseError: loaded.parseError,
    itemCount: items.length,
    touchedCount: touched.length,
    citedCount: cited.length,
    hasBoqDocument,
    sourceCodeCount: sourceCodes.length,
    sourceRowCount: sourceCoverage.rowCount,
    missingRestoreDocuments: sourceCoverage.missingDocuments,
    unreadableRestoreDocuments: sourceCoverage.unreadableDocuments,
    codes: touched.map((row) => row.code),
    missingCodes,
    missingSourceCodes,
    digest,
    shortGaps: '',
  }
  gate.shortGaps = describeGaps(gate)
  return gate
}

export function boqInventoryApplies(stageId: string): boolean {
  return stageId === ANALYSIS_SUITE_STAGE_ID
}

export function boqInventoryRejectReason(gate: BoqInventoryGate): string {
  return `实际工程量清单未完成全量核对，不得结束招标文件解析：${gate.shortGaps}。必须从已登记的 BOQ 文件抽出全部可识别真实行，写入 tender_capability replace boq_reconciliation，并在《${BOQ_INVENTORY_MEMO}》点名代表性清单号。没有清单或只做局部样本的项目不能过解析关；特征门 / force_pass 不能放行这一条。`
}

export function renderBoqInventoryBlock(gate: BoqInventoryGate): string {
  const codes = gate.codes.length > 0 ? `已抽出清单号：${gate.codes.slice(0, 12).join('、')}` : '还没有有效清单号'
  return [
    '实际工程量清单（packs/boq-reconciliation.json，不可用空话套件代替）：',
    gate.ready ? `- 已摸到 ${gate.touchedCount} 条清单行。` : `- 未齐：${gate.shortGaps}`,
    gate.sourceRowCount > 0 ? `- 源表带单位行覆盖：${Math.min(gate.touchedCount, gate.sourceRowCount)}/${gate.sourceRowCount}；显式清单号缺 ${gate.missingSourceCodes.length} 个。` : '- 源表解析稿暂无可机械反查的清单行。',
    `- ${codes}`,
  ].join('\n')
}

export function fixtureBoqReconciliationData(documentId: string): TenderBoqReconciliationData {
  return {
    items: FIXTURE_BOQ_ROWS.map((row, index) => ({
      id: `boq-c${index + 1}`,
      source: { documentId, sheet: row.sheet, cell: row.cell },
      code: row.code,
      description: row.description,
      unit: row.unit,
      quantity: row.quantity,
      quantityBasis: 'boq' as const,
      quantityStatus: 'sourced' as const,
      quantityRefs: [{ documentId, sheet: row.sheet, cell: row.cell.split(':').at(-1) || row.cell }],
    })),
    scopeLinks: [],
  }
}

function appendCodesToMemo(analysisDir: string, data: TenderBoqReconciliationData): void {
  const path = join(analysisDir, BOQ_INVENTORY_MEMO)
  const extra = `\n\n## 实际清单号\n\n${data.items.map((item) => (
    `- ${item.code} ${item.description} ${item.quantity ?? ''} ${item.unit}（${item.source.sheet} ${item.source.cell}）`
  )).join('\n')}\n`
  if (!existsSync(path)) {
    writeFileSync(path, `# 投标分析底稿\n\n## 来源索引\nfixture\n\n## 项目边界与项目特征\nfixture\n\n## 资格与评分\nfixture\n\n## 合同、保函与保险\nfixture\n\n## 技术规范\nfixture\n\n## BOQ 清单\n${extra}\n\n## 提交 Form\nfixture\n\n## 风险与缺口\nfixture\n`)
    return
  }
  const current = readFileSync(path, 'utf8')
  if (data.items.every((item) => current.includes(item.code))) return
  writeFileSync(path, `${current.trimEnd()}\n${extra}`)
}

function ensureFixtureBoqRestore(cwd: string, projectId: string, document: TenderDocument): void {
  if (findSetupRestore(cwd, projectId, document.path)) return
  const packDir = join(officialStageDir(cwd, projectId, 'project-setup'), 'boq-fixture-解析稿')
  mkdirSync(packDir, { recursive: true })
  const manuscript = [
    '# BOQ fixture',
    '| ITEM | DESCRIPTION | UNIT | QTY | RATE | AMT |',
    '| --- | --- | --- | --- | --- | --- |',
    ...FIXTURE_BOQ_ROWS.map((row) => `| ${row.code} | ${row.description} | ${row.unit} | ${row.quantity} | | 0 |`),
  ].join('\n')
  writeFileSync(join(packDir, 'manuscript.md'), `${manuscript}\n`)
  writeJson(join(packDir, 'pack.json'), {
    schemaVersion: 1,
    kind: 'agent-pi-kb-pack',
    role: 'agent-pi-setup-restore',
    name: 'BOQ fixture',
    manuscript: 'manuscript.md',
    originalName: document.name,
    originalPath: document.path,
    units: [],
  })
}

/** Test / smoke helper: write a three-line pack and name those codes in the memo. */
export function writeBoqInventoryFixture(cwd: string, projectId: string, analysisDir?: string): {
  documentId: string
  data: TenderBoqReconciliationData
} {
  const workspace = loadWorkspace(cwd, projectId)
  const document = workspace.documents.find((row) => row.status === 'active' && isBoqSourceDocument(row))
    ?? workspace.documents.find((row) => row.status === 'active')
  if (!document) throw new Error('writeBoqInventoryFixture needs a registered source document')
  ensureFixtureBoqRestore(cwd, projectId, document)
  const data = fixtureBoqReconciliationData(document.id)
  const paths = workspacePaths(cwd, projectId)
  writeJson(join(paths.packs, `${CAPABILITY_FILE_NAMES.boq_reconciliation}.json`), {
    schemaVersion: 1,
    capability: 'boq_reconciliation',
    projectId,
    revision: 1,
    coreRevision: workspace.revision,
    upstream: [
      { capability: 'core', revision: workspace.revision },
      { capability: 'document_analysis', revision: 0 },
    ],
    updatedAt: new Date().toISOString(),
    data,
  })
  appendCodesToMemo(analysisDir ?? officialStageDir(cwd, projectId, ANALYSIS_SUITE_STAGE_ID), data)
  return { documentId: document.id, data }
}
