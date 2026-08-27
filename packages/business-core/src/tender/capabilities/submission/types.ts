import type { TenderSourceLocator } from '../../types.ts';
import type { TenderCapabilityAuditIssue, TenderCapabilityReadiness } from '../types.ts';

export interface TenderSubmissionChecks {
  filePresent: boolean;
  formatMatch: boolean;
  templateMatch: boolean;
  renderPassed: boolean;
  hashVerified: boolean;
}

export interface TenderSubmissionItem {
  deliverableId: string;
  filePath: string;
  format: string;
  templatePath?: string;
  signatureStatus: 'not_required' | 'missing' | 'present' | 'verified';
  dependencies: string[];
  validationStatus: 'pending' | 'passed' | 'failed';
  evidenceRefs: TenderSourceLocator[];
  sha256: string;
  checks: TenderSubmissionChecks;
}

export interface TenderSubmissionContradiction {
  id: string;
  deliverableIds: string[];
  requirementIds: string[];
  summary: string;
  status: 'open' | 'resolved';
}

export interface TenderRedTeamFinding {
  id: string;
  title: string;
  severity: 'critical' | 'major' | 'minor';
  status: 'open' | 'resolved' | 'accepted';
  deliverableIds: string[];
  evidenceRefs: TenderSourceLocator[];
  insertedIntoFormalNarrative: boolean;
}

export interface TenderSubmissionAuditData {
  submissionStatus: 'draft' | 'reviewed' | 'blocked';
  items: TenderSubmissionItem[];
  contradictions: TenderSubmissionContradiction[];
  redTeamFindings: TenderRedTeamFinding[];
}

export interface TenderSubmissionAudit {
  schemaVersion: 1;
  capability: 'submission_audit';
  projectId: string;
  coreRevision: number;
  generatedAt: string;
  readiness: TenderCapabilityReadiness;
  summary: {
    requiredDeliverables: number;
    submissionItems: number;
    passedSubmissionItems: number;
    openContradictions: number;
    openRedTeamFindings: number;
    requiredCapabilityPacks: number;
    readyRequiredCapabilityPacks: number;
  };
  issues: TenderCapabilityAuditIssue[];
}
