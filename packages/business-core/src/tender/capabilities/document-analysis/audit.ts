import type { TenderWorkspace } from '../../types.ts';
import type { TenderCapabilityAuditIssue } from '../types.ts';
import { parseTenderDocumentAnalysisData } from './schema.ts';
import type { TenderDocumentAnalysisAudit, TenderDocumentAnalysisData } from './types.ts';

export function auditTenderDocumentAnalysis(
  workspace: TenderWorkspace,
  value: TenderDocumentAnalysisData | unknown,
  generatedAt = new Date().toISOString(),
): TenderDocumentAnalysisAudit {
  const data = parseTenderDocumentAnalysisData(value);
  const issues: TenderCapabilityAuditIssue[] = [];
  const documentById = new Map(workspace.documents.map((document) => [document.id, document]));
  const coveredDocuments = new Set<string>();

  if (data.sections.length === 0) {
    issues.push({
      code: 'document_analysis_empty',
      severity: 'error',
      entityType: 'document_analysis',
      message: 'Document analysis requires at least one analysed document section.',
    });
  }

  for (const section of data.sections) {
    const document = documentById.get(section.documentId);
    if (!document) {
      issues.push({
        code: 'document_analysis_source_missing',
        severity: 'error',
        entityType: 'document_analysis_section',
        entityId: section.id,
        message: `Document analysis section ${section.id} references missing document ${section.documentId}.`,
      });
    } else {
      coveredDocuments.add(section.documentId);
    }
    if (!section.summary.trim() || section.sourceRefs.length === 0) {
      issues.push({
        code: 'document_analysis_section_incomplete',
        severity: 'error',
        entityType: 'document_analysis_section',
        entityId: section.id,
        message: `Document analysis section ${section.id} requires a substantive summary and source references.`,
      });
    }
    if (section.status === 'blocked') {
      issues.push({
        code: 'document_analysis_section_blocked',
        severity: 'error',
        entityType: 'document_analysis_section',
        entityId: section.id,
        message: `Document analysis section ${section.id} is blocked.`,
      });
    } else if (section.status !== 'reviewed') {
      issues.push({
        code: 'document_analysis_section_not_reviewed',
        severity: 'warning',
        entityType: 'document_analysis_section',
        entityId: section.id,
        message: `Document analysis section ${section.id} has not been reviewed.`,
      });
    }
  }

  const activeTenderDocuments = workspace.documents.filter((document) => document.status === 'active');
  for (const document of activeTenderDocuments) {
    if (!coveredDocuments.has(document.id)) {
      issues.push({
        code: 'document_analysis_document_uncovered',
        severity: 'warning',
        entityType: 'document',
        entityId: document.id,
        message: `Registered tender document ${document.id} has no analysis section.`,
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
    capability: 'document_analysis',
    projectId: workspace.project.id,
    coreRevision: workspace.revision,
    generatedAt,
    readiness,
    summary: {
      sections: data.sections.length,
      reviewedSections: data.sections.filter((section) => section.status === 'reviewed').length,
      blockedSections: data.sections.filter((section) => section.status === 'blocked').length,
      uncoveredDocuments: activeTenderDocuments.filter((document) => !coveredDocuments.has(document.id)).length,
    },
    issues,
  };
}
