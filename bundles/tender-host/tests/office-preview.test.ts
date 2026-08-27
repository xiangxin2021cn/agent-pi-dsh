import assert from 'node:assert/strict'
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'
import { readOfficePreview, saveOfficePreview } from '../src/office-preview.ts'
import { unzipStore, zipStore } from '../src/xlsx-zip.ts'

test('xlsx open sheet tags keep every worksheet in the office preview', () => {
  const cwd = mkdtempSync(join(tmpdir(), 'ap-off-ms-'))
  const path = join(cwd, '资源.xlsx')
  writeFileSync(path, zipStore([
    {
      name: '[Content_Types].xml',
      data: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>
  <Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>
  <Override PartName="/xl/worksheets/sheet2.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>
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
  <sheets>
    <sheet name="汇总" sheetId="1" r:id="rId1"></sheet>
    <sheet name="人工" sheetId="2" r:id="rId2"></sheet>
  </sheets>
</workbook>`,
    },
    {
      name: 'xl/_rels/workbook.xml.rels',
      data: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/>
  <Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet2.xml"/>
</Relationships>`,
    },
    {
      name: 'xl/worksheets/sheet1.xml',
      data: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
  <sheetData><row r="1"><c r="A1" t="inlineStr"><is><t>总量</t></is></c></row></sheetData>
</worksheet>`,
    },
    {
      name: 'xl/worksheets/sheet2.xml',
      data: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
  <sheetData><row r="1"><c r="A1" t="inlineStr"><is><t>工日</t></is></c></row></sheetData>
</worksheet>`,
    },
  ]))
  const preview = readOfficePreview(cwd, path)
  assert.equal(preview.sheets?.length, 2)
  assert.equal(preview.sheets?.[0].name, '汇总')
  assert.equal(preview.sheets?.[1].name, '人工')
  assert.equal(preview.sheets?.[1].rows[0][0], '工日')
})

test('xlsx numeric character references decode in the office preview', () => {
  const cwd = mkdtempSync(join(tmpdir(), 'ap-off-ncr-'))
  const path = join(cwd, 'boq.xlsx')
  writeFileSync(path, zipStore([
    {
      name: '[Content_Types].xml',
      data: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>
  <Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>
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
  <sheets><sheet name="BOQ" sheetId="1" r:id="rId1"/></sheets>
</workbook>`,
    },
    {
      name: 'xl/_rels/workbook.xml.rels',
      data: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/>
</Relationships>`,
    },
    {
      name: 'xl/worksheets/sheet1.xml',
      data: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
  <sheetData><row r="1"><c r="A1" t="inlineStr"><is><t>BOQ &#32452;&#20215;&#27979;&#31639;</t></is></c></row></sheetData>
</worksheet>`,
    },
  ]))
  const preview = readOfficePreview(cwd, path)
  assert.equal(preview.sheets?.[0].rows[0][0], 'BOQ 组价测算')
})

test('xlsx grid round-trips through preview save', () => {
  const cwd = mkdtempSync(join(tmpdir(), 'ap-off-'))
  const path = join(cwd, 'rates.xlsx')
  writeFileSync(path, 'pk')
  saveOfficePreview(cwd, path, {
    kind: 'spreadsheet',
    sheets: [{ name: 'Rates', rows: [['Item', 'Qty'], ['C1.2', '12']] }],
  })
  const preview = readOfficePreview(cwd, path)
  assert.equal(preview.kind, 'spreadsheet')
  assert.equal(preview.editable, true)
  assert.deepEqual(preview.sheets?.[0].rows[0], ['Item', 'Qty'])
  assert.deepEqual(preview.sheets?.[0].rows[1], ['C1.2', '12'])
  const files = unzipStore(readFileSync(path))
  assert.ok(files.get('xl/workbook.xml'))
})

test('csv edits write back as csv', () => {
  const cwd = mkdtempSync(join(tmpdir(), 'ap-csv-'))
  const path = join(cwd, 'a.csv')
  writeFileSync(path, 'a,b\n1,2\n', 'utf8')
  const preview = readOfficePreview(cwd, path)
  assert.deepEqual(preview.sheets?.[0].rows[0], ['a', 'b'])
  saveOfficePreview(cwd, path, {
    kind: 'spreadsheet',
    sheets: [{ name: 'a.csv', rows: [['a', 'b'], ['3', '4']] }],
  })
  const again = readOfficePreview(cwd, path)
  assert.deepEqual(again.sheets?.[0].rows[1], ['3', '4'])
})

test('docx paragraphs save and reload', () => {
  const cwd = mkdtempSync(join(tmpdir(), 'ap-doc-'))
  const path = join(cwd, 'note.docx')
  saveOfficePreview(cwd, path, { kind: 'word', paragraphs: ['Hello', 'World'] })
  const preview = readOfficePreview(cwd, path)
  assert.equal(preview.kind, 'word')
  assert.deepEqual(preview.paragraphs, ['Hello', 'World'])
})

test('legacy ole files stay read-only', () => {
  const cwd = mkdtempSync(join(tmpdir(), 'ap-ole-'))
  const path = join(cwd, 'old.xls')
  writeFileSync(path, 'not-ooxml')
  const preview = readOfficePreview(cwd, path)
  assert.equal(preview.kind, 'legacy-office')
  assert.equal(preview.editable, false)
  assert.throws(() => saveOfficePreview(cwd, path, { kind: 'spreadsheet', sheets: [] }), /OLE/)
})
