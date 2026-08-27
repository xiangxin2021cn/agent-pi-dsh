import type { DeliveryEvidenceRef, DeliveryWorkspace } from '../../types.ts';
import { parseDeliveryWorkspace } from '../../schema.ts';
import type { DeliveryCapabilityAuditIssue, DeliveryCapabilityId } from '../types.ts';
import { parseDeliveryReportingAuditData } from './schema.ts';
import type { DeliveryOperationalCapabilityId, DeliveryReportingAuditAudit, DeliveryReportingAuditData } from './types.ts';

export function auditDeliveryReportingAudit(
  workspaceValue: DeliveryWorkspace | unknown,
  upstreamData: Partial<Record<DeliveryCapabilityId, unknown>>,
  value: DeliveryReportingAuditData | unknown,
  generatedAt = new Date().toISOString(),
): DeliveryReportingAuditAudit {
  const workspace = parseDeliveryWorkspace(workspaceValue);
  const data = parseDeliveryReportingAuditData(value);
  const issues: DeliveryCapabilityAuditIssue[] = [];
  const sourceById = new Map(workspace.sources.map((source) => [source.id, source]));
  const snapshotById = new Map(workspace.snapshots.map((snapshot) => [snapshot.id, snapshot]));
  const enabledCapabilities = Object.keys(upstreamData).filter((capability): capability is DeliveryOperationalCapabilityId => capability !== 'reporting_audit') as DeliveryOperationalCapabilityId[];
  const attestationByCapability = new Map(data.capabilityAttestations.map((item) => [item.capability, item]));

  if (workspace.project.dataDate && workspace.project.dataDate !== data.dataDate) issues.push(issue('reporting_data_date_mismatch', 'capability', undefined, `Reporting data date ${data.dataDate} does not match project data date ${workspace.project.dataDate}.`));
  if (data.period !== data.dataDate.slice(0, 7)) issues.push(issue('reporting_period_data_date_mismatch', 'capability', undefined, `Reporting period ${data.period} does not contain data date ${data.dataDate}.`));
  if (data.controlStatus === 'blocked') issues.push(issue('reporting_audit_blocked', 'capability', undefined, 'Reporting and audit control is blocked.'));
  if (data.controlStatus === 'draft') issues.push(warning('reporting_audit_not_reviewed', 'capability', undefined, 'Reporting and audit control has not been reviewed.'));

  for (const capability of enabledCapabilities) {
    const attestation = attestationByCapability.get(capability);
    if (!attestation) issues.push(issue('capability_attestation_missing', 'capability_attestation', capability, `Enabled capability ${capability} has no period-close attestation.`));
    else if (attestation.status !== 'reviewed') issues.push(issue('capability_attestation_not_reviewed', 'capability_attestation', capability, `Capability ${capability} attestation is ${attestation.status}.`));
  }
  for (const attestation of data.capabilityAttestations) {
    if (!enabledCapabilities.includes(attestation.capability)) issues.push(warning('capability_attestation_not_enabled', 'capability_attestation', attestation.capability, `Attestation references capability ${attestation.capability}, which is not enabled for this close.`));
  }

  for (const variance of data.varianceExplanations) {
    if (!enabledCapabilities.includes(variance.capability)) issues.push(issue('variance_capability_not_enabled', 'variance', variance.id, `Variance ${variance.id} references capability ${variance.capability}, which is not enabled.`));
    inspectEvidence(variance.evidenceRefs, variance.id, sourceById, snapshotById, issues);
    if (variance.status === 'reviewed' && !hasDirectEvidence(variance.evidenceRefs, sourceById)) issues.push(issue('variance_direct_evidence_missing', 'variance', variance.id, `Reviewed variance ${variance.id} has no active direct implementation evidence.`));
    if (variance.status === 'blocked') issues.push(issue('variance_blocked', 'variance', variance.id, `Variance ${variance.id} is blocked.`));
    if (variance.status === 'draft') issues.push(warning('variance_not_reviewed', 'variance', variance.id, `Variance ${variance.id} is still draft.`));
  }

  const approvedReportCapabilities = new Set<DeliveryOperationalCapabilityId>();
  for (const report of data.managementReports) {
    inspectEvidence(report.evidenceRefs, report.id, sourceById, snapshotById, issues);
    if (report.status === 'approved' && !hasDirectEvidence(report.evidenceRefs, sourceById)) issues.push(issue('management_report_direct_evidence_missing', 'management_report', report.id, `Approved report ${report.id} has no active direct implementation evidence.`));
    if (report.status === 'approved') for (const capability of report.capabilityIds) approvedReportCapabilities.add(capability);
    if (report.status === 'blocked') issues.push(issue('management_report_blocked', 'management_report', report.id, `Management report ${report.id} is blocked.`));
    if (report.status === 'draft' || report.status === 'reviewed') issues.push(warning('management_report_not_approved', 'management_report', report.id, `Management report ${report.id} is ${report.status}.`));
  }
  for (const capability of enabledCapabilities) {
    if (!approvedReportCapabilities.has(capability)) issues.push(issue('management_report_capability_missing', 'management_report', capability, `No approved management report covers enabled capability ${capability}.`));
  }
  if (data.managementReports.length === 0) issues.push(issue('management_report_missing', 'management_report', undefined, 'No management report is registered.'));

  inspectEvidence(data.closeApproval.evidenceRefs, 'period-close', sourceById, snapshotById, issues);
  if (data.closeApproval.status !== 'approved' || !data.closeApproval.approvedBy || !data.closeApproval.approvedAt) {
    issues.push(issue('period_close_not_approved', 'period_close', data.period, 'Period close requires explicit approval, approver, and approval date.'));
  } else if (!hasDirectEvidence(data.closeApproval.evidenceRefs, sourceById)) {
    issues.push(issue('period_close_direct_evidence_missing', 'period_close', data.period, 'Approved period close has no active direct implementation evidence.'));
  }

  for (let index = 0; index < data.auditHistory.length; index += 1) {
    const entry = data.auditHistory[index]!;
    if (index === 0 && entry.previousHash) issues.push(issue('audit_history_chain_broken', 'audit_history', entry.id, `First audit event ${entry.id} must not have a previous hash.`));
    if (index > 0 && entry.previousHash !== data.auditHistory[index - 1]!.contentHash) issues.push(issue('audit_history_chain_broken', 'audit_history', entry.id, `Audit event ${entry.id} does not link to the previous content hash.`));
    if (index > 0 && entry.at < data.auditHistory[index - 1]!.at) issues.push(issue('audit_history_order_invalid', 'audit_history', entry.id, `Audit event ${entry.id} is out of chronological order.`));
  }
  if (data.auditHistory.length === 0) issues.push(issue('audit_history_missing', 'audit_history', undefined, 'Period close has no audit history.'));

  const readiness = issues.some((entry) => entry.severity === 'error') ? 'not_ready' : issues.length ? 'needs_review' : 'ready';
  return {
    schemaVersion: 1, capability: 'reporting_audit', projectId: workspace.project.id, coreRevision: workspace.revision,
    generatedAt, readiness,
    summary: {
      period: data.period,
      enabledCapabilities: enabledCapabilities.length,
      attestedCapabilities: enabledCapabilities.filter((capability) => attestationByCapability.get(capability)?.status === 'reviewed').length,
      reviewedVariances: data.varianceExplanations.filter((item) => item.status === 'reviewed').length,
      managementReports: data.managementReports.length,
      approvedReports: data.managementReports.filter((item) => item.status === 'approved').length,
      closeApproved: data.closeApproval.status === 'approved',
      auditHistoryEntries: data.auditHistory.length,
    },
    issues,
  };
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
