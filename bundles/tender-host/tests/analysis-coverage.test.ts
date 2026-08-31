import assert from 'node:assert/strict'
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { test } from 'node:test'
import {
  TENDER_ANALYSIS_DOMAINS,
  analysisCoveragePath,
  assessAnalysisCoverage,
  initializeAnalysisCoverage,
  loadAnalysisCoverage,
  recordAnalysisCoverage,
} from '../src/analysis-coverage.ts'

test('reads each PageIndex node once, then maps conclusions and evidence to domains', () => {
  const cwd = mkdtempSync(join(tmpdir(), 'ap-coverage-'))
  const initialized = initializeAnalysisCoverage(cwd, 'p1', [{ sourceId: 'Volume-1.pdf', treeHash: 'a'.repeat(64), nodeIds: ['0001', '0002'] }])
  assert.deepEqual(initialized.unreadNodeIds, ['Volume-1.pdf:0001', 'Volume-1.pdf:0002'])
  assert.ok(initialized.domains.every((domain) => domain.unreadNodeIds.length === 0))
  assert.equal(assessAnalysisCoverage(initialized).ready, false)
  for (const [index, domain] of TENDER_ANALYSIS_DOMAINS.entries()) {
    recordAnalysisCoverage(cwd, 'p1', {
      domain: domain.id,
      // Only the first domain performs the physical read. Later calls merely
      // map the already-read node to another domain where it is relevant.
      readNodeIds: index === 0
        ? ['Volume-1.pdf:0001', 'Volume-1.pdf:0002', 'Volume-1.pdf:unknown']
        : ['Volume-1.pdf:0001'],
      evidenceClaimIds: [`${domain.id}-claim`],
      conclusion: `${domain.labelZh} 已核对。`,
    })
  }
  const unchanged = initializeAnalysisCoverage(cwd, 'p1', [{ sourceId: 'Volume-1.pdf', treeHash: 'a'.repeat(64), nodeIds: ['0001', '0002'] }])
  assert.deepEqual(unchanged.readNodeIds, ['Volume-1.pdf:0001', 'Volume-1.pdf:0002'])
  assert.deepEqual(unchanged.unreadNodeIds, [])
  assert.equal(unchanged.domains[0]?.readNodeIds.includes('Volume-1.pdf:unknown'), false)
  assert.equal(unchanged.domains[1]?.readNodeIds.includes('Volume-1.pdf:0002'), false)
  const ready = assessAnalysisCoverage(unchanged)
  assert.equal(ready.ready, true)

  const reset = initializeAnalysisCoverage(cwd, 'p1', [{ sourceId: 'Volume-1.pdf', treeHash: 'b'.repeat(64), nodeIds: ['0001', '0002', '0003'] }])
  assert.equal(assessAnalysisCoverage(reset).ready, false)
  assert.equal(reset.unreadNodeIds.includes('Volume-1.pdf:0003'), true)
  assert.ok(reset.domains.every((domain) => domain.unreadNodeIds.length === 0))
})

test('migrates the legacy domain x node ledger without requiring a reread', () => {
  const cwd = mkdtempSync(join(tmpdir(), 'ap-coverage-legacy-'))
  const initialized = initializeAnalysisCoverage(cwd, 'p1', [{ sourceId: 'Volume-1.pdf', treeHash: 'a'.repeat(64), nodeIds: ['0001', '0002'] }])
  const legacy: any = {
    ...initialized,
    domains: initialized.domains.map((domain, index) => ({
      ...domain,
      readNodeIds: index === 0 ? ['Volume-1.pdf:0001'] : [],
      unreadNodeIds: index === 0 ? ['Volume-1.pdf:0002'] : ['Volume-1.pdf:0001', 'Volume-1.pdf:0002'],
    })),
  }
  delete legacy.readNodeIds
  delete legacy.unreadNodeIds
  const path = analysisCoveragePath(cwd, 'p1')
  mkdirSync(dirname(path), { recursive: true })
  writeFileSync(path, JSON.stringify(legacy, null, 2))

  const migrated = loadAnalysisCoverage(cwd, 'p1')
  assert.deepEqual(migrated?.readNodeIds, ['Volume-1.pdf:0001'])
  assert.deepEqual(migrated?.unreadNodeIds, ['Volume-1.pdf:0002'])
  assert.ok(migrated?.domains.every((domain) => domain.unreadNodeIds.length === 0))
})
