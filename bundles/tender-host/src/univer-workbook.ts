import { existsSync, readFileSync, writeFileSync, statSync } from 'node:fs'
import { basename, extname } from 'node:path'
import { assertInside } from './files.ts'
import { unzipStore, zipStore } from './xlsx-zip.ts'

/** Univer ICellData subset used by the overlay editor. */
export interface UniverCell {
  v?: string | number | boolean
  t?: 1 | 2 | 3 | 4
  f?: string
}

export interface UniverSheetData {
  id: string
  name: string
  rowCount: number
  columnCount: number
  cellData: Record<string, Record<string, UniverCell>>
}

export interface UniverWorkbookData {
  id: string
  name: string
  appVersion: string
  locale?: string
  sheetOrder: string[]
  sheets: Record<string, UniverSheetData>
  styles?: Record<string, unknown>
}

const MAX_ROWS = 4000
const MAX_COLS = 80
const STRING = 1
const NUMBER = 2
const BOOLEAN = 3

function xmlEscape(value: string): string {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

function decodeXmlEntity(raw: string, digits: string, hex: boolean): string {
  const code = Number.parseInt(digits, hex ? 16 : 10)
  if (!Number.isFinite(code) || code <= 0 || code > 0x10ffff) return raw
  try {
    return String.fromCodePoint(code)
  } catch {
    return raw
  }
}

function decodeXml(value: string): string {
  return String(value)
    .replace(/&#x([0-9a-fA-F]+);/g, (raw, hex) => decodeXmlEntity(raw, hex, true))
    .replace(/&#(\d+);/g, (raw, dec) => decodeXmlEntity(raw, dec, false))
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, '&')
}

function colIndex(letters: string): number {
  let n = 0
  for (const ch of letters.toUpperCase()) {
    if (ch < 'A' || ch > 'Z') break
    n = n * 26 + (ch.charCodeAt(0) - 64)
  }
  return Math.max(1, n)
}

function colLetter(index: number): string {
  let n = index
  let out = ''
  while (n > 0) {
    const rem = (n - 1) % 26
    out = String.fromCharCode(65 + rem) + out
    n = Math.floor((n - 1) / 26)
  }
  return out || 'A'
}

function parseSharedStrings(xml: string): string[] {
  const out: string[] = []
  const siRe = /<si\b[^>]*>([\s\S]*?)<\/si>/g
  let match: RegExpExecArray | null
  while ((match = siRe.exec(xml))) {
    const texts = [...match[1].matchAll(/<t\b[^>]*>([\s\S]*?)<\/t>/g)].map((item) => decodeXml(item[1]))
    out.push(texts.join(''))
  }
  return out
}

function attrValue(attrs: string, name: string): string {
  const double = new RegExp(`\\b${name}\\s*=\\s*"([^"]*)"`, 'i').exec(attrs)
  if (double) return decodeXml(double[1])
  const single = new RegExp(`\\b${name}\\s*=\\s*'([^']*)'`, 'i').exec(attrs)
  return single ? decodeXml(single[1]) : ''
}

function parseWorkbookSheets(xml: string): Array<{ name: string; rid: string }> {
  const out: Array<{ name: string; rid: string }> = []
  const re = /<sheet\b([^>]*?)\/?>/gi
  let match: RegExpExecArray | null
  while ((match = re.exec(xml))) {
    const attrs = match[1]
    const name = attrValue(attrs, 'name')
    const rid = attrValue(attrs, 'r:id') || attrValue(attrs, 'id')
    if (name && rid) out.push({ name, rid })
  }
  return out
}

function listWorksheetKeys(files: Map<string, Buffer>): string[] {
  return [...files.keys()]
    .filter((key) => /^xl\/worksheets\/[^/]+\.xml$/i.test(key))
    .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }))
}

function readSheetXml(files: Map<string, Buffer>, target: string, index: number): string {
  const normalized = String(target || '').replace(/\\/g, '/').replace(/^\//, '')
  const key = normalized.startsWith('xl/') ? normalized : `xl/${normalized.replace(/^\.\.\//, '')}`
  return (
    files.get(key)?.toString('utf8')
    || files.get(key.replace(/^xl\//, ''))?.toString('utf8')
    || files.get(`xl/worksheets/sheet${index + 1}.xml`)?.toString('utf8')
    || ''
  )
}

function parseRels(xml: string): Map<string, string> {
  const out = new Map<string, string>()
  const re = /<Relationship\b([^>]+)\/>/g
  let match: RegExpExecArray | null
  while ((match = re.exec(xml))) {
    const id = /\bId="([^"]+)"/.exec(match[1])?.[1]
    const target = /\bTarget="([^"]+)"/.exec(match[1])?.[1]
    if (id && target) out.set(id, target.replace(/^\//, '').replace(/\\/g, '/'))
  }
  return out
}

function formulaOf(raw: string): string {
  const text = String(raw || '').trim()
  if (!text) return ''
  return text.startsWith('=') ? text : `=${text}`
}

function cellFromXlsx(attrs: string, body: string, strings: string[]): UniverCell | null {
  const type = /\bt="([^"]+)"/.exec(attrs)?.[1] || ''
  const formula = /<f\b[^>]*>([\s\S]*?)<\/f>/.exec(body)?.[1]
  let value: string | number | boolean | undefined
  let t: UniverCell['t'] = STRING
  if (type === 'inlineStr') {
    const text = /<t\b[^>]*>([\s\S]*?)<\/t>/.exec(body)
    value = text ? decodeXml(text[1]) : ''
  } else {
    const raw = /<v>([\s\S]*?)<\/v>/.exec(body)?.[1]
    if (type === 's') {
      value = strings[Number(raw)] ?? raw ?? ''
    } else if (type === 'b') {
      value = raw === '1'
      t = BOOLEAN
    } else if (raw != null && raw !== '' && Number.isFinite(Number(raw))) {
      value = Number(raw)
      t = NUMBER
    } else if (raw != null) {
      value = decodeXml(raw)
    }
  }
  if (value === undefined && !formula) return null
  const cell: UniverCell = {}
  if (value !== undefined) cell.v = value
  if (t) cell.t = t
  if (formula) cell.f = formulaOf(decodeXml(formula))
  return cell
}

function parseSheetCells(xml: string, strings: string[]): {
  cellData: Record<string, Record<string, UniverCell>>
  rowCount: number
  columnCount: number
} {
  const cellData: Record<string, Record<string, UniverCell>> = {}
  let maxRow = 0
  let maxCol = 0
  const cellRe = /<c\b([^>]*)>([\s\S]*?)<\/c>/g
  let match: RegExpExecArray | null
  while ((match = cellRe.exec(xml))) {
    const ref = /\br="([A-Z]+)(\d+)"/.exec(match[1])
    if (!ref) continue
    const col = colIndex(ref[1])
    const row = Number(ref[2])
    if (row > MAX_ROWS || col > MAX_COLS) continue
    const cell = cellFromXlsx(match[1], match[2], strings)
    if (!cell) continue
    const r = String(row - 1)
    const c = String(col - 1)
    if (!cellData[r]) cellData[r] = {}
    cellData[r][c] = cell
    if (row > maxRow) maxRow = row
    if (col > maxCol) maxCol = col
  }
  return {
    cellData,
    rowCount: Math.max(40, maxRow + 20),
    columnCount: Math.max(12, maxCol + 4),
  }
}

function parseCsv(text: string, sep = ','): string[][] {
  const rows: string[][] = []
  let row: string[] = []
  let cell = ''
  let quoted = false
  const src = text.replace(/^\uFEFF/, '')
  for (let i = 0; i < src.length; i += 1) {
    const ch = src[i]
    if (quoted) {
      if (ch === '"' && src[i + 1] === '"') {
        cell += '"'
        i += 1
      } else if (ch === '"') quoted = false
      else cell += ch
      continue
    }
    if (ch === '"') {
      quoted = true
      continue
    }
    if (ch === sep) {
      row.push(cell)
      cell = ''
      continue
    }
    if (ch === '\n') {
      row.push(cell.replace(/\r$/, ''))
      rows.push(row)
      row = []
      cell = ''
      continue
    }
    cell += ch
  }
  if (cell || row.length) {
    row.push(cell.replace(/\r$/, ''))
    rows.push(row)
  }
  return rows.slice(0, MAX_ROWS).map((line) => line.slice(0, MAX_COLS))
}

function rowsToSheet(name: string, id: string, rows: string[][]): UniverSheetData {
  const cellData: Record<string, Record<string, UniverCell>> = {}
  let maxCol = 1
  rows.forEach((line, r) => {
    line.forEach((value, c) => {
      if (value === '') return
      if (!cellData[r]) cellData[r] = {}
      const num = Number(value)
      if (value.trim() !== '' && Number.isFinite(num) && String(num) === value.trim()) {
        cellData[r][c] = { v: num, t: NUMBER }
      } else {
        cellData[r][c] = { v: value, t: STRING }
      }
      if (c + 1 > maxCol) maxCol = c + 1
    })
  })
  return {
    id,
    name,
    rowCount: Math.max(40, rows.length + 20),
    columnCount: Math.max(12, maxCol + 4),
    cellData,
  }
}

function readXlsxWorkbook(abs: string, name: string): UniverWorkbookData {
  const files = unzipStore(readFileSync(abs))
  const strings = parseSharedStrings(files.get('xl/sharedStrings.xml')?.toString('utf8') || '')
  const listed = parseWorkbookSheets(files.get('xl/workbook.xml')?.toString('utf8') || '')
  const rels = parseRels(files.get('xl/_rels/workbook.xml.rels')?.toString('utf8') || '')
  const sheets: UniverSheetData[] = []
  if (!listed.length) {
    const keys = listWorksheetKeys(files)
    if (!keys.length) {
      sheets.push({ id: 'sheet-1', name: 'Sheet1', ...parseSheetCells('', strings) })
    } else {
      keys.forEach((key, index) => {
        sheets.push({
          id: `sheet-${index + 1}`,
          name: `Sheet${index + 1}`,
          ...parseSheetCells(files.get(key)?.toString('utf8') || '', strings),
        })
      })
    }
  } else {
    listed.forEach((sheet, index) => {
      const xml = readSheetXml(files, rels.get(sheet.rid) || `worksheets/sheet${index + 1}.xml`, index)
      sheets.push({ id: `sheet-${index + 1}`, name: sheet.name || `Sheet${index + 1}`, ...parseSheetCells(xml, strings) })
    })
  }
  return {
    id: 'workbook',
    name,
    appVersion: '0.25.1',
    locale: 'zhCN',
    sheetOrder: sheets.map((sheet) => sheet.id),
    sheets: Object.fromEntries(sheets.map((sheet) => [sheet.id, sheet])),
    styles: {},
  }
}

function csvEscape(value: string, sep = ','): string {
  const text = String(value ?? '')
  if (/["\r\n]/.test(text) || text.includes(sep)) return `"${text.replace(/"/g, '""')}"`
  return text
}

function displayCell(cell: UniverCell | undefined): string {
  if (!cell) return ''
  if (cell.f) return cell.f
  if (cell.v === true) return 'TRUE'
  if (cell.v === false) return 'FALSE'
  if (cell.v != null) return String(cell.v)
  const stream = (cell as { p?: { body?: { dataStream?: string } } }).p?.body?.dataStream
  return stream ? String(stream).replace(/\r\n$/, '') : ''
}

function sheetToRows(sheet: UniverSheetData): string[][] {
  let maxRow = 0
  let maxCol = 0
  Object.entries(sheet.cellData || {}).forEach(([r, cols]) => {
    const row = Number(r)
    if (!Number.isFinite(row)) return
    maxRow = Math.max(maxRow, row + 1)
    Object.keys(cols || {}).forEach((c) => {
      const col = Number(c)
      if (Number.isFinite(col)) maxCol = Math.max(maxCol, col + 1)
    })
  })
  const rows: string[][] = []
  for (let r = 0; r < Math.max(1, maxRow); r += 1) {
    const line: string[] = []
    for (let c = 0; c < Math.max(1, maxCol); c += 1) {
      line.push(displayCell(sheet.cellData?.[String(r)]?.[String(c)]))
    }
    rows.push(line)
  }
  return rows
}

function buildXlsxFromWorkbook(workbook: UniverWorkbookData): Buffer {
  const order = workbook.sheetOrder?.length
    ? workbook.sheetOrder
    : Object.keys(workbook.sheets || {})
  const named = (order.length ? order : ['sheet-1']).map((id, index) => {
    const sheet = workbook.sheets?.[id] || { id, name: `Sheet${index + 1}`, cellData: {}, rowCount: 1, columnCount: 1 }
    return { sheet, index }
  })
  const files: Array<{ name: string; data: string }> = []
  named.forEach(({ sheet, index }) => {
    const rows = sheetToFormulaRows(sheet)
    const rowXml = rows.map((row, r) => {
      const cells = row.map((cell, c) => {
        if (!cell) return ''
        const ref = `${colLetter(c + 1)}${r + 1}`
        if (cell.f) {
          const formula = cell.f.replace(/^=/, '')
          const cached = cell.v == null ? '' : `<v>${xmlEscape(String(cell.v))}</v>`
          return `<c r="${ref}"><f>${xmlEscape(formula)}</f>${cached}</c>`
        }
        if (typeof cell.v === 'number' && Number.isFinite(cell.v)) {
          return `<c r="${ref}"><v>${cell.v}</v></c>`
        }
        if (typeof cell.v === 'boolean') {
          return `<c r="${ref}" t="b"><v>${cell.v ? 1 : 0}</v></c>`
        }
        const text = cell.v == null ? '' : String(cell.v)
        if (!text) return ''
        return `<c r="${ref}" t="inlineStr"><is><t>${xmlEscape(text)}</t></is></c>`
      }).join('')
      return `<row r="${r + 1}">${cells}</row>`
    }).join('')
    files.push({
      name: `xl/worksheets/sheet${index + 1}.xml`,
      data: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>${rowXml}</sheetData></worksheet>`,
    })
  })
  files.push({
    name: '[Content_Types].xml',
    data: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>
  ${named.map((row) => `<Override PartName="/xl/worksheets/sheet${row.index + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join('\n  ')}
</Types>`,
  })
  files.push({
    name: '_rels/.rels',
    data: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>
</Relationships>`,
  })
  files.push({
    name: 'xl/workbook.xml',
    data: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
  <sheets>
    ${named.map(({ sheet, index }) => `<sheet name="${xmlEscape(sheet.name || `Sheet${index + 1}`)}" sheetId="${index + 1}" r:id="rId${index + 1}"/>`).join('\n    ')}
  </sheets>
</workbook>`,
  })
  files.push({
    name: 'xl/_rels/workbook.xml.rels',
    data: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  ${named.map((_, index) => `<Relationship Id="rId${index + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${index + 1}.xml"/>`).join('\n  ')}
</Relationships>`,
  })
  return zipStore(files)
}

function sheetToFormulaRows(sheet: UniverSheetData): Array<Array<UniverCell | null>> {
  let maxRow = 0
  let maxCol = 0
  Object.entries(sheet.cellData || {}).forEach(([r, cols]) => {
    const row = Number(r)
    if (!Number.isFinite(row)) return
    maxRow = Math.max(maxRow, row + 1)
    Object.entries(cols || {}).forEach(([c, cell]) => {
      if (!cell || (cell.v == null && !cell.f)) return
      const col = Number(c)
      if (Number.isFinite(col)) maxCol = Math.max(maxCol, col + 1)
    })
  })
  const rows: Array<Array<UniverCell | null>> = []
  for (let r = 0; r < Math.max(1, maxRow); r += 1) {
    const line: Array<UniverCell | null> = []
    for (let c = 0; c < Math.max(1, maxCol); c += 1) {
      line.push(sheet.cellData?.[String(r)]?.[String(c)] || null)
    }
    rows.push(line)
  }
  return rows
}

export function isUniverSheetPath(path: string): boolean {
  const ext = extname(path).toLowerCase()
  return ext === '.xlsx' || ext === '.csv' || ext === '.tsv'
}

export function readUniverWorkbook(cwd: string, sourcePath: string): UniverWorkbookData {
  const path = assertInside(cwd, sourcePath)
  if (!existsSync(path) || !statSync(path).isFile()) throw new Error('not a file')
  const ext = extname(path).toLowerCase()
  const name = basename(path)
  if (ext === '.csv' || ext === '.tsv') {
    const sheet = rowsToSheet(name, 'sheet-1', parseCsv(readFileSync(path, 'utf8'), ext === '.tsv' ? '\t' : ','))
    return {
      id: 'workbook',
      name,
      appVersion: '0.25.1',
      locale: 'zhCN',
      sheetOrder: ['sheet-1'],
      sheets: { 'sheet-1': sheet },
      styles: {},
    }
  }
  if (ext === '.xlsx') return readXlsxWorkbook(path, name)
  throw new Error('Univer overlay only opens xlsx / csv / tsv')
}

export function saveUniverWorkbook(
  cwd: string,
  sourcePath: string,
  workbook: UniverWorkbookData,
): { path: string; mtimeMs: number; hint: string } {
  const path = assertInside(cwd, sourcePath)
  const ext = extname(path).toLowerCase()
  if (ext === '.csv' || ext === '.tsv') {
    const sep = ext === '.tsv' ? '\t' : ','
    const first = workbook.sheets?.[workbook.sheetOrder?.[0] || ''] || Object.values(workbook.sheets || {})[0]
    const rows = first ? sheetToRows(first) : [['']]
    writeFileSync(path, rows.map((row) => row.map((cell) => csvEscape(cell, sep)).join(sep)).join('\n') + '\n', 'utf8')
  } else if (ext === '.xlsx') {
    writeFileSync(path, buildXlsxFromWorkbook(workbook))
  } else {
    throw new Error('Univer overlay can only save xlsx / csv / tsv')
  }
  return {
    path,
    mtimeMs: statSync(path).mtimeMs,
    hint: '已保存回原文件',
  }
}

export function univerSheetUrl(cwd: string, filePath: string): string {
  return `/api/agent-pi/univer-sheet?cwd=${encodeURIComponent(cwd)}&path=${encodeURIComponent(filePath)}`
}
