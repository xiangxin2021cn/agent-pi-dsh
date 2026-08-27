import type { TenderSourceLocator } from '../../types.ts';
import type { TenderBoqItem, TenderScopeLink } from '../boq/types.ts';
import { compareDecimalStrings, decimalStringsEqual, multiplyDecimalStrings, sumDecimalStrings } from '../cost/decimal.ts';
import { remapBoqPricingIssueSeverity } from './severity.ts';
import type {
  TenderBoqDirectResourceKind,
  TenderBoqFiveStepItemBuildUp,
  TenderBoqPricingResourceKind,
} from './types.ts';

export interface TenderBoqItemQualityIssue {
  code: string;
  severity: 'error' | 'warning';
  message: string;
}

const DIRECT_RESOURCE_KINDS: TenderBoqDirectResourceKind[] = [
  'labour',
  'plant',
  'material',
  'subcontract',
  'transport',
  'waste',
];

export function inspectTenderBoqItemC51Quality(
  item: TenderBoqItem,
  scopeLink: TenderScopeLink | undefined,
  buildUp: TenderBoqFiveStepItemBuildUp,
): TenderBoqItemQualityIssue[] {
  const issues: TenderBoqItemQualityIssue[] = [];
  const error = (code: string, message: string) => issues.push({ code, severity: remapBoqPricingIssueSeverity(code, 'error'), message });

  const identity = buildUp.itemIdentity;
  if (!identity) {
    error('boq_pricing_item_identity_missing', `BOQ item ${item.id} has no immutable BOQ identity snapshot.`);
  } else {
    if (identity.code !== item.code || normalizeText(identity.description) !== normalizeText(item.description)) {
      error('boq_pricing_item_identity_mismatch', `BOQ item ${item.id} code or description differs from the reconciled BOQ row.`);
    }
    if (normalizeUnit(identity.unit) !== normalizeUnit(item.unit)) {
      error('boq_pricing_item_identity_unit_mismatch', `BOQ item ${item.id} identity unit ${identity.unit} does not match ${item.unit}.`);
    }
    if (!item.quantity || !decimalStringsEqual(identity.quantity, item.quantity)) {
      error('boq_pricing_item_identity_quantity_mismatch', `BOQ item ${item.id} identity quantity does not match the reconciled quantity.`);
    }
    if (!sameLocator(identity.sourceRef, item.source)) {
      error('boq_pricing_item_identity_source_mismatch', `BOQ item ${item.id} identity source does not match the reconciled BOQ row.`);
    }
  }

  const scope = buildUp.scopeBasis;
  if (!scope) {
    error('boq_pricing_scope_basis_missing', `BOQ item ${item.id} has no structured specification and measurement basis.`);
  } else {
    if (scope.specificationRefs.length === 0) {
      error('boq_pricing_specification_basis_missing', `BOQ item ${item.id} has no exact specification clause reference.`);
    }
    if (scope.measurementRuleRefs.length === 0) {
      error('boq_pricing_measurement_basis_missing', `BOQ item ${item.id} has no measurement or payment clause reference.`);
    }
    if (scope.inclusions.length === 0) {
      error('boq_pricing_scope_inclusions_missing', `BOQ item ${item.id} has no explicit work-content inclusions.`);
    }
    if (scope.testingRequirements.length === 0 || scope.methodConstraints.length === 0) {
      error('boq_pricing_technical_constraints_missing', `BOQ item ${item.id} must explicitly state testing requirements and method constraints, including reasoned not-applicable entries.`);
    }
    for (const expected of scopeLink?.specificationRefs ?? []) {
      if (!scope.specificationRefs.some((actual) => sameLocator(actual, expected))) {
        error('boq_pricing_specification_link_missing', `BOQ item ${item.id} omits linked specification source ${formatLocator(expected)}.`);
      }
    }
    for (const expected of scopeLink?.measurementRuleRefs ?? []) {
      if (!scope.measurementRuleRefs.some((actual) => sameLocator(actual, expected))) {
        error('boq_pricing_measurement_link_missing', `BOQ item ${item.id} omits linked measurement source ${formatLocator(expected)}.`);
      }
    }
  }

  const productivity = buildUp.productivityBasis;
  if (!productivity) {
    error('boq_pricing_productivity_basis_missing', `BOQ item ${item.id} has no structured method, crew, bottleneck, or three-scenario productivity basis.`);
  } else {
    if (productivity.methodSequence.length === 0 || !productivity.bottleneck.trim() || !productivity.calculationFormula.trim()) {
      error('boq_pricing_productivity_method_incomplete', `BOQ item ${item.id} has an incomplete method sequence, bottleneck, or productivity formula.`);
    }
    const coverageKinds = new Set((buildUp.resourceCoverage ?? [])
      .filter((entry) => entry.applicability === 'included')
      .map((entry) => entry.kind));
    if ((coverageKinds.has('labour') || coverageKinds.has('plant')) && productivity.crew.length === 0) {
      error('boq_pricing_crew_missing', `BOQ item ${item.id} includes labour or plant but has no crew composition.`);
    }
    const scenarios = new Map(productivity.scenarios.map((scenario) => [scenario.scenario, scenario]));
    if (scenarios.size !== 3 || !scenarios.has('optimistic') || !scenarios.has('base') || !scenarios.has('pessimistic')) {
      error('boq_pricing_productivity_scenarios_missing', `BOQ item ${item.id} must contain optimistic, base, and pessimistic productivity scenarios.`);
    } else {
      const optimistic = scenarios.get('optimistic')!;
      const base = scenarios.get('base')!;
      const pessimistic = scenarios.get('pessimistic')!;
      if (compareDecimalStrings(optimistic.productionRate, base.productionRate) < 0
        || compareDecimalStrings(base.productionRate, pessimistic.productionRate) < 0) {
        error('boq_pricing_productivity_scenario_order', `BOQ item ${item.id} productivity must satisfy optimistic >= base >= pessimistic.`);
      }
      const scenarioUnits = productivity.scenarios.map((scenario) => `${normalizeUnit(scenario.quantityUnit)}:${scenario.timeUnit}`);
      if (new Set(scenarioUnits).size !== 1) {
        error('boq_pricing_productivity_scenario_unit_mismatch', `BOQ item ${item.id} productivity scenarios use inconsistent units or time bases.`);
      }
      for (const scenario of productivity.scenarios) {
        const calculatedRate = multiplyDecimalStrings(productivity.theoreticalProductionRate, scenario.effectiveFactor);
        if (!decimalStringsEqual(calculatedRate, scenario.productionRate)) {
          error('boq_pricing_productivity_formula_mismatch', `BOQ item ${item.id} ${scenario.scenario} productivity ${scenario.productionRate} does not equal theoretical output ${productivity.theoreticalProductionRate} multiplied by effective factor ${scenario.effectiveFactor}.`);
        }
      }
      if (buildUp.planningBasis && (
        !decimalStringsEqual(base.productionRate, buildUp.planningBasis.productionRate)
        || normalizeUnit(base.quantityUnit) !== normalizeUnit(buildUp.planningBasis.quantityUnit)
        || base.timeUnit !== buildUp.planningBasis.timeUnit
      )) {
        error('boq_pricing_base_productivity_mismatch', `BOQ item ${item.id} base productivity does not match the planning basis.`);
      }
    }
  }

  const coverage = buildUp.resourceCoverage ?? [];
  const coverageByKind = new Map(coverage.map((entry) => [entry.kind, entry]));
  if (coverage.length !== DIRECT_RESOURCE_KINDS.length || DIRECT_RESOURCE_KINDS.some((kind) => !coverageByKind.has(kind))) {
    error('boq_pricing_resource_coverage_incomplete', `BOQ item ${item.id} must explicitly address labour, plant, material, subcontract, transport, and waste.`);
  }

  const componentById = new Map(buildUp.costComponents.map((component) => [component.id, component]));
  for (const kind of DIRECT_RESOURCE_KINDS) {
    const coverageEntry = coverageByKind.get(kind);
    const resources = buildUp.resourceConsumptions.filter((resource) => resource.kind === kind);
    const components = buildUp.costComponents.filter((component) => component.kind === kind);
    if (coverageEntry?.applicability === 'not_applicable') {
      if (resources.length > 0 || components.length > 0) {
        error('boq_pricing_resource_coverage_conflict', `BOQ item ${item.id} marks ${kind} not applicable but still carries resource or cost records.`);
      }
      continue;
    }
    if (coverageEntry?.applicability !== 'included') continue;
    if (resources.length === 0) {
      error('boq_pricing_resource_consumption_missing', `BOQ item ${item.id} includes ${kind} but has no per-unit resource consumption.`);
    }
    if (components.length === 0) {
      error('boq_pricing_cost_component_kind_missing', `BOQ item ${item.id} includes ${kind} but has no direct-cost component.`);
    }
  }

  const resourceIdsByComponent = new Map<string, string[]>();
  for (const resource of buildUp.resourceConsumptions) {
    if (resource.quantityBasis !== 'per_boq_unit' || !resource.calculationBasis?.trim() || !resource.sourceRefs?.length) {
      error('boq_pricing_resource_basis_incomplete', `Resource ${resource.id} must state a per-BOQ-unit calculation and source basis.`);
    }
    const component = resource.costComponentId ? componentById.get(resource.costComponentId) : undefined;
    if (!component || component.kind !== resource.kind) {
      error('boq_pricing_resource_component_link_invalid', `Resource ${resource.id} is not linked to a matching direct-cost component.`);
    } else {
      const linkedIds = resourceIdsByComponent.get(component.id) ?? [];
      linkedIds.push(resource.id);
      resourceIdsByComponent.set(component.id, linkedIds);
      if (!decimalStringsEqual(resource.quantity, component.quantity)) {
        error('boq_pricing_resource_component_quantity_mismatch', `Resource ${resource.id} quantity ${resource.quantity} does not match cost component ${component.id} quantity ${component.quantity}.`);
      }
      if (normalizeUnit(resource.unit) !== normalizeUnit(component.unit)) {
        error('boq_pricing_resource_component_unit_mismatch', `Resource ${resource.id} unit ${resource.unit} does not match cost component ${component.id} unit ${component.unit}.`);
      }
    }
  }

  if (buildUp.costComponents.length === 0) {
    error('boq_pricing_cost_components_empty', `BOQ item ${item.id} has no direct-cost components.`);
  }
  for (const component of buildUp.costComponents) {
    if (component.kind === 'overhead' || component.kind === 'contingency' || component.kind === 'escalation') {
      error('boq_pricing_indirect_cost_in_unit_rate', `BOQ item ${item.id} includes ${component.kind} in the pure direct unit rate.`);
    }
    if (!component.rateBasis) {
      error('boq_pricing_rate_basis_missing', `Cost component ${component.id} has no rate date, location, source type, acquisition mode, or VAT basis.`);
    }
    if (isResourceCostKind(component.kind)) {
      const linkedResourceIds = resourceIdsByComponent.get(component.id) ?? [];
      if (linkedResourceIds.length === 0) {
        error('boq_pricing_cost_component_resource_missing', `Cost component ${component.id} has no matching per-unit resource consumption.`);
      } else if (linkedResourceIds.length > 1) {
        error('boq_pricing_cost_component_resource_ambiguous', `Cost component ${component.id} is linked by multiple resources: ${linkedResourceIds.join(', ')}.`);
      }
    }
  }

  if (buildUp.status === 'reviewed') {
    const unverifiedCoreRecords = [
      ...(buildUp.productivityBasis?.crew ?? []),
      ...(buildUp.productivityBasis?.scenarios ?? []),
      ...buildUp.resourceConsumptions,
      ...(buildUp.planningBasis ? [buildUp.planningBasis] : []),
      ...buildUp.costComponents,
    ].filter((record) => record.assumptionStatus === 'unverified');
    if (unverifiedCoreRecords.length > 0) {
      error('boq_pricing_reviewed_core_unverified', `BOQ item ${item.id} is reviewed but still contains ${unverifiedCoreRecords.length} unverified productivity, resource, planning, or rate record(s).`);
    }
  }

  const summary = buildUp.directCostSummary;
  if (!summary) {
    error('boq_pricing_direct_cost_summary_missing', `BOQ item ${item.id} has no reconciled direct unit-rate and item-total summary.`);
  } else {
    const subtotals = new Map<TenderBoqPricingResourceKind, string>();
    for (const kind of [...DIRECT_RESOURCE_KINDS, 'other' as const]) {
      subtotals.set(kind, sumDecimalStrings(buildUp.costComponents.filter((component) => component.kind === kind).map((component) => component.amount)));
    }
    for (const kind of [...DIRECT_RESOURCE_KINDS, 'other' as const]) {
      if (!decimalStringsEqual(summary[kind], subtotals.get(kind) ?? '0')) {
        error('boq_pricing_direct_cost_subtotal_mismatch', `BOQ item ${item.id} ${kind} subtotal does not reconcile to its components.`);
      }
    }
    const unitDirectCost = sumDecimalStrings(buildUp.costComponents.map((component) => component.amount));
    if (!decimalStringsEqual(summary.unitDirectCost, unitDirectCost)
      || !decimalStringsEqual(buildUp.directCost, unitDirectCost)) {
      error('boq_pricing_unit_direct_cost_mismatch', `BOQ item ${item.id} unit direct cost does not reconcile to component amounts.`);
    }
    if (!item.quantity || !decimalStringsEqual(summary.boqQuantity, item.quantity)) {
      error('boq_pricing_summary_quantity_mismatch', `BOQ item ${item.id} direct-cost summary quantity does not match the BOQ.`);
    } else {
      const itemDirectCost = multiplyDecimalStrings(summary.unitDirectCost, item.quantity);
      if (!decimalStringsEqual(summary.itemDirectCost, itemDirectCost)) {
        error('boq_pricing_item_direct_cost_mismatch', `BOQ item ${item.id} item direct cost does not equal unit rate multiplied by BOQ quantity.`);
      }
    }
  }

  if (!buildUp.riskScenarios?.length) {
    error('boq_pricing_item_risk_scenarios_missing', `BOQ item ${item.id} has no item-specific optimistic/base/pessimistic risk sensitivity.`);
  } else {
    for (const risk of buildUp.riskScenarios) {
      if (risk.assumptionStatus === 'sourced' && risk.sourceRefs.length === 0) {
        error('boq_pricing_risk_source_missing', `Risk scenario ${risk.id} is marked sourced but has no source reference.`);
      }
    }
  }

  return issues;
}

function normalizeText(value: string): string {
  return value.normalize('NFKC').trim().replace(/\s+/g, ' ');
}

function normalizeUnit(value: string): string {
  return normalizeText(value).toLowerCase().replace(/\s+/g, '').replace(/³/g, '3').replace(/²/g, '2');
}

function isResourceCostKind(kind: TenderBoqPricingResourceKind | 'overhead' | 'contingency' | 'escalation'): kind is TenderBoqPricingResourceKind {
  return kind !== 'overhead' && kind !== 'contingency' && kind !== 'escalation';
}

function sameLocator(left: TenderSourceLocator, right: TenderSourceLocator): boolean {
  return left.documentId === right.documentId
    && (left.page ?? null) === (right.page ?? null)
    && (left.sheet ?? null) === (right.sheet ?? null)
    && (left.clause ?? null) === (right.clause ?? null)
    && (left.section ?? null) === (right.section ?? null)
    && (left.cell ?? null) === (right.cell ?? null)
    && (left.blockId ?? null) === (right.blockId ?? null);
}

function formatLocator(source: TenderSourceLocator): string {
  return [source.documentId, source.clause, source.sheet, source.cell, source.page ? `p.${source.page}` : undefined]
    .filter(Boolean)
    .join(':');
}

/**
 * Generic direct-cost inspector: keep five-step structure + webEvidence discipline,
 * but do not require COTO-style clause numbers when the project boundary is not C5.1.
 */
export function inspectTenderBoqItemGenericQuality(
  item: TenderBoqItem,
  _scopeLink: TenderScopeLink | undefined,
  buildUp: TenderBoqFiveStepItemBuildUp,
): TenderBoqItemQualityIssue[] {
  const issues: TenderBoqItemQualityIssue[] = [];
  const error = (code: string, message: string) => issues.push({ code, severity: remapBoqPricingIssueSeverity(code, 'error'), message });
  const warn = (code: string, message: string) => issues.push({ code, severity: 'warning', message });

  if (!buildUp.itemIdentity) {
    error('boq_pricing_item_identity_missing', `BOQ item ${item.id} has no immutable BOQ identity snapshot.`);
  }
  if (!buildUp.scopeBasis) {
    warn('boq_pricing_scope_basis_missing', `BOQ item ${item.id} has no structured specification/measurement basis.`);
  } else if (
    buildUp.scopeBasis.specificationRefs.length === 0
    && buildUp.scopeBasis.measurementRuleRefs.length === 0
  ) {
    warn('boq_pricing_scope_refs_sparse', `BOQ item ${item.id} lacks specification or measurement refs — cite tender clauses when known.`);
  }
  if (!buildUp.productivityBasis) {
    warn('boq_pricing_productivity_basis_missing', `BOQ item ${item.id} has no productivity basis.`);
  }
  if (!buildUp.steps) {
    error('boq_pricing_five_step_missing', `BOQ item ${item.id} is missing the five-step workpaper.`);
  }
  const components = buildUp.costComponents ?? [];
  if (components.length === 0 && buildUp.status !== 'blocked') {
    warn('boq_pricing_direct_cost_empty', `BOQ item ${item.id} has no direct-cost components.`);
  }
  for (const component of components) {
    if (component.assumptionStatus === 'unverified') {
      warn('boq_pricing_rate_unverified', `BOQ item ${item.id} component ${component.id} is unverified.`);
    }
  }
  return issues;
}

export function inspectTenderBoqItemQualityByStandard(
  pricingStandard: string | undefined,
  item: TenderBoqItem,
  scopeLink: TenderScopeLink | undefined,
  buildUp: TenderBoqFiveStepItemBuildUp,
): TenderBoqItemQualityIssue[] {
  if (!pricingStandard || pricingStandard === 'c51_pure_direct_cost_v1') {
    return inspectTenderBoqItemC51Quality(item, scopeLink, buildUp);
  }
  return inspectTenderBoqItemGenericQuality(item, scopeLink, buildUp);
}
