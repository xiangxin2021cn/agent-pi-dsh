import type { TenderWorkspace } from '../../types.ts';
import type { TenderCapabilityAuditIssue } from '../types.ts';
import { parseTenderSubmissionDocumentsData } from './schema.ts';
import type { TenderSubmissionDocumentsAudit, TenderSubmissionDocumentsData, TenderSubmissionDocumentKind } from './types.ts';

const REQUIRED_KINDS: TenderSubmissionDocumentKind[] = [
  'work_plan_methodology',
  'programme',
  'resource_plan',
  'cashflow_plan',
];

export function auditTenderSubmissionDocuments(
  workspace: TenderWorkspace,
  value: TenderSubmissionDocumentsData | unknown,
  generatedAt = new Date().toISOString(),
): TenderSubmissionDocumentsAudit {
  const data = parseTenderSubmissionDocumentsData(value);
  const issues: TenderCapabilityAuditIssue[] = [];
  const documentById = new Map(workspace.documents.map((document) => [document.id, document]));
  const requirementIds = new Set(workspace.requirements.map((requirement) => requirement.id));
  const deliverableIds = new Set(workspace.deliverables.map((deliverable) => deliverable.id));

  for (const item of data.items) {
    if (item.status === 'blocked') {
      issues.push({
        code: 'submission_document_blocked',
        severity: 'error',
        entityType: 'submission_document',
        entityId: item.id,
        message: `Submission document ${item.id} is blocked.`,
      });
    } else if (item.status !== 'ready') {
      issues.push({
        code: 'submission_document_not_ready',
        severity: 'warning',
        entityType: 'submission_document',
        entityId: item.id,
        message: `Submission document ${item.id} is not ready.`,
      });
    }
    if (item.deliverableId && !deliverableIds.has(item.deliverableId)) {
      issues.push({
        code: 'submission_document_deliverable_missing',
        severity: 'error',
        entityType: 'submission_document',
        entityId: item.id,
        message: `Submission document ${item.id} references missing deliverable ${item.deliverableId}.`,
      });
    }
    for (const requirementId of item.requirementIds) {
      if (!requirementIds.has(requirementId)) {
        issues.push({
          code: 'submission_document_requirement_missing',
          severity: 'error',
          entityType: 'submission_document',
          entityId: item.id,
          message: `Submission document ${item.id} references missing requirement ${requirementId}.`,
        });
      }
    }
    if (item.sourceRefs.length === 0) {
      issues.push({
        code: 'submission_document_source_missing',
        severity: 'warning',
        entityType: 'submission_document',
        entityId: item.id,
        message: `Submission document ${item.id} has no source references.`,
      });
    }
    for (const source of item.sourceRefs) {
      const document = documentById.get(source.documentId);
      if (!document) {
        issues.push({
          code: 'submission_document_source_unknown',
          severity: 'error',
          entityType: 'submission_document',
          entityId: item.id,
          message: `Submission document ${item.id} cites missing source ${source.documentId}.`,
        });
      }
    }
  }

  const coveredKinds = new Set(data.items.filter((item) => item.status === 'ready').map((item) => item.kind));
  for (const kind of REQUIRED_KINDS) {
    if (!coveredKinds.has(kind)) {
      issues.push({
        code: 'submission_document_required_kind_missing',
        severity: 'error',
        entityType: 'submission_document',
        entityId: kind,
        message: `Required tender submission document kind ${kind} is missing.`,
      });
    }
  }

  const readiness = issues.some((issue) => issue.severity === 'error')
    ? 'not_ready'
    : issues.length > 0
      ? 'needs_review'
      : 'ready';

  return {
    schemaVersion: 1,
    capability: 'submission_documents',
    projectId: workspace.project.id,
    coreRevision: workspace.revision,
    generatedAt,
    readiness,
    summary: {
      items: data.items.length,
      readyItems: data.items.filter((item) => item.status === 'ready').length,
      blockedItems: data.items.filter((item) => item.status === 'blocked').length,
      requiredKindsCovered: REQUIRED_KINDS.filter((kind) => coveredKinds.has(kind)).length,
    },
    issues,
  };
}
