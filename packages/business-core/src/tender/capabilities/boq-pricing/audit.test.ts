import { describe, expect, test } from 'bun:test';
import type { TenderWorkspace } from '../../types.ts';
import type { TenderBoqReconciliationData } from '../boq/types.ts';
import { auditTenderBoqFiveStepPricing } from './audit.ts';
import type { TenderBoqFiveStepPricingData } from './types.ts';

const workspace: TenderWorkspace = {
  schemaVersion: 1,
  revision: 3,
  project: {
    id: 'n3',
    title: 'N3 Tender',
    currency: 'ZAR',
    status: 'active',
  },
  documents: [
    { id: 'boq', name: 'BOQ', path: 'C:/tender/boq.xlsx', kind: 'boq', status: 'active' },
    { id: 'spec', name: 'Specification', path: 'C:/tender/spec.pdf', kind: 'specification', status: 'active' },
    { id: 'quote', name: 'Rate Evidence', path: 'C:/tender/quote.pdf', kind: 'supporting_evidence', status: 'active' },
  ],
  requirements: [],
  criteria: [],
  deliverables: [],
  responses: [],
};

const boqData: TenderBoqReconciliationData = {
  items: [{
    id: 'b6100-1',
    source: { documentId: 'boq', sheet: 'B6100', cell: 'A12:F12' },
    code: '1/61.02(a)(i)',
    description: 'Excavate 0-2m',
    unit: 'm3',
    quantity: '100',
    quantityBasis: 'boq',
    quantityStatus: 'sourced',
    quantityRefs: [],
  }],
  scopeLinks: [{
    boqItemId: 'b6100-1',
    requirementIds: [],
    specificationRefs: [{ documentId: 'spec', clause: '6102', page: 23 }],
    drawingRefs: [],
    measurementRuleRefs: [{ documentId: 'spec', clause: '6108', page: 31 }],
    inclusions: ['Excavation and trimming'],
    exclusions: [],
    assumptions: [],
    gapStatus: 'clear',
  }],
};

const completePricing: TenderBoqFiveStepPricingData = {
  currency: 'ZAR',
  pricingStandard: 'c51_pure_direct_cost_v1',
  vatTreatment: 'exclusive',
  indirectCostPolicy: 'excluded_from_item_direct_cost',
  pricingStatus: 'reviewed',
  itemBuildUps: [{
    boqItemId: 'b6100-1',
    status: 'reviewed',
    steps: {
      scopeQuantity: {
        narrative: 'BOQ quantity 100 m3 is sourced from B6100 row 12 and scoped by specification clause 6102.',
        sourceRefs: [{ documentId: 'boq', sheet: 'B6100', cell: 'A12:F12' }],
      },
      methodProductivity: {
        narrative: 'Excavate by small plant with trimming crew using measured cycle output.',
        sourceRefs: [{ documentId: 'spec', clause: '6102', page: 23 }],
      },
      resourceConsumption: {
        narrative: 'Crew and plant consumption is calculated per m3 from the stated productivity basis.',
        sourceRefs: [{ documentId: 'spec', clause: '6102', page: 23 }],
      },
      sourcedRatesDirectCost: {
        narrative: 'Direct cost uses source-traced plant and labour rates.',
        sourceRefs: [{ documentId: 'quote', page: 1 }],
      },
      reconciliationRisk: {
        narrative: 'Rate reconciles to the BOQ unit and flags no unresolved exclusions.',
        sourceRefs: [{ documentId: 'spec', clause: '6108', page: 31 }],
      },
    },
    itemIdentity: {
      code: '1/61.02(a)(i)',
      description: 'Excavate 0-2m',
      unit: 'm3',
      quantity: '100',
      sourceRef: { documentId: 'boq', sheet: 'B6100', cell: 'A12:F12' },
    },
    scopeBasis: {
      specificationRefs: [{ documentId: 'spec', clause: '6102', page: 23 }],
      measurementRuleRefs: [{ documentId: 'spec', clause: '6108', page: 31 }],
      inclusions: ['Excavation and trimming'],
      exclusions: ['Disposal outside the specified free-haul distance'],
      testingRequirements: ['Survey and formation acceptance before payment'],
      methodConstraints: ['Excavate in controlled layers and protect accepted formation'],
    },
    productivityBasis: {
      methodSequence: ['Set out', 'Excavate', 'Trim formation', 'Inspect and accept'],
      crew: [
        {
          id: 'crew-labour', kind: 'labour', description: 'Excavation and trimming crew', count: '4',
          assumptionStatus: 'sourced', sourceRefs: [{ documentId: 'spec', clause: '6102', page: 23 }],
        },
        {
          id: 'crew-plant', kind: 'plant', description: 'Excavator', count: '1',
          assumptionStatus: 'sourced', sourceRefs: [{ documentId: 'quote', page: 1 }],
        },
      ],
      workingHoursPerDay: '8',
      bottleneck: 'Excavator cycle output',
      theoreticalProductionRate: '20',
      calculationFormula: '20 m3/day theoretical x effective factor',
      scenarios: [
        {
          scenario: 'optimistic', productionRate: '12', quantityUnit: 'm3', timeUnit: 'working_day', effectiveFactor: '0.6',
          basis: 'Good access and balanced truck cycle', assumptionStatus: 'scenario', sourceRefs: [{ documentId: 'quote', page: 1 }],
        },
        {
          scenario: 'base', productionRate: '10', quantityUnit: 'm3', timeUnit: 'working_day', effectiveFactor: '0.5',
          basis: 'Normal constrained production', assumptionStatus: 'sourced', sourceRefs: [{ documentId: 'spec', clause: '6102', page: 23 }],
        },
        {
          scenario: 'pessimistic', productionRate: '8', quantityUnit: 'm3', timeUnit: 'working_day', effectiveFactor: '0.4',
          basis: 'Restricted access and trimming rework', assumptionStatus: 'scenario', sourceRefs: [{ documentId: 'spec', clause: '6102', page: 23 }],
        },
      ],
    },
    resourceCoverage: [
      { kind: 'labour', applicability: 'included', basis: 'Direct excavation and trimming crew' },
      { kind: 'plant', applicability: 'included', basis: 'Excavator production plant' },
      { kind: 'material', applicability: 'not_applicable', basis: 'No permanent material incorporated' },
      { kind: 'subcontract', applicability: 'not_applicable', basis: 'Self-performed activity' },
      { kind: 'transport', applicability: 'not_applicable', basis: 'Free-haul is excluded from this item' },
      { kind: 'waste', applicability: 'not_applicable', basis: 'No material consumption waste' },
    ],
    resourceConsumptions: [
      {
        id: 'res-labour', kind: 'labour', description: 'Excavation crew', quantity: '2', unit: 'h/m3', assumptionStatus: 'sourced',
        quantityBasis: 'per_boq_unit', calculationBasis: '20 crew-hours/day / 10 m3/day', costComponentId: 'cost-labour',
        sourceRefs: [{ documentId: 'spec', clause: '6102', page: 23 }],
      },
      {
        id: 'res-plant', kind: 'plant', description: 'Excavator', quantity: '0.5', unit: 'h/m3', assumptionStatus: 'sourced',
        quantityBasis: 'per_boq_unit', calculationBasis: '5 machine-hours/day / 10 m3/day', costComponentId: 'cost-plant',
        sourceRefs: [{ documentId: 'quote', page: 1 }],
      },
    ],
    planningBasis: {
      methodId: 'small-plant-excavation',
      productionRate: '10',
      quantityUnit: 'm3',
      timeUnit: 'working_day',
      duration: '10',
      calendarId: 'calendar-standard',
      activityId: 'activity-b6100-1',
      assumptionStatus: 'sourced',
      sourceRefs: [{ documentId: 'spec', clause: '6102', page: 23 }],
    },
    initialCashFlow: [
      {
        period: '2026-08',
        activityId: 'activity-b6100-1',
        weight: '0.6',
        amount: '30000',
        basis: 'Mobilisation and first production period.',
        assumptionStatus: 'sourced',
        sourceRefs: [{ documentId: 'spec', clause: '6102', page: 23 }],
      },
      {
        period: '2026-09',
        activityId: 'activity-b6100-1',
        weight: '0.4',
        amount: '20000',
        basis: 'Remaining production period.',
        assumptionStatus: 'sourced',
        sourceRefs: [{ documentId: 'spec', clause: '6102', page: 23 }],
      },
    ],
    costComponents: [
      {
        id: 'cost-labour', kind: 'labour', description: 'Excavation crew', quantity: '2', unit: 'h/m3', rate: '100', amount: '200',
        rateSourceRef: { documentId: 'quote', page: 1 },
        rateBasis: { sourceType: 'published_schedule', acquisitionMode: 'not_applicable', location: 'Durban', effectiveDate: '2026-07-15', vatTreatment: 'exclusive' },
        assumptionStatus: 'sourced',
      },
      {
        id: 'cost-plant', kind: 'plant', description: 'Excavator', quantity: '0.5', unit: 'h/m3', rate: '600', amount: '300',
        rateSourceRef: { documentId: 'quote', page: 1 },
        rateBasis: { sourceType: 'rental_quote', acquisitionMode: 'rented', location: 'Durban', effectiveDate: '2026-07-15', vatTreatment: 'exclusive' },
        assumptionStatus: 'sourced',
      },
    ],
    directCost: '500',
    directCostSummary: {
      labour: '200', plant: '300', material: '0', subcontract: '0', transport: '0', waste: '0', other: '0',
      unitDirectCost: '500', boqQuantity: '100', itemDirectCost: '50000',
    },
    riskScenarios: [{
      id: 'risk-productivity',
      variable: 'Excavator production rate',
      optimistic: '12 m3/working_day',
      base: '10 m3/working_day',
      pessimistic: '8 m3/working_day',
      trigger: 'Restricted access or trimming rework',
      treatment: 'Rebalance trucks and add trimming support before extending shifts',
      assumptionStatus: 'sourced',
      sourceRefs: [{ documentId: 'spec', clause: '6102', page: 23 }],
    }],
    conditions: [],
    riskNotes: [],
  }],
  resourceSummary: [
    { kind: 'labour', description: 'Excavation crew', quantity: '200', unit: 'h' },
    { kind: 'plant', description: 'Excavator', quantity: '50', unit: 'h' },
  ],
  assumptions: [],
};

describe('tender BOQ five-step pricing audit', () => {
  test('passes only when every BOQ item has all five pricing steps and reconciled cost', () => {
    const audit = auditTenderBoqFiveStepPricing(workspace, boqData, completePricing, '2026-07-15T00:00:00.000Z');

    expect(audit.readiness).toBe('ready');
    expect(audit.summary.items).toBe(1);
    expect(audit.summary.completeItems).toBe(1);
    expect(audit.summary.estimatedUnitRateSum).toBe('500');
    expect(audit.summary.estimatedDirectCost).toBe('50000');
  });

  test('rejects missing item build-ups and incomplete five-step derivations', () => {
    const missing = auditTenderBoqFiveStepPricing(workspace, boqData, {
      ...completePricing,
      itemBuildUps: [],
    }, '2026-07-15T00:00:00.000Z');
    const incomplete = auditTenderBoqFiveStepPricing(workspace, boqData, {
      ...completePricing,
      itemBuildUps: [{
        ...completePricing.itemBuildUps[0]!,
        steps: {
          ...completePricing.itemBuildUps[0]!.steps,
          methodProductivity: { narrative: '', sourceRefs: [] },
        },
      }],
    }, '2026-07-15T00:00:00.000Z');

    expect(missing.readiness).toBe('not_ready');
    expect(missing.issues.map((issue) => issue.code)).toContain('boq_pricing_build_up_missing');
    expect(incomplete.readiness).toBe('not_ready');
    expect(incomplete.issues.map((issue) => issue.code)).toContain('boq_pricing_step_incomplete');
  });

  test('rejects a reviewed item without a calculable planning basis but allows cash flow to be deferred', () => {
    const item = completePricing.itemBuildUps[0]!;
    const audit = auditTenderBoqFiveStepPricing(workspace, boqData, {
      ...completePricing,
      itemBuildUps: [{ ...item, planningBasis: undefined, initialCashFlow: [] }],
    }, '2026-07-15T00:00:00.000Z');

    expect(audit.readiness).toBe('not_ready');
    expect(audit.issues.map((issue) => issue.code)).toContain('boq_pricing_planning_basis_missing');
    expect(audit.issues.map((issue) => issue.code)).not.toContain('boq_pricing_cash_flow_missing');
  });

  test('rejects duration capacity that cannot produce the BOQ quantity', () => {
    const item = completePricing.itemBuildUps[0]!;
    const audit = auditTenderBoqFiveStepPricing(workspace, boqData, {
      ...completePricing,
      itemBuildUps: [{
        ...item,
        planningBasis: { ...item.planningBasis!, duration: '2' },
      }],
    }, '2026-07-15T00:00:00.000Z');

    expect(audit.readiness).toBe('not_ready');
    expect(audit.issues.map((issue) => issue.code)).toContain('boq_pricing_duration_capacity_shortfall');
  });

  test('rejects initial cash-flow weights and amounts that do not reconcile', () => {
    const item = completePricing.itemBuildUps[0]!;
    const audit = auditTenderBoqFiveStepPricing(workspace, boqData, {
      ...completePricing,
      itemBuildUps: [{
        ...item,
        initialCashFlow: item.initialCashFlow!.map((allocation, index) => index === 0
          ? { ...allocation, weight: '0.5', amount: '25000' }
          : allocation),
      }],
    }, '2026-07-15T00:00:00.000Z');

    const issueCodes = audit.issues.map((issue) => issue.code);
    // V2.4.0: arithmetic self-consistency is a human-review warning, not a
    // machine gate — the pack stays usable while the reviewer checks numbers.
    expect(audit.readiness).toBe('needs_review');
    expect(issueCodes).toContain('boq_pricing_cash_flow_weight_mismatch');
    expect(issueCodes).toContain('boq_pricing_cash_flow_amount_mismatch');
    expect(audit.issues.filter((issue) => issue.severity === 'error')).toEqual([]);
  });

  test('rejects a generic resource database or prose-only record that lacks C5.1 item controls', () => {
    const item = completePricing.itemBuildUps[0]!;
    const audit = auditTenderBoqFiveStepPricing(workspace, boqData, {
      ...completePricing,
      itemBuildUps: [{
        ...item,
        itemIdentity: undefined,
        scopeBasis: undefined,
        productivityBasis: undefined,
        resourceCoverage: undefined,
        directCostSummary: undefined,
        riskScenarios: undefined,
      }],
    }, '2026-07-15T00:00:00.000Z');

    const issueCodes = audit.issues.map((issue) => issue.code);
    expect(audit.readiness).toBe('not_ready');
    expect(issueCodes).toContain('boq_pricing_item_identity_missing');
    expect(issueCodes).toContain('boq_pricing_scope_basis_missing');
    expect(issueCodes).toContain('boq_pricing_productivity_basis_missing');
    expect(issueCodes).toContain('boq_pricing_resource_coverage_incomplete');
    expect(issueCodes).toContain('boq_pricing_direct_cost_summary_missing');
    expect(issueCodes).toContain('boq_pricing_item_risk_scenarios_missing');
  });

  test('rejects indirect markups and rate evidence without C5.1 basis metadata', () => {
    const item = completePricing.itemBuildUps[0]!;
    const audit = auditTenderBoqFiveStepPricing(workspace, boqData, {
      ...completePricing,
      itemBuildUps: [{
        ...item,
        costComponents: [
          ...item.costComponents.map((component, index) => index === 0 ? { ...component, rateBasis: undefined } : component),
          {
            id: 'cost-overhead', kind: 'overhead', description: 'General overhead', quantity: '1', unit: 'item',
            rate: '50', amount: '50', assumptionStatus: 'scenario',
          },
        ],
        directCost: '550',
        directCostSummary: { ...item.directCostSummary!, unitDirectCost: '550', itemDirectCost: '55000' },
      }],
    }, '2026-07-15T00:00:00.000Z');

    const issueCodes = audit.issues.map((issue) => issue.code);
    expect(audit.readiness).toBe('not_ready');
    expect(issueCodes).toContain('boq_pricing_rate_basis_missing');
    expect(issueCodes).toContain('boq_pricing_indirect_cost_in_unit_rate');
  });

  test('rejects a resource consumption that does not match its direct-cost component', () => {
    const item = completePricing.itemBuildUps[0]!;
    const audit = auditTenderBoqFiveStepPricing(workspace, boqData, {
      ...completePricing,
      itemBuildUps: [{
        ...item,
        resourceConsumptions: item.resourceConsumptions.map((resource, index) => index === 0
          ? { ...resource, quantity: '1.5', unit: 'day/m3' }
          : resource),
      }],
    }, '2026-07-15T00:00:00.000Z');

    const issueCodes = audit.issues.map((issue) => issue.code);
    expect(audit.readiness).toBe('not_ready');
    expect(issueCodes).toContain('boq_pricing_resource_component_quantity_mismatch');
    expect(issueCodes).toContain('boq_pricing_resource_component_unit_mismatch');
  });

  test('rejects reviewed pricing with unverified core rates or inconsistent productivity arithmetic', () => {
    const item = completePricing.itemBuildUps[0]!;
    const audit = auditTenderBoqFiveStepPricing(workspace, boqData, {
      ...completePricing,
      itemBuildUps: [{
        ...item,
        productivityBasis: {
          ...item.productivityBasis!,
          scenarios: item.productivityBasis!.scenarios.map((scenario) => scenario.scenario === 'base'
            ? { ...scenario, effectiveFactor: '0.4' }
            : scenario),
        },
        costComponents: item.costComponents.map((component, index) => index === 0
          ? { ...component, assumptionStatus: 'unverified' as const }
          : component),
      }],
    }, '2026-07-15T00:00:00.000Z');

    const issueCodes = audit.issues.map((issue) => issue.code);
    // V2.4.0: formula rounding and honest unverified records no longer
    // deadlock the pack; they surface as review warnings instead.
    expect(audit.readiness).toBe('needs_review');
    expect(issueCodes).toContain('boq_pricing_productivity_formula_mismatch');
    expect(issueCodes).toContain('boq_pricing_reviewed_core_unverified');
    expect(audit.issues.filter((issue) => issue.severity === 'error')).toEqual([]);
  });
});
