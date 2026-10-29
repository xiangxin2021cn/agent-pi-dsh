import { inspectOfficeZip } from './deliverable-format.ts'

export interface TemplateTextStyle {
  fontFamily?: string
  eastAsiaFontFamily?: string
  fontSizePt?: number
  bold?: boolean
  alignment?: string
  spacingBeforeTwips?: number
  spacingAfterTwips?: number
  lineSpacing?: number
  lineRule?: string
}
export interface TemplateHeading { title: string; level: number; locator: string; styleId?: string }
export interface EffectiveTemplateText {
  locator: string
  styleId: string
  headingLevel?: number
  latin: boolean
  eastAsia: boolean
  format: TemplateTextStyle
  unknown: Array<keyof TemplateTextStyle>
}
export interface TemplateTable { headers: string[]; columnWidthsTwips: number[]; locator: string }
export interface TemplateDocxFormat {
  page?: { widthTwips: number; heightTwips: number; orientation?: string; marginTopTwips?: number; marginRightTwips?: number; marginBottomTwips?: number; marginLeftTwips?: number }
  body: TemplateTextStyle
  headingStyles: Array<TemplateTextStyle & { styleId: string; level: number }>
  numbering: Array<{ id: string; levels: Array<{ level: number; format?: string; text?: string; start?: number }> }>
  tables: TemplateTable[]
  headerFooter: { headers: number; footers: number; copySourceText: false }
  sectionCount: number
  warnings: string[]
}

function decode(value: string): string {
  return value.replace(/&#(x[0-9a-f]+|\d+);/gi, (raw, code) => {
    const n = code[0].toLowerCase() === 'x' ? parseInt(code.slice(1), 16) : parseInt(code, 10)
    return n > 0 && n <= 0x10ffff && !(n >= 0xd800 && n <= 0xdfff) ? String.fromCodePoint(n) : raw
  }).replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, '&')
}
function attributes(xml: string): Record<string, string> {
  return Object.fromEntries([...xml.matchAll(/\b(?:w:)?([\w]+)\s*=\s*["']([^"']*)["']/g)].map(match => [match[1]!, decode(match[2]!)]))
}
function tag(xml: string, name: string): Record<string, string> {
  return attributes(xml.match(new RegExp('<w:' + name + '\\b[^>]*>'))?.[0] || '')
}
function num(value?: string): number | undefined {
  if (!value || !/^-?\d+(?:\.\d+)?$/.test(value)) return undefined
  const n = Number(value)
  return Number.isFinite(n) && Math.abs(n) <= 100000 ? n : undefined
}
function style(xml: string): TemplateTextStyle {
  const font = tag(xml, 'rFonts'), spacing = tag(xml, 'spacing'), size = num(tag(xml, 'sz').val)
  const result: TemplateTextStyle = {}
  if (font.ascii || font.hAnsi) result.fontFamily = (font.ascii || font.hAnsi)!.slice(0, 160)
  if (font.eastAsia) result.eastAsiaFontFamily = font.eastAsia.slice(0, 160)
  if (size !== undefined && size > 0 && size <= 400) result.fontSizePt = size / 2
  if (/<w:b\b/.test(xml)) result.bold = !['0', 'false', 'off'].includes(tag(xml, 'b').val || '')
  if (tag(xml, 'jc').val) result.alignment = tag(xml, 'jc').val
  for (const [source, key] of [['before', 'spacingBeforeTwips'], ['after', 'spacingAfterTwips'], ['line', 'lineSpacing']] as const) {
    const value = num(spacing[source])
    if (value !== undefined) result[key] = value
  }
  if (spacing.lineRule) result.lineRule = spacing.lineRule
  return result
}
function text(xml: string): string {
  return [...xml.matchAll(/<w:t\b[^>]*>([\s\S]*?)<\/w:t>/g)].map(match => decode(match[1]!)).join('').trim()
}
function elements(xml: string, name: string): string[] {
  return [...xml.matchAll(new RegExp('<w:' + name + '\\b[^>]*?(?:/\\s*>|>[\\s\\S]*?</w:' + name + '>)', 'g'))].map(row => row[0])
}
function property(xml: string, name: string): string { return elements(xml, name)[0] || '' }
const textKeys = ['fontFamily', 'eastAsiaFontFamily', 'fontSizePt', 'alignment', 'spacingBeforeTwips', 'spacingAfterTwips', 'lineSpacing', 'lineRule'] as const
type Formatting = { format: TemplateTextStyle; unknown: Array<keyof TemplateTextStyle> }
function formatting(xml: string): Formatting {
  const format = style(xml), unknown: Formatting['unknown'] = [], fonts = tag(xml, 'rFonts'), spacing = tag(xml, 'spacing')
  if (fonts.asciiTheme || fonts.hAnsiTheme || fonts.ascii && fonts.hAnsi && fonts.ascii !== fonts.hAnsi) unknown.push('fontFamily')
  if (fonts.eastAsiaTheme) unknown.push('eastAsiaFontFamily')
  if (/<w:sz\b/.test(xml) && format.fontSizePt === undefined) unknown.push('fontSizePt')
  if (spacing.beforeLines || spacing.beforeAutospacing) unknown.push('spacingBeforeTwips')
  if (spacing.afterLines || spacing.afterAutospacing) unknown.push('spacingAfterTwips')
  for (const key of unknown) delete format[key]
  return { format, unknown }
}
function overlay(base: Formatting, own: Formatting): Formatting {
  const format = { ...base.format, ...own.format }, unknown = new Set(base.unknown)
  for (const key of Object.keys(own.format) as Array<keyof TemplateTextStyle>) unknown.delete(key)
  for (const key of own.unknown) { unknown.add(key); delete format[key] }
  return { format, unknown: [...unknown] }
}

/** Inspect a bounded, CRC-checked OOXML container. Never copy body/header facts. */
export function inspectTemplateDocx(bytes: Buffer): { text: string; headings: TemplateHeading[]; format: TemplateDocxFormat; textRuns: EffectiveTemplateText[] } {
  const files = inspectOfficeZip(bytes)
  const document = files.get('word/document.xml')?.toString('utf8')
  if (!files.has('[Content_Types].xml') || !document) throw new Error('范本不是可识别的 DOCX 文档。')
  if (/<!DOCTYPE|<!ENTITY/i.test(document)) throw new Error('范本 XML 包含不支持的实体声明。')
  const stylesXml = files.get('word/styles.xml')?.toString('utf8') || ''
  const numberingXml = files.get('word/numbering.xml')?.toString('utf8') || ''
  if (/<!DOCTYPE|<!ENTITY/i.test(stylesXml + numberingXml)) throw new Error('范本样式 XML 包含不支持的实体声明。')
  const warnings: string[] = []
  const defaults = formatting(property(stylesXml, 'docDefaults'))
  const styles = new Map<string, Formatting & { type: string; level?: number; basedOn?: string }>()
  let defaultStyle = ''
  for (const match of stylesXml.matchAll(/<w:style\b[^>]*>[\s\S]*?<\/w:style>/g)) {
    const attrs = attributes(match[0].slice(0, match[0].indexOf('>') + 1))
    if (!['paragraph', 'character'].includes(attrs.type || '') || !attrs.styleId) continue
    if (styles.size >= 1000) throw new Error('范本段落样式过多，请先简化副本后再蒸馏。')
    if (attrs.type === 'paragraph' && attrs.default === '1') defaultStyle = attrs.styleId
    const outline = num(tag(match[0], 'outlineLvl').val)
    const named = (tag(match[0], 'name').val || attrs.styleId).match(/^(?:heading\s*|标题\s*)([1-9])$/i)
    styles.set(attrs.styleId, { ...formatting(match[0]), type: attrs.type!, basedOn: tag(match[0], 'basedOn').val, level: outline !== undefined && outline >= 0 && outline < 9 ? outline + 1 : named ? Number(named[1]) : undefined })
  }
  function resolved(id: string, type = 'paragraph', seen = new Set<string>()): Formatting & { level?: number } {
    const base = type === 'paragraph' ? defaults : { format: {}, unknown: [] }
    if (!id) return base
    if (!styles.has(id) || styles.get(id)!.type !== type || seen.has(id)) {
      warnings.push('文字样式缺失、类型不符或继承存在循环，相关实际格式需人工核对。')
      return { format: {}, unknown: [...textKeys] }
    }
    seen.add(id)
    const row = styles.get(id)!, parent = resolved(row.basedOn || '', type, seen)
    return { ...overlay(parent, row), level: row.level ?? parent.level }
  }
  const headings: TemplateHeading[] = [], used = new Map<string, number>(), paragraphs: string[] = [], textRuns: EffectiveTemplateText[] = []
  let paragraphIndex = 0
  for (const paragraph of elements(document, 'p')) {
    paragraphIndex++
    const value = text(paragraph)
    if (!value) continue
    paragraphs.push(value)
    const pPr = property(paragraph, 'pPr'), mark = property(pPr, 'rPr')
    const styleId = tag(pPr, 'pStyle').val || defaultStyle
    const row = resolved(styleId), direct = num(tag(pPr, 'outlineLvl').val)
    const level = direct !== undefined && direct >= 0 && direct < 9 ? direct + 1 : row.level
    if (Object.keys(style(mark)).length) warnings.push('段落标记有独立文字格式，当前不将其冒充已有正文文字的实际格式。')
    const paragraphFormat = overlay(row, formatting(pPr.replace(mark, '')))
    if (level) {
      if (headings.length >= 1000) throw new Error('范本标题超过蒸馏限制，请按文档范围拆分。')
      headings.push({ title: value.slice(0, 1000), level, locator: `word/document.xml:p${paragraphIndex}`, ...(styleId ? { styleId } : {}) })
      if (styleId) used.set(styleId, level)
    }
    for (const [index, run] of elements(paragraph, 'r').entries()) {
      const content = text(run)
      if (!content) continue
      if (textRuns.length >= 50000) { warnings.push('实际文字片段超过 50000 个，仅检查限额内格式。'); break }
      const rPr = property(run, 'rPr'), characterStyle = tag(rPr, 'rStyle').val
      const effective = overlay(overlay(paragraphFormat, resolved(characterStyle || '', 'character')), formatting(rPr))
      if (/[\u0590-\u08ff]/.test(content) || /<w:(?:rtl|cs)\b/.test(rPr)) { effective.unknown.push('fontFamily', 'eastAsiaFontFamily', 'fontSizePt'); warnings.push('复杂文字系统的字体和字号仍需独立版式复核。') }
      textRuns.push({ locator: `word/document.xml:p${paragraphIndex}:r${index + 1}`, styleId, ...(level ? { headingLevel: level } : {}), latin: /[A-Za-z0-9\u00c0-\u024f]/.test(content), eastAsia: /[\u2e80-\u9fff\uac00-\ud7af\uf900-\ufaff]/.test(content), ...effective })
    }
  }
  if (/<w:(?:tblStyle|txbxContent|altChunk|rPrChange|pPrChange|ins|del|moveFrom|moveTo)\b/.test(document)) warnings.push('文档含表格条件样式、嵌套文本或修订组合，尚不能完整核对其实际文字格式。')
  const sections = [...document.matchAll(/<w:sectPr\b[^>]*>[\s\S]*?<\/w:sectPr>/g)]
  const section = sections[0]?.[0] || '', size = tag(section, 'pgSz'), margins = tag(section, 'pgMar')
  const width = num(size.w), height = num(size.h)
  const page: TemplateDocxFormat['page'] = width && height ? { widthTwips: width, heightTwips: height } : undefined
  if (page) {
    if (size.orient) page.orientation = size.orient
    for (const [key, prop] of [['top', 'marginTopTwips'], ['right', 'marginRightTwips'], ['bottom', 'marginBottomTwips'], ['left', 'marginLeftTwips']] as const) {
      const value = num(margins[key]); if (value !== undefined) page[prop] = value
    }
  }
  if (/<w:(?:gridSpan|vMerge)\b/.test(document)) warnings.push('范本含合并单元格，当前只提取表头与列宽，合并关系需打开文档核对。')
  if (/<w:numPr\b/.test(document)) warnings.push('原文存在实际编号绑定，已提取编号定义，但逐段编号位置仍须对照原文核验。')
  if (sections.length > 1) warnings.push('范本包含多个分节，不能用单一页面设置宣称全部版式已复刻。')
  if (!page) warnings.push('原件未明确记录可提取的页面尺寸。')
  const tables: TemplateTable[] = []
  for (const match of document.matchAll(/<w:tbl\b[^>]*>[\s\S]*?<\/w:tbl>/g)) {
    if (tables.length >= 256) { warnings.push('仅提取前 256 张表格结构。'); break }
    const row = match[0].match(/<w:tr\b[^>]*>[\s\S]*?<\/w:tr>/)?.[0] || ''
    const headers = [...row.matchAll(/<w:tc\b[^>]*>[\s\S]*?<\/w:tc>/g)].map(cell => text(cell[0]).slice(0, 1000))
    const grid = match[0].match(/<w:tblGrid\b[^>]*>[\s\S]*?<\/w:tblGrid>/)?.[0] || ''
    const columnWidthsTwips = [...grid.matchAll(/<w:gridCol\b[^>]*\/?\s*>/g)].map(cell => num(attributes(cell[0]).w) || 0)
    tables.push({ headers, columnWidthsTwips, locator: `word/document.xml:table${tables.length + 1}` })
  }
  const numbering: TemplateDocxFormat['numbering'] = []
  for (const match of numberingXml.matchAll(/<w:abstractNum\b[^>]*>[\s\S]*?<\/w:abstractNum>/g)) {
    if (numbering.length >= 256) { warnings.push('仅提取前 256 套编号定义。'); break }
    const id = attributes(match[0].slice(0, match[0].indexOf('>') + 1)).abstractNumId || String(numbering.length)
    const levels = [...match[0].matchAll(/<w:lvl\b[^>]*>[\s\S]*?<\/w:lvl>/g)].slice(0, 9).map(level => ({
      level: num(attributes(level[0].slice(0, level[0].indexOf('>') + 1)).ilvl) ?? 0,
      ...(tag(level[0], 'numFmt').val ? { format: tag(level[0], 'numFmt').val } : {}),
      ...(tag(level[0], 'lvlText').val ? { text: tag(level[0], 'lvlText').val } : {}),
      ...(num(tag(level[0], 'start').val) !== undefined ? { start: num(tag(level[0], 'start').val) } : {}),
    }))
    numbering.push({ id, levels })
  }
  const headers = [...files.keys()].filter(name => /^word\/header\d+\.xml$/.test(name)).length
  const footers = [...files.keys()].filter(name => /^word\/footer\d+\.xml$/.test(name)).length
  if (headers || footers) warnings.push('页眉页脚只登记存在性；其中旧项目文字、签名和标识不得直接迁入新稿。')
  function observed(base: TemplateTextStyle, runs: EffectiveTemplateText[], label: string): TemplateTextStyle {
    const result = { ...base }
    for (const key of textKeys) {
      const relevant = runs.filter(row => key === 'fontFamily' ? row.latin : key === 'eastAsiaFontFamily' ? row.eastAsia : true)
      if (!relevant.length) continue
      const values = new Set(relevant.map(row => row.format[key]))
      if (relevant.some(row => row.unknown.includes(key)) || values.size > 1) {
        delete result[key]; warnings.push(`${label}的 ${key} 包含未知或多种有效格式，不将默认样式当成统一格式。`)
      } else if (!values.has(undefined)) (result as any)[key] = [...values][0]
      else delete result[key]
    }
    return result
  }
  const body = observed(resolved(defaultStyle).format, textRuns.filter(row => !row.headingLevel), '正文')
  if (!body.fontFamily || !body.fontSizePt) warnings.push('正文默认字体或字号未直接记录，主题与逐段实际样式仍需核对。')
  const format: TemplateDocxFormat = { ...(page ? { page } : {}), body, headingStyles: [...used].map(([styleId, level]) => ({ ...observed(resolved(styleId).format, textRuns.filter(row => row.styleId === styleId && row.headingLevel === level), `${level}级标题`), styleId, level })), tables, numbering, headerFooter: { headers, footers, copySourceText: false }, sectionCount: sections.length, warnings: [...new Set(warnings)] }
  return { text: paragraphs.join('\n\n'), headings, format, textRuns }
}
