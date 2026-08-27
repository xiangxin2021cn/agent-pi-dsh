import type { TenderSourceLocator } from '../../types.ts';
import type { TenderCapabilityAuditIssue, TenderCapabilityReadiness } from '../types.ts';

export type TenderBoqPricingResourceKind =
  | 'labour'
  | 'plant'
  | 'material'
  | 'subcontract'
  | 'transport'
  | 'waste'
  | 'other';

export type TenderBoqPricingAssumptionStatus = 'sourced' | 'scenario' | 'unverified';

export type TenderBoqDirectResourceKind = Exclude<TenderBoqPricingResourceKind, 'other'>;

export interface TenderBoqPricingStep {
  narrative: string;
  sourceRefs: TenderSourceLocator[];
}

export interface TenderBoqFiveStepRecord {
  scopeQuantity: TenderBoqPricingStep;
  methodProductivity: TenderBoqPricingStep;
  resourceConsumption: TenderBoqPricingStep;
  sourcedRatesDirectCost: TenderBoqPricingStep;
  reconciliationRisk: TenderBoqPricingStep;
}

export interface TenderBoqResourceConsumption {
  id: string;
  kind: TenderBoqPricingResourceKind;
  description: string;
  quantity: string;
  unit: string;
  assumptionStatus: TenderBoqPricingAssumptionStatus;
  quantityBasis?: 'per_boq_unit';
  calculationBasis?: string;
  costComponentId?: string;
  sourceRefs?: TenderSourceLocator[];
}

export interface TenderBoqItemIdentity {
  code: string;
  description: string;
  unit: string;
  quantity: string;
  sourceRef: TenderSourceLocator;
}

export interface TenderBoqScopeBasis {
  specificationRefs: TenderSourceLocator[];
  measurementRuleRefs: TenderSourceLocator[];
  inclusions: string[];
  exclusions: string[];
  testingRequirements: string[];
  methodConstraints: string[];
}

export interface TenderBoqCrewResource {
  id: string;
  kind: 'labour' | 'plant';
  description: string;
  count: string;
  assumptionStatus: TenderBoqPricingAssumptionStatus;
  sourceRefs: TenderSourceLocator[];
}

export interface TenderBoqProductivityScenario {
  scenario: 'optimistic' | 'base' | 'pessimistic';
  productionRate: string;
  quantityUnit: string;
  timeUnit: 'hour' | 'shift' | 'working_day' | 'week';
  effectiveFactor: string;
  basis: string;
  assumptionStatus: TenderBoqPricingAssumptionStatus;
  sourceRefs: TenderSourceLocator[];
}

export interface TenderBoqProductivityBasis {
  methodSequence: string[];
  crew: TenderBoqCrewResource[];
  workingHoursPerDay: string;
  bottleneck: string;
  theoreticalProductionRate: string;
  calculationFormula: string;
  scenarios: TenderBoqProductivityScenario[];
}

export interface TenderBoqResourceCoverage {
  kind: TenderBoqDirectResourceKind;
  applicability: 'included' | 'not_applicable';
  basis: string;
}

export interface TenderBoqRateWebEvidence {
  url: string;
  title?: string;
  accessedAt: string;
  note?: string;
}

export interface TenderBoqRateBasis {
  sourceType:
    | 'supplier_quote'
    | 'historical_purchase'
    | 'internal_ledger'
    | 'published_schedule'
    | 'rental_quote'
    | 'owned_cost_model'
    | 'subcontract_quote'
    | 'market_evidence'
    | 'scenario';
  acquisitionMode: 'owned' | 'rented' | 'purchased' | 'subcontracted' | 'internal_transfer' | 'not_applicable';
  location: string;
  effectiveDate: string;
  vatTreatment: 'exclusive';
  /** Web price-verification hits collected during C5.1 Step 3 (市场询价核证). */
  webEvidence?: TenderBoqRateWebEvidence[];
}

export interface TenderBoqDirectCostSummary {
  labour: string;
  plant: string;
  material: string;
  subcontract: string;
  transport: string;
  waste: string;
  other: string;
  unitDirectCost: string;
  boqQuantity: string;
  itemDirectCost: string;
}

export interface TenderBoqRiskScenario {
  id: string;
  variable: string;
  optimistic: string;
  base: string;
  pessimistic: string;
  trigger: string;
  treatment: string;
  assumptionStatus: TenderBoqPricingAssumptionStatus;
  sourceRefs: TenderSourceLocator[];
}

export interface TenderBoqPricingCostComponent {
  id: string;
  kind: TenderBoqPricingResourceKind | 'overhead' | 'contingency' | 'escalation' | 'other';
  description: string;
  quantity: string;
  unit: string;
  rate: string;
  amount: string;
  rateSourceRef?: TenderSourceLocator;
  rateBasis?: TenderBoqRateBasis;
  assumptionStatus: TenderBoqPricingAssumptionStatus;
}

export interface TenderBoqPlanningBasis {
  methodId: string;
  productionRate: string;
  quantityUnit: string;
  timeUnit: 'hour' | 'shift' | 'working_day' | 'week';
  duration: string;
  calendarId: string;
  activityId: string;
  assumptionStatus: 'sourced' | 'scenario' | 'unverified';
  sourceRefs: TenderSourceLocator[];
}

export interface TenderBoqInitialCashFlowAllocation {
  period: string;
  activityId: string;
  weight: string;
  amount: string;
  basis: string;
  assumptionStatus: 'sourced' | 'scenario' | 'unverified';
  sourceRefs: TenderSourceLocator[];
}

export interface TenderBoqFiveStepItemBuildUp {
  boqItemId: string;
  status: 'draft' | 'reviewed' | 'blocked';
  steps: TenderBoqFiveStepRecord;
  itemIdentity?: TenderBoqItemIdentity;
  scopeBasis?: TenderBoqScopeBasis;
  productivityBasis?: TenderBoqProductivityBasis;
  resourceCoverage?: TenderBoqResourceCoverage[];
  resourceConsumptions: TenderBoqResourceConsumption[];
  planningBasis?: TenderBoqPlanningBasis;
  initialCashFlow?: TenderBoqInitialCashFlowAllocation[];
  costComponents: TenderBoqPricingCostComponent[];
  directCost: string;
  directCostSummary?: TenderBoqDirectCostSummary;
  riskScenarios?: TenderBoqRiskScenario[];
  conditions: string[];
  riskNotes: string[];
}

export interface TenderBoqPricingResourceSummary {
  kind: TenderBoqPricingResourceKind;
  description: string;
  quantity: string;
  unit: string;
}

export interface TenderBoqPricingAssumption {
  id: string;
  text: string;
  status: 'scenario' | 'unverified' | 'confirmed' | 'rejected';
  sourceRefs: TenderSourceLocator[];
}

export interface TenderBoqFiveStepPricingData {
  currency: string;
  /** Strategy id from project_boundary.pricing.pricingStandard (was C5.1-only). */
  pricingStandard?: string;
  vatTreatment?: string;
  indirectCostPolicy?: string;
  pricingStatus: 'draft' | 'reviewed' | 'blocked';
  itemBuildUps: TenderBoqFiveStepItemBuildUp[];
  resourceSummary: TenderBoqPricingResourceSummary[];
  assumptions: TenderBoqPricingAssumption[];
}

export interface TenderBoqFiveStepPricingAudit {
  schemaVersion: 1;
  capability: 'boq_five_step_pricing';
  projectId: string;
  coreRevision: number;
  generatedAt: string;
  readiness: TenderCapabilityReadiness;
  summary: {
    items: number;
    completeItems: number;
    blockedItems: number;
    unverifiedComponents: number;
    estimatedUnitRateSum: string;
    estimatedDirectCost: string;
  };
  issues: TenderCapabilityAuditIssue[];
}
