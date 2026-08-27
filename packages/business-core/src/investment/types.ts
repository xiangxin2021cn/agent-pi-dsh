export type InvestmentSourceStatus = 'active' | 'superseded' | 'withdrawn';

export interface InvestmentProject {
  id: string;
  title: string;
  reference?: string;
  stage: 'screening' | 'pre_feasibility' | 'feasibility' | 'due_diligence' | 'investment_committee' | 'approved' | 'rejected' | 'on_hold';
  status: 'active' | 'on_hold' | 'completed' | 'archived';
  baseCurrency: string;
  valuationDate: string;
}

export interface InvestmentSource {
  id: string;
  name: string;
  path: string;
  kind: 'mandate' | 'geology' | 'resource_statement' | 'technical' | 'market' | 'offtake' | 'legal' | 'permit' | 'esg' | 'financial' | 'tax' | 'financing' | 'management' | 'supporting_evidence' | 'other';
  status: InvestmentSourceStatus;
  revision?: string;
  sha256: string;
}

export interface InvestmentEvidenceSnapshot {
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

export type InvestmentEvidenceRef =
  | { kind: 'source'; sourceId: string; page?: number; sheet?: string; clause?: string; cell?: string }
  | { kind: 'snapshot'; snapshotId: string };

export interface InvestmentAssumptionSet {
  id: string;
  title: string;
  status: 'draft' | 'approved' | 'superseded';
  evidenceRefs: InvestmentEvidenceRef[];
}

export interface InvestmentKnowledgeUse {
  publicationId: string;
  expectedSha256: string;
  relation: 'derived_from' | 'corroborates' | 'contradicts' | 'supersedes';
  localEntityIds: string[];
  verificationState: 'unverified' | 'corroborated' | 'conflicted' | 'stale';
  verifiedAt?: string;
  note?: string;
}

export interface InvestmentWorkspace {
  schemaVersion: 1;
  revision: number;
  project: InvestmentProject;
  sources: InvestmentSource[];
  snapshots: InvestmentEvidenceSnapshot[];
  assumptionSets: InvestmentAssumptionSet[];
  knowledgeUses: InvestmentKnowledgeUse[];
}

export interface InvestmentAuditIssue {
  code: string;
  severity: 'error' | 'warning';
  entityType: 'project' | 'source' | 'snapshot' | 'assumption_set' | 'knowledge_use';
  entityId?: string;
  message: string;
}

export interface InvestmentReadinessAudit {
  schemaVersion: 1;
  projectId: string;
  workspaceRevision: number;
  generatedAt: string;
  readiness: 'not_ready' | 'needs_review' | 'ready';
  summary: {
    directSources: number;
    activeDirectSources: number;
    importedSnapshots: number;
    approvedAssumptionSets: number;
    knowledgeUses: number;
    conflictedKnowledgeUses: number;
  };
  issues: InvestmentAuditIssue[];
}
