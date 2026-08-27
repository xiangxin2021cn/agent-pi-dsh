import { existsSync, readFileSync, writeFileSync, statSync } from 'node:fs'
import { basename, extname } from 'node:path'
import { assertInside } from './files.ts'
import { unzipStore, zipStore } from './xlsx-zip.ts'

export type OfficeKind = 'spreadsheet' | 'word' | 'slides' | 'legacy-office'

export interface OfficeSheet {
  name: string
  rows: string[][]
}

export interface OfficeSlide {
  name: string
  texts: string[]
}

export interface OfficePreview {
  kind: OfficeKind
  path: string
  editable: boolean
  hint: string
  sheets?: OfficeSheet[]
  paragraphs?: string[]
  slides?: OfficeSlide[]
}

const MAX_SHEET_ROWS = 400
const MAX_SHEET_COLS = 80
const MAX_PARAS = 2000

function xmlEscape(value: string): string {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

function xmlText(value: string): string {
  return String(value).replace(/<!\[CDATA\[/g, '').replace(/]]>/g, '')
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

function parseSheetRows(xml: string, strings: string[]): string[][] {
  const cells = new Map<string, string>()
  let maxRow = 0
  let maxCol = 0
  const cellRe = /<c\b([^>]*)>([\s\S]*?)<\/c>/g
  let match: RegExpExecArray | null
  while ((match = cellRe.exec(xml))) {
    const attrs = match[1]
    const body = match[2]
    const ref = /\br="([A-Z]+)(\d+)"/.exec(attrs)
    if (!ref) continue
    const col = colIndex(ref[1])
    const row = Number(ref[2])
    if (row > MAX_SHEET_ROWS || col > MAX_SHEET_COLS) continue
    const type = /\bt="([^"]+)"/.exec(attrs)?.[1] || ''
    let value = ''
    if (type === 'inlineStr') {
      const t = /<t\b[^>]*>([\s\S]*?)<\/t>/.exec(body)
      value = t ? decodeXml(t[1]) : ''
    } else {
      const v = /<v>([\s\S]*?)<\/v>/.exec(body)
      const raw = v ? v[1] : ''
      if (type === 's') value = strings[Number(raw)] ?? raw
      else if (type === 'b') value = raw === '1' ? 'TRUE' : 'FALSE'
      else value = raw
    }
    cells.set(`${row}:${col}`, value)
    if (row > maxRow) maxRow = row
    if (col > maxCol) maxCol = col
  }
  const rows: string[][] = []
  for (let r = 1; r <= maxRow; r += 1) {
    const line: string[] = []
    for (let c = 1; c <= maxCol; c += 1) line.push(cells.get(`${r}:${c}`) ?? '')
    rows.push(line)
  }
  return rows
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
      } else if (ch === '"') {
        quoted = false
      } else {
        cell += ch
      }
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
  return rows.slice(0, MAX_SHEET_ROWS).map((line) => line.slice(0, MAX_SHEET_COLS))
}

function csvEscape(value: string, sep = ','): string {
  const text = String(value ?? '')
  if (/["\r\n]/.test(text) || text.includes(sep)) return `"${text.replace(/"/g, '""')}"`
  return text
}

function stringifyCsv(rows: string[][], sep = ','): string {
  return rows.map((row) => row.map((cell) => csvEscape(cell, sep)).join(sep)).join('\n') + (rows.length ? '\n' : '')
}

function readXlsx(abs: string): OfficeSheet[] {
  const files = unzipStore(readFileSync(abs))
  const strings = parseSharedStrings(files.get('xl/sharedStrings.xml')?.toString('utf8') || '')
  const sheets = parseWorkbookSheets(files.get('xl/workbook.xml')?.toString('utf8') || '')
  const rels = parseRels(files.get('xl/_rels/workbook.xml.rels')?.toString('utf8') || '')
  if (!sheets.length) {
    const keys = listWorksheetKeys(files)
    if (!keys.length) return [{ name: 'Sheet1', rows: [] }]
    return keys.map((key, index) => ({
      name: `Sheet${index + 1}`,
      rows: parseSheetRows(files.get(key)?.toString('utf8') || '', strings),
    }))
  }
  return sheets.map((sheet, index) => ({
    name: sheet.name,
    rows: parseSheetRows(readSheetXml(files, rels.get(sheet.rid) || `worksheets/sheet${index + 1}.xml`, index), strings),
  }))
}

function extractParagraphs(xml: string): string[] {
  const paras: string[] = []
  const re = /<w:p\b[^>]*>([\s\S]*?)<\/w:p>/g
  let match: RegExpExecArray | null
  while ((match = re.exec(xml))) {
    const texts = [...match[1].matchAll(/<w:t\b[^>]*>([\s\S]*?)<\/w:t>/g)].map((item) => decodeXml(item[1]))
    paras.push(texts.join(''))
    if (paras.length >= MAX_PARAS) break
  }
  return paras
}

function extractSlideTexts(xml: string): string[] {
  return [...xml.matchAll(/<a:t>([\s\S]*?)<\/a:t>/g)].map((item) => decodeXml(item[1]))
}

function buildSimpleXlsx(sheets: OfficeSheet[]): Buffer {
  const named = sheets.length ? sheets : [{ name: 'Sheet1', rows: [['']] }]
  const files: Array<{ name: string; data: string }> = []
  const sheetFiles = named.map((sheet, index) => {
    const rows = sheet.rows.length ? sheet.rows : [['']]
    const rowXml = rows.map((row, r) => {
      const cells = row.map((value, c) => {
        const ref = `${colLetter(c + 1)}${r + 1}`
        const num = Number(value)
        if (value !== '' && Number.isFinite(num) && String(value).trim() === String(num)) {
          return `<c r="${ref}"><v>${num}</v></c>`
        }
        return `<c r="${ref}" t="inlineStr"><is><t>${xmlEscape(value)}</t></is></c>`
      }).join('')
      return `<row r="${r + 1}">${cells}</row>`
    }).join('')
    const name = `xl/worksheets/sheet${index + 1}.xml`
    files.push({
      name,
      data: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>${rowXml}</sheetData></worksheet>`,
    })
    return { sheet, index }
  })
  files.push({
    name: '[Content_Types].xml',
    data: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>
  ${sheetFiles.map((row) => `<Override PartName="/xl/worksheets/sheet${row.index + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join('\n  ')}
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
    ${named.map((sheet, index) => `<sheet name="${xmlEscape(sheet.name || `Sheet${index + 1}`)}" sheetId="${index + 1}" r:id="rId${index + 1}"/>`).join('\n    ')}
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

function buildSimpleDocx(paragraphs: string[]): Buffer {
  const paras = (paragraphs.length ? paragraphs : ['']).map((line) => {
    const text = xmlEscape(xmlText(line))
    return `<w:p><w:r><w:t xml:space="preserve">${text}</w:t></w:r></w:p>`
  }).join('')
  return zipStore([
    {
      name: '[Content_Types].xml',
      data: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
</Types>`,
    },
    {
      name: '_rels/.rels',
      data: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>
</Relationships>`,
    },
    {
      name: 'word/document.xml',
      data: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>${paras}<w:sectPr/></w:body></w:document>`,
    },
  ])
}

function patchPptxTexts(abs: string, slides: OfficeSlide[]): Buffer {
  const files = unzipStore(readFileSync(abs))
  const names = [...files.keys()].filter((name) => /^ppt\/slides\/slide\d+\.xml$/i.test(name)).sort()
  names.forEach((name, index) => {
    const wanted = slides[index]?.texts || []
    let i = 0
    const xml = files.get(name)?.toString('utf8') || ''
    const next = xml.replace(/<a:t>([\s\S]*?)<\/a:t>/g, () => {
      const text = wanted[i] ?? ''
      i += 1
      return `<a:t>${xmlEscape(xmlText(text))}</a:t>`
    })
    files.set(name, Buffer.from(next, 'utf8'))
  })
  return zipStore([...files.entries()].map(([name, data]) => ({ name, data })))
}

function officeExt(path: string): string {
  return extname(path).toLowerCase()
}

export function isOfficePreviewKind(kind: string): boolean {
  return kind === 'spreadsheet' || kind === 'word' || kind === 'slides' || kind === 'legacy-office'
}

export function readOfficePreview(cwd: string, sourcePath: string): OfficePreview {
  const path = assertInside(cwd, sourcePath)
  if (!existsSync(path) || !statSync(path).isFile()) throw new Error('not a file')
  const ext = officeExt(path)
  if (ext === '.xls' || ext === '.doc' || ext === '.ppt') {
    return {
      kind: 'legacy-office',
      path,
      editable: false,
      hint: '这是旧版 OLE 文件。请另存为 xlsx / docx / pptx 后再在预览里编辑。复杂公式表也可在对话里用 univer_import 打开。',
    }
  }
  if (ext === '.csv' || ext === '.tsv') {
    const sep = ext === '.tsv' ? '\t' : ','
    const rows = parseCsv(readFileSync(path, 'utf8'), sep)
    return {
      kind: 'spreadsheet',
      path,
      editable: true,
      hint: 'CSV 可直接改格子并保存。',
      sheets: [{ name: basename(path), rows }],
    }
  }
  if (ext === '.xlsx') {
    return {
      kind: 'spreadsheet',
      path,
      editable: true,
      hint: '保存会写成数值表。带公式或样式的复杂表请用对话里的 univer_import。',
      sheets: readXlsx(path),
    }
  }
  if (ext === '.docx') {
    const files = unzipStore(readFileSync(path))
    const xml = files.get('word/document.xml')?.toString('utf8') || ''
    return {
      kind: 'word',
      path,
      editable: true,
      hint: '预览改的是段落文字。复杂排版保存后会收成简单文档；需要保版式时用对话 univer_import。',
      paragraphs: extractParagraphs(xml),
    }
  }
  if (ext === '.pptx') {
    const files = unzipStore(readFileSync(path))
    const names = [...files.keys()].filter((name) => /^ppt\/slides\/slide\d+\.xml$/i.test(name)).sort()
    return {
      kind: 'slides',
      path,
      editable: true,
      hint: '改的是每页已有文本框。新增框请用对话 univer_import。',
      slides: names.map((name, index) => ({
        name: `Slide ${index + 1}`,
        texts: extractSlideTexts(files.get(name)?.toString('utf8') || ''),
      })),
    }
  }
  throw new Error('unsupported office file')
}

export function saveOfficePreview(
  cwd: string,
  sourcePath: string,
  office: { kind?: string; sheets?: OfficeSheet[]; paragraphs?: string[]; slides?: OfficeSlide[] },
): { path: string; mtimeMs: number; hint: string } {
  const path = assertInside(cwd, sourcePath)
  const ext = officeExt(path)
  if (ext === '.xls' || ext === '.doc' || ext === '.ppt') {
    throw new Error('旧版 OLE 文件不能在预览里保存，请另存为 xlsx / docx / pptx')
  }
  if (ext === '.csv' || ext === '.tsv') {
    const sep = ext === '.tsv' ? '\t' : ','
    const rows = office.sheets?.[0]?.rows || []
    writeFileSync(path, stringifyCsv(rows, sep), 'utf8')
  } else if (ext === '.xlsx') {
    writeFileSync(path, buildSimpleXlsx(office.sheets || []))
  } else if (ext === '.docx') {
    writeFileSync(path, buildSimpleDocx(office.paragraphs || []))
  } else if (ext === '.pptx') {
    writeFileSync(path, patchPptxTexts(path, office.slides || []))
  } else {
    throw new Error('Only xlsx / csv / docx / pptx can be saved from preview')
  }
  return {
    path,
    mtimeMs: statSync(path).mtimeMs,
    hint: ext === '.xlsx'
      ? '已保存为数值表。原公式如需保留，请用对话 univer_import。'
      : '已保存',
  }
}
