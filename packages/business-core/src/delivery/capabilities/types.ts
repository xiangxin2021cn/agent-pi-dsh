export type DeliveryCapabilityId =
  | 'contract_scope'
  | 'programme_progress'
  | 'resource_procurement'
  | 'cost_commercial'
  | 'cashflow'
  | 'risk_change'
  | 'reporting_audit';

export type DeliveryCapabilityDependency = DeliveryCapabilityId | 'core';
export type DeliveryCapabilityReadiness = 'not_ready' | 'needs_review' | 'ready';

export interface DeliveryCapabilityRevisionRef {
  capability: DeliveryCapabilityDependency;
  revision: number;
}

export interface DeliveryCapabilityEnvelope<T = unknown> {
  schemaVersion: 1;
  capability: DeliveryCapabilityId;
  projectId: string;
  revision: number;
  coreRevision: number;
  upstream: DeliveryCapabilityRevisionRef[];
  updatedAt: string;
  data: T;
}

export interface DeliveryCapabilityAuditIssue {
  code: string;
  severity: 'error' | 'warning';
  entityType: string;
  entityId?: string;
  message: string;
}

export interface DeliveryCapabilityIndexEntry {
  capability: DeliveryCapabilityId;
  enabled: boolean;
  required: boolean;
  revision: number;
  readiness: DeliveryCapabilityReadiness;
  issueCount: number;
  stale: boolean;
  updatedAt: string;
}

export interface DeliveryCapabilityIndex {
  schemaVersion: 1;
  projectId: string;
  coreRevision: number;
  capabilities: DeliveryCapabilityIndexEntry[];
}
