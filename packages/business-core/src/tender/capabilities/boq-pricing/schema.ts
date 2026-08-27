import { z } from 'zod';
import { TenderSourceLocatorSchema } from '../../schema.ts';
import type { TenderBoqFiveStepPricingData } from './types.ts';

const EntityIdSchema = z.string().regex(/^[a-z0-9][a-z0-9._-]{0,79}$/i, 'Entity ID must be filesystem-safe.');
const NonEmptyString = z.string().trim().min(1);
const DecimalString = z.string().regex(/^(?:0|[1-9]\d*)(?:\.\d+)?$/, 'Expected a non-negative unformatted decimal string.');
const SignedDecimalString = z.string().regex(/^-?(?:0|[1-9]\d*)(?:\.\d+)?$/, 'Expected an unformatted decimal string.');
const PositiveDecimalString = DecimalString.refine((value) => /[1-9]/.test(value), 'Expected a positive decimal string.');
const AllocationWeightSchema = z.string().regex(
  /^(?:0(?:\.\d+)?|1(?:\.0+)?)$/,
  'Expected a decimal allocation weight between 0 and 1.',
);
const CurrencySchema = z.string().regex(/^[A-Z]{3}$/, 'Expected an ISO currency code.');
const ResourceKindSchema = z.enum(['labour', 'plant', 'material', 'subcontract', 'transport', 'waste', 'other']);
const DirectResourceKindSchema = z.enum(['labour', 'plant', 'material', 'subcontract', 'transport', 'waste']);
const AssumptionStatusSchema = z.enum(['sourced', 'scenario', 'unverified']);
const TimeUnitSchema = z.enum(['hour', 'shift', 'working_day', 'week']);
const DateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Expected a YYYY-MM-DD date.');

const TenderBoqPricingStepSchema = z.object({
  narrative: z.string(),
  sourceRefs: z.array(TenderSourceLocatorSchema).default([]),
}).strict();

const TenderBoqFiveStepRecordSchema = z.object({
  scopeQuantity: TenderBoqPricingStepSchema,
  methodProductivity: TenderBoqPricingStepSchema,
  resourceConsumption: TenderBoqPricingStepSchema,
  sourcedRatesDirectCost: TenderBoqPricingStepSchema,
  reconciliationRisk: TenderBoqPricingStepSchema,
}).strict();

const TenderBoqResourceConsumptionSchema = z.object({
  id: EntityIdSchema,
  kind: ResourceKindSchema,
  description: NonEmptyString,
  quantity: SignedDecimalString,
  unit: NonEmptyString,
  assumptionStatus: AssumptionStatusSchema,
  quantityBasis: z.literal('per_boq_unit').optional(),
  calculationBasis: NonEmptyString.optional(),
  costComponentId: EntityIdSchema.optional(),
  sourceRefs: z.array(TenderSourceLocatorSchema).optional(),
}).strict();

const TenderBoqItemIdentitySchema = z.object({
  code: NonEmptyString,
  description: NonEmptyString,
  unit: NonEmptyString,
  quantity: DecimalString,
  sourceRef: TenderSourceLocatorSchema,
}).strict();

const TenderBoqScopeBasisSchema = z.object({
  specificationRefs: z.array(TenderSourceLocatorSchema),
  measurementRuleRefs: z.array(TenderSourceLocatorSchema),
  inclusions: z.array(NonEmptyString),
  exclusions: z.array(NonEmptyString),
  testingRequirements: z.array(NonEmptyString),
  methodConstraints: z.array(NonEmptyString),
}).strict();

const TenderBoqCrewResourceSchema = z.object({
  id: EntityIdSchema,
  kind: z.enum(['labour', 'plant']),
  description: NonEmptyString,
  count: PositiveDecimalString,
  assumptionStatus: AssumptionStatusSchema,
  sourceRefs: z.array(TenderSourceLocatorSchema),
}).strict();

const TenderBoqProductivityScenarioSchema = z.object({
  scenario: z.enum(['optimistic', 'base', 'pessimistic']),
  productionRate: PositiveDecimalString,
  quantityUnit: NonEmptyString,
  timeUnit: TimeUnitSchema,
  effectiveFactor: AllocationWeightSchema.refine((value) => /[1-9]/.test(value), 'Expected an effective factor above zero.'),
  basis: NonEmptyString,
  assumptionStatus: AssumptionStatusSchema,
  sourceRefs: z.array(TenderSourceLocatorSchema),
}).strict();

const TenderBoqProductivityBasisSchema = z.object({
  methodSequence: z.array(NonEmptyString),
  crew: uniqueBy(TenderBoqCrewResourceSchema, 'id'),
  workingHoursPerDay: PositiveDecimalString,
  bottleneck: NonEmptyString,
  theoreticalProductionRate: PositiveDecimalString,
  calculationFormula: NonEmptyString,
  scenarios: uniqueBy(TenderBoqProductivityScenarioSchema, 'scenario'),
}).strict();

const TenderBoqResourceCoverageSchema = z.object({
  kind: DirectResourceKindSchema,
  applicability: z.enum(['included', 'not_applicable']),
  basis: NonEmptyString,
}).strict();

const TenderBoqRateWebEvidenceSchema = z.object({
  url: z.string().regex(/^https?:\/\//i, 'Expected an http(s) evidence URL.'),
  title: NonEmptyString.optional(),
  accessedAt: DateSchema,
  note: NonEmptyString.optional(),
}).strict();

const TenderBoqRateBasisSchema = z.object({
  sourceType: z.enum([
    'supplier_quote', 'historical_purchase', 'internal_ledger', 'published_schedule',
    'rental_quote', 'owned_cost_model', 'subcontract_quote', 'market_evidence', 'scenario',
  ]),
  acquisitionMode: z.enum(['owned', 'rented', 'purchased', 'subcontracted', 'internal_transfer', 'not_applicable']),
  location: NonEmptyString,
  effectiveDate: DateSchema,
  vatTreatment: z.literal('exclusive'),
  webEvidence: z.array(TenderBoqRateWebEvidenceSchema).optional(),
}).strict();

const TenderBoqDirectCostSummarySchema = z.object({
  labour: SignedDecimalString,
  plant: SignedDecimalString,
  material: SignedDecimalString,
  subcontract: SignedDecimalString,
  transport: SignedDecimalString,
  waste: SignedDecimalString,
  other: SignedDecimalString,
  unitDirectCost: SignedDecimalString,
  boqQuantity: DecimalString,
  itemDirectCost: SignedDecimalString,
}).strict();

const TenderBoqRiskScenarioSchema = z.object({
  id: EntityIdSchema,
  variable: NonEmptyString,
  optimistic: NonEmptyString,
  base: NonEmptyString,
  pessimistic: NonEmptyString,
  trigger: NonEmptyString,
  treatment: NonEmptyString,
  assumptionStatus: AssumptionStatusSchema,
  sourceRefs: z.array(TenderSourceLocatorSchema),
}).strict();

const TenderBoqPricingCostComponentSchema = z.object({
  id: EntityIdSchema,
  kind: z.enum(['labour', 'plant', 'material', 'subcontract', 'transport', 'waste', 'overhead', 'contingency', 'escalation', 'other']),
  description: NonEmptyString,
  quantity: SignedDecimalString,
  unit: NonEmptyString,
  rate: SignedDecimalString,
  amount: SignedDecimalString,
  rateSourceRef: TenderSourceLocatorSchema.optional(),
  rateBasis: TenderBoqRateBasisSchema.optional(),
  assumptionStatus: AssumptionStatusSchema,
}).strict();

const TenderBoqPlanningBasisSchema = z.object({
  methodId: EntityIdSchema,
  productionRate: PositiveDecimalString,
  quantityUnit: NonEmptyString,
  timeUnit: TimeUnitSchema,
  duration: PositiveDecimalString,
  calendarId: EntityIdSchema,
  activityId: EntityIdSchema,
  assumptionStatus: AssumptionStatusSchema,
  sourceRefs: z.array(TenderSourceLocatorSchema).default([]),
}).strict();

const TenderBoqInitialCashFlowAllocationSchema = z.object({
  period: z.string().regex(/^\d{4}-(?:0[1-9]|1[0-2])$/, 'Expected a YYYY-MM period.'),
  activityId: EntityIdSchema,
  weight: AllocationWeightSchema,
  amount: SignedDecimalString,
  basis: NonEmptyString,
  assumptionStatus: AssumptionStatusSchema,
  sourceRefs: z.array(TenderSourceLocatorSchema).default([]),
}).strict();

const TenderBoqFiveStepItemBuildUpSchema = z.object({
  boqItemId: EntityIdSchema,
  status: z.enum(['draft', 'reviewed', 'blocked']),
  steps: TenderBoqFiveStepRecordSchema,
  itemIdentity: TenderBoqItemIdentitySchema.optional(),
  scopeBasis: TenderBoqScopeBasisSchema.optional(),
  productivityBasis: TenderBoqProductivityBasisSchema.optional(),
  resourceCoverage: uniqueBy(TenderBoqResourceCoverageSchema, 'kind').optional(),
  resourceConsumptions: z.array(TenderBoqResourceConsumptionSchema).default([]),
  planningBasis: TenderBoqPlanningBasisSchema.optional(),
  initialCashFlow: uniqueBy(TenderBoqInitialCashFlowAllocationSchema, 'period').optional(),
  costComponents: uniqueBy(TenderBoqPricingCostComponentSchema, 'id').default([]),
  directCost: SignedDecimalString,
  directCostSummary: TenderBoqDirectCostSummarySchema.optional(),
  riskScenarios: uniqueBy(TenderBoqRiskScenarioSchema, 'id').optional(),
  conditions: z.array(NonEmptyString).default([]),
  riskNotes: z.array(NonEmptyString).default([]),
}).strict();

const TenderBoqPricingResourceSummarySchema = z.object({
  kind: ResourceKindSchema,
  description: NonEmptyString,
  quantity: DecimalString,
  unit: NonEmptyString,
}).strict();

const TenderBoqPricingAssumptionSchema = z.object({
  id: EntityIdSchema,
  text: NonEmptyString,
  status: z.enum(['scenario', 'unverified', 'confirmed', 'rejected']),
  sourceRefs: z.array(TenderSourceLocatorSchema).default([]),
}).strict();

export const TenderBoqFiveStepPricingDataSchema = z.object({
  currency: CurrencySchema,
  pricingStandard: NonEmptyString.optional(),
  vatTreatment: NonEmptyString.optional(),
  indirectCostPolicy: NonEmptyString.optional(),
  pricingStatus: z.enum(['draft', 'reviewed', 'blocked']),
  itemBuildUps: uniqueBy(TenderBoqFiveStepItemBuildUpSchema, 'boqItemId'),
  resourceSummary: z.array(TenderBoqPricingResourceSummarySchema).default([]),
  assumptions: uniqueBy(TenderBoqPricingAssumptionSchema, 'id'),
}).strict();

export function parseTenderBoqFiveStepPricingData(value: unknown): TenderBoqFiveStepPricingData {
  return TenderBoqFiveStepPricingDataSchema.parse(value) as TenderBoqFiveStepPricingData;
}

function uniqueBy<T extends z.ZodType<Record<K, string>>, K extends string>(schema: T, key: K) {
  return z.array(schema).superRefine((records, context) => {
    const seen = new Set<string>();
    records.forEach((record, index) => {
      if (seen.has(record[key])) {
        context.addIssue({ code: 'custom', path: [index, key], message: `Duplicate ${key}: ${record[key]}` });
      }
      seen.add(record[key]);
    });
  });
}
