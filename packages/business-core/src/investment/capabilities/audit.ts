import { parseInvestmentWorkspace } from '../schema.ts';
import type { InvestmentEvidenceRef, InvestmentWorkspace } from '../types.ts';
import { parseInvestmentCapabilityData } from './schema.ts';
import type { InvestmentCapabilityAudit, InvestmentCapabilityAuditIssue, InvestmentCapabilityData, InvestmentCapabilityId } from './types.ts';

const REQUIRED_FINDING_CATEGORIES: Record<InvestmentCapabilityId, string[]> = {
  mandate_screening: ['mandate', 'opportunity', 'stage_gate'],
  resource_technical: ['resource_statement', 'technical_plan', 'infrastructure'],
  market_offtake: ['market_demand', 'pricing', 'offtake'],
  legal_esg: ['title_permit', 'environment', 'social'],
  financial_valuation: ['capex', 'opex', 'revenue', 'valuation'],
  transaction_decision: ['financing', 'transaction', 'recommendation'],
};

export function auditInvestmentCapability(
  capability: InvestmentCapabilityId,
  workspaceValue: InvestmentWorkspace | unknown,
  dataValue: InvestmentCapabilityData | unknown,
  generatedAt = new Date().toISOString(),
): InvestmentCapabilityAudit {
  const workspace = parseInvestmentWorkspace(workspaceValue);
  const data = parseInvestmentCapabilityData(dataValue);
  const issues: InvestmentCapabilityAuditIssue[] = [];
  const sourceById = new Map(workspace.sources.map((source) => [source.id, source]));
  const snapshotById = new Map(workspace.snapshots.map((snapshot) => [snapshot.id, snapshot]));

  if (data.reviewStatus === 'blocked') issues.push(error('capability_blocked', 'capability', capability, `${capability} is blocked.`));
  else if (data.reviewStatus !== 'reviewed') issues.push(warning('capability_not_reviewed', 'capability', capability, `${capability} has not been reviewed.`));

  for (const category of REQUIRED_FINDING_CATEGORIES[capability]) {
    if (!data.findings.some((finding) => finding.category === category && finding.status === 'verified')) {
      issues.push(error('required_finding_category_missing', 'finding', category, `Verified finding category ${category} is required.`));
    }
  }

  for (const finding of data.findings) {
    inspectEvidence(finding.evidenceRefs, 'finding', finding.id, workspace, issues);
    if (finding.status === 'verified' && !hasActiveDirectEvidence(finding.evidenceRefs, sourceById)) {
      issues.push(error('finding_direct_evidence_missing', 'finding', finding.id, `Verified finding ${finding.id} requires active direct investment evidence; snapshots may only corroborate it.`));
    }
    if (finding.status === 'blocked') issues.push(error('finding_blocked', 'finding', finding.id, `Finding ${finding.id} is blocked.`));
    else if (finding.status !== 'verified' || finding.confidence !== 'confirmed') issues.push(warning('finding_not_verified', 'finding', finding.id, `Finding ${finding.id} is not a confirmed verified conclusion.`));
  }

  for (const assumption of data.assumptions) {
    inspectEvidence(assumption.evidenceRefs, 'assumption', assumption.id, workspace, issues);
    if (assumption.status === 'approved' && !hasActiveDirectEvidence(assumption.evidenceRefs, sourceById)) {
      issues.push(error('assumption_direct_evidence_missing', 'assumption', assumption.id, `Approved assumption ${assumption.id} requires active direct investment evidence.`));
    } else if (assumption.status === 'blocked') issues.push(error('assumption_blocked', 'assumption', assumption.id, `Assumption ${assumption.id} is blocked.`));
    else if (assumption.status === 'draft') issues.push(warning('assumption_not_approved', 'assumption', assumption.id, `Assumption ${assumption.id} is not approved.`));
  }

  for (const metric of data.metrics) {
    inspectEvidence(metric.evidenceRefs, 'metric', metric.id, workspace, issues);
    if (metric.status === 'verified' && !hasActiveDirectEvidence(metric.evidenceRefs, sourceById)) {
      issues.push(error('metric_direct_evidence_missing', 'metric', metric.id, `Verified metric ${metric.id} requires active direct investment evidence.`));
    } else if (metric.status !== 'verified') issues.push(warning('metric_not_verified', 'metric', metric.id, `Metric ${metric.id} is ${metric.status}.`));
  }

  for (const risk of data.risks) {
    if (risk.status === 'blocked') issues.push(error('risk_blocked', 'risk', risk.id, `Risk ${risk.id} is blocked.`));
    else if (risk.status === 'open' && (risk.severity === 'high' || risk.severity === 'critical')) issues.push(warning('material_risk_open', 'risk', risk.id, `Material risk ${risk.id} remains open.`));
  }

  if (capability === 'financial_valuation' && !data.scenarios.some((scenario) => scenario.status === 'reviewed')) {
    issues.push(error('reviewed_valuation_scenario_missing', 'scenario', undefined, 'Financial valuation requires at least one reviewed scenario.'));
  }

  for (const approval of data.approvals) {
    inspectEvidence(approval.evidenceRefs, 'approval', approval.id, workspace, issues);
    if (approval.decision === 'approved' && !hasActiveDirectEvidence(approval.evidenceRefs, sourceById)) {
      issues.push(error('approval_direct_evidence_missing', 'approval', approval.id, `Approved decision ${approval.id} requires active direct investment evidence.`));
    }
  }
  if (capability === 'transaction_decision' && !data.approvals.some((approval) => approval.decision === 'approved')) {
    issues.push(error('approved_decision_missing', 'approval', undefined, 'Transaction decision requires an approved investment decision.'));
  }

  const readiness = issues.some((issue) => issue.severity === 'error') ? 'not_ready' : issues.length ? 'needs_review' : 'ready';
  return {
    schemaVersion: 1, capability, projectId: workspace.project.id, coreRevision: workspace.revision,
    generatedAt, readiness,
    summary: {
      findings: data.findings.length,
      verifiedFindings: data.findings.filter((finding) => finding.status === 'verified' && finding.confidence === 'confirmed').length,
      assumptions: data.assumptions.length,
      verifiedMetrics: data.metrics.filter((metric) => metric.status === 'verified').length,
      openRisks: data.risks.filter((risk) => risk.status === 'open').length,
      approvedDecisions: data.approvals.filter((approval) => approval.decision === 'approved').length,
    },
    issues,
  };

  function inspectEvidence(
    refs: InvestmentEvidenceRef[], entityType: string, entityId: string,
    currentWorkspace: InvestmentWorkspace, currentIssues: InvestmentCapabilityAuditIssue[],
  ): void {
    if (refs.length === 0) currentIssues.push(error('evidence_missing', entityType, entityId, `${entityType} ${entityId} has no evidence.`));
    for (const reference of refs) {
      if (reference.kind === 'source') {
        if (sourceById.get(reference.sourceId)?.status !== 'active') currentIssues.push(error('source_evidence_invalid', entityType, entityId, `Source ${reference.sourceId} is missing or inactive.`));
      } else {
        const snapshot = snapshotById.get(reference.snapshotId);
        if (!snapshot || snapshot.approvalState !== 'approved' || !snapshot.userConfirmed) currentIssues.push(error('snapshot_evidence_invalid', entityType, entityId, `Snapshot ${reference.snapshotId} is missing or unverified.`));
      }
    }
    void currentWorkspace;
  }
}

function hasActiveDirectEvidence(refs: InvestmentEvidenceRef[], sources: Map<string, InvestmentWorkspace['sources'][number]>): boolean {
  return refs.some((reference) => reference.kind === 'source' && sources.get(reference.sourceId)?.status === 'active');
}

function error(code: string, entityType: string, entityId: string | undefined, message: string): InvestmentCapabilityAuditIssue {
  return { code, severity: 'error', entityType, entityId, message };
}

function warning(code: string, entityType: string, entityId: string | undefined, message: string): InvestmentCapabilityAuditIssue {
  return { code, severity: 'warning', entityType, entityId, message };
}
