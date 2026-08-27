import assert from 'node:assert/strict'
import { test } from 'node:test'
import type { BusinessProjectRecord } from '../../../packages/business-projects/index.ts'
import {
  SA_LABOUR_ANYSEARCH,
  SA_LABOUR_WAGE_CHECK,
  SA_LABOUR_WAGE_DRAFT_ZH,
  looksLikeSouthAfricaPricing,
} from '../src/sa-labour.ts'

function project(partial: Partial<BusinessProjectRecord> = {}): BusinessProjectRecord {
  return {
    schemaVersion: 1,
    projectId: 'p1',
    module: 'tender',
    name: 'Generic rehab',
    rootPath: process.cwd(),
    workflowId: 'tender-main',
    inputPaths: [],
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...partial,
  }
}

test('ZAR or SANRAL names trigger the South Africa wage path', () => {
  assert.equal(looksLikeSouthAfricaPricing(project(), []), false)
  assert.equal(looksLikeSouthAfricaPricing(project(), [], { currency: 'ZAR' }), true)
  assert.equal(looksLikeSouthAfricaPricing(project({ name: 'N3 SANRAL KZN' })), true)
  assert.equal(looksLikeSouthAfricaPricing(project(), [], { jurisdiction: 'South Africa' }), true)
  assert.equal(
    looksLikeSouthAfricaPricing(project(), [{
      area: 'pricing',
      key: 'methodStandard',
      role: 'method_and_depth_standard',
      title: 'C5.1 路床单价推导',
      path: 'knowledge/tender-sa-sanral/C5.1_路床_单价推导.md',
      exists: true,
    }]),
    true,
  )
})

test('AnySearch wage check stays in the international zone and does not pin rand figures', () => {
  assert.equal(SA_LABOUR_ANYSEARCH.zone, 'intl')
  assert.equal(SA_LABOUR_ANYSEARCH.language, 'en')
  assert.ok(SA_LABOUR_ANYSEARCH.tools.includes('anysearch_batch_search'))
  assert.ok(SA_LABOUR_ANYSEARCH.batchQueries.some((query) => /BCCEI/.test(query)))
  assert.match(SA_LABOUR_WAGE_DRAFT_ZH, /zone=intl/)
  assert.match(SA_LABOUR_WAGE_DRAFT_ZH, /BCCEI/)
  assert.match(SA_LABOUR_WAGE_DRAFT_ZH, /anysearch_batch_search/)
  assert.doesNotMatch(SA_LABOUR_WAGE_CHECK.note, /R[1-9]\d{2,3}\/天/)
})
