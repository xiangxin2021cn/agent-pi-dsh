import assert from 'node:assert/strict'
import { test } from 'node:test'
import { PDFDocument } from 'pdf-lib'
import { inspectDeliverable, inspectOfficeZip } from '../src/deliverable-format.ts'
import { zipStore } from '../src/xlsx-zip.ts'

const docx = () => zipStore([{ name: '[Content_Types].xml', data: '<Types/>' }, { name: 'word/document.xml', data: '<w:t>A&amp;B</w:t>' }])

test('Office inspection detects truncation, incorrect CRC, duplicate parts and wrong format', async () => {
  assert.equal((await inspectDeliverable(docx(), 'report.docx')).text?.trim(), 'A&B')
  await assert.rejects(inspectDeliverable(docx(), 'report.xlsx'), /对应的 Office/)
  await assert.rejects(inspectDeliverable(docx().subarray(0, 100), 'report.docx'), /ZIP/)
  const bad = docx(), central = bad.indexOf(Buffer.from('PK\x01\x02', 'binary'))
  bad.writeUInt32LE(0, central + 16)
  await assert.rejects(inspectDeliverable(bad, 'report.docx'), /校验码/)
  assert.throws(() => inspectOfficeZip(zipStore([{ name: 'x', data: 'one' }, { name: 'x', data: 'two' }])), /ZIP/)
  assert.throws(() => inspectOfficeZip(docx(), 1), /大小限制/)
})

test('Office streams with data-descriptor flags use the central directory sizes', () => {
  const archive = docx()
  let central = archive.indexOf(Buffer.from('PK\x01\x02', 'binary'))
  while (archive.readUInt32LE(central) === 0x02014b50) {
    const local = archive.readUInt32LE(central + 42)
    archive.writeUInt16LE(8, local + 6)
    archive.fill(0, local + 14, local + 26)
    archive.writeUInt16LE(8, central + 8)
    central += 46 + archive.readUInt16LE(central + 28) + archive.readUInt16LE(central + 30) + archive.readUInt16LE(central + 32)
  }
  assert.equal(inspectOfficeZip(archive).size, 2)
})

test('PDF must parse and contain pages; a header alone does not prove a deliverable', async () => {
  const pdf = await PDFDocument.create()
  pdf.addPage([200, 200])
  const result = await inspectDeliverable(await pdf.save(), 'report.pdf')
  assert.match(result.evidence, /1 页/)
  assert.equal(result.text, null)
  await assert.rejects(inspectDeliverable(Buffer.from('%PDF-1.7\nnot a document'), 'report.pdf'))
  await assert.rejects(inspectDeliverable(Buffer.from('<html>fake</html>'), 'report.pdf'), /PDF 标识/)
})

test('renamed legacy files fail; unsupported formats never claim a format or content check', async () => {
  await assert.rejects(inspectDeliverable(Buffer.from('a,b\n1,2'), 'sheet.xls'), /OLE/)
  const result = await inspectDeliverable(Buffer.from('unparsed drawing'), 'drawing.dwg')
  assert.equal(result.text, null)
  assert.match(result.evidence, /不支持自动结构检查/)
})
