import assert from 'node:assert/strict'
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'
import { demoPricingData } from '../src/pricing-workbook.ts'
import {
  applyReviewedOverlay,
  diffSensitivePricing,
  divideDecimalStrings,
  extractSensitiveFacts,
  patchLabeledValues,
  patchSiblingPricingMarkdown,
} from '../src/pricing-review.ts'

const before = `## C5.1.1

- 日产量基准: **2,500 m³/天** | 工期: 17天

| 柴油 | R23.50/L | 示意泵价 |
| 水泥 | R1,850/t | 示意袋装 |
`

test('extracts daily output and key resource rates', () => {
  const facts = extractSensitiveFacts(before)
  assert.ok(facts.some((fact) => fact.kind === 'productivity' && fact.value === '2500'))
  assert.ok(facts.some((fact) => fact.kind === 'rate' && fact.label.includes('柴油') && fact.value === '23.5'))
  assert.ok(facts.some((fact) => fact.kind === 'rate' && fact.label.includes('水泥') && fact.value === '1850'))
})

test('diff reports productivity and diesel edits and ignores wording', () => {
  const after = before
    .replace('2,500', '3,000')
    .replace('R23.50/L', 'R26.80/L')
    .replace('示意泵价', '本标人工复核')
  const { changes } = diffSensitivePricing(before, after)
  assert.equal(changes.length, 2)
  const prod = changes.find((row) => row.kind === 'productivity')
  const diesel = changes.find((row) => row.kind === 'rate' && row.label.includes('柴油'))
  assert.equal(prod?.from, '2500')
  assert.equal(prod?.to, '3000')
  assert.equal(diesel?.from, '23.5')
  assert.equal(diesel?.to, '26.8')
  const wording = diffSensitivePricing(before, before.replace('示意泵价', '当地摘录'))
  assert.equal(wording.changes.length, 0)
})

test('overlay doubles output and halves time-based consumption', () => {
  const pack = demoPricingData()
  const diesel = pack.itemBuildUps[0]!.costComponents.find((row) => /diesel/i.test(row.description))!
  const overlaid = applyReviewedOverlay(pack, {
    projectId: 'demo',
    updatedAt: '2026-08-25T00:00:00.000Z',
    source: 'human_reviewed',
    items: [
      { key: 'productivity|日产|', kind: 'productivity', label: '日产', value: '6400' },
      { key: 'rate|柴油|', kind: 'rate', label: '柴油', value: '300' },
    ],
  })
  const item = overlaid.itemBuildUps[0]!
  assert.equal(item.planningBasis?.productionRate, '6400')
  assert.equal(item.planningBasis?.duration, divideDecimalStrings('1000', '6400'))
  const fuel = item.costComponents.find((row) => /diesel/i.test(row.description))!
  assert.equal(fuel.quantity, divideDecimalStrings(diesel.quantity, '2'))
  assert.equal(fuel.rate, '300')
  assert.equal(fuel.amount, '9.375')
})

test('labeled patch replaces the old number on the same line', () => {
  const patched = patchLabeledValues(before, [{
    kind: 'rate',
    key: 'rate|柴油|',
    label: '柴油',
    from: '23.50',
    to: '26.80',
    fromRaw: '23.50',
    toRaw: '26.80',
  }])
  assert.equal(patched.hits, 1)
  assert.match(patched.text, /R26\.80\/L/)
  assert.doesNotMatch(patched.text, /R23\.50\/L/)
})

test('sibling markdown is left alone when the label is absent', () => {
  const dir = mkdtempSync(join(tmpdir(), 'ap-review-md-'))
  const saved = join(dir, 'C5.1.md')
  const other = join(dir, 'notes.md')
  mkdirSync(dir, { recursive: true })
  writeFileSync(saved, before)
  writeFileSync(other, '工期说明，无关键资源行。\n')
  const patched = patchSiblingPricingMarkdown(saved, [{
    kind: 'rate',
    key: 'rate|柴油|',
    label: '柴油',
    from: '23.50',
    to: '26.80',
    fromRaw: '23.50',
    toRaw: '26.80',
  }])
  assert.equal(patched.length, 0)
  assert.equal(readFileSync(other, 'utf8').includes('关键资源'), true)
})
