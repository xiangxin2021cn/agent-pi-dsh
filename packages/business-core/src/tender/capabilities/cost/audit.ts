import type { TenderWorkspace } from '../../types.ts';
import { parseTenderBoqReconciliationData } from '../boq/schema.ts';
import { parseTenderScheduleResourceData } from '../schedule/schema.ts';
import type { TenderCapabilityAuditIssue } from '../types.ts';
import { decimalStringsEqual, multiplyDecimalStrings, sumDecimalStrings } from './decimal.ts';
import { parseTenderCostCashFlowData } from './schema.ts';
import type { TenderCostCashFlowAudit, TenderCostCashFlowData } from './types.ts';

export function auditTenderCostCashFlow(
  workspace: TenderWorkspace,
  boqData: unknown,
  scheduleData: unknown,
  value: TenderCostCashFlowData | unknown,
  generatedAt = new Date().toISOString(),
): TenderCostCashFlowAudit {
  const boq = parseTenderBoqReconciliationData(boqData);
  const schedule = parseTenderScheduleResourceData(scheduleData);
  const data = parseTenderCostCashFlowData(value);
  const issues: TenderCapabilityAuditIssue[] = [];
  const documentById = new Map(workspace.documents.map((document) => [document.id, document]));
  const boqItemIds = new Set(boq.items.map((item) => item.id));
  const activityIds = new Set(schedule.activities.map((activity) => activity.id));
  const rateSourceById = new Map(data.rateSources.map((source) => [source.id, source]));
  const scenarioById = new Map(data.scenarios.map((scenario) => [scenario.id, scenario]));
  const componentById = new Map(data.components.map((component) => [component.id, component]));
  const componentUseCount = new Map<string, number>();

  if (data.costStatus === 'blocked') {
    issues.push({ code: 'cost_plan_blocked', severity: 'error', entityType: 'cost_plan', message: 'The tender cost plan is blocked.' });
  } else if (data.costStatus !== 'reviewed') {
    issues.push({ code: 'cost_plan_not_reviewed', severity: 'warning', entityType: 'cost_plan', message: 'The tender cost plan has not been reviewed.' });
  }
  if (workspace.project.currency && workspace.project.currency !== data.currency) {
    issues.push({
      code: 'project_currency_mismatch',
      severity: 'error',
      entityType: 'cost_plan',
      message: `Cost currency ${data.currency} does not match project currency ${workspace.project.currency}.`,
    });
  }

  for (const rateSource of data.rateSources) {
    const document = documentById.get(rateSource.sourceRef.documentId);
    if (!document) {
      issues.push({
        code: 'rate_source_document_missing',
        severity: 'error',
        entityType: 'rate_source',
        entityId: rateSource.id,
        message: `Rate source ${rateSource.id} references missing document ${rateSource.sourceRef.documentId}.`,
      });
    } else if (document.status !== 'active') {
      issues.push({
        code: 'rate_source_document_inactive',
        severity: document.status === 'withdrawn' ? 'error' : 'warning',
        entityType: 'rate_source',
        entityId: rateSource.id,
        message: `Rate source ${rateSource.id} cites ${document.status} document ${document.id}.`,
      });
    }
    if (rateSource.currency !== data.currency) {
      issues.push({
        code: 'rate_source_currency_mismatch',
        severity: 'error',
        entityType: 'rate_source',
        entityId: rateSource.id,
        message: `Rate source ${rateSource.id} currency ${rateSource.currency} does not match ${data.currency}.`,
      });
    }
  }

  for (const component of data.components) {
    if (component.assumptionStatus === 'sourced') {
      if (!component.rateSourceId || !rateSourceById.has(component.rateSourceId)) {
        issues.push({
          code: 'rate_source_missing',
          severity: 'error',
          entityType: 'cost_component',
          entityId: component.id,
          message: `Sourced cost component ${component.id} has no registered rate source.`,
        });
      }
    } else if (component.assumptionStatus === 'scenario') {
      if (!component.scenarioId || !scenarioById.has(component.scenarioId)) {
        issues.push({
          code: 'cost_scenario_missing',
          severity: 'error',
          entityType: 'cost_component',
          entityId: component.id,
          message: `Scenario cost component ${component.id} has no registered scenario.`,
        });
      }
    } else {
      issues.push({
        code: 'cost_component_unverified',
        severity: 'warning',
        entityType: 'cost_component',
        entityId: component.id,
        message: `Cost component ${component.id} is unverified.`,
      });
    }
  }

  const calculatedBuildUpTotals: string[] = [];
  for (const buildUp of data.buildUps) {
    if (!boqItemIds.has(buildUp.boqItemId)) {
      issues.push({
        code: 'cost_boq_item_missing',
        severity: 'error',
        entityType: 'cost_build_up',
        entityId: buildUp.boqItemId,
        message: `Cost build-up references missing BOQ item ${buildUp.boqItemId}.`,
      });
    }
    const amounts: string[] = [];
    for (const componentId of buildUp.componentIds) {
      const component = componentById.get(componentId);
      if (!component) {
        issues.push({
          code: 'cost_component_missing',
          severity: 'error',
          entityType: 'cost_build_up',
          entityId: buildUp.boqItemId,
          message: `Cost build-up ${buildUp.boqItemId} references missing component ${componentId}.`,
        });
        continue;
      }
      componentUseCount.set(componentId, (componentUseCount.get(componentId) ?? 0) + 1);
      amounts.push(multiplyDecimalStrings(component.quantity, component.rate));
    }
    const calculated = sumDecimalStrings(amounts);
    calculatedBuildUpTotals.push(calculated);
    if (!decimalStringsEqual(calculated, buildUp.total)) {
      issues.push({
        code: 'boq_cost_total_mismatch',
        severity: 'error',
        entityType: 'cost_build_up',
        entityId: buildUp.boqItemId,
        message: `Cost build-up ${buildUp.boqItemId} total ${buildUp.total} does not equal calculated ${calculated}.`,
      });
    }
  }

  const buildUpItemIds = new Set(data.buildUps.map((buildUp) => buildUp.boqItemId));
  for (const boqItemId of boqItemIds) {
    if (!buildUpItemIds.has(boqItemId)) {
      issues.push({
        code: 'boq_cost_build_up_missing',
        severity: 'error',
        entityType: 'boq_item',
        entityId: boqItemId,
        message: `BOQ item ${boqItemId} has no cost build-up.`,
      });
    }
  }
  for (const component of data.components) {
    const useCount = componentUseCount.get(component.id) ?? 0;
    if (useCount === 0) {
      issues.push({
        code: 'cost_component_unused',
        severity: 'warning',
        entityType: 'cost_component',
        entityId: component.id,
        message: `Cost component ${component.id} is not used by a BOQ build-up.`,
      });
    } else if (useCount > 1) {
      issues.push({
        code: 'cost_component_reused',
        severity: 'error',
        entityType: 'cost_component',
        entityId: component.id,
        message: `Cost component ${component.id} is reused by multiple BOQ build-ups.`,
      });
    }
  }

  const sortedPeriods = [...data.cashFlow].sort((left, right) => left.period.localeCompare(right.period));
  if (sortedPeriods.some((period, index) => period.period !== data.cashFlow[index]?.period)) {
    issues.push({
      code: 'cashflow_period_order_invalid',
      severity: 'error',
      entityType: 'cashflow',
      message: 'Cash-flow periods must be stored in ascending order.',
    });
  }
  let runningTotal = '0';
  for (const period of data.cashFlow) {
    for (const activityId of period.activityIds) {
      if (!activityIds.has(activityId)) {
        issues.push({
          code: 'cashflow_activity_missing',
          severity: 'error',
          entityType: 'cashflow',
          entityId: period.period,
          message: `Cash-flow period ${period.period} references missing activity ${activityId}.`,
        });
      }
    }
    runningTotal = sumDecimalStrings([runningTotal, period.plannedCost]);
    if (!decimalStringsEqual(runningTotal, period.cumulativeCost)) {
      issues.push({
        code: 'cumulative_cashflow_mismatch',
        severity: 'error',
        entityType: 'cashflow',
        entityId: period.period,
        message: `Cash-flow period ${period.period} cumulative value ${period.cumulativeCost} does not equal ${runningTotal}.`,
      });
    }
  }

  const estimatedTotal = sumDecimalStrings(calculatedBuildUpTotals);
  const cashFlowTotal = sumDecimalStrings(data.cashFlow.map((period) => period.plannedCost));
  if (!decimalStringsEqual(estimatedTotal, cashFlowTotal)) {
    issues.push({
      code: 'cashflow_total_mismatch',
      severity: 'error',
      entityType: 'cashflow',
      message: `Cash-flow total ${cashFlowTotal} does not equal estimated total ${estimatedTotal}.`,
    });
  }

  const readiness = issues.some((issue) => issue.severity === 'error')
    ? 'not_ready'
    : issues.length > 0
      ? 'needs_review'
      : 'ready';

  return {
    schemaVersion: 1,
    capability: 'cost_cashflow',
    projectId: workspace.project.id,
    coreRevision: workspace.revision,
    generatedAt,
    readiness,
    summary: {
      currency: data.currency,
      rateSources: data.rateSources.length,
      components: data.components.length,
      buildUps: data.buildUps.length,
      cashFlowPeriods: data.cashFlow.length,
      estimatedTotal,
      cashFlowTotal,
      unverifiedComponents: data.components.filter((component) => component.assumptionStatus === 'unverified').length,
    },
    issues,
  };
}
