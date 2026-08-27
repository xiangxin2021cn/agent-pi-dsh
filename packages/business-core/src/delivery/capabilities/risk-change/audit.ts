import type { DeliveryEvidenceRef, DeliveryWorkspace } from '../../types.ts';
import { parseDeliveryWorkspace } from '../../schema.ts';
import type { DeliveryContractScopeData } from '../contract-scope/types.ts';
import { parseDeliveryContractScopeData } from '../contract-scope/schema.ts';
import type { DeliveryCapabilityAuditIssue } from '../types.ts';
import { parseDeliveryRiskChangeData } from './schema.ts';
import type { DeliveryRiskChangeAudit, DeliveryRiskChangeData } from './types.ts';

export function auditDeliveryRiskChange(
  workspaceValue: DeliveryWorkspace | unknown,
  contractScopeValue: DeliveryContractScopeData | unknown,
  value: DeliveryRiskChangeData | unknown,
  generatedAt = new Date().toISOString(),
): DeliveryRiskChangeAudit {
  const workspace = parseDeliveryWorkspace(workspaceValue);
  const contractScope = parseDeliveryContractScopeData(contractScopeValue);
  const data = parseDeliveryRiskChangeData(value);
  const issues: DeliveryCapabilityAuditIssue[] = [];
  const sourceById = new Map(workspace.sources.map((source) => [source.id, source]));
  const snapshotById = new Map(workspace.snapshots.map((snapshot) => [snapshot.id, snapshot]));
  const scopeIds = new Set(contractScope.scopeItems.map((item) => item.id));
  const obligationIds = new Set(contractScope.obligations.map((item) => item.id));
  const noticeIds = new Set(data.notices.map((item) => item.id));
  const changeIds = new Set(data.changes.map((item) => item.id));

  if (workspace.project.dataDate && workspace.project.dataDate !== data.dataDate) issues.push(issue('risk_change_data_date_mismatch', 'capability', undefined, `Risk/change data date ${data.dataDate} does not match project data date ${workspace.project.dataDate}.`));
  if (workspace.project.currency && workspace.project.currency !== data.currency) issues.push(issue('risk_change_currency_mismatch', 'capability', undefined, `Risk/change currency ${data.currency} does not match project currency ${workspace.project.currency}.`));
  if (data.controlStatus === 'blocked') issues.push(issue('risk_change_blocked', 'capability', undefined, 'Risk, change, and decision control is blocked.'));
  if (data.controlStatus === 'draft') issues.push(warning('risk_change_not_reviewed', 'capability', undefined, 'Risk, change, and decision control has not been reviewed.'));

  for (const risk of data.risks) {
    validateScopeRefs(risk.scopeItemIds, risk.id, 'risk', scopeIds, issues);
    inspectEvidence(risk.evidenceRefs, risk.id, sourceById, snapshotById, issues);
    if (risk.rating !== risk.probability * risk.impact) issues.push(issue('risk_rating_mismatch', 'risk', risk.id, `Risk ${risk.id} rating does not equal probability times impact.`));
    if (risk.confidence === 'confirmed' && !hasDirectEvidence(risk.evidenceRefs, sourceById)) issues.push(issue('risk_direct_evidence_missing', 'risk', risk.id, `Confirmed risk ${risk.id} has no active direct implementation evidence.`));
    if (risk.status === 'blocked') issues.push(issue('risk_blocked', 'risk', risk.id, `Risk ${risk.id} is blocked.`));
    else if (risk.status === 'open' && risk.dueDate <= data.dataDate) issues.push(issue('risk_response_overdue', 'risk', risk.id, `Risk ${risk.id} response is overdue.`));
    else if (risk.status === 'open') issues.push(warning('risk_open', 'risk', risk.id, `Risk ${risk.id} remains open.`));
    if (risk.confidence !== 'confirmed') issues.push(warning('risk_not_confirmed', 'risk', risk.id, `Risk ${risk.id} is ${risk.confidence}.`));
  }

  for (const record of data.issues) {
    validateScopeRefs(record.scopeItemIds, record.id, 'issue', scopeIds, issues);
    inspectEvidence(record.evidenceRefs, record.id, sourceById, snapshotById, issues);
    if (record.status === 'resolved' && (!record.resolution || !hasDirectEvidence(record.evidenceRefs, sourceById))) issues.push(issue('issue_resolution_unsupported', 'issue', record.id, `Resolved issue ${record.id} requires a resolution and active direct evidence.`));
    if (record.status === 'blocked') issues.push(issue('issue_blocked', 'issue', record.id, `Issue ${record.id} is blocked.`));
    else if (record.status === 'open' && record.dueDate <= data.dataDate) issues.push(issue('issue_overdue', 'issue', record.id, `Issue ${record.id} is overdue.`));
    else if (record.status === 'open') issues.push(warning('issue_open', 'issue', record.id, `Issue ${record.id} remains open.`));
  }

  for (const notice of data.notices) {
    if (notice.obligationId && !obligationIds.has(notice.obligationId)) issues.push(issue('notice_obligation_missing', 'notice', notice.id, `Notice ${notice.id} references missing obligation ${notice.obligationId}.`));
    inspectEvidence(notice.evidenceRefs, notice.id, sourceById, snapshotById, issues);
    if ((notice.status === 'issued' || notice.status === 'acknowledged') && (!notice.sentDate || !hasDirectEvidence(notice.evidenceRefs, sourceById))) issues.push(issue('notice_issue_unsupported', 'notice', notice.id, `Issued notice ${notice.id} requires a sent date and active direct evidence.`));
    if ((notice.status === 'draft' && notice.dueDate <= data.dataDate) || notice.status === 'overdue') issues.push(issue('notice_overdue', 'notice', notice.id, `Notice ${notice.id} is overdue.`));
    if (notice.status === 'blocked') issues.push(issue('notice_blocked', 'notice', notice.id, `Notice ${notice.id} is blocked.`));
  }

  for (const change of data.changes) {
    validateScopeRefs(change.scopeItemIds, change.id, 'change', scopeIds, issues);
    for (const noticeId of change.noticeIds) if (!noticeIds.has(noticeId)) issues.push(issue('change_notice_missing', 'change', change.id, `Change ${change.id} references missing notice ${noticeId}.`));
    inspectEvidence(change.evidenceRefs, change.id, sourceById, snapshotById, issues);
    if ((change.status === 'approved' || change.status === 'implemented') && !hasDirectEvidence(change.evidenceRefs, sourceById)) issues.push(issue('change_direct_evidence_missing', 'change', change.id, `Approved or implemented change ${change.id} has no active direct implementation evidence.`));
    if (change.status === 'blocked') issues.push(issue('change_blocked', 'change', change.id, `Change ${change.id} is blocked.`));
    if (change.status === 'identified' || change.status === 'submitted') issues.push(warning('change_pending', 'change', change.id, `Change ${change.id} remains ${change.status}.`));
    if (change.confidence !== 'confirmed') issues.push(warning('change_not_confirmed', 'change', change.id, `Change ${change.id} is ${change.confidence}.`));
  }

  for (const claim of data.claims) {
    for (const changeId of claim.changeIds) if (!changeIds.has(changeId)) issues.push(issue('claim_change_missing', 'claim', claim.id, `Claim ${claim.id} references missing change ${changeId}.`));
    for (const noticeId of claim.noticeIds) if (!noticeIds.has(noticeId)) issues.push(issue('claim_notice_missing', 'claim', claim.id, `Claim ${claim.id} references missing notice ${noticeId}.`));
    inspectEvidence(claim.evidenceRefs, claim.id, sourceById, snapshotById, issues);
    if ((claim.status === 'submitted' || claim.status === 'agreed') && !hasDirectEvidence(claim.evidenceRefs, sourceById)) issues.push(issue('claim_direct_evidence_missing', 'claim', claim.id, `Submitted or agreed claim ${claim.id} has no active direct implementation evidence.`));
    if (claim.status === 'blocked') issues.push(issue('claim_blocked', 'claim', claim.id, `Claim ${claim.id} is blocked.`));
    if (claim.status === 'potential' || claim.status === 'submitted') issues.push(warning('claim_pending', 'claim', claim.id, `Claim ${claim.id} remains ${claim.status}.`));
  }

  const relatedEntityIds = new Set([
    ...data.risks.map((item) => item.id), ...data.issues.map((item) => item.id),
    ...data.notices.map((item) => item.id), ...data.changes.map((item) => item.id), ...data.claims.map((item) => item.id),
  ]);
  for (const decision of data.decisions) {
    for (const entityId of decision.relatedEntityIds) if (!relatedEntityIds.has(entityId)) issues.push(issue('decision_entity_missing', 'decision', decision.id, `Decision ${decision.id} references missing entity ${entityId}.`));
    inspectEvidence(decision.evidenceRefs, decision.id, sourceById, snapshotById, issues);
    if ((decision.status === 'approved' || decision.status === 'rejected') && (!decision.decidedAt || !decision.decision || !hasDirectEvidence(decision.evidenceRefs, sourceById))) issues.push(issue('decision_resolution_unsupported', 'decision', decision.id, `Resolved decision ${decision.id} requires a decision date, decision text, and active direct evidence.`));
    if (decision.status === 'blocked') issues.push(issue('decision_blocked', 'decision', decision.id, `Decision ${decision.id} is blocked.`));
    else if (decision.status === 'pending' && decision.dueDate <= data.dataDate) issues.push(issue('decision_overdue', 'decision', decision.id, `Decision ${decision.id} is overdue.`));
    else if (decision.status === 'pending') issues.push(warning('decision_pending', 'decision', decision.id, `Decision ${decision.id} remains pending.`));
  }

  const readiness = issues.some((entry) => entry.severity === 'error') ? 'not_ready' : issues.length ? 'needs_review' : 'ready';
  return {
    schemaVersion: 1, capability: 'risk_change', projectId: workspace.project.id, coreRevision: workspace.revision,
    generatedAt, readiness,
    summary: {
      risks: data.risks.length,
      openRisks: data.risks.filter((item) => item.status === 'open' || item.status === 'blocked').length,
      openIssues: data.issues.filter((item) => item.status === 'open' || item.status === 'blocked').length,
      overdueNotices: data.notices.filter((item) => item.status === 'overdue' || (item.status === 'draft' && item.dueDate <= data.dataDate)).length,
      approvedChanges: data.changes.filter((item) => item.status === 'approved' || item.status === 'implemented').length,
      pendingChanges: data.changes.filter((item) => item.status === 'identified' || item.status === 'submitted' || item.status === 'blocked').length,
      agreedClaims: data.claims.filter((item) => item.status === 'agreed').length,
      pendingDecisions: data.decisions.filter((item) => item.status === 'pending' || item.status === 'blocked').length,
    },
    issues,
  };
}

function validateScopeRefs(ids: string[], entityId: string, entityType: string, scopeIds: Set<string>, issues: DeliveryCapabilityAuditIssue[]): void {
  for (const scopeItemId of ids) if (!scopeIds.has(scopeItemId)) issues.push(issue(`${entityType}_scope_missing`, entityType, entityId, `${entityType} ${entityId} references missing scope item ${scopeItemId}.`));
}

function inspectEvidence(
  references: DeliveryEvidenceRef[], entityId: string,
  sources: Map<string, DeliveryWorkspace['sources'][number]>, snapshots: Map<string, DeliveryWorkspace['snapshots'][number]>,
  issues: DeliveryCapabilityAuditIssue[],
): void {
  for (const reference of references) {
    if (reference.kind === 'source') {
      const source = sources.get(reference.sourceId);
      if (!source || source.status !== 'active') issues.push(issue('delivery_source_evidence_invalid', 'evidence', entityId, `Source ${reference.sourceId} is missing or inactive.`));
    } else {
      const snapshot = snapshots.get(reference.snapshotId);
      if (!snapshot || snapshot.approvalState !== 'approved' || !snapshot.userConfirmed) issues.push(issue('delivery_snapshot_evidence_invalid', 'evidence', entityId, `Snapshot ${reference.snapshotId} is missing or unverified.`));
    }
  }
}

function hasDirectEvidence(references: DeliveryEvidenceRef[], sources: Map<string, DeliveryWorkspace['sources'][number]>): boolean {
  return references.some((reference) => reference.kind === 'source' && sources.get(reference.sourceId)?.status === 'active');
}

function issue(code: string, entityType: string, entityId: string | undefined, message: string): DeliveryCapabilityAuditIssue { return { code, severity: 'error', entityType, entityId, message }; }
function warning(code: string, entityType: string, entityId: string | undefined, message: string): DeliveryCapabilityAuditIssue { return { code, severity: 'warning', entityType, entityId, message }; }
