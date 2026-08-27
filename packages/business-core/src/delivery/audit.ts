import { parseDeliveryWorkspace } from './schema.ts';
import type { DeliveryAuditIssue, DeliveryReadinessAudit, DeliveryWorkspace } from './types.ts';

export function auditDeliveryWorkspace(
  value: DeliveryWorkspace | unknown,
  generatedAt = new Date().toISOString(),
): DeliveryReadinessAudit {
  const workspace = parseDeliveryWorkspace(value);
  const issues: DeliveryAuditIssue[] = [];
  const sourceById = new Map(workspace.sources.map((source) => [source.id, source]));
  const snapshotById = new Map(workspace.snapshots.map((snapshot) => [snapshot.id, snapshot]));
  const activeSources = workspace.sources.filter((source) => source.status === 'active');

  if (activeSources.length === 0) {
    issues.push({
      code: 'direct_project_input_missing',
      severity: 'error',
      entityType: 'project',
      entityId: workspace.project.id,
      message: 'Delivery Workspace requires at least one active user-owned project source.',
    });
  }

  for (const snapshot of workspace.snapshots) {
    if (!snapshot.userConfirmed) {
      issues.push({ code: 'snapshot_not_confirmed', severity: 'error', entityType: 'snapshot', entityId: snapshot.id, message: `Snapshot ${snapshot.id} has not been confirmed by the user.` });
    }
    if (snapshot.approvalState !== 'approved') {
      issues.push({ code: 'snapshot_not_approved', severity: snapshot.approvalState === 'withdrawn' ? 'error' : 'warning', entityType: 'snapshot', entityId: snapshot.id, message: `Snapshot ${snapshot.id} is ${snapshot.approvalState}.` });
    }
  }

  for (const baseline of workspace.baselines) {
    if (baseline.status !== 'approved') continue;
    if (baseline.evidenceRefs.length === 0) {
      issues.push({ code: 'baseline_evidence_missing', severity: 'error', entityType: 'baseline', entityId: baseline.id, message: `Approved baseline ${baseline.id} has no evidence.` });
    }
    for (const ref of baseline.evidenceRefs) {
      if (ref.kind === 'source') {
        const source = sourceById.get(ref.sourceId);
        if (!source || source.status !== 'active') {
          issues.push({ code: 'baseline_evidence_missing', severity: 'error', entityType: 'baseline', entityId: baseline.id, message: `Baseline ${baseline.id} references missing or inactive source ${ref.sourceId}.` });
        }
      } else {
        const snapshot = snapshotById.get(ref.snapshotId);
        if (!snapshot || !snapshot.userConfirmed || snapshot.approvalState !== 'approved') {
          issues.push({ code: 'baseline_snapshot_unverified', severity: 'error', entityType: 'baseline', entityId: baseline.id, message: `Baseline ${baseline.id} references an unverified snapshot ${ref.snapshotId}.` });
        }
      }
    }
  }

  for (const use of workspace.knowledgeUses) {
    if (use.verificationState === 'conflicted') {
      issues.push({ code: 'knowledge_evidence_conflicted', severity: 'error', entityType: 'knowledge_use', entityId: use.publicationId, message: `Knowledge evidence ${use.publicationId} is conflicted.` });
    } else if (use.verificationState === 'stale') {
      issues.push({ code: 'knowledge_evidence_stale', severity: 'error', entityType: 'knowledge_use', entityId: use.publicationId, message: `Knowledge evidence ${use.publicationId} is stale.` });
    } else if (use.verificationState === 'unverified') {
      issues.push({ code: 'knowledge_evidence_unverified', severity: 'warning', entityType: 'knowledge_use', entityId: use.publicationId, message: `Knowledge evidence ${use.publicationId} is unverified.` });
    }
  }

  const readiness = issues.some((issue) => issue.severity === 'error') ? 'not_ready' : issues.length ? 'needs_review' : 'ready';
  return {
    schemaVersion: 1,
    projectId: workspace.project.id,
    workspaceRevision: workspace.revision,
    generatedAt,
    readiness,
    summary: {
      directSources: workspace.sources.length,
      activeDirectSources: activeSources.length,
      tenderSnapshots: workspace.snapshots.filter((snapshot) => snapshot.producerPlugin === 'tender').length,
      approvedBaselines: workspace.baselines.filter((baseline) => baseline.status === 'approved').length,
      knowledgeUses: workspace.knowledgeUses.length,
      conflictedKnowledgeUses: workspace.knowledgeUses.filter((use) => use.verificationState === 'conflicted').length,
    },
    issues,
  };
}
