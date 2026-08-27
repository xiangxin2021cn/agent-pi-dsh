import assert from 'node:assert/strict'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'
import { assessPricingLocalIntel } from '../src/pricing-local-intel.ts'
import {
  looksLikeProductivityFile,
  registerEnterpriseProductivity,
  scanEnterpriseProductivity,
  seedEnterpriseProductivityMemo,
} from '../src/productivity-source.ts'
import { inferDocumentKind } from '../src/workspace.ts'

test('productivity file names hit and ordinary specs miss', () => {
  assert.equal(looksLikeProductivityFile('企业工效.xlsx'), true)
  assert.equal(looksLikeProductivityFile('site-productivity-rates.xlsx'), true)
  assert.equal(looksLikeProductivityFile('日产量.md'), true)
  assert.equal(looksLikeProductivityFile('Volume-3-specification.pdf'), false)
  assert.equal(looksLikeProductivityFile('BOQ.xlsx'), false)
  assert.equal(inferDocumentKind('C:/tender/企业工效.xlsx'), 'supporting_evidence')
})

test('scan keeps only productivity attachments', () => {
  const files = scanEnterpriseProductivity([
    'C:/tender/BOQ.xlsx',
    'C:/tender/工效.xlsx',
    'C:/tender/工效.xlsx',
    'C:/tender/spec.pdf',
  ])
  assert.equal(files.length, 1)
  assert.equal(files[0]!.name, '工效.xlsx')
})

test('enterprise seed writes a memo that clears the productivity file bar only', () => {
  const cwd = mkdtempSync(join(tmpdir(), 'ap-ent-prod-'))
  const projectId = 'demo-1'
  registerEnterpriseProductivity(cwd, projectId, [join(cwd, '企业工效.xlsx')])
  const seeded = seedEnterpriseProductivityMemo(cwd, projectId)
  assert.ok(seeded)
  const dir = join(cwd, 'Agent Pi Outputs', projectId, 'boq-pricing')
  const status = assessPricingLocalIntel(dir)
  const prod = status.files.find((file) => file.fileName === '当地工效尽调.md')
  assert.ok(prod?.ok, prod ? `${prod.chars} ${prod.missingTerms.join(',')}` : 'missing memo')
  assert.equal(status.ok, false)
  assert.match(status.shortGaps, /询价单/)
})
