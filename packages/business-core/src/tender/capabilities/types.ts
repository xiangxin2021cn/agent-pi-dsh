export type TenderCapabilityId =
  | 'document_analysis'
  | 'evaluation_strategy'
  | 'boq_reconciliation'
  | 'project_boundary'
  | 'boq_five_step_pricing'
  | 'construction_resource_schedule'
  | 'bidder_commitments'
  | 'execution_plan'
  | 'schedule_resources'
  | 'cost_cashflow'
  | 'submission_documents'
  | 'submission_audit';

export type TenderCapabilityDependency = TenderCapabilityId | 'core';
export type TenderCapabilityReadiness = 'not_ready' | 'needs_review' | 'ready';

export interface TenderCapabilityRevisionRef {
  capability: TenderCapabilityDependency;
  revision: number;
}

export interface TenderCapabilityEnvelope<T = unknown> {
  schemaVersion: 1;
  capability: TenderCapabilityId;
  projectId: string;
  revision: number;
  coreRevision: number;
  upstream: TenderCapabilityRevisionRef[];
  updatedAt: string;
  data: T;
}

export interface TenderCapabilityAuditIssue {
  code: string;
  severity: 'error' | 'warning';
  entityType: string;
  entityId?: string;
  message: string;
}

export interface TenderCapabilityIndexEntry {
  capability: TenderCapabilityId;
  enabled: boolean;
  required: boolean;
  revision: number;
  readiness: TenderCapabilityReadiness;
  issueCount: number;
  stale: boolean;
  updatedAt: string;
}

export interface TenderCapabilityIndex {
  schemaVersion: 1;
  projectId: string;
  coreRevision: number;
  capabilities: TenderCapabilityIndexEntry[];
}
