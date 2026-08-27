export type DeliveryProjectStatus = 'active' | 'on_hold' | 'completed' | 'archived';
export type DeliverySourceStatus = 'active' | 'superseded' | 'withdrawn';

export interface DeliveryProject {
  id: string;
  title: string;
  reference?: string;
  currency?: string;
  status: DeliveryProjectStatus;
  dataDate?: string;
}

export interface DeliverySource {
  id: string;
  name: string;
  path: string;
  kind: 'contract' | 'approved_scope' | 'boq' | 'baseline_programme' | 'budget' | 'organization' | 'commitment' | 'resource' | 'progress' | 'risk' | 'change' | 'supporting_evidence' | 'other';
  status: DeliverySourceStatus;
  revision?: string;
  sha256: string;
}

export interface DeliveryEvidenceSnapshot {
  id: string;
  producerPlugin: 'tender' | 'delivery' | 'investment' | 'knowledge';
  producerWorkspaceId: string;
  producerRevision: number;
  managedArtifactPath: string;
  contentSha256: string;
  approvalState: 'draft' | 'approved' | 'withdrawn';
  importedAt: string;
  userConfirmed: boolean;
}

export type DeliveryEvidenceRef =
  | { kind: 'source'; sourceId: string; page?: number; sheet?: string; clause?: string; cell?: string }
  | { kind: 'snapshot'; snapshotId: string };

export interface DeliveryBaseline {
  id: string;
  kind: 'contract' | 'scope' | 'schedule' | 'budget' | 'organization' | 'progress';
  title: string;
  status: 'draft' | 'approved' | 'superseded';
  evidenceRefs: DeliveryEvidenceRef[];
}

export interface DeliveryKnowledgeUse {
  publicationId: string;
  expectedSha256: string;
  relation: 'derived_from' | 'corroborates' | 'contradicts' | 'supersedes';
  localEntityIds: string[];
  verificationState: 'unverified' | 'corroborated' | 'conflicted' | 'stale';
  verifiedAt?: string;
  note?: string;
}

export interface DeliveryWorkspace {
  schemaVersion: 1;
  revision: number;
  project: DeliveryProject;
  sources: DeliverySource[];
  snapshots: DeliveryEvidenceSnapshot[];
  baselines: DeliveryBaseline[];
  knowledgeUses: DeliveryKnowledgeUse[];
}

export interface DeliveryAuditIssue {
  code: string;
  severity: 'error' | 'warning';
  entityType: 'project' | 'source' | 'snapshot' | 'baseline' | 'knowledge_use';
  entityId?: string;
  message: string;
}

export interface DeliveryReadinessAudit {
  schemaVersion: 1;
  projectId: string;
  workspaceRevision: number;
  generatedAt: string;
  readiness: 'not_ready' | 'needs_review' | 'ready';
  summary: {
    directSources: number;
    activeDirectSources: number;
    tenderSnapshots: number;
    approvedBaselines: number;
    knowledgeUses: number;
    conflictedKnowledgeUses: number;
  };
  issues: DeliveryAuditIssue[];
}
