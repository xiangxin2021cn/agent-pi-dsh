import assert from 'node:assert/strict'
import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'
import {
  recordStructuredEvidence,
  renderStructuredEvidenceCitation,
  sha256File,
  verifyStructuredEvidence,
} from '../src/structured-evidence.ts'

test('freezes structured evidence and renders a natural document citation plus audit token', () => {
  const cwd = mkdtempSync(join(tmpdir(), 'ap-evidence-'))
  const source = join(cwd, 'Volume 3.md')
  writeFileSync(source, '# Insurance\n<!-- page 11 -->\nPI insurance is mandatory.\n')
  const claim = {
    claimId: 'insurance-required-001',
    claim: 'Professional indemnity insurance is mandatory.',
    surface: 'document' as const,
    sourceId: source,
    section: 'Insurance',
    page: 11,
    quote: 'PI insurance is mandatory.',
    internalLocator: 'tree:0007#L3',
    sourceHash: sha256File(source),
  }
  const ledger = recordStructuredEvidence(cwd, 'project-a', [claim])
  assert.equal(ledger.claims.length, 1)
  assert.equal(verifyStructuredEvidence(cwd, claim), null)
  assert.match(renderStructuredEvidenceCitation(claim), /《Volume 3.md》.*第 11 页.*\[ev:insurance-required-001\]/)
  assert.throws(() => recordStructuredEvidence(cwd, 'project-a', [{ ...claim, quote: 'changed' }]), /已冻结/)
})

test('requires sheet cells for table evidence and detects changed sources', () => {
  const cwd = mkdtempSync(join(tmpdir(), 'ap-evidence-table-'))
  const source = join(cwd, 'BOQ.csv')
  writeFileSync(source, 'Item,Qty\nA,4\n')
  const claim = {
    claimId: 'boq-a-qty',
    claim: 'Item A quantity is 4.',
    surface: 'table' as const,
    sourceId: source,
    quote: 'A,4',
    internalLocator: 'BOQ!B2',
    sourceHash: sha256File(source),
  }
  recordStructuredEvidence(cwd, 'project-b', [claim])
  writeFileSync(source, 'Item,Qty\nA,5\n')
  assert.match(verifyStructuredEvidence(cwd, claim) || '', /SHA-256/)
  assert.throws(() => recordStructuredEvidence(cwd, 'project-c', [{ ...claim, claimId: 'bad-table', internalLocator: 'row 2' }]), /sheet!A1/)
})
