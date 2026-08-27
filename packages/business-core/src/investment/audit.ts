import { parseInvestmentWorkspace } from './schema.ts';
import type { InvestmentAuditIssue, InvestmentReadinessAudit, InvestmentWorkspace } from './types.ts';

export function auditInvestmentWorkspace(value: InvestmentWorkspace | unknown, generatedAt = new Date().toISOString()): InvestmentReadinessAudit {
  const workspace = parseInvestmentWorkspace(value);
  const issues: InvestmentAuditIssue[] = [];
  const sourceById = new Map(workspace.sources.map((source) => [source.id, source]));
  const snapshotById = new Map(workspace.snapshots.map((snapshot) => [snapshot.id, snapshot]));
  const activeSources = workspace.sources.filter((source) => source.status === 'active');

  if (activeSources.length === 0) issues.push(issue('direct_investment_source_missing', 'project', workspace.project.id, 'Investment Workspace requires at least one active user-owned investment source.'));
  if (!workspace.assumptionSets.some((set) => set.status === 'approved')) issues.push(issue('approved_assumption_set_missing', 'project', workspace.project.id, 'Investment Workspace requires an approved local assumption set.'));

  for (const snapshot of workspace.snapshots) {
    if (!snapshot.userConfirmed) issues.push(issue('snapshot_not_confirmed', 'snapshot', snapshot.id, `Snapshot ${snapshot.id} has not been confirmed by the user.`));
    if (snapshot.approvalState !== 'approved') issues.push({ ...issue('snapshot_not_approved', 'snapshot', snapshot.id, `Snapshot ${snapshot.id} is ${snapshot.approvalState}.`), severity: snapshot.approvalState === 'draft' ? 'warning' : 'error' });
  }

  for (const assumptionSet of workspace.assumptionSets) {
    if (assumptionSet.status !== 'approved') continue;
    if (assumptionSet.evidenceRefs.length === 0) issues.push(issue('assumption_evidence_missing', 'assumption_set', assumptionSet.id, `Approved assumption set ${assumptionSet.id} has no evidence.`));
    let hasDirectEvidence = false;
    for (const reference of assumptionSet.evidenceRefs) {
      if (reference.kind === 'source') {
        const source = sourceById.get(reference.sourceId);
        if (source?.status === 'active') hasDirectEvidence = true;
        else issues.push(issue('assumption_evidence_missing', 'assumption_set', assumptionSet.id, `Assumption set ${assumptionSet.id} references missing or inactive source ${reference.sourceId}.`));
      } else {
        const snapshot = snapshotById.get(reference.snapshotId);
        if (!snapshot || !snapshot.userConfirmed || snapshot.approvalState !== 'approved') issues.push(issue('assumption_snapshot_unverified', 'assumption_set', assumptionSet.id, `Assumption set ${assumptionSet.id} references unverified snapshot ${reference.snapshotId}.`));
      }
    }
    if (!hasDirectEvidence) issues.push(issue('assumption_direct_evidence_missing', 'assumption_set', assumptionSet.id, `Approved assumption set ${assumptionSet.id} has no active direct investment evidence.`));
  }

  for (const use of workspace.knowledgeUses) {
    if (use.verificationState === 'conflicted') issues.push(issue('knowledge_evidence_conflicted', 'knowledge_use', use.publicationId, `Knowledge evidence ${use.publicationId} is conflicted.`));
    else if (use.verificationState === 'stale') issues.push(issue('knowledge_evidence_stale', 'knowledge_use', use.publicationId, `Knowledge evidence ${use.publicationId} is stale.`));
    else if (use.verificationState === 'unverified') issues.push({ ...issue('knowledge_evidence_unverified', 'knowledge_use', use.publicationId, `Knowledge evidence ${use.publicationId} is unverified.`), severity: 'warning' });
  }

  const readiness = issues.some((entry) => entry.severity === 'error') ? 'not_ready' : issues.length ? 'needs_review' : 'ready';
  return {
    schemaVersion: 1, projectId: workspace.project.id, workspaceRevision: workspace.revision, generatedAt, readiness,
    summary: {
      directSources: workspace.sources.length,
      activeDirectSources: activeSources.length,
      importedSnapshots: workspace.snapshots.length,
      approvedAssumptionSets: workspace.assumptionSets.filter((set) => set.status === 'approved').length,
      knowledgeUses: workspace.knowledgeUses.length,
      conflictedKnowledgeUses: workspace.knowledgeUses.filter((use) => use.verificationState === 'conflicted').length,
    },
    issues,
  };
}

function issue(code: string, entityType: InvestmentAuditIssue['entityType'], entityId: string | undefined, message: string): InvestmentAuditIssue {
  return { code, severity: 'error', entityType, entityId, message };
}
