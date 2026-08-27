import type { InvestmentEvidenceRef } from '../types.ts';

export type InvestmentCapabilityId =
  | 'mandate_screening'
  | 'resource_technical'
  | 'market_offtake'
  | 'legal_esg'
  | 'financial_valuation'
  | 'transaction_decision';

export type InvestmentCapabilityDependency = InvestmentCapabilityId | 'core';
export type InvestmentCapabilityReadiness = 'not_ready' | 'needs_review' | 'ready';

export interface InvestmentFinding {
  id: string;
  category: string;
  title: string;
  conclusion: string;
  evidenceRefs: InvestmentEvidenceRef[];
  status: 'verified' | 'draft' | 'blocked';
  confidence: 'confirmed' | 'scenario' | 'unverified';
}

export interface InvestmentCapabilityData {
  reviewStatus: 'draft' | 'reviewed' | 'blocked';
  findings: InvestmentFinding[];
  assumptions: Array<{
    id: string;
    name: string;
    value: string;
    unit?: string;
    evidenceRefs: InvestmentEvidenceRef[];
    status: 'approved' | 'draft' | 'blocked';
  }>;
  metrics: Array<{
    id: string;
    name: string;
    value: string;
    unit: string;
    evidenceRefs: InvestmentEvidenceRef[];
    status: 'verified' | 'scenario' | 'unverified';
  }>;
  risks: Array<{
    id: string;
    title: string;
    severity: 'low' | 'medium' | 'high' | 'critical';
    owner: string;
    mitigation: string;
    status: 'open' | 'mitigated' | 'blocked';
  }>;
  scenarios: Array<{
    id: string;
    name: string;
    status: 'draft' | 'reviewed';
    assumptionIds: string[];
    metricIds: string[];
  }>;
  approvals: Array<{
    id: string;
    title: string;
    authority: string;
    decision: 'pending' | 'approved' | 'rejected';
    decidedAt?: string;
    evidenceRefs: InvestmentEvidenceRef[];
  }>;
}

export interface InvestmentCapabilityAuditIssue {
  code: string;
  severity: 'error' | 'warning';
  entityType: string;
  entityId?: string;
  message: string;
}

export interface InvestmentCapabilityAudit {
  schemaVersion: 1;
  capability: InvestmentCapabilityId;
  projectId: string;
  coreRevision: number;
  generatedAt: string;
  readiness: InvestmentCapabilityReadiness;
  summary: {
    findings: number;
    verifiedFindings: number;
    assumptions: number;
    verifiedMetrics: number;
    openRisks: number;
    approvedDecisions: number;
  };
  issues: InvestmentCapabilityAuditIssue[];
}

export interface InvestmentCapabilityEnvelope<T = InvestmentCapabilityData> {
  schemaVersion: 1;
  capability: InvestmentCapabilityId;
  projectId: string;
  revision: number;
  coreRevision: number;
  upstream: Array<{ capability: InvestmentCapabilityDependency; revision: number }>;
  updatedAt: string;
  data: T;
}

export interface InvestmentCapabilityIndexEntry {
  capability: InvestmentCapabilityId;
  enabled: boolean;
  required: boolean;
  revision: number;
  readiness: InvestmentCapabilityReadiness;
  issueCount: number;
  stale: boolean;
  updatedAt: string;
}

export interface InvestmentCapabilityIndex {
  schemaVersion: 1;
  projectId: string;
  coreRevision: number;
  capabilities: InvestmentCapabilityIndexEntry[];
}
