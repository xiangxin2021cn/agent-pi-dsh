import type { DeliveryEvidenceRef } from '../../types.ts';
import type { DeliveryCapabilityAuditIssue, DeliveryCapabilityReadiness } from '../types.ts';

export interface DeliveryContractObligation {
  id: string;
  title: string;
  type: 'notice' | 'payment' | 'time' | 'quality' | 'hse' | 'environment' | 'insurance' | 'bond' | 'other';
  owner: string;
  evidenceRefs: DeliveryEvidenceRef[];
  status: 'open' | 'planned' | 'compliant' | 'noncompliant' | 'blocked';
}

export interface DeliveryScopeItem {
  id: string;
  wbsCode: string;
  title: string;
  inclusionStatus: 'included' | 'excluded' | 'clarification';
  owner: string;
  acceptanceCriteria: string[];
  evidenceRefs: DeliveryEvidenceRef[];
  status: 'draft' | 'reviewed' | 'blocked';
}

export interface DeliveryResponsibilityAssignment {
  id: string;
  scopeItemIds: string[];
  responsible: string[];
  accountable: string;
  consulted: string[];
  informed: string[];
  interfaces: string[];
  status: 'draft' | 'reviewed' | 'blocked';
}

export interface DeliveryContractScopeData {
  baselineStatus: 'draft' | 'reviewed' | 'blocked';
  obligations: DeliveryContractObligation[];
  scopeItems: DeliveryScopeItem[];
  responsibilityAssignments: DeliveryResponsibilityAssignment[];
}

export interface DeliveryContractScopeAudit {
  schemaVersion: 1;
  capability: 'contract_scope';
  projectId: string;
  coreRevision: number;
  generatedAt: string;
  readiness: DeliveryCapabilityReadiness;
  summary: {
    obligations: number;
    compliantObligations: number;
    scopeItems: number;
    reviewedScopeItems: number;
    directlySupportedScopeItems: number;
    responsibilityAssignments: number;
  };
  issues: DeliveryCapabilityAuditIssue[];
}
