import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  parseTenderBoqFiveStepPricingData,
  parseTenderCapabilityEnvelope,
  type TenderBoqFiveStepItemBuildUp,
  type TenderBoqFiveStepPricingData,
  type TenderBoqPricingCostComponent,
} from '../../../packages/business-core/src/tender/index.ts'
import { CAPABILITY_FILE_NAMES, tenderDir, ensureDir } from './fsutil.ts'
import { officialStageDir } from './outputs.ts'
import { zipStore } from './xlsx-zip.ts'

export const BOQ_PRICING_WORKBOOK_FILE = 'BOQ 组价测算.xlsx'
export const BOQ_PRICING_STAGE_ID = 'boq-five-step-pricing'

type BlockId = 'material' | 'fuel' | 'plant' | 'labour' | 'admin'

const BLOCK_ORDER: BlockId[] = ['material', 'fuel', 'plant', 'labour', 'admin']

const BLOCK_TITLE: Record<BlockId, string> = {
  material: 'Cost of materials',
  fuel: 'Cost of fuel',
  plant: 'Cost of machinery',
  labour: 'Cost of labor',
  admin: 'Management fees and other expenses',
}

const BLOCK_TOTAL: Record<BlockId, string> = {
  material: 'PER UNIT TOTAL COST OF MATERIALS',
  fuel: 'PER UNIT TOTAL COST OF FUEL',
  plant: 'PER UNIT TOTAL COST OF MACHINERY',
  labour: 'PER UNIT TOTAL COST OF LABOR',
  admin: 'PER UNIT TOTAL COST OF MANAGEMENT FEES AND OTHER EXPENSES',
}

const BLOCK_PREFIX: Record<BlockId, string> = {
  material: 'M',
  fuel: 'F',
  plant: 'C',
  labour: 'L',
  admin: 'A',
}

type CellKind = 'title' | 'header' | 'section' | 'input' | 'formula' | 'text' | 'yellow'

interface SheetCell {
  ref: string
  text?: string
  number?: number
  formula?: string
  style: CellKind
}

interface SheetSpec {
  name: string
  cells: SheetCell[]
  merges: string[]
  widths: Array<{ min: number; max: number; width: number }>
}

function xmlEscape(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

function colLetter(index: number): string {
  let n = index
  let out = ''
  while (n > 0) {
    const rem = (n - 1) % 26
    out = String.fromCharCode(65 + rem) + out
    n = Math.floor((n - 1) / 26)
  }
  return out
}

function cellRef(col: number, row: number): string {
  return `${colLetter(col)}${row}`
}

function sanitizeSheetName(raw: string, used: Set<string>): string {
  let name = raw.replace(/[:\\/?*[\]]/g, ' ').replace(/\s+/g, ' ').trim() || 'Item'
  if (name.length > 31) name = name.slice(0, 31).trim()
  let candidate = name
  let n = 2
  while (used.has(candidate.toLowerCase())) {
    const suffix = `_${n}`
    candidate = `${name.slice(0, Math.max(1, 31 - suffix.length))}${suffix}`
    n += 1
  }
  used.add(candidate.toLowerCase())
  return candidate
}

function asNumber(value: string | undefined): number | undefined {
  if (value === undefined) return undefined
  const cleaned = String(value).replace(/,/g, '').trim()
  if (!cleaned) return undefined
  const n = Number(cleaned)
  return Number.isFinite(n) ? n : undefined
}

function looksLikeFormula(text: string | undefined): string | undefined {
  if (!text) return undefined
  const trimmed = text.trim()
  const body = trimmed.startsWith('=') ? trimmed.slice(1) : trimmed
  if (!/^[\d.+\-*/() \t]+$/.test(body)) return undefined
  if (!/[\d)]/.test(body)) return undefined
  return body.replace(/\s+/g, '')
}

/** Point a daily-output literal at the yellow H2 cell so the user can retune productivity. */
function rewriteQtyFormula(formula: string, daily: number): string {
  if (!Number.isFinite(daily) || daily <= 0) return formula
  const token = String(daily).replace('.', '\\.')
  return formula.replace(new RegExp(`(?<![0-9.])${token}(?![0-9.])`, 'g'), '$H$2')
}

function blockOf(component: TenderBoqPricingCostComponent): BlockId {
  const kind = String(component.kind || '')
  const desc = `${component.id} ${component.description} ${component.unit}`.toLowerCase()
  if (/diesel|gasoline|petrol|fuel|柴油|汽油|燃油/.test(desc) || /\/?\s*l\b/.test(desc)) return 'fuel'
  if (kind === 'material' || kind === 'waste') return 'material'
  if (kind === 'labour') return 'labour'
  if (kind === 'plant') return 'plant'
  if (kind === 'transport') return /l\b|litre|liter|柴油|fuel/.test(desc) ? 'fuel' : 'plant'
  return 'admin'
}

function componentCode(component: TenderBoqPricingCostComponent, block: BlockId, index: number): string {
  const id = String(component.id || '').trim()
  if (/^[A-Za-z][A-Za-z0-9._-]{1,16}$/.test(id)) return id
  return `${BLOCK_PREFIX[block]}${String(1000 + index + 1)}`
}

function stylesXml(): string {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
  <numFmts count="1"><numFmt numFmtId="164" formatCode="#,##0.00"/></numFmts>
  <fonts count="5">
    <font><sz val="11"/><name val="Arial"/></font>
    <font><b/><sz val="14"/><name val="Arial"/></font>
    <font><b/><sz val="11"/><color rgb="FFFFFFFF"/><name val="Arial"/></font>
    <font><b/><sz val="11"/><name val="Arial"/></font>
    <font><sz val="11"/><color rgb="FF0000FF"/><name val="Arial"/></font>
  </fonts>
  <fills count="5">
    <fill><patternFill patternType="none"/></fill>
    <fill><patternFill patternType="gray125"/></fill>
    <fill><patternFill patternType="solid"><fgColor rgb="FF1F4E79"/><bgColor rgb="FF1F4E79"/></patternFill></fill>
    <fill><patternFill patternType="solid"><fgColor rgb="FFD6DCE4"/><bgColor rgb="FFD6DCE4"/></patternFill></fill>
    <fill><patternFill patternType="solid"><fgColor rgb="FFFFFF99"/><bgColor rgb="FFFFFF99"/></patternFill></fill>
  </fills>
  <borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders>
  <cellStyleXfs count="1"><xf/></cellStyleXfs>
  <cellXfs count="7">
    <xf xfId="0" fontId="0"/>
    <xf xfId="0" fontId="1" applyFont="1"/>
    <xf xfId="0" fontId="2" fillId="2" applyFont="1" applyFill="1"/>
    <xf xfId="0" fontId="3" fillId="3" applyFont="1" applyFill="1"/>
    <xf xfId="0" fontId="4" numFmtId="164" applyFont="1" applyNumberFormat="1"/>
    <xf xfId="0" fontId="0" numFmtId="164" applyNumberFormat="1"/>
    <xf xfId="0" fontId="4" fillId="4" numFmtId="164" applyFont="1" applyFill="1" applyNumberFormat="1"/>
  </cellXfs>
</styleSheet>`
}

function styleIndex(kind: CellKind): number {
  switch (kind) {
    case 'title': return 1
    case 'header': return 2
    case 'section': return 3
    case 'input': return 4
    case 'formula': return 5
    case 'yellow': return 6
    default: return 0
  }
}

function sheetXml(sheet: SheetSpec, shared: Map<string, number>): string {
  const byRow = new Map<number, SheetCell[]>()
  for (const cell of sheet.cells) {
    const row = Number(cell.ref.replace(/^[A-Z]+/, ''))
    const list = byRow.get(row) ?? []
    list.push(cell)
    byRow.set(row, list)
  }
  const rows = [...byRow.keys()].sort((a, b) => a - b)
  const rowXml = rows.map((row) => {
    const cells = (byRow.get(row) ?? []).sort((a, b) => a.ref.localeCompare(b.ref, 'en'))
    const body = cells.map((cell) => {
      const s = styleIndex(cell.style)
      if (cell.formula !== undefined) {
        return `<c r="${cell.ref}" s="${s}"><f>${xmlEscape(cell.formula)}</f></c>`
      }
      if (cell.number !== undefined) {
        return `<c r="${cell.ref}" s="${s}"><v>${cell.number}</v></c>`
      }
      const text = cell.text ?? ''
      const idx = shared.get(text)
      return `<c r="${cell.ref}" s="${s}" t="s"><v>${idx ?? 0}</v></c>`
    }).join('')
    return `<row r="${row}">${body}</row>`
  }).join('')
  const cols = sheet.widths.map((col) =>
    `<col min="${col.min}" max="${col.max}" width="${col.width}" customWidth="1"/>`).join('')
  const merges = sheet.merges.length
    ? `<mergeCells count="${sheet.merges.length}">${sheet.merges.map((ref) => `<mergeCell ref="${ref}"/>`).join('')}</mergeCells>`
    : ''
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
  <sheetViews><sheetView workbookViewId="0"/></sheetViews>
  <sheetFormatPr defaultRowHeight="16"/>
  <cols>${cols}</cols>
  <sheetData>${rowXml}</sheetData>
  ${merges}
</worksheet>`
}

function collectStrings(sheets: SheetSpec[]): string[] {
  const seen = new Set<string>()
  const out: string[] = []
  for (const sheet of sheets) {
    for (const cell of sheet.cells) {
      if (cell.formula !== undefined || cell.number !== undefined) continue
      const text = cell.text ?? ''
      if (seen.has(text)) continue
      seen.add(text)
      out.push(text)
    }
  }
  return out
}

function buildXlsx(sheets: SheetSpec[]): Buffer {
  const strings = collectStrings(sheets)
  const shared = new Map(strings.map((text, index) => [text, index]))
  const sst = strings.map((text) => `<si><t xml:space="preserve">${xmlEscape(text)}</t></si>`).join('')
  const workbookSheets = sheets.map((sheet, index) =>
    `<sheet name="${xmlEscape(sheet.name)}" sheetId="${index + 1}" r:id="rId${index + 1}"/>`).join('')
  const workbookRels = sheets.map((_, index) =>
    `<Relationship Id="rId${index + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${index + 1}.xml"/>`).join('')
  const overrides = sheets.map((_, index) =>
    `<Override PartName="/xl/worksheets/sheet${index + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join('')
  const files = [
    {
      name: '[Content_Types].xml',
      data: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>
  <Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>
  <Override PartName="/xl/sharedStrings.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sharedStrings+xml"/>
  ${overrides}
</Types>`,
    },
    {
      name: '_rels/.rels',
      data: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>
</Relationships>`,
    },
    {
      name: 'xl/workbook.xml',
      data: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
  <sheets>${workbookSheets}</sheets>
  <calcPr fullCalcOnLoad="1"/>
</workbook>`,
    },
    {
      name: 'xl/_rels/workbook.xml.rels',
      data: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  ${workbookRels}
  <Relationship Id="rId${sheets.length + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>
  <Relationship Id="rId${sheets.length + 2}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/sharedStrings" Target="sharedStrings.xml"/>
</Relationships>`,
    },
    { name: 'xl/styles.xml', data: stylesXml() },
    {
      name: 'xl/sharedStrings.xml',
      data: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<sst xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" count="${strings.length}" uniqueCount="${strings.length}">${sst}</sst>`,
    },
    ...sheets.map((sheet, index) => ({
      name: `xl/worksheets/sheet${index + 1}.xml`,
      data: sheetXml(sheet, shared),
    })),
  ]
  return zipStore(files)
}

function add(cells: SheetCell[], ref: string, value: Partial<SheetCell> & { style?: CellKind }): void {
  cells.push({ ref, style: value.style ?? 'text', text: value.text, number: value.number, formula: value.formula })
}

function analysisConditions(item: TenderBoqFiveStepItemBuildUp): string {
  const lines: string[] = []
  const hours = item.productivityBasis?.workingHoursPerDay
  const output = item.planningBasis?.productionRate || item.productivityBasis?.theoreticalProductionRate
  const unit = item.planningBasis?.quantityUnit || item.itemIdentity?.unit || ''
  if (hours) lines.push(`1. Work ${hours} hours per day;`)
  if (output) lines.push(`2. The daily output is ${output} ${unit};`.trim())
  if (item.productivityBasis?.methodSequence?.length) {
    lines.push(`3. Method: ${item.productivityBasis.methodSequence.join(' → ')}`)
  }
  for (const condition of item.conditions ?? []) {
    if (condition.trim()) lines.push(condition.trim())
  }
  if (lines.length === 0) lines.push('Edit daily output in H2. Quantity and rate cells with blue text are inputs; black cells are formulas.')
  return `Analysis conditions:\n${lines.join('\n')}`
}

function dailyOutput(item: TenderBoqFiveStepItemBuildUp): number {
  return asNumber(item.planningBasis?.productionRate)
    ?? asNumber(item.productivityBasis?.theoreticalProductionRate)
    ?? asNumber(item.productivityBasis?.scenarios?.find((row) => row.scenario === 'base')?.productionRate)
    ?? 1
}

function hoursPerDay(item: TenderBoqFiveStepItemBuildUp): number {
  return asNumber(item.productivityBasis?.workingHoursPerDay) ?? 10
}

function buildItemSheet(item: TenderBoqFiveStepItemBuildUp, sheetName: string, title: string): SheetSpec {
  const cells: SheetCell[] = []
  const merges: string[] = []
  const identity = item.itemIdentity
  const code = identity?.code || item.boqItemId
  const grouped = new Map<BlockId, TenderBoqPricingCostComponent[]>()
  for (const block of BLOCK_ORDER) grouped.set(block, [])
  for (const component of item.costComponents ?? []) {
    grouped.get(blockOf(component))!.push(component)
  }
  const usedBlocks = BLOCK_ORDER.filter((block) => (grouped.get(block) ?? []).length > 0)
  const blocks = usedBlocks.length > 0 ? usedBlocks : (['fuel', 'plant', 'labour', 'admin'] as BlockId[])

  add(cells, 'A1', { text: title, style: 'title' })
  merges.push('A1:F1')
  add(cells, 'A2', { text: 'BOQ ITEM', style: 'header' })
  add(cells, 'B2', { text: 'DESCRIPTION', style: 'header' })
  add(cells, 'C2', { text: 'UNIT', style: 'header' })
  add(cells, 'D2', { text: 'QUANTITY', style: 'header' })
  add(cells, 'E2', { text: 'RATE', style: 'header' })
  merges.push('E2:F2')
  add(cells, 'A3', { text: code, style: 'text' })
  add(cells, 'B3', { text: identity?.description || item.boqItemId, style: 'text' })
  add(cells, 'C3', { text: identity?.unit || '', style: 'text' })
  add(cells, 'D3', { number: 1, style: 'input' })
  add(cells, 'G2', { text: 'Daily output', style: 'text' })
  add(cells, 'H2', { number: dailyOutput(item), style: 'yellow' })
  add(cells, 'G3', { text: 'Hours per day', style: 'text' })
  add(cells, 'H3', { number: hoursPerDay(item), style: 'yellow' })
  add(cells, 'A4', { text: analysisConditions(item), style: 'text' })
  merges.push('A4:F4')

  let row = 5
  const subtotalRows: number[] = []
  let seq = 0
  for (const [index, block] of blocks.entries()) {
    const components = grouped.get(block) ?? []
    add(cells, `A${row}`, { text: `${code}.${index + 1}  ${BLOCK_TITLE[block]}`, style: 'section' })
    merges.push(`A${row}:F${row}`)
    row += 1
    add(cells, `A${row}`, { text: 'ITEM', style: 'header' })
    add(cells, `B${row}`, { text: 'DESCRIPTION', style: 'header' })
    add(cells, `C${row}`, { text: 'UNIT', style: 'header' })
    add(cells, `D${row}`, { text: 'QUANTITY', style: 'header' })
    add(cells, `E${row}`, { text: 'UNIT COST', style: 'header' })
    add(cells, `F${row}`, { text: 'TOTAL', style: 'header' })
    row += 1
    const first = row
    const rows = components.length > 0 ? components : [{
      id: `${BLOCK_PREFIX[block]}1001`,
      kind: block === 'admin' ? 'other' : block === 'fuel' ? 'other' : block,
      description: `Add ${BLOCK_TITLE[block].toLowerCase()} here`,
      quantity: '0',
      unit: '',
      rate: '0',
      amount: '0',
      assumptionStatus: 'unverified' as const,
    } satisfies TenderBoqPricingCostComponent]
    for (const component of rows) {
      const consumption = item.resourceConsumptions?.find((entry) => entry.costComponentId === component.id)
      const qtyFormula = looksLikeFormula(consumption?.calculationBasis)
      const qty = asNumber(component.quantity) ?? asNumber(consumption?.quantity) ?? 0
      const rate = asNumber(component.rate) ?? 0
      add(cells, `A${row}`, { text: componentCode(component, block, seq), style: 'text' })
      add(cells, `B${row}`, { text: component.description || '', style: 'text' })
      add(cells, `C${row}`, { text: component.unit || consumption?.unit || '', style: 'text' })
      if (qtyFormula) add(cells, `D${row}`, { formula: rewriteQtyFormula(qtyFormula, dailyOutput(item)), style: 'formula' })
      else add(cells, `D${row}`, { number: qty, style: 'input' })
      add(cells, `E${row}`, { number: rate, style: 'input' })
      add(cells, `F${row}`, { formula: `D${row}*E${row}`, style: 'formula' })
      seq += 1
      row += 1
    }
    const last = row - 1
    add(cells, `A${row}`, { text: `${code}.${index + 1}`, style: 'section' })
    add(cells, `B${row}`, { text: BLOCK_TOTAL[block], style: 'section' })
    merges.push(`B${row}:E${row}`)
    add(cells, `F${row}`, { formula: `SUM(F${first}:F${last})`, style: 'formula' })
    subtotalRows.push(row)
    row += 1
  }

  const totalRow = row
  add(cells, `A${totalRow}`, { text: `TOTAL COST FOR ${code} (Excluding VAT)`, style: 'section' })
  merges.push(`A${totalRow}:E${totalRow}`)
  add(cells, `F${totalRow}`, { formula: subtotalRows.map((n) => `F${n}`).join('+') || '0', style: 'formula' })
  const profitRow = totalRow + 1
  add(cells, `A${profitRow}`, { text: 'PROFIT', style: 'section' })
  merges.push(`A${profitRow}:E${profitRow}`)
  add(cells, `F${profitRow}`, { formula: `F${totalRow}*Rates!$B$5`, style: 'formula' })
  const priceRow = profitRow + 1
  add(cells, `A${priceRow}`, { text: `PRICE OF ${code} (Excluding VAT)`, style: 'section' })
  merges.push(`A${priceRow}:E${priceRow}`)
  add(cells, `F${priceRow}`, { formula: `F${totalRow}+F${profitRow}`, style: 'formula' })
  add(cells, 'E3', { formula: `F${priceRow}`, style: 'formula' })

  return {
    name: sheetName,
    cells,
    merges,
    widths: [
      { min: 1, max: 1, width: 14 },
      { min: 2, max: 2, width: 42 },
      { min: 3, max: 3, width: 10 },
      { min: 4, max: 6, width: 14 },
      { min: 7, max: 7, width: 16 },
      { min: 8, max: 8, width: 14 },
    ],
  }
}

function buildRatesSheet(data: TenderBoqFiveStepPricingData): SheetSpec {
  const cells: SheetCell[] = []
  add(cells, 'A1', { text: 'Assumptions (blue / yellow cells are inputs)', style: 'title' })
  add(cells, 'A2', { text: 'Currency', style: 'text' })
  add(cells, 'B2', { text: data.currency || 'USD', style: 'input' })
  add(cells, 'A3', { text: 'Hours per day (default)', style: 'text' })
  add(cells, 'B3', { number: 10, style: 'yellow' })
  add(cells, 'A4', { text: 'VAT factor (rate cells may divide by this)', style: 'text' })
  add(cells, 'B4', { number: 1.12, style: 'yellow' })
  add(cells, 'A5', { text: 'Profit fraction on direct cost (0 = C5.1 pure direct)', style: 'text' })
  add(cells, 'B5', { number: 0, style: 'yellow' })
  add(cells, 'A7', { text: 'Edit item-sheet UNIT COST and Daily output. Totals and the header RATE are formulas.', style: 'text' })
  add(cells, 'A8', { text: 'Do not replace F=D*E or block SUM rows with typed numbers.', style: 'text' })
  return {
    name: 'Rates',
    cells,
    merges: ['A1:F1'],
    widths: [{ min: 1, max: 1, width: 48 }, { min: 2, max: 2, width: 16 }],
  }
}

function buildSummarySheet(title: string, items: Array<{ sheet: string; item: TenderBoqFiveStepItemBuildUp }>): SheetSpec {
  const cells: SheetCell[] = []
  add(cells, 'A1', { text: title, style: 'title' })
  add(cells, 'A2', { text: 'BOQ ITEM', style: 'header' })
  add(cells, 'B2', { text: 'DESCRIPTION', style: 'header' })
  add(cells, 'C2', { text: 'UNIT', style: 'header' })
  add(cells, 'D2', { text: 'QUANTITY', style: 'header' })
  add(cells, 'E2', { text: 'RATE', style: 'header' })
  add(cells, 'F2', { text: 'AMOUNT', style: 'header' })
  items.forEach((row, index) => {
    const r = index + 3
    const identity = row.item.itemIdentity
    const quoted = `'${row.sheet.replace(/'/g, "''")}'`
    add(cells, `A${r}`, { text: identity?.code || row.item.boqItemId, style: 'text' })
    add(cells, `B${r}`, { text: identity?.description || row.item.boqItemId, style: 'text' })
    add(cells, `C${r}`, { text: identity?.unit || '', style: 'text' })
    add(cells, `D${r}`, { number: asNumber(identity?.quantity) ?? 0, style: 'input' })
    add(cells, `E${r}`, { formula: `${quoted}!E3`, style: 'formula' })
    add(cells, `F${r}`, { formula: `D${r}*E${r}`, style: 'formula' })
  })
  const first = 3
  const last = Math.max(2, items.length + 2)
  const totalRow = last + 1
  add(cells, `A${totalRow}`, { text: 'TOTAL (Excluding VAT)', style: 'section' })
  add(cells, `F${totalRow}`, { formula: items.length ? `SUM(F${first}:F${last})` : '0', style: 'formula' })
  return {
    name: 'Summary',
    cells,
    merges: ['A1:F1'],
    widths: [
      { min: 1, max: 1, width: 14 },
      { min: 2, max: 2, width: 48 },
      { min: 3, max: 3, width: 10 },
      { min: 4, max: 6, width: 14 },
    ],
  }
}

export function buildPricingWorkbook(data: TenderBoqFiveStepPricingData, projectTitle = 'BOQ'): Buffer {
  const title = `BOQ ITEM UNIT COST ANALYSIS FOR ${projectTitle}`
  const used = new Set<string>(['summary', 'rates'])
  const itemSheets = data.itemBuildUps.map((item) => {
    const name = sanitizeSheetName(item.itemIdentity?.code || item.boqItemId, used)
    return { sheet: name, spec: buildItemSheet(item, name, title), item }
  })
  const sheets = [
    buildSummarySheet(title, itemSheets.map((row) => ({ sheet: row.sheet, item: row.item }))),
    buildRatesSheet(data),
    ...itemSheets.map((row) => row.spec),
  ]
  return buildXlsx(sheets)
}

export function demoPricingData(): TenderBoqFiveStepPricingData {
  return {
    currency: 'USD',
    pricingStandard: 'c51_pure_direct_cost_v1',
    vatTreatment: 'exclusive',
    indirectCostPolicy: 'excluded_from_item_direct_cost',
    pricingStatus: 'draft',
    itemBuildUps: [{
      boqItemId: '700.1',
      status: 'draft',
      steps: {
        scopeQuantity: { narrative: 'demo', sourceRefs: [] },
        methodProductivity: { narrative: 'demo', sourceRefs: [] },
        resourceConsumption: { narrative: 'demo', sourceRefs: [] },
        sourcedRatesDirectCost: { narrative: 'demo', sourceRefs: [] },
        reconciliationRisk: { narrative: 'demo', sourceRefs: [] },
      },
      itemIdentity: {
        code: '700.1',
        description: 'Demo pavement item (edit quantities and rates)',
        unit: 'm2',
        quantity: '1000',
        sourceRef: { documentId: 'template' },
      },
      productivityBasis: {
        methodSequence: ['Load', 'Haul', 'Place'],
        crew: [],
        workingHoursPerDay: '10',
        bottleneck: 'loader',
        theoreticalProductionRate: '3200',
        calculationFormula: 'fleet x hours / output',
        scenarios: [],
      },
      planningBasis: {
        methodId: 'demo',
        productionRate: '3200',
        quantityUnit: 'm2',
        timeUnit: 'working_day',
        duration: '1',
        calendarId: 'cal',
        activityId: 'a1',
        assumptionStatus: 'scenario',
        sourceRefs: [],
      },
      resourceConsumptions: [
        { id: 'r1', kind: 'other', description: 'Diesel of 2 loader,10L/hour', quantity: '0.0625', unit: 'L', assumptionStatus: 'scenario', calculationBasis: '2*10*10/3200', costComponentId: 'F1001' },
      ],
      costComponents: [
        { id: 'F1001', kind: 'other', description: 'Diesel of 2 loader,10L/hour', quantity: '0.0625', unit: 'L', rate: '272.32', amount: '17.02', assumptionStatus: 'unverified' },
        { id: 'C1001', kind: 'plant', description: '2 loader (owned equipment)', quantity: '0.000625', unit: 'per shift', rate: '8000', amount: '5', assumptionStatus: 'unverified' },
        { id: 'L1001', kind: 'labour', description: '2 driver of loader', quantity: '0.000625', unit: 'day', rate: '23255.6', amount: '14.53', assumptionStatus: 'unverified' },
        { id: 'A1001', kind: 'other', description: 'Management team fees', quantity: '0.0003125', unit: 'day', rate: '54166.67', amount: '16.93', assumptionStatus: 'unverified' },
      ],
      directCost: '53.48',
      conditions: ['Template only. Replace with this project’s sourced rates.'],
      riskNotes: [],
    }],
    resourceSummary: [],
    assumptions: [],
  }
}

export function loadPricingPack(cwd: string, projectId: string): TenderBoqFiveStepPricingData | undefined {
  const path = join(tenderDir(cwd, projectId), 'packs', `${CAPABILITY_FILE_NAMES.boq_five_step_pricing}.json`)
  if (!existsSync(path)) return undefined
  const envelope = parseTenderCapabilityEnvelope(JSON.parse(readFileSync(path, 'utf8')))
  return parseTenderBoqFiveStepPricingData(envelope.data)
}

export function pricingWorkbookPath(cwd: string, projectId: string): string {
  return join(officialStageDir(cwd, projectId, BOQ_PRICING_STAGE_ID), BOQ_PRICING_WORKBOOK_FILE)
}

/** Stage-complete gate: BOQ pricing also needs the formula workbook next to the Markdown report. */
export function pricingWorkbookMissing(cwd: string, projectId: string, stageId: string): string | undefined {
  if (stageId !== BOQ_PRICING_STAGE_ID) return undefined
  if (existsSync(pricingWorkbookPath(cwd, projectId))) return undefined
  return `缺公式测算表《${BOQ_PRICING_WORKBOOK_FILE}》（应位于 Agent Pi Outputs/${projectId}/boq-pricing/）。请在《BOQ 组价总报告.md》之后调用 tender_pricing_workbook generate。蓝字/黄底单元格可改，合计与表头 RATE 必须保持公式。`
}

export function writeDemoTemplate(path: string): void {
  ensureDir(join(path, '..'))
  writeFileSync(path, buildPricingWorkbook(demoPricingData(), 'TEMPLATE'))
}

export function generatePricingWorkbook(input: {
  cwd: string
  projectId: string
  projectTitle?: string
  data?: TenderBoqFiveStepPricingData
}): { path: string; fileName: string; items: number; sheets: number } {
  const data = input.data ?? loadPricingPack(input.cwd, input.projectId)
  if (!data) throw new Error('还没有 boq_five_step_pricing 数据包。请先完成章节组价并 tender_capability replace。')
  if (!data.itemBuildUps.length) throw new Error('组价包里没有清单项，无法生成测算表。')
  const dir = officialStageDir(input.cwd, input.projectId, BOQ_PRICING_STAGE_ID)
  ensureDir(dir)
  const path = join(dir, BOQ_PRICING_WORKBOOK_FILE)
  const buffer = buildPricingWorkbook(data, input.projectTitle || input.projectId)
  writeFileSync(path, buffer)
  return {
    path,
    fileName: BOQ_PRICING_WORKBOOK_FILE,
    items: data.itemBuildUps.length,
    sheets: data.itemBuildUps.length + 2,
  }
}
