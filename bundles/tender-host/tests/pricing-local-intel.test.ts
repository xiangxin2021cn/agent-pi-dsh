import assert from 'node:assert/strict'
import { mkdtempSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { test } from 'node:test'
import {
  assessPricingLocalIntel,
  evaluatePricingIntelGate,
  fixturePricingDiligenceMarkdown,
  fixturePricingProductivityMarkdown,
  fixturePricingRfqIndexMarkdown,
  fixturePricingRfqMarkdown,
  fixturePricingWaiverMarkdown,
  pricingLocalIntelApplies,
  writePricingIntelFixtures,
  writePricingWaiverFixture,
} from '../src/pricing-local-intel.ts'

test('pricing local-intel fixtures clear the mechanical bar', () => {
  const dir = mkdtempSync(join(tmpdir(), 'ap-intel-'))
  assert.equal(assessPricingLocalIntel(dir).ok, false)
  writePricingIntelFixtures(dir)
  const status = assessPricingLocalIntel(dir)
  assert.equal(status.ok, true, status.shortGaps)
  assert.equal(status.rfqs.length, 1)
  assert.match(status.rfqs[0]!.fileName, /RFQ-01-diesel/)
})

test('RFQ fixture is bilingual and diligence mentions AnySearch', () => {
  assert.match(fixturePricingDiligenceMarkdown(), /AnySearch/)
  assert.match(fixturePricingDiligenceMarkdown(), /邮箱/)
  assert.match(fixturePricingProductivityMarkdown(), /工效/)
  assert.match(fixturePricingProductivityMarkdown(), /中国/)
  assert.match(fixturePricingRfqIndexMarkdown(), /English/)
  const rfq = fixturePricingRfqMarkdown()
  assert.match(rfq, /## 中文/)
  assert.match(rfq, /## English/)
  assert.match(rfq, /规格/)
  assert.match(rfq, /Quantity/)
})

test('force-pass plus waiver note clears the intel gate without RFQs', () => {
  const dir = mkdtempSync(join(tmpdir(), 'ap-intel-waive-'))
  assert.equal(evaluatePricingIntelGate(dir, false).ready, false)
  assert.equal(evaluatePricingIntelGate(dir, true).ready, false)
  writePricingWaiverFixture(dir)
  const waived = evaluatePricingIntelGate(dir, true)
  assert.equal(waived.ready, true, waived.shortGaps)
  assert.match(waived.shortGaps, /网络询价/)
  assert.equal(evaluatePricingIntelGate(dir, false).ready, false)
  assert.match(fixturePricingWaiverMarkdown(), /非正式/)
  assert.match(fixturePricingWaiverMarkdown(), /工效/)
})

test('C5.1 exemplar is a location-bound method, not a live rate book', () => {
  const path = join(
    dirname(fileURLToPath(import.meta.url)),
    '../../../knowledge/tender-sa-sanral/C5.1_路床_单价推导.md',
  )
  const text = readFileSync(path, 'utf8')
  assert.match(text, /本标地址绑定/)
  assert.match(text, /anysearch_capabilities/)
  assert.match(text, /anysearch_batch_search/)
  assert.match(text, /当地供应商尽调/)
  assert.match(text, /当地工效尽调/)
  assert.match(text, /国际手册/)
  assert.match(text, /中国定额/)
  assert.match(text, /组价依据说明/)
  assert.match(text, /强制放行/)
  assert.match(text, /企业工效/)
  assert.match(text, /询价单/)
  assert.match(text, /示意/)
  assert.equal(pricingLocalIntelApplies('boq-five-step-pricing'), true)
  assert.equal(pricingLocalIntelApplies('tender-document-analysis'), false)
})
