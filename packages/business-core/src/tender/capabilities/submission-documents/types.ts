import type { TenderSourceLocator } from '../../types.ts';
import type { TenderCapabilityAuditIssue, TenderCapabilityReadiness } from '../types.ts';

export type TenderSubmissionDocumentKind =
  | 'work_plan_methodology'
  | 'programme'
  | 'resource_plan'
  | 'cashflow_plan'
  | 'cost_plan'
  | 'other';

export interface TenderSubmissionDocumentItem {
  id: string;
  kind: TenderSubmissionDocumentKind;
  title: string;
  filePath: string;
  format: string;
  deliverableId?: string;
  requirementIds: string[];
  sourceRefs: TenderSourceLocator[];
  status: 'draft' | 'ready' | 'blocked';
}

export interface TenderSubmissionDocumentsData {
  items: TenderSubmissionDocumentItem[];
}

export interface TenderSubmissionDocumentsAudit {
  schemaVersion: 1;
  capability: 'submission_documents';
  projectId: string;
  coreRevision: number;
  generatedAt: string;
  readiness: TenderCapabilityReadiness;
  summary: {
    items: number;
    readyItems: number;
    blockedItems: number;
    requiredKindsCovered: number;
  };
  issues: TenderCapabilityAuditIssue[];
}
