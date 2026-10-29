import { inspectOfficeZip } from './deliverable-format.ts'
import { zipStore } from './xlsx-zip.ts'
import type { TemplateDocxFormat, TemplateTextStyle } from './template-dna-office.ts'

const xml = (value: string) => value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&apos;')
function number(value: unknown, label: string, min: number, max: number, integer = true): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < min || value > max || integer && !Number.isInteger(value)) throw new Error(`范本 ${label} 超出可用格式范围。`)
  return value
}
function font(value: unknown): string {
  if (typeof value !== 'string' || !value.trim() || value.length > 160 || /[\x00-\x1f\x7f<>;{}\\]/.test(value)) throw new Error('范本字体名称包含不可用于导出的字符。')
  return value
}
function checkedStyle(value: TemplateTextStyle): TemplateTextStyle {
  const result: TemplateTextStyle = {}
  for (const key of ['fontFamily', 'eastAsiaFontFamily'] as const) if (value[key] !== undefined) result[key] = font(value[key])
  if (value.fontSizePt !== undefined) { result.fontSizePt = number(value.fontSizePt, '字号', 1, 200, false); if (!Number.isInteger(result.fontSizePt * 2)) throw new Error('范本字号必须为半磅的倍数。') }
  if (value.bold !== undefined) { if (typeof value.bold !== 'boolean') throw new Error('范本粗体值无效。'); result.bold = value.bold }
  if (value.alignment !== undefined) {
    if (!['left', 'right', 'center', 'both', 'justify', 'distribute', 'start', 'end'].includes(value.alignment)) throw new Error('范本对齐方式不受支持。')
    result.alignment = value.alignment
  }
  for (const key of ['spacingBeforeTwips', 'spacingAfterTwips', 'lineSpacing'] as const) if (value[key] !== undefined) result[key] = number(value[key], '段距', 0, 20000)
  if (value.lineRule !== undefined) {
    if (!['auto', 'exact', 'atLeast'].includes(value.lineRule)) throw new Error('范本行距规则不受支持。')
    result.lineRule = value.lineRule
  }
  return result
}
export function prepareTemplateExport(value: TemplateDocxFormat): { format: TemplateDocxFormat; warnings: string[] } {
  const format: TemplateDocxFormat = { body: checkedStyle(value.body), headingStyles: [], numbering: [], tables: [], headerFooter: { headers: 0, footers: 0, copySourceText: false }, sectionCount: number(value.sectionCount, '分节数量', 0, 10000), warnings: [...value.warnings] }
  if (value.page) {
    const page = value.page
    format.page = { widthTwips: number(page.widthTwips, '纸张宽度', 1440, 50000), heightTwips: number(page.heightTwips, '纸张高度', 1440, 50000) }
    for (const key of ['marginTopTwips', 'marginRightTwips', 'marginBottomTwips', 'marginLeftTwips'] as const) if (page[key] !== undefined) format.page[key] = number(page[key], '页边距', 0, 20000)
    if (page.orientation !== undefined) { if (!['portrait', 'landscape'].includes(page.orientation)) throw new Error('范本页面方向无效。'); format.page.orientation = page.orientation }
    if ((page.marginLeftTwips || 0) + (page.marginRightTwips || 0) >= page.widthTwips || (page.marginTopTwips || 0) + (page.marginBottomTwips || 0) >= page.heightTwips) throw new Error('范本页边距占满纸张，无法导出正文。')
  }
  for (const row of value.headingStyles) format.headingStyles.push({ ...checkedStyle(row), styleId: String(row.styleId).slice(0, 160), level: number(row.level, '标题层级', 1, 9) })
  if (new Set(format.headingStyles.map(row => row.level)).size !== format.headingStyles.length) format.warnings.push('同级标题含多套样式，本次导出采用该级首套样式，仍需逐位置复核。')
  for (const row of value.numbering) format.numbering.push({ id: String(row.id).slice(0, 160), levels: row.levels.map(level => {
    const result: TemplateDocxFormat['numbering'][number]['levels'][number] = { level: number(level.level, '编号层级', 0, 8) }
    if (level.format !== undefined) { if (!/^[A-Za-z][A-Za-z0-9]{0,39}$/.test(level.format)) throw new Error('范本编号类型无效。'); result.format = level.format }
    if (level.text !== undefined) { if (typeof level.text !== 'string' || level.text.length > 160 || /[\x00-\x1f]/.test(level.text)) throw new Error('范本编号文字无效。'); result.text = level.text }
    if (level.start !== undefined) result.start = number(level.start, '编号起点', 0, 100000)
    return result
  }) })
  if (format.numbering.length > 1 || format.numbering.some(row => row.levels.length !== 1)) format.warnings.push('多套或多级编号只保留定义，未自动推断原文逐段绑定位置；须核对实际编号。')
  for (const row of value.tables) format.tables.push({ headers: row.headers.map(text => String(text).slice(0, 1000)), locator: String(row.locator).slice(0, 240), columnWidthsTwips: row.columnWidthsTwips.map(width => number(width, '表格列宽', 0, 50000)) })
  if (format.tables.some(row => row.columnWidthsTwips.some(width => !width))) format.warnings.push('部分表格列宽未知，不能宣称已精确复刻这些列。')
  format.headerFooter.headers = number(value.headerFooter.headers, '页眉数量', 0, 1000)
  format.headerFooter.footers = number(value.headerFooter.footers, '页脚数量', 0, 1000)
  if (format.sectionCount > 1) format.warnings.push('多分节页面只应用首节已知设置，须逐节核对完整文档。')
  if (format.headerFooter.headers || format.headerFooter.footers) format.warnings.push('不复制原件页眉页脚中的旧项目文字；相应版式及内容须单独确认。')
  return { format, warnings: [...new Set(format.warnings)] }
}
const cssString = (value: string) => JSON.stringify(value).replace(/</g, '\\3c ').replace(/>/g, '\\3e ').replace(/&/g, '\\26 ')
function cssStyle(style: TemplateTextStyle): string {
  const props: string[] = []
  if (style.fontFamily || style.eastAsiaFontFamily) props.push('font-family:' + [...new Set([style.fontFamily, style.eastAsiaFontFamily].filter(Boolean))].map(value => cssString(value!)).join(',') + ';')
  if (style.fontSizePt !== undefined) props.push(`font-size:${style.fontSizePt}pt;`)
  if (style.bold !== undefined) props.push(`font-weight:${style.bold ? 700 : 400};`)
  if (style.alignment) props.push('text-align:' + (['both', 'distribute'].includes(style.alignment) ? 'justify' : style.alignment) + ';')
  if (style.spacingBeforeTwips !== undefined) props.push(`margin-top:${style.spacingBeforeTwips / 20}pt;`)
  if (style.spacingAfterTwips !== undefined) props.push(`margin-bottom:${style.spacingAfterTwips / 20}pt;`)
  if (style.lineSpacing) props.push(`line-height:${style.lineRule && style.lineRule !== 'auto' ? style.lineSpacing / 20 + 'pt' : style.lineSpacing / 240};`)
  return props.join('')
}
export function templateExportCss(value: TemplateDocxFormat): string {
  const { format } = prepareTemplateExport(value), lines: string[] = []
  if (format.page) {
    const p = format.page, attrs = [`size:${p.widthTwips / 20}pt ${p.heightTwips / 20}pt;`]
    for (const [key, side] of [['marginTopTwips', 'top'], ['marginRightTwips', 'right'], ['marginBottomTwips', 'bottom'], ['marginLeftTwips', 'left']] as const) if (p[key] !== undefined) attrs.push(`margin-${side}:${p[key]! / 20}pt;`)
    lines.push('@page{' + attrs.join('') + '}')
  }
  lines.push('body,.markdown-body p,.markdown-body li,.markdown-body td,.markdown-body th{' + cssStyle(format.body) + '}')
  lines.push('.markdown-body{max-width:none;margin:0;padding:0;}')
  const levels = new Set<number>()
  for (const heading of format.headingStyles) if (!levels.has(heading.level)) { levels.add(heading.level); lines.push('h' + heading.level + '{' + cssStyle({ ...format.body, ...heading }) + '}') }
  const counter = format.numbering.length === 1 && format.numbering[0]?.levels.length === 1 ? format.numbering[0].levels[0] : undefined
  const systems: Record<string, string> = { decimal: 'decimal', upperRoman: 'upper-roman', lowerRoman: 'lower-roman', upperLetter: 'upper-alpha', lowerLetter: 'lower-alpha' }
  if (counter?.format && systems[counter.format]) {
    const [prefix = '', suffix = '.'] = (counter.text || '%1.').split('%1')
    lines.push('@counter-style ap-template-numbering{system:extends ' + systems[counter.format] + ';prefix:' + cssString(prefix) + ';suffix:' + cssString(suffix + ' ') + ';}', 'ol{list-style-type:ap-template-numbering;}')
  }
  lines.push('@media print{body,.markdown-body p,.markdown-body li,.markdown-body td,.markdown-body th{' + cssStyle(format.body) + '}' + [...levels].map(level => 'h' + level + '{' + cssStyle({ ...format.body, ...format.headingStyles.find(row => row.level === level)! }) + '}').join('') + '}')
  return lines.join('\n')
}
export function applyTemplateHtmlFormat(html: string, value: TemplateDocxFormat): string {
  const { format } = prepareTemplateExport(value)
  let tableIndex = 0
  const counter = format.numbering.length === 1 && format.numbering[0]?.levels.length === 1 ? format.numbering[0].levels[0] : undefined
  if (counter?.start !== undefined && templateNumberingForList(format, true)) html = html.replace(/<ol(?:\s[^>]*)?>/g, '<ol start="' + counter.start + '">')
  return html.replace(/<table(?:\s[^>]*)?>[\s\S]*?<\/table>/g, table => {
    const widths = format.tables[tableIndex++]?.columnWidthsTwips
    if (!widths?.length || widths.some(width => !width)) return table
    const headers = table.match(/<thead>[\s\S]*?<\/thead>/)?.[0] || ''
    if ([...headers.matchAll(/<th(?:\s|>)/g)].length !== widths.length) return table
    const total = widths.reduce((sum, width) => sum + width, 0)
    return table.replace(/^<table(?:\s[^>]*)?>/, '<table style="width:' + total / 20 + 'pt;max-width:100%;table-layout:fixed"><colgroup>' + widths.map(width => '<col style="width:' + width / 20 + 'pt">').join('') + '</colgroup>')
  })
}
function rPr(style: TemplateTextStyle): string {
  return [style.fontFamily || style.eastAsiaFontFamily ? '<w:rFonts' + (style.fontFamily ? ` w:ascii="${xml(style.fontFamily)}" w:hAnsi="${xml(style.fontFamily)}" w:cs="${xml(style.fontFamily)}"` : '') + (style.eastAsiaFontFamily ? ` w:eastAsia="${xml(style.eastAsiaFontFamily)}"` : '') + '/>' : '', style.fontSizePt !== undefined ? `<w:sz w:val="${style.fontSizePt * 2}"/><w:szCs w:val="${style.fontSizePt * 2}"/>` : '', style.bold !== undefined ? `<w:b w:val="${style.bold ? 1 : 0}"/>` : ''].join('')
}
function pPr(style: TemplateTextStyle): string {
  const spacing = [style.spacingBeforeTwips !== undefined ? ` w:before="${style.spacingBeforeTwips}"` : '', style.spacingAfterTwips !== undefined ? ` w:after="${style.spacingAfterTwips}"` : '', style.lineSpacing !== undefined ? ` w:line="${style.lineSpacing}"` : '', style.lineRule ? ` w:lineRule="${style.lineRule}"` : ''].join('')
  return (style.alignment ? `<w:jc w:val="${xml(style.alignment)}"/>` : '') + (spacing ? '<w:spacing' + spacing + '/>' : '')
}
export function templateNumberingForList(value: TemplateDocxFormat | undefined, ordered: boolean): number | undefined {
  if (!value || value.numbering.length !== 1 || value.numbering[0]?.levels.length !== 1) return undefined
  const level = value.numbering[0].levels[0]!
  return ordered ? ['decimal', 'upperRoman', 'lowerRoman', 'upperLetter', 'lowerLetter'].includes(level.format || '') ? 1 : undefined : level.format === 'bullet' ? 1 : undefined
}

/** Changes the generated document only; no bytes from an old project enter this path. */
export function applyTemplateDocxFormat(bytes: Buffer, value: TemplateDocxFormat): Buffer {
  const { format } = prepareTemplateExport(value), files = inspectOfficeZip(bytes)
  let document = files.get('word/document.xml')!.toString('utf8')
  if (format.page) {
    const p = format.page
    const sectPr = `<w:sectPr><w:pgSz w:w="${p.widthTwips}" w:h="${p.heightTwips}"${p.orientation ? ` w:orient="${p.orientation}"` : ''}/><w:pgMar w:top="${p.marginTopTwips ?? 1440}" w:right="${p.marginRightTwips ?? 1440}" w:bottom="${p.marginBottomTwips ?? 1440}" w:left="${p.marginLeftTwips ?? 1440}"/></w:sectPr>`
    document = document.replace(/<w:sectPr\b[^>]*>[\s\S]*?<\/w:sectPr>/g, sectPr)
  }
  document = document.replace(/<w:p\b[^>]*>[\s\S]*?<\/w:p>/g, paragraph => {
    const level = Number(paragraph.match(/<w:pStyle w:val="Heading([1-9])"/)?.[1] || 0)
    const style = { ...format.body, ...(format.headingStyles.find(row => row.level === level) || {}) }
    let updated = paragraph.replace(/<w:rPr>[\s\S]*?<\/w:rPr>/g, original => {
      let props = original.slice(7, -8)
      if (style.fontFamily || style.eastAsiaFontFamily) props = props.replace(/<w:rFonts\b[^>]*\/?\s*>/g, '')
      if (style.fontSizePt !== undefined) props = props.replace(/<w:sz(?:Cs)?\b[^>]*\/?\s*>/g, '')
      if (style.bold !== undefined) props = props.replace(/<w:b\b[^>]*\/?\s*>/g, '')
      return '<w:rPr>' + props + rPr(style) + '</w:rPr>'
    })
    const props = pPr(style)
    if (props) updated = updated.replace(/<w:pPr>([\s\S]*?)<\/w:pPr>/, (_all, old) => '<w:pPr>' + String(old).replace(/<w:spacing\b[^>]*\/?\s*>/g, '').replace(/<w:jc\b[^>]*\/?\s*>/g, '') + props + '</w:pPr>')
    return updated
  })
  const styles = ['<?xml version="1.0" encoding="UTF-8"?>', '<w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">', '<w:docDefaults><w:rPrDefault><w:rPr>' + rPr(format.body) + '</w:rPr></w:rPrDefault><w:pPrDefault><w:pPr>' + pPr(format.body) + '</w:pPr></w:pPrDefault></w:docDefaults>', '<w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/><w:rPr>' + rPr(format.body) + '</w:rPr><w:pPr>' + pPr(format.body) + '</w:pPr></w:style>']
  for (let level = 1; level <= 9; level++) {
    const style = { ...format.body, ...(format.headingStyles.find(row => row.level === level) || {}) }
    styles.push(`<w:style w:type="paragraph" w:styleId="Heading${level}"><w:name w:val="heading ${level}"/><w:basedOn w:val="Normal"/><w:pPr><w:outlineLvl w:val="${level - 1}"/>${pPr(style)}</w:pPr><w:rPr>${rPr(style)}</w:rPr></w:style>`)
  }
  styles.push('</w:styles>'); files.set('word/styles.xml', Buffer.from(styles.join('')))
  let tableIndex = 0
  document = document.replace(/<w:tbl\b[^>]*>[\s\S]*?<\/w:tbl>/g, table => {
    const widths = format.tables[tableIndex++]?.columnWidthsTwips
    if (!widths?.length || widths.some(width => !width)) return table
    const colCount = [...(table.match(/<w:tblGrid>[\s\S]*?<\/w:tblGrid>/)?.[0] || '').matchAll(/<w:gridCol\b/g)].length
    if (colCount !== widths.length) return table
    let updated = table.replace(/<w:tblW\b[^>]*\/?\s*>/, `<w:tblW w:w="${widths.reduce((sum, width) => sum + width, 0)}" w:type="dxa"/>`).replace('<w:tblPr>', '<w:tblPr><w:tblLayout w:type="fixed"/>').replace(/<w:tblGrid>[\s\S]*?<\/w:tblGrid>/, '<w:tblGrid>' + widths.map(width => `<w:gridCol w:w="${width}"/>`).join('') + '</w:tblGrid>')
    updated = updated.replace(/<w:tr>[\s\S]*?<\/w:tr>/g, row => { let index = 0; return row.replace(/<w:tcW\b[^>]*\/?\s*>/g, () => `<w:tcW w:w="${widths[index++] ?? widths[0]}" w:type="dxa"/>`) })
    return updated
  })
  if (format.numbering.length) {
    const numbering = '<w:numbering xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">' + format.numbering.map((row, index) => `<w:abstractNum w:abstractNumId="${index}">` + row.levels.map(level => `<w:lvl w:ilvl="${level.level}">${level.start !== undefined ? `<w:start w:val="${level.start}"/>` : ''}${level.format ? `<w:numFmt w:val="${xml(level.format)}"/>` : ''}${level.text ? `<w:lvlText w:val="${xml(level.text)}"/>` : ''}</w:lvl>`).join('') + `</w:abstractNum><w:num w:numId="${index + 1}"><w:abstractNumId w:val="${index}"/></w:num>`).join('') + '</w:numbering>'
    files.set('word/numbering.xml', Buffer.from(numbering))
    files.set('[Content_Types].xml', Buffer.from(files.get('[Content_Types].xml')!.toString().replace('</Types>', '<Override PartName="/word/numbering.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.numbering+xml"/></Types>')))
    files.set('word/_rels/document.xml.rels', Buffer.from(files.get('word/_rels/document.xml.rels')!.toString().replace('</Relationships>', '<Relationship Id="rIdNumbering" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/numbering" Target="numbering.xml"/></Relationships>')))
  }
  files.set('word/document.xml', Buffer.from(document))
  return zipStore([...files].map(([name, data]) => ({ name, data })))
}
