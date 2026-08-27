import type { DeliveryEvidenceRef } from '../../types.ts';
import type { DeliveryCapabilityAuditIssue, DeliveryCapabilityId, DeliveryCapabilityReadiness } from '../types.ts';

export type DeliveryOperationalCapabilityId = Exclude<DeliveryCapabilityId, 'reporting_audit'>;

export interface DeliveryCapabilityAttestation {
  capability: DeliveryOperationalCapabilityId;
  status: 'reviewed' | 'exception' | 'not_applicable';
  note: string;
}

export interface DeliveryVarianceExplanation {
  id: string;
  capability: DeliveryOperationalCapabilityId;
  metric: string;
  baseline: string;
  actual: string;
  variance: string;
  explanation: string;
  owner: string;
  evidenceRefs: DeliveryEvidenceRef[];
  status: 'draft' | 'reviewed' | 'blocked';
}

export interface DeliveryManagementReport {
  id: string;
  title: string;
  format: 'md' | 'docx' | 'pdf' | 'xlsx' | 'json';
  artifactPath: string;
  contentSha256: string;
  capabilityIds: DeliveryOperationalCapabilityId[];
  evidenceRefs: DeliveryEvidenceRef[];
  status: 'draft' | 'reviewed' | 'approved' | 'blocked';
}

export interface DeliveryCloseApproval {
  status: 'pending' | 'approved' | 'rejected';
  approvedBy?: string;
  approvedAt?: string;
  evidenceRefs: DeliveryEvidenceRef[];
}

export interface DeliveryAuditHistoryEntry {
  id: string;
  action: string;
  actor: string;
  at: string;
  previousHash?: string;
  contentHash: string;
}

export interface DeliveryReportingAuditData {
  controlStatus: 'draft' | 'reviewed' | 'blocked';
  period: string;
  dataDate: string;
  capabilityAttestations: DeliveryCapabilityAttestation[];
  varianceExplanations: DeliveryVarianceExplanation[];
  managementReports: DeliveryManagementReport[];
  closeApproval: DeliveryCloseApproval;
  auditHistory: DeliveryAuditHistoryEntry[];
}

export interface DeliveryReportingAuditAudit {
  schemaVersion: 1;
  capability: 'reporting_audit';
  projectId: string;
  coreRevision: number;
  generatedAt: string;
  readiness: DeliveryCapabilityReadiness;
  summary: {
    period: string;
    enabledCapabilities: number;
    attestedCapabilities: number;
    reviewedVariances: number;
    managementReports: number;
    approvedReports: number;
    closeApproved: boolean;
    auditHistoryEntries: number;
  };
  issues: DeliveryCapabilityAuditIssue[];
}
