import assert from 'node:assert/strict'
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'
import type { TenderCapabilityIndex } from '../../../packages/business-core/src/tender/index.ts'
import {
  capabilityStatus,
  initTenderWorkspace,
  replaceCapability,
  upsertWorkspaceSection,
  workspacePaths,
} from '../src/workspace.ts'
import { registerTools } from '../src/tools.ts'

test('a core workspace revision makes persisted capability packs stale', () => {
  const cwd = mkdtempSync(join(tmpdir(), 'ap-cap-stale-'))
  const projectId = 'road-bid'
  initTenderWorkspace(cwd, projectId, { id: projectId, title: 'Road bid', status: 'active' })
  const paths = workspacePaths(cwd, projectId)
  const index = JSON.parse(readFileSync(paths.index, 'utf8')) as TenderCapabilityIndex
  const entry = index.capabilities.find((item) => item.capability === 'document_analysis')
  assert.ok(entry)
  Object.assign(entry, { revision: 1, readiness: 'ready', issueCount: 0, stale: false })
  writeFileSync(paths.index, `${JSON.stringify(index, null, 2)}\n`)
  writeFileSync(join(paths.packs, 'document-analysis.json'), `${JSON.stringify({
    schemaVersion: 1,
    capability: 'document_analysis',
    projectId,
    revision: 1,
    coreRevision: 1,
    upstream: [{ capability: 'core', revision: 1 }],
    updatedAt: '2026-08-27T00:00:00.000Z',
    data: { sections: [] },
  }, null, 2)}\n`)

  upsertWorkspaceSection(cwd, projectId, { project: { id: projectId, title: 'Road bid revised', status: 'active' } })
  const status = capabilityStatus(cwd, projectId)
  const refreshed = status.index.capabilities.find((item) => item.capability === 'document_analysis')
  assert.equal(refreshed?.stale, true)
})

test('host capability index preserves a deterministic not_ready audit result', () => {
  const cwd = mkdtempSync(join(tmpdir(), 'ap-cap-readiness-'))
  const projectId = 'road-bid'
  initTenderWorkspace(cwd, projectId, { id: projectId, title: 'Road bid', status: 'active' })

  const result = replaceCapability(cwd, projectId, 'document_analysis', { sections: [] })
  const entry = result.index.capabilities.find((item) => item.capability === 'document_analysis')
  assert.equal(result.audit.readiness, 'not_ready')
  assert.equal(entry?.readiness, 'not_ready')
})

test('capability tool returns compact summaries while preserving full pack and audit files', async () => {
  const cwd = mkdtempSync(join(tmpdir(), 'ap-cap-tool-'))
  const projectId = 'road-bid'
  initTenderWorkspace(cwd, projectId, { id: projectId, title: 'Road bid', status: 'active' })
  const definitions: Array<{ name?: string; execute?: (...args: any[]) => unknown }> = []
  registerTools(
    { tools: { register: (definition) => { definitions.push(definition as never); return definition } } },
    ((definition: unknown) => definition) as never,
  )
  const capabilityTool = definitions.find((definition) => definition.name === 'tender_capability')
  assert.ok(capabilityTool?.execute)
  const exec = { agent: { session: { header: { cwd } } } }

  const call = async (args: Record<string, unknown>) => {
    const text = await capabilityTool.execute?.(args, exec)
    assert.equal(typeof text, 'string')
    return { text, value: JSON.parse(text) as Record<string, any> }
  }

  const initialized = await call({ action: 'init', projectId, capability: 'document_analysis', data: { sections: [] } })
  assert.deepEqual(initialized.value.dataCounts, { sections: 0 })
  assert.equal(initialized.value.revision, 1)
  assert.equal(initialized.value.readiness, 'not_ready')
  assert.equal(initialized.value.stale, false)
  assert.equal(initialized.value.issueCounts.byCode.document_analysis_empty, 1)
  assert.equal(initialized.value.written, true)

  const sentinel = `CAPABILITY-PAYLOAD-MUST-NOT-ECHO-${'x'.repeat(200)}`
  const sections = Array.from({ length: 40 }, (_, index) => ({
    id: `section-${index}`,
    documentId: 'missing-source',
    title: `Section ${index}`,
    kind: 'other',
    summary: `${sentinel}-${index}`,
    sourceRefs: [],
    status: 'draft',
  }))
  const replaced = await call({ action: 'replace', projectId, capability: 'document_analysis', data: { sections } })
  assert.equal(replaced.value.revision, 2)
  assert.deepEqual(replaced.value.dataCounts, { sections: 40 })
  assert.deepEqual(replaced.value.issueCounts.bySeverity, { error: 80, warning: 40 })
  assert.deepEqual(replaced.value.issueCounts.byCode, {
    document_analysis_section_incomplete: 40,
    document_analysis_section_not_reviewed: 40,
    document_analysis_source_missing: 40,
  })
  assert.equal(replaced.value.issueCounts.total, 120)
  assert.equal('envelope' in replaced.value, false)
  assert.equal('audit' in replaced.value, false)
  assert.equal('index' in replaced.value, false)
  assert.equal(replaced.text.includes(sentinel), false)
  assert.ok(replaced.text.length < 2_000)

  const persistedPack = JSON.parse(readFileSync(replaced.value.packPath, 'utf8')) as { data: { sections: Array<{ summary: string }> } }
  const persistedAudit = JSON.parse(readFileSync(replaced.value.auditPath, 'utf8')) as { issues: unknown[] }
  assert.equal(persistedPack.data.sections[0]?.summary.includes(sentinel), true)
  assert.equal(persistedAudit.issues.length, 120)

  const validated = await call({ action: 'validate', projectId, capability: 'document_analysis', data: { sections } })
  assert.equal(validated.value.ok, true)
  assert.equal(validated.value.written, false)
  assert.equal(validated.value.revision, 2)
  assert.equal('parsed' in validated.value, false)
  assert.equal('audit' in validated.value, false)
  assert.equal(validated.text.includes(sentinel), false)
  assert.ok(validated.text.length < 2_000)

  const status = await call({ action: 'status', projectId, capability: 'document_analysis' })
  assert.equal(status.value.configured, false)
  assert.equal(status.value.revision, 2)
  assert.equal(status.value.issueCounts.total, 120)
  assert.equal('envelope' in status.value, false)
  assert.equal('index' in status.value, false)
  assert.equal(status.text.includes(sentinel), false)

  const configured = await call({ action: 'configure', projectId, capability: 'document_analysis' })
  assert.equal(configured.value.configured, true)
  assert.equal(configured.value.revision, 2)
  assert.equal(configured.value.packPath, replaced.value.packPath)
  assert.equal(configured.value.auditPath, replaced.value.auditPath)

  await assert.rejects(
    async () => capabilityTool.execute?.({ action: 'typo', projectId, capability: 'document_analysis' }, exec),
    /Unknown tender_capability action typo/,
  )
})
