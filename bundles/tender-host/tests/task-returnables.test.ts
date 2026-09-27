import assert from 'node:assert/strict'
import { test } from 'node:test'
import { auditTenderSubmissionDocuments } from '../../../packages/business-core/src/tender/capabilities/submission-documents/audit.ts'
import type { TenderWorkspace } from '../../../packages/business-core/src/tender/types.ts'

const workspace: TenderWorkspace = { schemaVersion: 1, revision: 1, project: { id: 'p1', title: 'Namibia tender', status: 'active' },
  documents: [{ id: 'tender', name: 'Tender.pdf', path: 'Tender.pdf', kind: 'returnable_schedule', status: 'active' }], requirements: [], criteria: [], responses: [],
  deliverables: [{ id: 'declaration', title: 'Declaration', requirementIds: [], status: 'planned' }, { id: 'qualification', title: 'Qualification form', requirementIds: [], status: 'planned' }] }
const item = (id: string) => ({ id, kind: 'other', title: id, filePath: id+'.docx', format: 'docx', deliverableId: id, requirementIds: [], sourceRefs: [{ documentId: 'tender', page: 15 }], status: 'ready' })

test('actual declaration and qualification forms replace the historical four-report assumption', () => {
  const audit = auditTenderSubmissionDocuments(workspace, { requiredDeliverableIds: ['declaration', 'qualification'], items: [item('declaration'), item('qualification')] })
  assert.equal(audit.readiness, 'ready'); assert.equal(audit.summary.requiredKindsCovered, 2)
})
test('registered returnables cannot be omitted by declaring a shorter or empty list', () => {
  const audit = auditTenderSubmissionDocuments(workspace, { requiredDeliverableIds: ['declaration'], items: [item('declaration')] })
  assert.ok(audit.issues.some(row => row.code === 'submission_required_deliverable_missing' && row.entityId === 'qualification'))
  assert.throws(() => auditTenderSubmissionDocuments(workspace, { requiredDeliverableIds: [], items: [] }), /empty list/)
})
test('historical packs retain their four-kind audit', () => {
  const audit = auditTenderSubmissionDocuments(workspace, { items: [item('declaration')] })
  assert.equal(audit.issues.filter(row => row.code === 'submission_document_required_kind_missing').length, 4)
})
