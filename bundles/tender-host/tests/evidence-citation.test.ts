import assert from 'node:assert/strict'
import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'
import type { BusinessProjectRecord } from '../../../packages/business-projects/index.ts'
import { extractCitationTokens, verifyCitationToken } from '../src/citations.ts'
import { recordStructuredEvidence, sha256File } from '../src/structured-evidence.ts'

test('[ev:claimId] resolves only inside the current project ledger and verifies source hash', () => {
  const cwd = mkdtempSync(join(tmpdir(), 'ap-ev-citation-'))
  const source = join(cwd, 'spec.md')
  writeFileSync(source, '# Clause\nExact requirement.\n')
  const project: BusinessProjectRecord = {
    schemaVersion: 1,
    module: 'tender',
    projectId: 'p1',
    name: 'P1',
    rootPath: cwd,
    workflowId: 'tender-main',
    inputPaths: [source],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  }
  recordStructuredEvidence(cwd, 'p1', [{
    claimId: 'exact-clause-001',
    claim: 'Exact requirement.',
    surface: 'document',
    sourceId: source,
    section: 'Clause',
    page: 1,
    quote: 'Exact requirement.',
    internalLocator: 'tree:0001#L2',
    sourceHash: sha256File(source),
  }])
  const token = extractCitationTokens('结论（《spec.md》）[ev:exact-clause-001]')[0]!
  assert.equal(token.kind, 'ev')
  assert.equal(verifyCitationToken(cwd, project, token), null)
  assert.match(verifyCitationToken(cwd, { ...project, projectId: 'p2' }, token) || '', /找不到结构化证据/)
})
