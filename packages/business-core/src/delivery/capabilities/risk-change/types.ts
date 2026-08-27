import type { DeliveryEvidenceRef } from '../../types.ts';
import type { DeliveryCapabilityAuditIssue, DeliveryCapabilityReadiness } from '../types.ts';

export interface DeliveryRiskRecord {
  id: string;
  type: 'risk' | 'opportunity';
  title: string;
  scopeItemIds: string[];
  cause: string;
  effect: string;
  probability: number;
  impact: number;
  rating: number;
  owner: string;
  dueDate: string;
  response: string;
  evidenceRefs: DeliveryEvidenceRef[];
  status: 'open' | 'mitigated' | 'closed' | 'blocked';
  confidence: 'confirmed' | 'scenario' | 'unverified';
}

export interface DeliveryIssueRecord {
  id: string;
  title: string;
  scopeItemIds: string[];
  owner: string;
  dueDate: string;
  resolution?: string;
  evidenceRefs: DeliveryEvidenceRef[];
  status: 'open' | 'resolved' | 'blocked';
}

export interface DeliveryNoticeRecord {
  id: string;
  type: 'contractual' | 'early_warning' | 'instruction';
  obligationId?: string;
  title: string;
  dueDate: string;
  sentDate?: string;
  evidenceRefs: DeliveryEvidenceRef[];
  status: 'draft' | 'issued' | 'acknowledged' | 'overdue' | 'blocked';
}

export interface DeliveryChangeRecord {
  id: string;
  title: string;
  scopeItemIds: string[];
  noticeIds: string[];
  costImpact: string;
  scheduleImpactDays: number;
  evidenceRefs: DeliveryEvidenceRef[];
  status: 'identified' | 'submitted' | 'approved' | 'rejected' | 'implemented' | 'blocked';
  confidence: 'confirmed' | 'scenario' | 'unverified';
}

export interface DeliveryClaimRecord {
  id: string;
  title: string;
  changeIds: string[];
  noticeIds: string[];
  amount: string;
  extensionDays: number;
  evidenceRefs: DeliveryEvidenceRef[];
  status: 'potential' | 'submitted' | 'agreed' | 'rejected' | 'blocked';
}

export interface DeliveryDecisionRecord {
  id: string;
  title: string;
  relatedEntityIds: string[];
  owner: string;
  dueDate: string;
  decidedAt?: string;
  decision?: string;
  evidenceRefs: DeliveryEvidenceRef[];
  status: 'pending' | 'approved' | 'rejected' | 'blocked';
}

export interface DeliveryRiskChangeData {
  controlStatus: 'draft' | 'reviewed' | 'blocked';
  dataDate: string;
  currency: string;
  risks: DeliveryRiskRecord[];
  issues: DeliveryIssueRecord[];
  notices: DeliveryNoticeRecord[];
  changes: DeliveryChangeRecord[];
  claims: DeliveryClaimRecord[];
  decisions: DeliveryDecisionRecord[];
}

export interface DeliveryRiskChangeAudit {
  schemaVersion: 1;
  capability: 'risk_change';
  projectId: string;
  coreRevision: number;
  generatedAt: string;
  readiness: DeliveryCapabilityReadiness;
  summary: {
    risks: number;
    openRisks: number;
    openIssues: number;
    overdueNotices: number;
    approvedChanges: number;
    pendingChanges: number;
    agreedClaims: number;
    pendingDecisions: number;
  };
  issues: DeliveryCapabilityAuditIssue[];
}
