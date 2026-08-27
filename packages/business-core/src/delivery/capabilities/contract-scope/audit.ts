import type { DeliveryEvidenceRef, DeliveryWorkspace } from '../../types.ts';
import { parseDeliveryWorkspace } from '../../schema.ts';
import type { DeliveryCapabilityAuditIssue } from '../types.ts';
import { parseDeliveryContractScopeData } from './schema.ts';
import type { DeliveryContractScopeAudit, DeliveryContractScopeData } from './types.ts';

export function auditDeliveryContractScope(
  workspaceValue: DeliveryWorkspace | unknown,
  value: DeliveryContractScopeData | unknown,
  generatedAt = new Date().toISOString(),
): DeliveryContractScopeAudit {
  const workspace = parseDeliveryWorkspace(workspaceValue);
  const data = parseDeliveryContractScopeData(value);
  const issues: DeliveryCapabilityAuditIssue[] = [];
  const sourceById = new Map(workspace.sources.map((source) => [source.id, source]));
  const snapshotById = new Map(workspace.snapshots.map((snapshot) => [snapshot.id, snapshot]));
  const scopeIds = new Set(data.scopeItems.map((item) => item.id));
  const responsibilityOwners = new Map<string, string[]>();

  if (!workspace.baselines.some((baseline) => baseline.kind === 'contract' && baseline.status === 'approved')) {
    issues.push(issue('approved_contract_baseline_missing', 'baseline', undefined, 'No approved local contract baseline is registered.'));
  }
  if (!workspace.baselines.some((baseline) => baseline.kind === 'scope' && baseline.status === 'approved')) {
    issues.push(issue('approved_scope_baseline_missing', 'baseline', undefined, 'No approved local scope baseline is registered.'));
  }
  if (data.baselineStatus === 'blocked') issues.push(issue('contract_scope_blocked', 'capability', undefined, 'Contract and scope baseline is blocked.'));
  if (data.baselineStatus === 'draft') issues.push({ ...issue('contract_scope_not_reviewed', 'capability', undefined, 'Contract and scope baseline has not been reviewed.'), severity: 'warning' });

  for (const obligation of data.obligations) {
    inspectEvidence(obligation.evidenceRefs, obligation.id, sourceById, snapshotById, issues);
    if (obligation.evidenceRefs.length === 0) issues.push(issue('obligation_evidence_missing', 'obligation', obligation.id, `Obligation ${obligation.id} has no evidence.`));
    if (obligation.status === 'blocked' || obligation.status === 'noncompliant') issues.push(issue('obligation_not_compliant', 'obligation', obligation.id, `Obligation ${obligation.id} is ${obligation.status}.`));
    else if (obligation.status !== 'compliant') issues.push({ ...issue('obligation_not_verified', 'obligation', obligation.id, `Obligation ${obligation.id} is ${obligation.status}.`), severity: 'warning' });
  }

  const wbsCodes = new Set<string>();
  for (const scopeItem of data.scopeItems) {
    if (wbsCodes.has(scopeItem.wbsCode)) issues.push(issue('scope_wbs_duplicate', 'scope_item', scopeItem.id, `Duplicate WBS code ${scopeItem.wbsCode}.`));
    wbsCodes.add(scopeItem.wbsCode);
    inspectEvidence(scopeItem.evidenceRefs, scopeItem.id, sourceById, snapshotById, issues);
    const hasDirectEvidence = scopeItem.evidenceRefs.some((ref) => ref.kind === 'source' && sourceById.get(ref.sourceId)?.status === 'active');
    if (scopeItem.status === 'reviewed' && !hasDirectEvidence) issues.push(issue('scope_direct_evidence_missing', 'scope_item', scopeItem.id, `Reviewed scope item ${scopeItem.id} has no active direct project source.`));
    if (scopeItem.acceptanceCriteria.length === 0) issues.push(issue('scope_acceptance_criteria_missing', 'scope_item', scopeItem.id, `Scope item ${scopeItem.id} has no acceptance criterion.`));
    if (scopeItem.status === 'blocked') issues.push(issue('scope_item_blocked', 'scope_item', scopeItem.id, `Scope item ${scopeItem.id} is blocked.`));
    else if (scopeItem.status !== 'reviewed') issues.push({ ...issue('scope_item_not_reviewed', 'scope_item', scopeItem.id, `Scope item ${scopeItem.id} is not reviewed.`), severity: 'warning' });
    if (scopeItem.inclusionStatus === 'clarification') issues.push({ ...issue('scope_clarification_open', 'scope_item', scopeItem.id, `Scope item ${scopeItem.id} remains a clarification.`), severity: 'warning' });
  }

  for (const assignment of data.responsibilityAssignments) {
    if (assignment.status === 'blocked') issues.push(issue('responsibility_blocked', 'responsibility', assignment.id, `Responsibility ${assignment.id} is blocked.`));
    else if (assignment.status !== 'reviewed') issues.push({ ...issue('responsibility_not_reviewed', 'responsibility', assignment.id, `Responsibility ${assignment.id} is not reviewed.`), severity: 'warning' });
    if (assignment.interfaces.length === 0) issues.push(issue('responsibility_interface_missing', 'responsibility', assignment.id, `Responsibility ${assignment.id} has no interface record.`));
    for (const scopeItemId of assignment.scopeItemIds) {
      if (!scopeIds.has(scopeItemId)) issues.push(issue('responsibility_scope_missing', 'responsibility', assignment.id, `Responsibility ${assignment.id} references missing scope item ${scopeItemId}.`));
      const owners = responsibilityOwners.get(scopeItemId) ?? [];
      owners.push(assignment.id);
      responsibilityOwners.set(scopeItemId, owners);
    }
  }
  for (const scopeItemId of scopeIds) {
    const owners = responsibilityOwners.get(scopeItemId) ?? [];
    if (owners.length === 0) issues.push(issue('scope_responsibility_missing', 'scope_item', scopeItemId, `Scope item ${scopeItemId} has no responsibility assignment.`));
    if (owners.length > 1) issues.push(issue('scope_responsibility_duplicate', 'scope_item', scopeItemId, `Scope item ${scopeItemId} has multiple accountability assignments.`));
  }

  const readiness = issues.some((entry) => entry.severity === 'error') ? 'not_ready' : issues.length ? 'needs_review' : 'ready';
  return {
    schemaVersion: 1,
    capability: 'contract_scope',
    projectId: workspace.project.id,
    coreRevision: workspace.revision,
    generatedAt,
    readiness,
    summary: {
      obligations: data.obligations.length,
      compliantObligations: data.obligations.filter((item) => item.status === 'compliant').length,
      scopeItems: data.scopeItems.length,
      reviewedScopeItems: data.scopeItems.filter((item) => item.status === 'reviewed').length,
      directlySupportedScopeItems: data.scopeItems.filter((item) => item.evidenceRefs.some((ref) => ref.kind === 'source' && sourceById.get(ref.sourceId)?.status === 'active')).length,
      responsibilityAssignments: data.responsibilityAssignments.length,
    },
    issues,
  };
}

function inspectEvidence(
  refs: DeliveryEvidenceRef[],
  entityId: string,
  sources: Map<string, DeliveryWorkspace['sources'][number]>,
  snapshots: Map<string, DeliveryWorkspace['snapshots'][number]>,
  issues: DeliveryCapabilityAuditIssue[],
): void {
  for (const ref of refs) {
    if (ref.kind === 'source') {
      const source = sources.get(ref.sourceId);
      if (!source || source.status !== 'active') issues.push(issue('delivery_source_evidence_invalid', 'evidence', entityId, `Source ${ref.sourceId} is missing or inactive.`));
    } else {
      const snapshot = snapshots.get(ref.snapshotId);
      if (!snapshot || snapshot.approvalState !== 'approved' || !snapshot.userConfirmed) issues.push(issue('delivery_snapshot_evidence_invalid', 'evidence', entityId, `Snapshot ${ref.snapshotId} is missing or unverified.`));
    }
  }
}

function issue(code: string, entityType: string, entityId: string | undefined, message: string): DeliveryCapabilityAuditIssue {
  return { code, severity: 'error', entityType, entityId, message };
}
