import type { TenderSourceLocator, TenderWorkspace } from '../../types.ts';
import { parseTenderBoqReconciliationData } from '../boq/schema.ts';
import type { TenderBoqReconciliationData } from '../boq/types.ts';
import type { TenderCapabilityAuditIssue } from '../types.ts';
import { compareDecimalStrings, decimalStringsEqual, multiplyDecimalStrings, sumDecimalStrings } from '../cost/decimal.ts';
import { inspectTenderBoqItemQualityByStandard } from './quality.ts';
import { parseTenderBoqFiveStepPricingData } from './schema.ts';
import { remapBoqPricingIssueSeverity } from './severity.ts';
import type { TenderBoqFiveStepItemBuildUp, TenderBoqFiveStepPricingAudit, TenderBoqFiveStepPricingData } from './types.ts';

const STEP_KEYS: Array<keyof TenderBoqFiveStepItemBuildUp['steps']> = [
  'scopeQuantity',
  'methodProductivity',
  'resourceConsumption',
  'sourcedRatesDirectCost',
  'reconciliationRisk',
];

export function auditTenderBoqFiveStepPricing(
  workspace: TenderWorkspace,
  boqValue: TenderBoqReconciliationData | unknown,
  value: TenderBoqFiveStepPricingData | unknown,
  generatedAt = new Date().toISOString(),
): TenderBoqFiveStepPricingAudit {
  const boq = parseTenderBoqReconciliationData(boqValue);
  const data = parseTenderBoqFiveStepPricingData(value);
  const issues: TenderCapabilityAuditIssue[] = [];
  const documentById = new Map(workspace.documents.map((document) => [document.id, document]));
  const itemIds = new Set(boq.items.map((item) => item.id));
  const itemById = new Map(boq.items.map((item) => [item.id, item]));
  const scopeLinkByItemId = new Map(boq.scopeLinks.map((link) => [link.boqItemId, link]));
  const buildUpByItemId = new Map(data.itemBuildUps.map((buildUp) => [buildUp.boqItemId, buildUp]));
  const completeItemIds = new Set<string>();

  if (boq.items.length === 0 || data.itemBuildUps.length === 0) {
    issues.push({
      code: 'boq_pricing_items_empty',
      severity: 'error',
      entityType: 'boq_pricing',
      message: 'BOQ five-step pricing requires reconciled BOQ items and at least one item build-up.',
    });
  }

  if (workspace.project.currency && workspace.project.currency !== data.currency) {
    issues.push({
      code: 'boq_pricing_currency_mismatch',
      severity: 'error',
      entityType: 'boq_pricing',
      message: `BOQ pricing currency ${data.currency} does not match project currency ${workspace.project.currency}.`,
    });
  }
  if (!data.pricingStandard?.trim()) {
    issues.push({
      code: 'boq_pricing_standard_missing',
      severity: 'error',
      entityType: 'boq_pricing',
      message: 'BOQ pricing must declare a pricingStandard from the project boundary.',
    });
  }
  const isC51 = data.pricingStandard === 'c51_pure_direct_cost_v1';
  if (isC51 && data.vatTreatment !== 'exclusive') {
    issues.push({
      code: 'boq_pricing_vat_basis_invalid',
      severity: 'error',
      entityType: 'boq_pricing',
      message: 'C5.1 BOQ direct-cost rates must be VAT exclusive.',
    });
  }
  if (isC51 && data.indirectCostPolicy !== 'excluded_from_item_direct_cost') {
    issues.push({
      code: 'boq_pricing_indirect_cost_policy_invalid',
      severity: 'error',
      entityType: 'boq_pricing',
      message: 'Indirect cost and profit must be excluded from item pure direct cost and handled downstream.',
    });
  }
  if (!isC51 && data.pricingStandard) {
    issues.push({
      code: 'boq_pricing_standard_generic',
      severity: 'warning',
      entityType: 'boq_pricing',
      message: `Using non-C5.1 pricingStandard ${data.pricingStandard}; COTO clause ritual is not enforced.`,
    });
  }
  if (data.pricingStatus === 'blocked') {
    issues.push({ code: 'boq_pricing_blocked', severity: 'error', entityType: 'boq_pricing', message: 'BOQ five-step pricing is blocked.' });
  } else if (data.pricingStatus !== 'reviewed') {
    issues.push({ code: 'boq_pricing_not_reviewed', severity: 'warning', entityType: 'boq_pricing', message: 'BOQ five-step pricing has not been reviewed.' });
  }

  for (const item of boq.items) {
    if (!buildUpByItemId.has(item.id)) {
      issues.push({
        code: 'boq_pricing_build_up_missing',
        severity: 'error',
        entityType: 'boq_item',
        entityId: item.id,
        message: `BOQ item ${item.id} has no five-step pricing build-up.`,
      });
    }
  }

  for (const buildUp of data.itemBuildUps) {
    const itemIssueStart = issues.length;
    if (!itemIds.has(buildUp.boqItemId)) {
      issues.push({
        code: 'boq_pricing_unknown_item',
        severity: 'error',
        entityType: 'boq_pricing_build_up',
        entityId: buildUp.boqItemId,
        message: `BOQ pricing build-up references missing item ${buildUp.boqItemId}.`,
      });
    }

    const boqItem = itemById.get(buildUp.boqItemId);
    if (boqItem) {
      for (const qualityIssue of inspectTenderBoqItemQualityByStandard(
        data.pricingStandard,
        boqItem,
        scopeLinkByItemId.get(buildUp.boqItemId),
        buildUp,
      )) {
        issues.push({
          ...qualityIssue,
          entityType: 'boq_pricing_build_up',
          entityId: buildUp.boqItemId,
        });
      }
    }
    if (buildUp.status === 'blocked') {
      issues.push({
        code: 'boq_pricing_item_blocked',
        severity: 'error',
        entityType: 'boq_pricing_build_up',
        entityId: buildUp.boqItemId,
        message: `BOQ pricing build-up ${buildUp.boqItemId} is blocked.`,
      });
    } else if (buildUp.status !== 'reviewed') {
      issues.push({
        code: 'boq_pricing_item_not_reviewed',
        severity: 'warning',
        entityType: 'boq_pricing_build_up',
        entityId: buildUp.boqItemId,
        message: `BOQ pricing build-up ${buildUp.boqItemId} has not been reviewed.`,
      });
    }

    for (const stepKey of STEP_KEYS) {
      const step = buildUp.steps[stepKey];
      if (!step.narrative.trim() || step.sourceRefs.length === 0) {
        issues.push({
          code: 'boq_pricing_step_incomplete',
          severity: 'error',
          entityType: 'boq_pricing_step',
          entityId: `${buildUp.boqItemId}:${stepKey}`,
          message: `BOQ item ${buildUp.boqItemId} has incomplete ${stepKey} step.`,
        });
      }
      step.sourceRefs.forEach((source) => inspectSource(documentById, source, issues, buildUp.boqItemId));
    }

    for (const resource of buildUp.resourceConsumptions) {
      if (resource.assumptionStatus === 'unverified') {
        issues.push({
          code: 'boq_pricing_resource_unverified',
          severity: 'warning',
          entityType: 'boq_resource_consumption',
          entityId: resource.id,
          message: `Resource consumption ${resource.id} is unverified.`,
        });
      }
      resource.sourceRefs?.forEach((source) => inspectSource(documentById, source, issues, resource.id));
    }

    const planningBasis = buildUp.planningBasis;
    if (!planningBasis) {
      issues.push({
        code: 'boq_pricing_planning_basis_missing',
        severity: 'error',
        entityType: 'boq_pricing_build_up',
        entityId: buildUp.boqItemId,
        message: `BOQ item ${buildUp.boqItemId} has no calculable production and duration basis.`,
      });
    } else {
      if (boqItem && normalizeUnit(planningBasis.quantityUnit) !== normalizeUnit(boqItem.unit)) {
        issues.push({
          code: 'boq_pricing_planning_unit_mismatch',
          severity: 'error',
          entityType: 'boq_pricing_build_up',
          entityId: buildUp.boqItemId,
          message: `BOQ item ${buildUp.boqItemId} planning unit ${planningBasis.quantityUnit} does not match BOQ unit ${boqItem.unit}.`,
        });
      }
      if (planningBasis.sourceRefs.length === 0) {
        issues.push({
          code: 'boq_pricing_planning_source_missing',
          severity: 'error',
          entityType: 'boq_pricing_build_up',
          entityId: buildUp.boqItemId,
          message: `BOQ item ${buildUp.boqItemId} planning basis has no source reference.`,
        });
      }
      planningBasis.sourceRefs.forEach((source) => inspectSource(documentById, source, issues, buildUp.boqItemId));
      if (planningBasis.assumptionStatus === 'unverified') {
        issues.push({
          code: 'boq_pricing_planning_unverified',
          severity: 'warning',
          entityType: 'boq_pricing_build_up',
          entityId: buildUp.boqItemId,
          message: `BOQ item ${buildUp.boqItemId} planning basis is unverified.`,
        });
      }
      if (boqItem && boqItem.quantity) {
        const capacity = multiplyDecimalStrings(planningBasis.productionRate, planningBasis.duration);
        if (compareDecimalStrings(capacity, boqItem.quantity) < 0) {
          issues.push({
            code: 'boq_pricing_duration_capacity_shortfall',
            severity: 'error',
            entityType: 'boq_pricing_build_up',
            entityId: buildUp.boqItemId,
            message: `BOQ item ${buildUp.boqItemId} planned capacity ${capacity} ${planningBasis.quantityUnit} is below quantity ${boqItem.quantity}.`,
          });
        }
      } else if (boqItem) {
        issues.push({
          code: 'boq_pricing_quantity_missing_for_planning',
          severity: 'error',
          entityType: 'boq_pricing_build_up',
          entityId: buildUp.boqItemId,
          message: `BOQ item ${buildUp.boqItemId} has no quantity for duration validation.`,
        });
      }
    }

    const cashFlow = buildUp.initialCashFlow;
    if (cashFlow && cashFlow.length > 0) {
      const itemDirectCost = buildUp.directCostSummary?.itemDirectCost ?? buildUp.directCost;
      for (const allocation of cashFlow) {
        if (planningBasis && allocation.activityId !== planningBasis.activityId) {
          issues.push({
            code: 'boq_pricing_cash_flow_activity_mismatch',
            severity: 'error',
            entityType: 'boq_cash_flow_allocation',
            entityId: `${buildUp.boqItemId}:${allocation.period}`,
            message: `BOQ item ${buildUp.boqItemId} cash-flow activity ${allocation.activityId} does not match ${planningBasis.activityId}.`,
          });
        }
        if (allocation.sourceRefs.length === 0) {
          issues.push({
            code: 'boq_pricing_cash_flow_source_missing',
            severity: 'error',
            entityType: 'boq_cash_flow_allocation',
            entityId: `${buildUp.boqItemId}:${allocation.period}`,
            message: `BOQ item ${buildUp.boqItemId} cash-flow period ${allocation.period} has no source reference.`,
          });
        }
        allocation.sourceRefs.forEach((source) => inspectSource(documentById, source, issues, buildUp.boqItemId));
        if (allocation.assumptionStatus === 'unverified') {
          issues.push({
            code: 'boq_pricing_cash_flow_unverified',
            severity: 'warning',
            entityType: 'boq_cash_flow_allocation',
            entityId: `${buildUp.boqItemId}:${allocation.period}`,
            message: `BOQ item ${buildUp.boqItemId} cash-flow period ${allocation.period} is unverified.`,
          });
        }
        const expectedAmount = multiplyDecimalStrings(itemDirectCost, allocation.weight);
        if (!decimalStringsEqual(expectedAmount, allocation.amount)) {
          issues.push({
            code: 'boq_pricing_cash_flow_allocation_mismatch',
            severity: 'error',
            entityType: 'boq_cash_flow_allocation',
            entityId: `${buildUp.boqItemId}:${allocation.period}`,
            message: `BOQ item ${buildUp.boqItemId} cash-flow amount ${allocation.amount} does not equal weighted amount ${expectedAmount}.`,
          });
        }
      }
      if (!decimalStringsEqual(sumDecimalStrings(cashFlow.map((allocation) => allocation.weight)), '1')) {
        issues.push({
          code: 'boq_pricing_cash_flow_weight_mismatch',
          severity: 'error',
          entityType: 'boq_pricing_build_up',
          entityId: buildUp.boqItemId,
          message: `BOQ item ${buildUp.boqItemId} cash-flow allocation weights must total 1.`,
        });
      }
      if (!decimalStringsEqual(sumDecimalStrings(cashFlow.map((allocation) => allocation.amount)), itemDirectCost)) {
        issues.push({
          code: 'boq_pricing_cash_flow_amount_mismatch',
          severity: 'error',
          entityType: 'boq_pricing_build_up',
          entityId: buildUp.boqItemId,
          message: `BOQ item ${buildUp.boqItemId} cash-flow allocation amounts must total item direct cost ${itemDirectCost}.`,
        });
      }
    }

    const amounts: string[] = [];
    for (const component of buildUp.costComponents) {
      if (component.assumptionStatus === 'sourced' && !component.rateSourceRef) {
        issues.push({
          code: 'boq_pricing_rate_source_missing',
          severity: 'error',
          entityType: 'boq_cost_component',
          entityId: component.id,
          message: `Sourced cost component ${component.id} has no rate source reference.`,
        });
      }
      if (component.assumptionStatus === 'unverified') {
        issues.push({
          code: 'boq_pricing_component_unverified',
          severity: 'warning',
          entityType: 'boq_cost_component',
          entityId: component.id,
          message: `Cost component ${component.id} is unverified.`,
        });
      }
      if (component.rateSourceRef) inspectSource(documentById, component.rateSourceRef, issues, component.id);
      const calculated = multiplyDecimalStrings(component.quantity, component.rate);
      amounts.push(component.amount);
      if (!decimalStringsEqual(calculated, component.amount)) {
        issues.push({
          code: 'boq_pricing_component_total_mismatch',
          severity: 'error',
          entityType: 'boq_cost_component',
          entityId: component.id,
          message: `Cost component ${component.id} amount ${component.amount} does not equal ${calculated}.`,
        });
      }
    }

    const calculatedDirectCost = sumDecimalStrings(amounts);
    if (!decimalStringsEqual(calculatedDirectCost, buildUp.directCost)) {
      issues.push({
        code: 'boq_pricing_direct_cost_mismatch',
        severity: 'error',
        entityType: 'boq_pricing_build_up',
        entityId: buildUp.boqItemId,
        message: `BOQ item ${buildUp.boqItemId} direct cost ${buildUp.directCost} does not equal ${calculatedDirectCost}.`,
      });
    }

    buildUp.itemIdentity && inspectSource(documentById, buildUp.itemIdentity.sourceRef, issues, buildUp.boqItemId);
    buildUp.scopeBasis?.specificationRefs.forEach((source) => inspectSource(documentById, source, issues, buildUp.boqItemId));
    buildUp.scopeBasis?.measurementRuleRefs.forEach((source) => inspectSource(documentById, source, issues, buildUp.boqItemId));
    buildUp.productivityBasis?.crew.forEach((crew) => crew.sourceRefs.forEach((source) => inspectSource(documentById, source, issues, crew.id)));
    buildUp.productivityBasis?.scenarios.forEach((scenario) => scenario.sourceRefs.forEach((source) => inspectSource(documentById, source, issues, buildUp.boqItemId)));
    buildUp.riskScenarios?.forEach((risk) => {
      risk.sourceRefs.forEach((source) => inspectSource(documentById, source, issues, risk.id));
      if (risk.assumptionStatus === 'unverified') {
        issues.push({
          code: 'boq_pricing_risk_unverified',
          severity: 'warning',
          entityType: 'boq_pricing_risk',
          entityId: risk.id,
          message: `BOQ item ${buildUp.boqItemId} risk scenario ${risk.id} is unverified.`,
        });
      }
    });

    if (buildUp.status === 'reviewed' && !issues.slice(itemIssueStart).some((issue) => remapBoqPricingIssueSeverity(issue.code, issue.severity) === 'error')) {
      completeItemIds.add(buildUp.boqItemId);
    }
  }

  for (const assumption of data.assumptions) {
    if (assumption.status === 'rejected') {
      issues.push({
        code: 'boq_pricing_assumption_rejected',
        severity: 'error',
        entityType: 'boq_pricing_assumption',
        entityId: assumption.id,
        message: `BOQ pricing assumption ${assumption.id} is rejected.`,
      });
    } else if (assumption.status === 'unverified') {
      issues.push({
        code: 'boq_pricing_assumption_unverified',
        severity: 'warning',
        entityType: 'boq_pricing_assumption',
        entityId: assumption.id,
        message: `BOQ pricing assumption ${assumption.id} is unverified.`,
      });
    }
    assumption.sourceRefs.forEach((source) => inspectSource(documentById, source, issues, assumption.id));
  }

  const remappedIssues = issues.map((issue) => ({
    ...issue,
    severity: remapBoqPricingIssueSeverity(issue.code, issue.severity),
  }));

  const readiness = remappedIssues.some((issue) => issue.severity === 'error')
    ? 'not_ready'
    : remappedIssues.length > 0
      ? 'needs_review'
      : 'ready';

  return {
    schemaVersion: 1,
    capability: 'boq_five_step_pricing',
    projectId: workspace.project.id,
    coreRevision: workspace.revision,
    generatedAt,
    readiness,
    summary: {
      items: boq.items.length,
      completeItems: completeItemIds.size,
      blockedItems: data.itemBuildUps.filter((buildUp) => buildUp.status === 'blocked').length,
      unverifiedComponents: data.itemBuildUps.reduce(
        (sum, buildUp) => sum + buildUp.costComponents.filter((component) => component.assumptionStatus === 'unverified').length,
        0,
      ),
      estimatedUnitRateSum: sumDecimalStrings(data.itemBuildUps.map((buildUp) => buildUp.directCost)),
      estimatedDirectCost: sumDecimalStrings(data.itemBuildUps.map((buildUp) => buildUp.directCostSummary?.itemDirectCost ?? '0')),
    },
    issues: remappedIssues,
  };
}

function normalizeUnit(value: string): string {
  return value.normalize('NFKC').trim().toLowerCase().replace(/\s+/g, '').replace(/³/g, '3').replace(/²/g, '2');
}

function inspectSource(
  documentById: Map<string, { status: string }>,
  source: TenderSourceLocator,
  issues: TenderCapabilityAuditIssue[],
  entityId: string,
): void {
  const document = documentById.get(source.documentId);
  if (!document) {
    issues.push({
      code: 'boq_pricing_source_missing',
      severity: 'error',
      entityType: 'boq_pricing_source',
      entityId,
      message: `Source document ${source.documentId} is not registered.`,
    });
  } else if (document.status !== 'active') {
    issues.push({
      code: 'boq_pricing_source_inactive',
      severity: document.status === 'withdrawn' ? 'error' : 'warning',
      entityType: 'boq_pricing_source',
      entityId,
      message: `Source document ${source.documentId} is ${document.status}.`,
    });
  }
}
