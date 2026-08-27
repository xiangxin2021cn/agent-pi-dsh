import type { DeliveryEvidenceRef, DeliveryWorkspace } from '../../types.ts';
import { parseDeliveryWorkspace } from '../../schema.ts';
import type { DeliveryContractScopeData } from '../contract-scope/types.ts';
import { parseDeliveryContractScopeData } from '../contract-scope/schema.ts';
import type { DeliveryResourceProcurementData } from '../resource-procurement/types.ts';
import { parseDeliveryResourceProcurementData } from '../resource-procurement/schema.ts';
import type { DeliveryCapabilityAuditIssue } from '../types.ts';
import { deliveryDecimalStringsEqual, sumDeliveryDecimalStrings } from './decimal.ts';
import { parseDeliveryCostCommercialData } from './schema.ts';
import type { DeliveryCostCommercialAudit, DeliveryCostCommercialData, DeliveryCostTransaction } from './types.ts';

export function auditDeliveryCostCommercial(
  workspaceValue: DeliveryWorkspace | unknown,
  contractScopeValue: DeliveryContractScopeData | unknown,
  resourceValue: DeliveryResourceProcurementData | unknown,
  value: DeliveryCostCommercialData | unknown,
  generatedAt = new Date().toISOString(),
): DeliveryCostCommercialAudit {
  const workspace = parseDeliveryWorkspace(workspaceValue);
  const contractScope = parseDeliveryContractScopeData(contractScopeValue);
  const resources = parseDeliveryResourceProcurementData(resourceValue);
  const data = parseDeliveryCostCommercialData(value);
  const issues: DeliveryCapabilityAuditIssue[] = [];
  const sourceById = new Map(workspace.sources.map((source) => [source.id, source]));
  const snapshotById = new Map(workspace.snapshots.map((snapshot) => [snapshot.id, snapshot]));
  const scopeIds = new Set(contractScope.scopeItems.map((item) => item.id));
  const activityIds = new Set(resources.allocations.map((allocation) => allocation.activityId));
  const costCodeById = new Map(data.budgetLines.map((line) => [line.id, line]));

  if (!workspace.baselines.some((baseline) => baseline.kind === 'budget' && baseline.status === 'approved')) {
    issues.push(issue('approved_budget_baseline_missing', 'baseline', undefined, 'No approved local budget baseline is registered.'));
  }
  if (workspace.project.dataDate && workspace.project.dataDate !== data.dataDate) {
    issues.push(issue('cost_data_date_mismatch', 'capability', undefined, `Cost data date ${data.dataDate} does not match project data date ${workspace.project.dataDate}.`));
  }
  if (workspace.project.currency && workspace.project.currency !== data.currency) {
    issues.push(issue('cost_currency_mismatch', 'capability', undefined, `Cost currency ${data.currency} does not match project currency ${workspace.project.currency}.`));
  }
  if (data.controlStatus === 'blocked') issues.push(issue('cost_commercial_blocked', 'capability', undefined, 'Cost and commercial control is blocked.'));
  if (data.controlStatus === 'draft') issues.push(warning('cost_commercial_not_reviewed', 'capability', undefined, 'Cost and commercial control has not been reviewed.'));

  const approvedVariationsByCode = groupAmounts(
    data.variations.filter((item) => item.status === 'approved'),
    (item) => item.costCodeId,
    (item) => item.amount,
  );
  for (const line of data.budgetLines) {
    if (!scopeIds.has(line.scopeItemId)) issues.push(issue('budget_scope_missing', 'budget_line', line.id, `Budget line ${line.id} references missing scope item ${line.scopeItemId}.`));
    for (const activityId of line.activityIds) if (!activityIds.has(activityId)) issues.push(issue('budget_activity_missing', 'budget_line', line.id, `Budget line ${line.id} references missing resourced activity ${activityId}.`));
    inspectEvidence(line.evidenceRefs, line.id, sourceById, snapshotById, issues);
    if (line.status === 'reviewed' && !hasDirectEvidence(line.evidenceRefs, sourceById)) issues.push(issue('budget_direct_evidence_missing', 'budget_line', line.id, `Reviewed budget line ${line.id} has no active direct implementation evidence.`));
    if (!deliveryDecimalStringsEqual(sumDeliveryDecimalStrings([line.approvedBudget, line.approvedVariationAmount]), line.currentBudget)) {
      issues.push(issue('budget_reconciliation_mismatch', 'budget_line', line.id, `Budget line ${line.id} does not reconcile approved budget plus approved variations to current budget.`));
    }
    const approvedVariations = approvedVariationsByCode.get(line.id) ?? '0';
    if (!deliveryDecimalStringsEqual(approvedVariations, line.approvedVariationAmount)) {
      issues.push(issue('approved_variation_reconciliation_mismatch', 'budget_line', line.id, `Budget line ${line.id} approved variations do not reconcile to the variation register.`));
    }
    if (line.status === 'blocked') issues.push(issue('budget_line_blocked', 'budget_line', line.id, `Budget line ${line.id} is blocked.`));
    if (line.status === 'draft') issues.push(warning('budget_line_not_reviewed', 'budget_line', line.id, `Budget line ${line.id} is still draft.`));
  }

  for (const scopeItem of contractScope.scopeItems) {
    if (scopeItem.inclusionStatus === 'included' && scopeItem.status === 'reviewed' && !data.budgetLines.some((line) => line.scopeItemId === scopeItem.id)) {
      issues.push(issue('scope_cost_code_missing', 'scope_item', scopeItem.id, `Reviewed scope item ${scopeItem.id} has no cost code.`));
    }
  }

  for (const commitment of data.commitments) {
    checkCostCode(commitment.costCodeId, commitment.id, 'commitment', costCodeById, issues);
    inspectEvidence(commitment.evidenceRefs, commitment.id, sourceById, snapshotById, issues);
    if (commitment.status === 'confirmed' && !hasDirectEvidence(commitment.evidenceRefs, sourceById)) issues.push(issue('commitment_direct_evidence_missing', 'commitment', commitment.id, `Confirmed commitment ${commitment.id} has no active direct implementation evidence.`));
    if (commitment.status === 'blocked') issues.push(issue('commitment_blocked', 'commitment', commitment.id, `Commitment ${commitment.id} is blocked.`));
    if (commitment.status === 'draft') issues.push(warning('commitment_not_confirmed', 'commitment', commitment.id, `Commitment ${commitment.id} is still draft.`));
  }

  auditTransactions(data.actualCosts, 'actual_cost', costCodeById, sourceById, snapshotById, issues);
  auditTransactions(data.accruals, 'accrual', costCodeById, sourceById, snapshotById, issues);
  for (const variation of data.variations) {
    checkCostCode(variation.costCodeId, variation.id, 'variation', costCodeById, issues);
    inspectEvidence(variation.evidenceRefs, variation.id, sourceById, snapshotById, issues);
    if (variation.status === 'approved' && !hasDirectEvidence(variation.evidenceRefs, sourceById)) issues.push(issue('variation_direct_evidence_missing', 'variation', variation.id, `Approved variation ${variation.id} has no active direct implementation evidence.`));
    if (variation.status === 'blocked') issues.push(issue('variation_blocked', 'variation', variation.id, `Variation ${variation.id} is blocked.`));
    if (variation.status === 'pending') issues.push(warning('variation_pending', 'variation', variation.id, `Variation ${variation.id} remains pending.`));
  }

  const actualByCode = groupAmounts(
    data.actualCosts.filter((item) => item.status === 'posted'),
    (item) => item.costCodeId,
    (item) => item.amount,
  );
  const accrualByCode = groupAmounts(
    data.accruals.filter((item) => item.status === 'posted'),
    (item) => item.costCodeId,
    (item) => item.amount,
  );
  const forecastCodes = new Set<string>();
  for (const forecast of data.forecasts) {
    forecastCodes.add(forecast.costCodeId);
    checkCostCode(forecast.costCodeId, forecast.costCodeId, 'forecast', costCodeById, issues);
    inspectEvidence(forecast.evidenceRefs, forecast.costCodeId, sourceById, snapshotById, issues);
    if (forecast.confidence === 'confirmed' && !hasDirectEvidence(forecast.evidenceRefs, sourceById)) issues.push(issue('forecast_direct_evidence_missing', 'forecast', forecast.costCodeId, `Confirmed forecast ${forecast.costCodeId} has no active direct implementation evidence.`));
    const calculatedEac = sumDeliveryDecimalStrings([
      actualByCode.get(forecast.costCodeId) ?? '0',
      accrualByCode.get(forecast.costCodeId) ?? '0',
      forecast.forecastToComplete,
    ]);
    if (!deliveryDecimalStringsEqual(calculatedEac, forecast.estimateAtCompletion)) {
      issues.push(issue('eac_reconciliation_mismatch', 'forecast', forecast.costCodeId, `Forecast ${forecast.costCodeId} does not reconcile actual cost, accruals, and forecast-to-complete to EAC.`));
    }
    if (forecast.confidence !== 'confirmed') issues.push(warning('forecast_not_confirmed', 'forecast', forecast.costCodeId, `Forecast ${forecast.costCodeId} is ${forecast.confidence}.`));
  }
  for (const costCodeId of costCodeById.keys()) if (!forecastCodes.has(costCodeId)) issues.push(issue('cost_forecast_missing', 'budget_line', costCodeId, `Cost code ${costCodeId} has no forecast.`));

  const readiness = issues.some((entry) => entry.severity === 'error') ? 'not_ready' : issues.length ? 'needs_review' : 'ready';
  return {
    schemaVersion: 1,
    capability: 'cost_commercial',
    projectId: workspace.project.id,
    coreRevision: workspace.revision,
    generatedAt,
    readiness,
    summary: {
      currency: data.currency,
      costCodes: data.budgetLines.length,
      currentBudget: sumDeliveryDecimalStrings(data.budgetLines.map((line) => line.currentBudget)),
      commitments: sumDeliveryDecimalStrings(data.commitments.filter((item) => item.status === 'confirmed').map((item) => item.committedAmount)),
      actualCost: sumDeliveryDecimalStrings(data.actualCosts.filter((item) => item.status === 'posted').map((item) => item.amount)),
      accruals: sumDeliveryDecimalStrings(data.accruals.filter((item) => item.status === 'posted').map((item) => item.amount)),
      approvedVariations: sumDeliveryDecimalStrings(data.variations.filter((item) => item.status === 'approved').map((item) => item.amount)),
      forecastToComplete: sumDeliveryDecimalStrings(data.forecasts.map((item) => item.forecastToComplete)),
      estimateAtCompletion: sumDeliveryDecimalStrings(data.forecasts.map((item) => item.estimateAtCompletion)),
    },
    issues,
  };
}

function auditTransactions(
  transactions: DeliveryCostTransaction[],
  entityType: 'actual_cost' | 'accrual',
  costCodes: Map<string, unknown>,
  sources: Map<string, DeliveryWorkspace['sources'][number]>,
  snapshots: Map<string, DeliveryWorkspace['snapshots'][number]>,
  issues: DeliveryCapabilityAuditIssue[],
): void {
  for (const transaction of transactions) {
    checkCostCode(transaction.costCodeId, transaction.id, entityType, costCodes, issues);
    inspectEvidence(transaction.evidenceRefs, transaction.id, sources, snapshots, issues);
    if (transaction.status === 'posted' && !hasDirectEvidence(transaction.evidenceRefs, sources)) {
      issues.push(issue(`${entityType}_direct_evidence_missing`, entityType, transaction.id, `Posted ${entityType} ${transaction.id} has no active direct implementation evidence.`));
    }
    if (transaction.status === 'draft') issues.push(warning(`${entityType}_not_posted`, entityType, transaction.id, `${entityType} ${transaction.id} is still draft.`));
  }
}

function groupAmounts<T>(
  items: T[],
  groupKey: (item: T) => string,
  amount: (item: T) => string,
): Map<string, string> {
  const grouped = new Map<string, string[]>();
  for (const item of items) {
    const key = groupKey(item);
    const amounts = grouped.get(key) ?? [];
    amounts.push(amount(item));
    grouped.set(key, amounts);
  }
  return new Map([...grouped].map(([key, amounts]) => [key, sumDeliveryDecimalStrings(amounts)]));
}

function checkCostCode(costCodeId: string, entityId: string, entityType: string, costCodes: Map<string, unknown>, issues: DeliveryCapabilityAuditIssue[]): void {
  if (!costCodes.has(costCodeId)) issues.push(issue('cost_code_missing', entityType, entityId, `${entityType} ${entityId} references missing cost code ${costCodeId}.`));
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
