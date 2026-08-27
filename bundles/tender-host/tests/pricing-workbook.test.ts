import assert from 'node:assert/strict'
import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'
import {
  BOQ_PRICING_WORKBOOK_FILE,
  buildPricingWorkbook,
  demoPricingData,
  generatePricingWorkbook,
  pricingWorkbookMissing,
} from '../src/pricing-workbook.ts'
import { unzipStore } from '../src/xlsx-zip.ts'

function sheetXml(files: Map<string, Buffer>, index: number): string {
  return files.get(`xl/worksheets/sheet${index}.xml`)?.toString('utf8') ?? ''
}

test('demo workbook keeps the sample unit-cost layout and live formulas', () => {
  const files = unzipStore(buildPricingWorkbook(demoPricingData(), 'TEMPLATE'))
  assert.ok(files.get('[Content_Types].xml'))
  const workbook = files.get('xl/workbook.xml')?.toString('utf8') ?? ''
  assert.match(workbook, /sheet name="Summary"/)
  assert.match(workbook, /sheet name="Rates"/)
  assert.match(workbook, /sheet name="700.1"/)
  assert.match(workbook, /fullCalcOnLoad="1"/)

  const strings = files.get('xl/sharedStrings.xml')?.toString('utf8') ?? ''
  assert.match(strings, /Cost of fuel/)
  assert.match(strings, /Cost of machinery/)
  assert.match(strings, /Cost of labor/)
  assert.match(strings, /Management fees and other expenses/)

  const summary = sheetXml(files, 1)
  assert.match(summary, /<f>'700.1'!E3<\/f>/)
  assert.match(summary, /<f>D3\*E3<\/f>/)
  assert.match(summary, /<f>SUM\(F3:F3\)<\/f>/)

  const rates = sheetXml(files, 2)
  assert.match(rates, /<v>0<\/v>/)

  const item = sheetXml(files, 3)
  assert.match(item, /<f>2\*10\*10\/\$H\$2<\/f>/)
  assert.match(item, /<f>D\d+\*E\d+<\/f>/)
  assert.match(item, /<f>SUM\(F\d+:F\d+\)<\/f>/)
  assert.match(item, /Rates!\$B\$5/)
  assert.match(item, /<c r="E3"[^>]*><f>F\d+<\/f><\/c>/)
})

test('generatePricingWorkbook writes Official Outputs and the stage gate sees it', () => {
  const cwd = mkdtempSync(join(tmpdir(), 'ap-pricing-'))
  const projectId = 'demo-road'
  const written = generatePricingWorkbook({
    cwd,
    projectId,
    projectTitle: 'Demo road',
    data: demoPricingData(),
  })
  assert.equal(written.fileName, BOQ_PRICING_WORKBOOK_FILE)
  assert.equal(written.items, 1)
  assert.equal(written.sheets, 3)
  assert.ok(written.path.endsWith(join('Agent Pi Outputs', projectId, 'boq-pricing', BOQ_PRICING_WORKBOOK_FILE)))
  assert.equal(pricingWorkbookMissing(cwd, projectId, 'boq-five-step-pricing'), undefined)
  assert.match(pricingWorkbookMissing(cwd, 'other', 'boq-five-step-pricing') ?? '', /缺公式测算表/)
  assert.equal(pricingWorkbookMissing(cwd, projectId, 'tender-document-analysis'), undefined)
})

test('empty pack cannot generate a workbook', () => {
  const cwd = mkdtempSync(join(tmpdir(), 'ap-pricing-empty-'))
  writeFileSync(join(cwd, 'dummy'), '')
  assert.throws(
    () => generatePricingWorkbook({ cwd, projectId: 'empty' }),
    /还没有 boq_five_step_pricing/,
  )
})
