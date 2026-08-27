import type { TenderSourceLocator } from '../../types.ts';
import type { TenderCapabilityAuditIssue, TenderCapabilityReadiness } from '../types.ts';

export interface TenderDocumentAnalysisSection {
  id: string;
  documentId: string;
  title: string;
  kind:
    | 'project_information'
    | 'tender_requirements'
    | 'special_conditions'
    | 'addenda_clarifications'
    | 'boq_characteristics'
    | 'risk_gap'
    | 'other';
  summary: string;
  sourceRefs: TenderSourceLocator[];
  status: 'draft' | 'reviewed' | 'blocked';
}

export interface TenderDocumentAnalysisData {
  sections: TenderDocumentAnalysisSection[];
}

export interface TenderDocumentAnalysisAudit {
  schemaVersion: 1;
  capability: 'document_analysis';
  projectId: string;
  coreRevision: number;
  generatedAt: string;
  readiness: TenderCapabilityReadiness;
  summary: {
    sections: number;
    reviewedSections: number;
    blockedSections: number;
    uncoveredDocuments: number;
  };
  issues: TenderCapabilityAuditIssue[];
}
