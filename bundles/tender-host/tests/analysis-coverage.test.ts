import assert from 'node:assert/strict'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'
import {
  TENDER_ANALYSIS_DOMAINS,
  assessAnalysisCoverage,
  initializeAnalysisCoverage,
  recordAnalysisCoverage,
} from '../src/analysis-coverage.ts'

test('requires every analysis domain to close unread nodes with evidence and a conclusion', () => {
  const cwd = mkdtempSync(join(tmpdir(), 'ap-coverage-'))
  initializeAnalysisCoverage(cwd, 'p1', [{ sourceId: 'Volume-1.pdf', treeHash: 'a'.repeat(64), nodeIds: ['0001', '0002'] }])
  assert.equal(assessAnalysisCoverage(initializeAnalysisCoverage(cwd, 'p1', [{ sourceId: 'Volume-1.pdf', treeHash: 'a'.repeat(64), nodeIds: ['0001', '0002'] }])).ready, false)
  for (const domain of TENDER_ANALYSIS_DOMAINS) {
    recordAnalysisCoverage(cwd, 'p1', {
      domain: domain.id,
      readNodeIds: ['Volume-1.pdf:0001', 'Volume-1.pdf:0002'],
      evidenceClaimIds: [`${domain.id}-claim`],
      conclusion: `${domain.labelZh} 已核对。`,
    })
  }
  const ready = assessAnalysisCoverage(initializeAnalysisCoverage(cwd, 'p1', [{ sourceId: 'Volume-1.pdf', treeHash: 'a'.repeat(64), nodeIds: ['0001', '0002'] }]))
  assert.equal(ready.ready, true)

  const reset = initializeAnalysisCoverage(cwd, 'p1', [{ sourceId: 'Volume-1.pdf', treeHash: 'b'.repeat(64), nodeIds: ['0001', '0002', '0003'] }])
  assert.equal(assessAnalysisCoverage(reset).ready, false)
  assert.equal(reset.domains[0]?.unreadNodeIds.includes('Volume-1.pdf:0003'), true)
})
