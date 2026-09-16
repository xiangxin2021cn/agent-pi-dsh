import { extname } from 'node:path'
import { inflateRawSync } from 'node:zlib'
import { crc32 } from './xlsx-zip.ts'

/** Validate central-directory sizes and CRCs, including streamed Office ZIPs. */
export function inspectOfficeZip(buffer: Buffer, limit = 64 * 1024 * 1024): Map<string, Buffer> {
  const invalid = () => { throw new Error('Office ZIP 目录、内容或校验码无效；请重新生成并打开检查。') }
  let end = buffer.length - 22
  const floor = Math.max(0, end - 65535)
  for (; end >= floor; end--) {
    if (buffer.readUInt32LE(end) === 0x06054b50 && end + 22 + buffer.readUInt16LE(end + 20) === buffer.length) break
  }
  if (end < floor || buffer.readUInt16LE(end + 4) || buffer.readUInt16LE(end + 6)) return invalid()
  const count = buffer.readUInt16LE(end + 10)
  let offset = buffer.readUInt32LE(end + 16)
  if (count !== buffer.readUInt16LE(end + 8) || offset + buffer.readUInt32LE(end + 12) !== end) return invalid()
  const files = new Map<string, Buffer>()
  let total = 0
  for (let index = 0; index < count; index++) {
    if (offset + 46 > end || buffer.readUInt32LE(offset) !== 0x02014b50) return invalid()
    const flags = buffer.readUInt16LE(offset + 8), method = buffer.readUInt16LE(offset + 10)
    const crc = buffer.readUInt32LE(offset + 16), size = buffer.readUInt32LE(offset + 20), rawSize = buffer.readUInt32LE(offset + 24)
    const nameLength = buffer.readUInt16LE(offset + 28), local = buffer.readUInt32LE(offset + 42)
    const next = offset + 46 + nameLength + buffer.readUInt16LE(offset + 30) + buffer.readUInt16LE(offset + 32)
    if (next > end || flags & 1 || ![0, 8].includes(method) || local + 30 > offset) return invalid()
    const name = buffer.toString('utf8', offset + 46, offset + 46 + nameLength)
    if (!name || files.has(name) || buffer.readUInt32LE(local) !== 0x04034b50
      || buffer.readUInt16LE(local + 6) !== flags || buffer.readUInt16LE(local + 8) !== method) return invalid()
    const start = local + 30 + buffer.readUInt16LE(local + 26) + buffer.readUInt16LE(local + 28)
    if (start + size > buffer.readUInt32LE(end + 16)
      || buffer.toString('utf8', local + 30, local + 30 + buffer.readUInt16LE(local + 26)) !== name) return invalid()
    if (rawSize > limit - total) throw new Error('Office 文件解压后超过自动检查大小限制，请打开文件审阅。')
    const payload = buffer.subarray(start, start + size)
    const raw = method === 8 ? inflateRawSync(payload, { maxOutputLength: Math.max(1, limit - total) }) : payload
    if (raw.length !== rawSize || crc32(raw) !== crc) return invalid()
    total += raw.length
    files.set(name, raw)
    offset = next
  }
  if (offset !== end) return invalid()
  return files
}

export async function inspectDeliverable(bytes: Uint8Array, path: string): Promise<{ text: string | null; evidence: string }> {
  const buffer = Buffer.from(bytes), ext = extname(path).toLowerCase()
  if (['.docx', '.xlsx', '.pptx'].includes(ext)) {
    const files = inspectOfficeZip(buffer)
    const root = ext === '.docx' ? 'word/document.xml' : ext === '.xlsx' ? 'xl/workbook.xml' : 'ppt/presentation.xml'
    if (!files.has('[Content_Types].xml') || !files.get(root)?.length) throw new Error('文件内容不是对应的 Office 格式。')
    const text = [...files.entries()].filter(([name]) => name.endsWith('.xml'))
      .map(([, data]) => data.toString('utf8').replace(/<[^>]*>/g, '')
        .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, '&')).join('\n')
    return { text, evidence: 'Office ZIP 完整性、CRC 与对应文档部件已检查；仍需打开并检查版式、公式及编辑保存。' }
  }
  if (ext === '.pdf') {
    if (buffer.subarray(0, 5).toString() !== '%PDF-') throw new Error('文件没有有效 PDF 标识。')
    const { PDFDocument } = await import('pdf-lib')
    const pdf = await PDFDocument.load(buffer, { throwOnInvalidObject: true })
    if (!pdf.getPageCount()) throw new Error('PDF 没有可交付页面。')
    return { text: null, evidence: `PDF 已解析，共 ${pdf.getPageCount()} 页；尚不代表已渲染检查页面。` }
  }
  if (['.xls', '.doc', '.ppt'].includes(ext)) {
    if (buffer.length < 512 || buffer.subarray(0, 8).toString('hex') !== 'd0cf11e0a1b11ae1') throw new Error('旧版 Office 文件没有有效 OLE 容器，不能用改扩展名代替。')
    return { text: null, evidence: '仅检查 OLE 容器标识；文件类型、可打开性及编辑保存需由对应应用验证。' }
  }
  if (ext === '.univer' && buffer.subarray(0, 16).toString() === 'SQLite format 3\0') {
    return { text: null, evidence: '仅检查 Univer SQLite 容器标识；需在 Office 查看器中打开、编辑保存并重开验证。' }
  }
  const text = buffer.toString('utf8')
  if (ext === '.json' || ext === '.univer') {
    JSON.parse(text)
    return { text, evidence: 'JSON 语法已解析；应用结构和显示需另行验证。' }
  }
  if (['.md', '.txt', '.csv', '.html', '.htm', '.xml', '.svg', '.yaml', '.yml'].includes(ext)) {
    return { text, evidence: '已读取文本；仅验证约定内容，未验证版式或可编辑性。' }
  }
  return { text: null, evidence: '此格式不支持自动结构检查，仅确认文件存在且非空；需用对应应用打开验收。' }
}
