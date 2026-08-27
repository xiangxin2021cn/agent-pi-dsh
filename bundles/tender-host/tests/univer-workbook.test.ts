import assert from 'node:assert/strict'
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'
import { saveOfficePreview } from '../src/office-preview.ts'
import { univerAssetPath, univerAssetsReady, univerSheetPage } from '../src/univer-assets.ts'
import {
  isUniverSheetPath,
  readUniverWorkbook,
  saveUniverWorkbook,
  univerSheetUrl,
  type UniverWorkbookData,
} from '../src/univer-workbook.ts'
import { zipStore, unzipStore } from '../src/xlsx-zip.ts'

function xlsxWithNumericEntities(): Buffer {
  return zipStore([
    {
      name: '[Content_Types].xml',
      data: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>
  <Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>
  <Override PartName="/xl/sharedStrings.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sharedStrings+xml"/>
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
    <sheet name="BOQ" sheetId="1" r:id="rId1"/>
  </sheets>
</workbook>`,
    },
    {
      name: 'xl/_rels/workbook.xml.rels',
      data: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/>
  <Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/sharedStrings" Target="sharedStrings.xml"/>
</Relationships>`,
    },
    {
      name: 'xl/sharedStrings.xml',
      data: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<sst xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" count="2" uniqueCount="2">
  <si><t>BOQ &#32452;&#20215;&#27979;&#31639;</t></si>
  <si><t>&#x7EC4;&#x4EF7;</t></si>
</sst>`,
    },
    {
      name: 'xl/worksheets/sheet1.xml',
      data: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
  <sheetData>
    <row r="1">
      <c r="A1" t="s"><v>0</v></c>
      <c r="B1" t="inlineStr"><is><t>&#32452;</t></is></c>
      <c r="C1" t="s"><v>1</v></c>
    </row>
  </sheetData>
</worksheet>`,
    },
  ])
}

function sampleBook(name: string): UniverWorkbookData {
  return {
    id: 'workbook',
    name,
    appVersion: '0.25.1',
    sheetOrder: ['sheet-1', 'sheet-2'],
    styles: {},
    sheets: {
      'sheet-1': {
        id: 'sheet-1',
        name: 'Calc',
        rowCount: 40,
        columnCount: 12,
        cellData: {
          0: {
            0: { v: 2, t: 2 },
            1: { f: '=A1*3', v: 6, t: 2 },
            2: { v: 'qty', t: 1 },
          },
        },
      },
      'sheet-2': {
        id: 'sheet-2',
        name: 'Notes',
        rowCount: 40,
        columnCount: 12,
        cellData: {
          0: { 0: { v: 'ok', t: 1 } },
        },
      },
    },
  }
}

test('xlsx formula and second sheet survive Univer snapshot save', () => {
  const cwd = mkdtempSync(join(tmpdir(), 'ap-univer-x-'))
  const path = join(cwd, 'calc.xlsx')
  saveUniverWorkbook(cwd, path, sampleBook('calc.xlsx'))
  const book = readUniverWorkbook(cwd, path)
  assert.equal(book.sheetOrder.length, 2)
  assert.equal(book.sheets['sheet-1']?.name, 'Calc')
  assert.equal(book.sheets['sheet-1']?.cellData['0']['1']?.f, '=A1*3')
  assert.equal(book.sheets['sheet-1']?.cellData['0']['0']?.v, 2)
  assert.equal(book.sheets['sheet-2']?.cellData['0']['0']?.v, 'ok')
  book.sheets['sheet-1'].cellData['0']['0'] = { v: 5, t: 2 }
  saveUniverWorkbook(cwd, path, book)
  const again = readUniverWorkbook(cwd, path)
  assert.equal(again.sheets['sheet-1']?.cellData['0']['0']?.v, 5)
  assert.equal(again.sheets['sheet-1']?.cellData['0']['1']?.f, '=A1*3')
  const files = unzipStore(readFileSync(path))
  assert.match(files.get('xl/worksheets/sheet1.xml')?.toString('utf8') || '', /<f>A1\*3<\/f>/)
})

test('csv edits write back as csv', () => {
  const cwd = mkdtempSync(join(tmpdir(), 'ap-univer-c-'))
  const path = join(cwd, 'rates.csv')
  writeFileSync(path, 'a,b\n1,2\n', 'utf8')
  const book = readUniverWorkbook(cwd, path)
  assert.equal(book.sheets['sheet-1']?.cellData['0']['0']?.v, 'a')
  book.sheets['sheet-1'].cellData['1']['1'] = { v: 9, t: 2 }
  const saved = saveUniverWorkbook(cwd, path, book)
  assert.equal(saved.hint, '已保存回原文件')
  assert.match(readFileSync(path, 'utf8'), /9/)
})

function xlsxWithOpenSheetTags(): Buffer {
  return zipStore([
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
  ])
}

test('xlsx open sheet tags load every worksheet, not only the first', () => {
  const cwd = mkdtempSync(join(tmpdir(), 'ap-univer-ms-'))
  const path = join(cwd, '资源.xlsx')
  writeFileSync(path, xlsxWithOpenSheetTags())
  const book = readUniverWorkbook(cwd, path)
  assert.equal(book.sheetOrder.length, 2)
  assert.equal(book.sheets['sheet-1']?.name, '汇总')
  assert.equal(book.sheets['sheet-2']?.name, '人工')
  assert.equal(book.sheets['sheet-1']?.cellData['0']['0']?.v, '总量')
  assert.equal(book.sheets['sheet-2']?.cellData['0']['0']?.v, '工日')
})

test('xlsx numeric character references decode to CJK', () => {
  const cwd = mkdtempSync(join(tmpdir(), 'ap-univer-ncr-'))
  const path = join(cwd, 'boq.xlsx')
  writeFileSync(path, xlsxWithNumericEntities())
  const book = readUniverWorkbook(cwd, path)
  assert.equal(book.sheets['sheet-1']?.cellData['0']['0']?.v, 'BOQ 组价测算')
  assert.equal(book.sheets['sheet-1']?.cellData['0']['1']?.v, '组')
  assert.equal(book.sheets['sheet-1']?.cellData['0']['2']?.v, '组价')
})

test('office preview xlsx can be opened as a Univer workbook', () => {
  const cwd = mkdtempSync(join(tmpdir(), 'ap-univer-p-'))
  const path = join(cwd, 'rates.xlsx')
  saveOfficePreview(cwd, path, {
    kind: 'spreadsheet',
    sheets: [{ name: 'Rates', rows: [['Item', 'Qty'], ['C1.2', '12']] }],
  })
  const book = readUniverWorkbook(cwd, path)
  assert.equal(book.sheets['sheet-1']?.name, 'Rates')
  assert.equal(book.sheets['sheet-1']?.cellData['0']['0']?.v, 'Item')
})

test('isUniverSheetPath and sheet url stay on the original file', () => {
  assert.equal(isUniverSheetPath('a.xlsx'), true)
  assert.equal(isUniverSheetPath('a.csv'), true)
  assert.equal(isUniverSheetPath('a.tsv'), true)
  assert.equal(isUniverSheetPath('a.xls'), false)
  assert.equal(isUniverSheetPath('a.docx'), false)
  assert.match(univerSheetUrl('C:/work', 'boq.xlsx'), /path=boq\.xlsx/)
  assert.match(univerSheetUrl('C:/work', 'boq.xlsx'), /cwd=C/)
})

test('unknown Univer assets are rejected and the sheet page only lists present files', () => {
  assert.equal(univerAssetPath('../presets.js'), null)
  assert.equal(univerAssetPath('not-a-real.js'), null)
  const page = univerSheetPage()
  assert.match(page, /id="app"/)
  assert.match(page, /univer-sheet\.js/)
  if (univerAssetsReady()) {
    assert.match(page, /presets\.js/)
    assert.match(page, /sheets-core\.js/)
  }
})
