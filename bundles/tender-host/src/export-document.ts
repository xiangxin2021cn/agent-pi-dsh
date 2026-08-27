import { basename, dirname, extname, isAbsolute, join, parse, resolve } from 'node:path'
import { existsSync, mkdirSync, readFileSync, rmSync, statSync, unlinkSync, writeFileSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import { tmpdir } from 'node:os'
import { randomBytes } from 'node:crypto'
import { pathToFileURL } from 'node:url'
import { marked } from 'marked'
import { renderMermaidSVG } from 'beautiful-mermaid'

export type MarkdownExportFormat = 'md' | 'html' | 'pdf' | 'docx'

type MarkdownExportBlock =
  | { type: 'heading'; depth: number; text: string }
  | { type: 'paragraph'; text: string }
  | { type: 'image'; alt: string; src: string }
  | { type: 'listItem'; ordered: boolean; index: number; text: string }
  | { type: 'code'; text: string }
  | { type: 'quote'; text: string }
  | { type: 'table'; header: string[]; rows: string[][] }
  | { type: 'space' }

interface MarkdownExportPageLayout {
  pageSize: 'A4' | 'A3'
  orientation: 'portrait' | 'landscape'
}

interface PreparedMarkdownExportContent {
  content: string
  pageLayout?: MarkdownExportPageLayout
}

interface DocxImageMedia {
  id: number
  relationshipId: string
  fileName: string
  extension: string
  contentType: string
  bytes: Buffer
  alt: string
}

function xmlEscape(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

function htmlEscape(value: string): string {
  return xmlEscape(value).replace(/'/g, '&#39;')
}

function decodeHtmlEntities(value: string): string {
  return value
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
}

function markdownInlineToText(value: string): string {
  return decodeHtmlEntities(value)
    .replace(/!\[([^\]]*)\]\([^)]+\)/g, '$1')
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/?[^>]+>/g, '')
    .replace(/[*_`~]/g, '')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

function tokenText(token: any): string {
  if (!token) return ''
  if (typeof token.text === 'string') return markdownInlineToText(token.text)
  if (Array.isArray(token.tokens)) return token.tokens.map(tokenText).filter(Boolean).join(' ')
  if (typeof token.raw === 'string') return markdownInlineToText(token.raw)
  return ''
}

function onlyImageToken(token: any): { alt: string; src: string } | undefined {
  if (token?.type === 'image' && typeof token.href === 'string') {
    return { alt: markdownInlineToText(String(token.text ?? '')), src: token.href }
  }
  const children = Array.isArray(token?.tokens)
    ? token.tokens.filter((item: any) => item.type !== 'text' || String(item.raw ?? item.text ?? '').trim())
    : []
  if (children.length !== 1) return undefined
  const child = children[0]
  return child?.type === 'image' && typeof child.href === 'string'
    ? { alt: markdownInlineToText(String(child.text ?? '')), src: child.href }
    : undefined
}

export function renderMarkdownBlocksForExport(markdown: string): MarkdownExportBlock[] {
  const blocks: MarkdownExportBlock[] = []
  const tokens = marked.lexer(markdown.replace(/\r\n/g, '\n'), { gfm: true })

  for (const token of tokens as any[]) {
    switch (token.type) {
      case 'space':
        if (blocks[blocks.length - 1]?.type !== 'space') blocks.push({ type: 'space' })
        break
      case 'heading':
        blocks.push({
          type: 'heading',
          depth: Math.max(1, Math.min(6, Number(token.depth) || 1)),
          text: tokenText(token),
        })
        break
      case 'paragraph': {
        const image = onlyImageToken(token)
        if (image) blocks.push({ type: 'image', ...image })
        else {
          const text = tokenText(token)
          if (text) blocks.push({ type: 'paragraph', text })
        }
        break
      }
      case 'image': {
        const image = onlyImageToken(token)
        if (image) blocks.push({ type: 'image', ...image })
        break
      }
      case 'blockquote': {
        const text = Array.isArray(token.tokens)
          ? token.tokens.map(tokenText).filter(Boolean).join('\n')
          : tokenText(token)
        if (text) blocks.push({ type: 'quote', text })
        break
      }
      case 'code':
        blocks.push({ type: 'code', text: String(token.text ?? '').trimEnd() })
        break
      case 'list': {
        const ordered = !!token.ordered
        const start = typeof token.start === 'number' ? token.start : 1
        const items = Array.isArray(token.items) ? token.items : []
        items.forEach((item: any, offset: number) => {
          const text = Array.isArray(item.tokens)
            ? item.tokens.map(tokenText).filter(Boolean).join(' ')
            : tokenText(item)
          if (text) blocks.push({ type: 'listItem', ordered, index: start + offset, text })
        })
        break
      }
      case 'table': {
        const header = (token.header ?? []).map((cell: any) => tokenText(cell))
        const rows = (token.rows ?? []).map((row: any[]) => row.map((cell: any) => tokenText(cell)))
        blocks.push({ type: 'table', header, rows })
        break
      }
      case 'hr':
        blocks.push({ type: 'space' })
        break
      default: {
        const text = tokenText(token)
        if (text) blocks.push({ type: 'paragraph', text })
      }
    }
  }

  while (blocks[0]?.type === 'space') blocks.shift()
  while (blocks[blocks.length - 1]?.type === 'space') blocks.pop()
  return blocks
}

function detectPageLayoutFromVisualMarkup(value: string): MarkdownExportPageLayout | undefined {
  const pageSize = value.match(/data-page-size=["'](A3|A4)["']/i)?.[1]?.toUpperCase()
  const orientation = value.match(/data-orientation=["'](landscape|portrait)["']/i)?.[1]?.toLowerCase()
  if (pageSize === 'A3' || pageSize === 'A4') {
    return {
      pageSize,
      orientation: orientation === 'landscape' ? 'landscape' : 'portrait',
    }
  }
  return undefined
}

function getMarkdownAssetMimeType(filePath: string): string | undefined {
  const ext = extname(filePath).toLowerCase()
  if (ext === '.svg') return 'image/svg+xml'
  if (ext === '.png') return 'image/png'
  if (ext === '.jpg' || ext === '.jpeg') return 'image/jpeg'
  if (ext === '.gif') return 'image/gif'
  if (ext === '.webp') return 'image/webp'
  return undefined
}

function parseMarkdownImageHref(rawTarget: string): string {
  const trimmed = rawTarget.trim()
  if (trimmed.startsWith('<') && trimmed.includes('>')) {
    return trimmed.slice(1, trimmed.indexOf('>')).trim()
  }
  const quotedTitleIndex = trimmed.search(/\s+["']/)
  return (quotedTitleIndex === -1 ? trimmed : trimmed.slice(0, quotedTitleIndex)).trim()
}

function isLocalMarkdownAssetRef(href: string): boolean {
  return !!href && !/^(?:https?:|data:|blob:|#|mailto:)/i.test(href)
}

function renderMermaidBlocksForExportContent(content: string): PreparedMarkdownExportContent {
  const mermaidPattern = /```mermaid\s*\n([\s\S]*?)```/gi
  const parts: string[] = []
  let lastIndex = 0
  let pageLayout = detectPageLayoutFromVisualMarkup(content)

  for (const match of content.matchAll(mermaidPattern)) {
    const index = match.index ?? 0
    const source = (match[1] ?? '').trim()
    parts.push(content.slice(lastIndex, index))
    try {
      const svg = renderMermaidSVG(source)
      pageLayout = pageLayout ?? detectPageLayoutFromVisualMarkup(svg)
      parts.push(`![Mermaid diagram](data:image/svg+xml;base64,${Buffer.from(svg, 'utf8').toString('base64')})`)
    } catch {
      parts.push(match[0])
    }
    lastIndex = index + match[0].length
  }

  parts.push(content.slice(lastIndex))
  return { content: parts.join(''), pageLayout }
}

export function prepareMarkdownContentForExport(sourcePath: string, content: string): PreparedMarkdownExportContent {
  const mermaidPrepared = renderMermaidBlocksForExportContent(content)
  content = mermaidPrepared.content
  const sourceDir = dirname(sourcePath)
  const imagePattern = /!\[([^\]]*)]\(([^)\r\n]+)\)/g
  const parts: string[] = []
  let lastIndex = 0
  let pageLayout = mermaidPrepared.pageLayout ?? detectPageLayoutFromVisualMarkup(content)

  for (const match of content.matchAll(imagePattern)) {
    const index = match.index ?? 0
    const rawTarget = match[2] ?? ''
    const href = parseMarkdownImageHref(rawTarget)
    parts.push(content.slice(lastIndex, index))
    if (isLocalMarkdownAssetRef(href)) {
      const assetPath = isAbsolute(href) ? href : resolve(sourceDir, href)
      if (!existsSync(assetPath) || !statSync(assetPath).isFile()) {
        throw new Error(`Missing local Markdown image asset: ${assetPath}`)
      }
      const mime = getMarkdownAssetMimeType(assetPath)
      if (!mime) throw new Error(`Unsupported Markdown image asset type: ${assetPath}`)
      const bytes = readFileSync(assetPath)
      if (mime === 'image/svg+xml') {
        pageLayout = pageLayout ?? detectPageLayoutFromVisualMarkup(bytes.toString('utf8'))
      }
      parts.push(`![${match[1] ?? ''}](data:${mime};base64,${bytes.toString('base64')})`)
    } else {
      parts.push(match[0])
    }
    lastIndex = index + match[0].length
  }

  parts.push(content.slice(lastIndex))
  return { content: parts.join(''), pageLayout }
}

export function createMarkdownHtml(content: string, title: string, pageLayout?: MarkdownExportPageLayout): string {
  const body = marked.parse(content, { gfm: true, breaks: false, async: false }) as string
  const pageSize = pageLayout ? `${pageLayout.pageSize} ${pageLayout.orientation}` : 'A4'
  return [
    '<!doctype html>',
    '<html lang="zh-CN">',
    '<head>',
    '<meta charset="utf-8">',
    `<title>${htmlEscape(title)}</title>`,
    '<style>',
    `@page{size:${pageSize};margin:18mm 16mm;}`,
    'html,body{margin:0;padding:0;background:#fff;}',
    'body{font-family:-apple-system,BlinkMacSystemFont,"Segoe UI","Microsoft YaHei","Noto Sans CJK SC",Arial,sans-serif;line-height:1.65;color:#202124;font-size:14px;}',
    '.markdown-body{box-sizing:border-box;max-width:900px;margin:40px auto;padding:0 32px;}',
    'h1,h2,h3,h4{line-height:1.25;margin:1.4em 0 .65em;break-after:avoid;}',
    'h1{font-size:2em;} h2{font-size:1.55em;} h3{font-size:1.25em;}',
    'p,ul,ol,blockquote,pre,table{margin:0 0 1em;}',
    'ul,ol{padding-left:1.6em;} li{margin:.25em 0;}',
    'a{color:#0969da;text-decoration:none;}',
    'blockquote{border-left:4px solid #d0d7de;color:#57606a;padding:0 1em;}',
    'table{border-collapse:collapse;width:100%;table-layout:fixed;page-break-inside:auto;}',
    'tr{page-break-inside:avoid;page-break-after:auto;}',
    'th,td{border:1px solid #d0d7de;padding:6px 8px;vertical-align:top;overflow-wrap:anywhere;word-break:break-word;}',
    'th{background:#f6f8fa;font-weight:600;}',
    'code,pre{font-family:"SFMono-Regular",Consolas,"Liberation Mono",Menlo,monospace;background:#f6f8fa;border-radius:4px;}',
    'code{padding:.15em .3em;} pre{padding:12px;white-space:pre-wrap;overflow-wrap:anywhere;word-break:break-word;} pre code{padding:0;background:transparent;}',
    'img,svg,canvas{max-width:100%;height:auto;}',
    '@media print{body{font-size:11pt;}.markdown-body{max-width:none;margin:0;padding:0;}a{color:#202124;}h1{font-size:22pt;}h2{font-size:17pt;}h3{font-size:14pt;}}',
    '</style>',
    '</head>',
    '<body>',
    '<main class="markdown-body">',
    body,
    '</main>',
    '</body>',
    '</html>',
  ].join('\n')
}

function crc32(data: Buffer): number {
  let crc = 0xffffffff
  for (let i = 0; i < data.length; i += 1) {
    crc ^= data[i]!
    for (let bit = 0; bit < 8; bit += 1) {
      crc = crc & 1 ? (crc >>> 1) ^ 0xedb88320 : crc >>> 1
    }
  }
  return (crc ^ 0xffffffff) >>> 0
}

function zipStore(files: Array<{ name: string; data: Buffer }>): Buffer {
  const locals: Buffer[] = []
  const centrals: Buffer[] = []
  let offset = 0
  for (const file of files) {
    const name = Buffer.from(file.name, 'utf8')
    const crc = crc32(file.data)
    const local = Buffer.alloc(30 + name.length)
    local.writeUInt32LE(0x04034b50, 0)
    local.writeUInt16LE(20, 4)
    local.writeUInt32LE(crc, 14)
    local.writeUInt32LE(file.data.length, 18)
    local.writeUInt32LE(file.data.length, 22)
    local.writeUInt16LE(name.length, 26)
    name.copy(local, 30)
    locals.push(local, file.data)
    const central = Buffer.alloc(46 + name.length)
    central.writeUInt32LE(0x02014b50, 0)
    central.writeUInt16LE(20, 4)
    central.writeUInt16LE(20, 6)
    central.writeUInt32LE(crc, 16)
    central.writeUInt32LE(file.data.length, 20)
    central.writeUInt32LE(file.data.length, 24)
    central.writeUInt16LE(name.length, 28)
    central.writeUInt32LE(offset, 42)
    name.copy(central, 46)
    centrals.push(central)
    offset += local.length + file.data.length
  }
  const centralDir = Buffer.concat(centrals)
  const end = Buffer.alloc(22)
  end.writeUInt32LE(0x06054b50, 0)
  end.writeUInt16LE(files.length, 8)
  end.writeUInt16LE(files.length, 10)
  end.writeUInt32LE(centralDir.length, 12)
  end.writeUInt32LE(offset, 16)
  return Buffer.concat([...locals, centralDir, end])
}

function docxRun(text: string, options: { bold?: boolean; size?: number } = {}): string {
  const props = [
    '<w:rFonts w:ascii="Calibri" w:hAnsi="Calibri" w:eastAsia="微软雅黑" w:cs="Calibri"/>',
    options.bold ? '<w:b/>' : '',
    options.size ? `<w:sz w:val="${options.size}"/><w:szCs w:val="${options.size}"/>` : '',
  ].filter(Boolean).join('')
  return `<w:r><w:rPr>${props}</w:rPr><w:t xml:space="preserve">${xmlEscape(text)}</w:t></w:r>`
}

function docxParagraph(text: string, options: { bold?: boolean; size?: number; indent?: number; after?: number; style?: string } = {}): string {
  const pPr = [
    options.style ? `<w:pStyle w:val="${options.style}"/>` : '',
    options.indent ? `<w:ind w:left="${options.indent}"/>` : '',
    `<w:spacing w:after="${options.after ?? 120}"/>`,
  ].filter(Boolean).join('')
  return `<w:p><w:pPr>${pPr}</w:pPr>${docxRun(text, options)}</w:p>`
}

function docxTable(block: Extract<MarkdownExportBlock, { type: 'table' }>): string {
  const data = [block.header, ...block.rows].filter((row) => row.length > 0)
  if (data.length === 0) return ''
  const colCount = Math.max(...data.map((row) => row.length), 1)
  const colW = Math.max(800, Math.floor(9000 / colCount))
  const rows = data.map((row, rowIndex) => [
    '<w:tr>',
    ...Array.from({ length: colCount }, (_, index) => [
      '<w:tc>',
      `<w:tcPr><w:tcW w:w="${colW}" w:type="dxa"/>${rowIndex === 0 ? '<w:shd w:val="clear" w:color="auto" w:fill="F6F8FA"/>' : ''}</w:tcPr>`,
      docxParagraph(row[index] ?? '', { bold: rowIndex === 0, after: 0 }),
      '</w:tc>',
    ].join('')),
    '</w:tr>',
  ].join('')).join('')
  return [
    '<w:tbl>',
    '<w:tblPr><w:tblW w:w="5000" w:type="pct"/><w:tblBorders>',
    '<w:top w:val="single" w:sz="4" w:space="0" w:color="D0D7DE"/>',
    '<w:left w:val="single" w:sz="4" w:space="0" w:color="D0D7DE"/>',
    '<w:bottom w:val="single" w:sz="4" w:space="0" w:color="D0D7DE"/>',
    '<w:right w:val="single" w:sz="4" w:space="0" w:color="D0D7DE"/>',
    '<w:insideH w:val="single" w:sz="4" w:space="0" w:color="D0D7DE"/>',
    '<w:insideV w:val="single" w:sz="4" w:space="0" w:color="D0D7DE"/>',
    '</w:tblBorders></w:tblPr>',
    `<w:tblGrid>${Array.from({ length: colCount }, () => `<w:gridCol w:w="${colW}"/>`).join('')}</w:tblGrid>`,
    rows,
    '</w:tbl>',
  ].join('')
}

function measureImageExtent(bytes: Buffer, extension: string): { cx: number; cy: number } {
  const maxCx = 8_600_000
  const maxCy = 9_800_000
  const fallback = { cx: maxCx, cy: 4_800_000 }
  let width = 0
  let height = 0
  if (extension === 'svg') {
    const svg = bytes.toString('utf8')
    const w = Number(svg.match(/\bwidth=["']([\d.]+)/i)?.[1])
    const h = Number(svg.match(/\bheight=["']([\d.]+)/i)?.[1])
    const vb = svg.match(/\bviewBox=["']\s*([-\d.eE]+)\s+([-\d.eE]+)\s+([-\d.eE]+)\s+([-\d.eE]+)/i)
    if (w > 0 && h > 0) {
      width = w
      height = h
    } else if (vb) {
      width = Number(vb[3])
      height = Number(vb[4])
    }
  } else if (extension === 'png' && bytes.length >= 24 && bytes.subarray(1, 4).toString() === 'PNG') {
    width = bytes.readUInt32BE(16)
    height = bytes.readUInt32BE(20)
  } else if ((extension === 'jpg' || extension === 'jpeg') && bytes[0] === 0xff && bytes[1] === 0xd8) {
    let offset = 2
    while (offset + 9 < bytes.length) {
      if (bytes[offset] !== 0xff) break
      const marker = bytes[offset + 1]!
      const size = bytes.readUInt16BE(offset + 2)
      if (marker === 0xc0 || marker === 0xc1 || marker === 0xc2) {
        height = bytes.readUInt16BE(offset + 5)
        width = bytes.readUInt16BE(offset + 7)
        break
      }
      offset += 2 + size
    }
  }
  if (!(width > 0 && height > 0)) return fallback
  let cx = maxCx
  let cy = Math.max(400_000, Math.round(maxCx * (height / width)))
  if (cy > maxCy) {
    cy = maxCy
    cx = Math.max(400_000, Math.round(maxCy * (width / height)))
  }
  return { cx, cy }
}

function parseDataImage(src: string): Pick<DocxImageMedia, 'extension' | 'contentType' | 'bytes'> | undefined {
  const match = src.match(/^data:(image\/(?:png|jpeg|gif|webp|svg\+xml));base64,([A-Za-z0-9+/=]+)$/i)
  if (!match) return undefined
  const contentType = match[1]!.toLowerCase()
  const extension = contentType === 'image/svg+xml'
    ? 'svg'
    : contentType === 'image/jpeg'
      ? 'jpg'
      : contentType.slice('image/'.length)
  return { extension, contentType, bytes: Buffer.from(match[2]!, 'base64') }
}

function registerDocxImage(block: Extract<MarkdownExportBlock, { type: 'image' }>, media: DocxImageMedia[]): DocxImageMedia | undefined {
  const parsed = parseDataImage(block.src)
  if (!parsed) return undefined
  const id = media.length + 1
  const image: DocxImageMedia = {
    id,
    relationshipId: `rIdImage${id}`,
    fileName: `image${id}.${parsed.extension}`,
    extension: parsed.extension,
    contentType: parsed.contentType,
    bytes: parsed.bytes,
    alt: block.alt,
  }
  media.push(image)
  return image
}

function docxImageParagraph(block: Extract<MarkdownExportBlock, { type: 'image' }>, media: DocxImageMedia[]): string {
  const image = registerDocxImage(block, media)
  if (!image) return docxParagraph(block.alt || '[image]')
  const { cx, cy } = measureImageExtent(image.bytes, image.extension)
  return [
    '<w:p><w:r><w:drawing>',
    '<wp:inline distT="0" distB="0" distL="0" distR="0">',
    `<wp:extent cx="${cx}" cy="${cy}"/>`,
    `<wp:docPr id="${image.id}" name="${xmlEscape(image.alt || image.fileName)}"/>`,
    '<a:graphic><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/picture"><pic:pic>',
    `<pic:nvPicPr><pic:cNvPr id="${image.id}" name="${xmlEscape(image.fileName)}"/><pic:cNvPicPr/></pic:nvPicPr>`,
    `<pic:blipFill><a:blip r:embed="${image.relationshipId}"/><a:stretch><a:fillRect/></a:stretch></pic:blipFill>`,
    `<pic:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="${cx}" cy="${cy}"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></pic:spPr>`,
    '</pic:pic></a:graphicData></a:graphic></wp:inline></w:drawing></w:r></w:p>',
    image.alt ? docxParagraph(image.alt, { after: 80 }) : '',
  ].join('')
}

function createDocxSectionProperties(pageLayout?: MarkdownExportPageLayout): string {
  const portrait = pageLayout?.pageSize === 'A3'
    ? { width: 16838, height: 23811 }
    : { width: 11906, height: 16838 }
  const landscape = pageLayout?.orientation === 'landscape'
  const width = landscape ? portrait.height : portrait.width
  const height = landscape ? portrait.width : portrait.height
  const orientation = landscape ? ' w:orient="landscape"' : ''
  return `<w:sectPr><w:pgSz w:w="${width}" w:h="${height}"${orientation}/><w:pgMar w:top="1440" w:right="1440" w:bottom="1440" w:left="1440"/></w:sectPr>`
}

function docxStylesXml(): string {
  return [
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>',
    '<w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">',
    '<w:docDefaults><w:rPrDefault><w:rPr>',
    '<w:rFonts w:ascii="Calibri" w:hAnsi="Calibri" w:eastAsia="微软雅黑" w:cs="Calibri"/>',
    '<w:sz w:val="22"/><w:szCs w:val="22"/>',
    '</w:rPr></w:rPrDefault>',
    '<w:pPrDefault><w:pPr><w:spacing w:after="120" w:line="360" w:lineRule="auto"/></w:pPr></w:pPrDefault>',
    '</w:docDefaults>',
    '<w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/><w:qFormat/></w:style>',
    '<w:style w:type="paragraph" w:styleId="Heading1"><w:name w:val="heading 1"/><w:basedOn w:val="Normal"/><w:qFormat/><w:pPr><w:spacing w:before="360" w:after="180"/></w:pPr><w:rPr><w:b/><w:sz w:val="32"/><w:szCs w:val="32"/></w:rPr></w:style>',
    '<w:style w:type="paragraph" w:styleId="Heading2"><w:name w:val="heading 2"/><w:basedOn w:val="Normal"/><w:qFormat/><w:pPr><w:spacing w:before="280" w:after="160"/></w:pPr><w:rPr><w:b/><w:sz w:val="28"/><w:szCs w:val="28"/></w:rPr></w:style>',
    '<w:style w:type="paragraph" w:styleId="Heading3"><w:name w:val="heading 3"/><w:basedOn w:val="Normal"/><w:qFormat/><w:pPr><w:spacing w:before="240" w:after="140"/></w:pPr><w:rPr><w:b/><w:sz w:val="24"/><w:szCs w:val="24"/></w:rPr></w:style>',
    '</w:styles>',
  ].join('')
}

export function createDocxBuffer(markdown: string, pageLayout?: MarkdownExportPageLayout): Buffer {
  const blocks = renderMarkdownBlocksForExport(markdown)
  const media: DocxImageMedia[] = []
  const documentContent = blocks.map((block) => {
    switch (block.type) {
      case 'heading':
        return docxParagraph(block.text, {
          bold: true,
          size: block.depth === 1 ? 32 : block.depth === 2 ? 28 : 24,
          after: 180,
          style: block.depth <= 3 ? `Heading${block.depth}` : 'Heading3',
        })
      case 'paragraph':
        return docxParagraph(block.text)
      case 'image':
        return docxImageParagraph(block, media)
      case 'listItem':
        return docxParagraph(`${block.ordered ? `${block.index}.` : '•'} ${block.text}`, { indent: 360 })
      case 'quote':
        return docxParagraph(block.text, { indent: 360 })
      case 'code':
        return docxParagraph(block.text, { indent: 360 })
      case 'table':
        return docxTable(block)
      case 'space':
        return '<w:p/>'
    }
  }).join('')

  const files: Array<{ name: string; data: Buffer }> = [
    {
      name: '[Content_Types].xml',
      data: Buffer.from([
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>',
        '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">',
        '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>',
        '<Default Extension="xml" ContentType="application/xml"/>',
        ...[...new Map(media.map((image) => [image.extension, image.contentType])).entries()]
          .map(([extension, contentType]) => `<Default Extension="${extension}" ContentType="${contentType}"/>`),
        '<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>',
        '<Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/>',
        '</Types>',
      ].join(''), 'utf8'),
    },
    {
      name: '_rels/.rels',
      data: Buffer.from('<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>', 'utf8'),
    },
    {
      name: 'word/_rels/document.xml.rels',
      data: Buffer.from([
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>',
        '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">',
        '<Relationship Id="rIdStyles" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>',
        ...media.map((image) => `<Relationship Id="${image.relationshipId}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="media/${image.fileName}"/>`),
        '</Relationships>',
      ].join(''), 'utf8'),
    },
    { name: 'word/styles.xml', data: Buffer.from(docxStylesXml(), 'utf8') },
  ]
  for (const image of media) {
    files.push({ name: `word/media/${image.fileName}`, data: image.bytes })
  }
  files.push({
    name: 'word/document.xml',
    data: Buffer.from([
      '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>',
      '<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture">',
      '<w:body>',
      documentContent || '<w:p/>',
      createDocxSectionProperties(pageLayout),
      '</w:body></w:document>',
    ].join(''), 'utf8'),
  })
  return zipStore(files)
}

function utf16BeHex(value: string): string {
  const buffer = Buffer.alloc(value.length * 2)
  for (let i = 0; i < value.length; i += 1) buffer.writeUInt16BE(value.charCodeAt(i), i * 2)
  return buffer.toString('hex').toUpperCase()
}

function wrapPdfLine(line: string, maxUnits = 78): string[] {
  if (!line) return ['']
  const wrapped: string[] = []
  let current = ''
  let units = 0
  for (const char of line) {
    const charUnits = char.charCodeAt(0) > 255 ? 2 : 1
    if (units + charUnits > maxUnits && current) {
      wrapped.push(current)
      current = ''
      units = 0
    }
    current += char
    units += charUnits
  }
  if (current) wrapped.push(current)
  return wrapped
}

export function createPdfBuffer(markdown: string, pageLayout?: MarkdownExportPageLayout): Buffer {
  const blocks = renderMarkdownBlocksForExport(markdown)
  const lines = blocks.flatMap((block) => {
    switch (block.type) {
      case 'heading':
        return wrapPdfLine(block.text, block.depth === 1 ? 44 : 56)
          .map((text) => ({ text, size: block.depth === 1 ? 18 : 15, indent: 0, after: 8 }))
      case 'paragraph':
        return wrapPdfLine(block.text).map((text) => ({ text, size: 11, indent: 0, after: 2 }))
      case 'image':
        return wrapPdfLine(block.alt ? `[Figure] ${block.alt}` : '[Figure]').map((text) => ({ text, size: 10, indent: 0, after: 4 }))
      case 'listItem':
        return wrapPdfLine(`${block.ordered ? `${block.index}.` : '•'} ${block.text}`, 72)
          .map((text) => ({ text, size: 11, indent: 18, after: 2 }))
      case 'quote':
        return wrapPdfLine(block.text, 72).map((text) => ({ text, size: 11, indent: 18, after: 2 }))
      case 'code':
        return block.text.split('\n').flatMap((line) =>
          wrapPdfLine(line, 72).map((text) => ({ text, size: 10, indent: 18, after: 1 })),
        )
      case 'table': {
        const tableLines = [block.header, ...block.rows]
          .filter((row) => row.length > 0)
          .map((row) => row.join('  |  '))
        return tableLines.flatMap((line, index) =>
          wrapPdfLine(line, 68).map((text) => ({ text, size: 10, indent: 0, after: index === 0 ? 4 : 1 })),
        )
      }
      case 'space':
        return [{ text: '', size: 11, indent: 0, after: 6 }]
    }
  })
  const landscape = pageLayout?.orientation === 'landscape'
  const a3 = pageLayout?.pageSize === 'A3'
  const mediaBox = landscape
    ? (a3 ? [0, 0, 1191, 842] : [0, 0, 842, 595])
    : (a3 ? [0, 0, 842, 1191] : [0, 0, 595, 842])
  const startY = mediaBox[3]! - 52
  const linesPerPage = landscape ? 32 : 46
  const pages = Math.max(1, Math.ceil(lines.length / linesPerPage))
  const objects: Array<{ id: number; body: string }> = [
    { id: 1, body: '<< /Type /Catalog /Pages 2 0 R >>' },
    { id: 2, body: `<< /Type /Pages /Kids [${Array.from({ length: pages }, (_, index) => `${6 + index * 2} 0 R`).join(' ')}] /Count ${pages} >>` },
    { id: 3, body: '<< /Type /Font /Subtype /Type0 /BaseFont /STSong-Light /Encoding /UniGB-UCS2-H /DescendantFonts [4 0 R] >>' },
    { id: 4, body: '<< /Type /Font /Subtype /CIDFontType0 /BaseFont /STSong-Light /CIDSystemInfo << /Registry (Adobe) /Ordering (GB1) /Supplement 5 >> /FontDescriptor 5 0 R /DW 1000 >>' },
    { id: 5, body: '<< /Type /FontDescriptor /FontName /STSong-Light /Flags 4 /FontBBox [0 -200 1000 900] /ItalicAngle 0 /Ascent 880 /Descent -120 /CapHeight 700 /StemV 80 >>' },
  ]
  for (let page = 0; page < pages; page += 1) {
    const pageLines = lines.slice(page * linesPerPage, (page + 1) * linesPerPage)
    const commands = [
      'BT',
      `50 ${startY} Td`,
      ...pageLines.flatMap((line, index) => {
        const leading = Math.max(13, line.size + 4 + line.after)
        const move = index === 0 ? [] : [`0 -${leading} Td`]
        const indent = line.indent ? [`${line.indent} 0 Td`] : []
        const resetIndent = line.indent ? [`-${line.indent} 0 Td`] : []
        return [
          ...move,
          `/F1 ${line.size} Tf`,
          ...indent,
          ...(line.text ? [`<${utf16BeHex(line.text)}> Tj`] : []),
          ...resetIndent,
        ]
      }),
      'ET',
    ].join('\n')
    objects.push({
      id: 6 + page * 2,
      body: `<< /Type /Page /Parent 2 0 R /MediaBox [${mediaBox.join(' ')}] /Resources << /Font << /F1 3 0 R >> >> /Contents ${7 + page * 2} 0 R >>`,
    })
    objects.push({
      id: 7 + page * 2,
      body: `<< /Length ${Buffer.byteLength(commands, 'utf8')} >>\nstream\n${commands}\nendstream`,
    })
  }
  objects.sort((a, b) => a.id - b.id)
  const chunks: string[] = ['%PDF-1.4\n% Agent Pi\n']
  const offsets: number[] = [0]
  for (const object of objects) {
    offsets[object.id] = Buffer.byteLength(chunks.join(''), 'utf8')
    chunks.push(`${object.id} 0 obj\n${object.body}\nendobj\n`)
  }
  const xrefOffset = Buffer.byteLength(chunks.join(''), 'utf8')
  const maxId = Math.max(...objects.map((object) => object.id))
  chunks.push(`xref\n0 ${maxId + 1}\n0000000000 65535 f \n`)
  for (let id = 1; id <= maxId; id += 1) {
    chunks.push(`${String(offsets[id] ?? 0).padStart(10, '0')} 00000 n \n`)
  }
  chunks.push(`trailer\n<< /Size ${maxId + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF`)
  return Buffer.from(chunks.join(''), 'utf8')
}

function findChromium(): string | null {
  const candidates = [
    process.env.PROGRAMFILES ? join(process.env.PROGRAMFILES, 'Google/Chrome/Application/chrome.exe') : '',
    process.env.LOCALAPPDATA ? join(process.env.LOCALAPPDATA, 'Google/Chrome/Application/chrome.exe') : '',
    process.env['PROGRAMFILES(X86)'] ? join(process.env['PROGRAMFILES(X86)'], 'Google/Chrome/Application/chrome.exe') : '',
    process.env.PROGRAMFILES ? join(process.env.PROGRAMFILES, 'Microsoft/Edge/Application/msedge.exe') : '',
    process.env['PROGRAMFILES(X86)'] ? join(process.env['PROGRAMFILES(X86)'], 'Microsoft/Edge/Application/msedge.exe') : '',
    process.env.LOCALAPPDATA ? join(process.env.LOCALAPPDATA, 'Microsoft/Edge/Application/msedge.exe') : '',
  ].filter(Boolean)
  return candidates.find((path) => existsSync(path)) ?? null
}

function printedPdfReady(pdfPath: string): boolean {
  return existsSync(pdfPath) && statSync(pdfPath).size >= 800
}

function printHtmlWithChromium(
  chrome: string,
  htmlPath: string,
  pdfPath: string,
  userDataDir: string,
  extra: string[],
): boolean {
  spawnSync(chrome, [
    ...extra,
    '--disable-gpu',
    '--disable-extensions',
    '--disable-background-networking',
    '--disable-sync',
    '--disable-default-apps',
    '--no-first-run',
    '--no-default-browser-check',
    '--no-pdf-header-footer',
    '--hide-scrollbars',
    '--run-all-compositor-stages-before-draw',
    '--virtual-time-budget=20000',
    '--font-render-hinting=none',
    '--allow-file-access-from-files',
    `--user-data-dir=${userDataDir}`,
    `--print-to-pdf=${pdfPath}`,
    pathToFileURL(htmlPath).href,
  ], { timeout: 90_000, windowsHide: true, encoding: 'utf8' })
  return printedPdfReady(pdfPath)
}

export function renderHtmlToPdf(html: string): Buffer | null {
  const chrome = findChromium()
  if (!chrome) return null
  const id = randomBytes(8).toString('hex')
  const htmlPath = join(tmpdir(), `ap-export-${id}.html`)
  const pdfPath = join(tmpdir(), `ap-export-${id}.pdf`)
  const userDataDir = join(tmpdir(), `ap-export-ud-${id}`)
  writeFileSync(htmlPath, html, 'utf8')
  mkdirSync(userDataDir, { recursive: true })
  try {
    const attempts = [
      ['--headless=new'],
      ['--headless=new', '--no-sandbox'],
      ['--headless'],
      ['--headless', '--no-sandbox'],
    ]
    for (const extra of attempts) {
      if (printHtmlWithChromium(chrome, htmlPath, pdfPath, userDataDir, extra)) break
    }
    if (!printedPdfReady(pdfPath)) return null
    const body = readFileSync(pdfPath)
    if (body.subarray(0, 5).toString() !== '%PDF-') return null
    return body
  } catch {
    return null
  } finally {
    try { unlinkSync(htmlPath) } catch {}
    try { unlinkSync(pdfPath) } catch {}
    try { rmSync(userDataDir, { recursive: true, force: true }) } catch {}
  }
}

export function buildPreparedExport(sourcePath: string, markdown: string): {
  prepared: PreparedMarkdownExportContent
  title: string
  html: string
} {
  const prepared = prepareMarkdownContentForExport(sourcePath, markdown)
  const title = basename(sourcePath)
  return {
    prepared,
    title,
    html: createMarkdownHtml(prepared.content, title, prepared.pageLayout),
  }
}

export function exportPreparedMarkdown(
  sourcePath: string,
  markdown: string,
  format: MarkdownExportFormat,
): { filename: string; mime: string; body: Buffer } {
  const parsed = parse(sourcePath)
  if (format === 'md') {
    return {
      filename: `${parsed.name}.md`,
      mime: 'text/markdown; charset=utf-8',
      body: Buffer.from(markdown, 'utf8'),
    }
  }
  const { prepared, title, html } = buildPreparedExport(sourcePath, markdown)
  if (format === 'html') {
    return {
      filename: `${parsed.name}.html`,
      mime: 'text/html; charset=utf-8',
      body: Buffer.from(html, 'utf8'),
    }
  }
  if (format === 'docx') {
    return {
      filename: `${parsed.name}.docx`,
      mime: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      body: createDocxBuffer(prepared.content, prepared.pageLayout),
    }
  }
  const printed = renderHtmlToPdf(html)
  return {
    filename: `${parsed.name}.pdf`,
    mime: 'application/pdf',
    body: printed ?? createPdfBuffer(prepared.content, prepared.pageLayout),
  }
}
