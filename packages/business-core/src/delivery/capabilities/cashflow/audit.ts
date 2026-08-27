import type { DeliveryEvidenceRef, DeliveryWorkspace } from '../../types.ts';
import { parseDeliveryWorkspace } from '../../schema.ts';
import type { DeliveryProgrammeProgressData } from '../programme-progress/types.ts';
import { parseDeliveryProgrammeProgressData } from '../programme-progress/schema.ts';
import type { DeliveryCostCommercialData } from '../cost-commercial/types.ts';
import { parseDeliveryCostCommercialData } from '../cost-commercial/schema.ts';
import { deliveryDecimalStringsEqual, sumDeliveryDecimalStrings } from '../cost-commercial/decimal.ts';
import type { DeliveryCapabilityAuditIssue } from '../types.ts';
import { parseDeliveryCashflowData } from './schema.ts';
import type { DeliveryCashflowAudit, DeliveryCashflowData, DeliveryCashPosition } from './types.ts';

export function auditDeliveryCashflow(
  workspaceValue: DeliveryWorkspace | unknown,
  programmeValue: DeliveryProgrammeProgressData | unknown,
  costValue: DeliveryCostCommercialData | unknown,
  value: DeliveryCashflowData | unknown,
  generatedAt = new Date().toISOString(),
): DeliveryCashflowAudit {
  const workspace = parseDeliveryWorkspace(workspaceValue);
  const programme = parseDeliveryProgrammeProgressData(programmeValue);
  const costs = parseDeliveryCostCommercialData(costValue);
  const data = parseDeliveryCashflowData(value);
  const issues: DeliveryCapabilityAuditIssue[] = [];
  const sourceById = new Map(workspace.sources.map((source) => [source.id, source]));
  const snapshotById = new Map(workspace.snapshots.map((snapshot) => [snapshot.id, snapshot]));
  const periods = [...data.periods].sort((left, right) => left.period.localeCompare(right.period));

  if (workspace.project.dataDate && workspace.project.dataDate !== data.dataDate) {
    issues.push(issue('cashflow_data_date_mismatch', 'capability', undefined, `Cash-flow data date ${data.dataDate} does not match project data date ${workspace.project.dataDate}.`));
  }
  if (workspace.project.currency && workspace.project.currency !== data.currency) {
    issues.push(issue('cashflow_currency_mismatch', 'capability', undefined, `Cash-flow currency ${data.currency} does not match project currency ${workspace.project.currency}.`));
  }
  if (costs.currency !== data.currency) issues.push(issue('cashflow_cost_currency_mismatch', 'capability', undefined, `Cash-flow currency ${data.currency} does not match cost currency ${costs.currency}.`));
  if (data.controlStatus === 'blocked') issues.push(issue('cashflow_blocked', 'capability', undefined, 'Cash-flow control is blocked.'));
  if (data.controlStatus === 'draft') issues.push(warning('cashflow_not_reviewed', 'capability', undefined, 'Cash-flow control has not been reviewed.'));

  const periodIds = new Set<string>();
  for (const period of periods) {
    if (periodIds.has(period.period)) issues.push(issue('cashflow_period_duplicate', 'period', period.period, `Cash-flow period ${period.period} is duplicated.`));
    periodIds.add(period.period);
    inspectEvidence(period.evidenceRefs, period.period, sourceById, snapshotById, issues);
    if (period.status === 'reviewed' && !hasDirectEvidence(period.evidenceRefs, sourceById)) {
      issues.push(issue('cashflow_direct_evidence_missing', 'period', period.period, `Reviewed cash-flow period ${period.period} has no active direct implementation evidence.`));
    }
    if (period.status === 'blocked') issues.push(issue('cashflow_period_blocked', 'period', period.period, `Cash-flow period ${period.period} is blocked.`));
    if (period.status === 'draft') issues.push(warning('cashflow_period_not_reviewed', 'period', period.period, `Cash-flow period ${period.period} is still draft.`));
    for (const [basis, position] of Object.entries({ planned: period.planned, actual: period.actual, forecast: period.forecast })) {
      if (!positionReconciles(position)) issues.push(issue('cashflow_period_reconciliation_mismatch', 'period', period.period, `${basis} cash-flow for ${period.period} does not reconcile opening plus inflow to outflow plus closing.`));
    }
  }

  for (let index = 1; index < periods.length; index += 1) {
    const previous = periods[index - 1]!;
    const current = periods[index]!;
    for (const basis of ['planned', 'actual', 'forecast'] as const) {
      if (!deliveryDecimalStringsEqual(previous[basis].closingBalance, current[basis].openingBalance)) {
        issues.push(issue('cashflow_rolling_balance_mismatch', 'period', current.period, `${basis} opening balance for ${current.period} does not equal the previous closing balance.`));
      }
    }
  }

  const plannedOutflow = sumDeliveryDecimalStrings(periods.map((period) => period.planned.outflow));
  const currentBudget = sumDeliveryDecimalStrings(costs.budgetLines.map((line) => line.currentBudget));
  if (!deliveryDecimalStringsEqual(plannedOutflow, currentBudget)) {
    issues.push(issue('cashflow_budget_reconciliation_mismatch', 'capability', undefined, 'Total planned cash outflow does not reconcile to current budget.'));
  }
  const forecastOutflow = sumDeliveryDecimalStrings(periods.map((period) => period.forecast.outflow));
  const estimateAtCompletion = sumDeliveryDecimalStrings(costs.forecasts.map((forecast) => forecast.estimateAtCompletion));
  if (!deliveryDecimalStringsEqual(forecastOutflow, estimateAtCompletion)) {
    issues.push(issue('cashflow_eac_reconciliation_mismatch', 'capability', undefined, 'Total forecast cash outflow does not reconcile to estimate-at-completion.'));
  }

  const requiredProgrammePeriods = new Set<string>();
  for (const activity of programme.activities) {
    if (activity.status === 'completed') continue;
    for (const period of monthsBetween(activity.forecastStart, activity.forecastFinish)) requiredProgrammePeriods.add(period);
  }
  for (const period of requiredProgrammePeriods) {
    if (!periodIds.has(period)) issues.push(issue('cashflow_programme_period_missing', 'period', period, `No cash-flow period covers active programme month ${period}.`));
  }

  for (const constraint of data.fundingConstraints) {
    inspectEvidence(constraint.evidenceRefs, constraint.id, sourceById, snapshotById, issues);
    if ((constraint.status === 'open' || constraint.status === 'blocked') && !hasDirectEvidence(constraint.evidenceRefs, sourceById)) {
      issues.push(issue('funding_constraint_direct_evidence_missing', 'funding_constraint', constraint.id, `Funding constraint ${constraint.id} has no active direct implementation evidence.`));
    }
    if (constraint.status === 'blocked') issues.push(issue('funding_constraint_blocked', 'funding_constraint', constraint.id, `Funding constraint ${constraint.id} is blocked.`));
    else if (constraint.status === 'open' && constraint.dueDate <= data.dataDate) issues.push(issue('funding_constraint_overdue', 'funding_constraint', constraint.id, `Funding constraint ${constraint.id} is open at or beyond its due date.`));
    else if (constraint.status === 'open') issues.push(warning('funding_constraint_open', 'funding_constraint', constraint.id, `Funding constraint ${constraint.id} remains open.`));
  }

  const readiness = issues.some((entry) => entry.severity === 'error') ? 'not_ready' : issues.length ? 'needs_review' : 'ready';
  return {
    schemaVersion: 1,
    capability: 'cashflow',
    projectId: workspace.project.id,
    coreRevision: workspace.revision,
    generatedAt,
    readiness,
    summary: {
      currency: data.currency,
      periods: periods.length,
      plannedInflow: sumDeliveryDecimalStrings(periods.map((period) => period.planned.inflow)),
      plannedOutflow,
      actualInflow: sumDeliveryDecimalStrings(periods.map((period) => period.actual.inflow)),
      actualOutflow: sumDeliveryDecimalStrings(periods.map((period) => period.actual.outflow)),
      forecastInflow: sumDeliveryDecimalStrings(periods.map((period) => period.forecast.inflow)),
      forecastOutflow,
      endingForecastBalance: periods.at(-1)?.forecast.closingBalance ?? '0',
      openFundingConstraints: data.fundingConstraints.filter((constraint) => constraint.status === 'open' || constraint.status === 'blocked').length,
    },
    issues,
  };
}

function positionReconciles(position: DeliveryCashPosition): boolean {
  return deliveryDecimalStringsEqual(
    sumDeliveryDecimalStrings([position.openingBalance, position.inflow]),
    sumDeliveryDecimalStrings([position.outflow, position.closingBalance]),
  );
}

function monthsBetween(start: string, finish: string): string[] {
  const current = new Date(`${start.slice(0, 7)}-01T00:00:00Z`);
  const end = new Date(`${finish.slice(0, 7)}-01T00:00:00Z`);
  const periods: string[] = [];
  while (current <= end) {
    periods.push(`${current.getUTCFullYear()}-${String(current.getUTCMonth() + 1).padStart(2, '0')}`);
    current.setUTCMonth(current.getUTCMonth() + 1);
  }
  return periods;
}

function inspectEvidence(
  references: DeliveryEvidenceRef[], entityId: string,
  sources: Map<string, DeliveryWorkspace['sources'][number]>,
  snapshots: Map<string, DeliveryWorkspace['snapshots'][number]>,
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

function issue(code: string, entityType: string, entityId: string | undefined, message: string): DeliveryCapabilityAuditIssue {
  return { code, severity: 'error', entityType, entityId, message };
}

function warning(code: string, entityType: string, entityId: string | undefined, message: string): DeliveryCapabilityAuditIssue {
  return { code, severity: 'warning', entityType, entityId, message };
}
