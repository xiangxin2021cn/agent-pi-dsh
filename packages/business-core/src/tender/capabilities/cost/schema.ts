import { z } from 'zod';
import { TenderSourceLocatorSchema } from '../../schema.ts';
import type { TenderCostCashFlowData } from './types.ts';

const EntityIdSchema = z.string().regex(/^[a-z0-9][a-z0-9._-]{0,79}$/i, 'Entity ID must be filesystem-safe.');
const NonEmptyString = z.string().trim().min(1);
const DecimalString = z.string().regex(/^(?:0|[1-9]\d*)(?:\.\d+)?$/, 'Expected a non-negative unformatted decimal string.');
const CurrencySchema = z.string().regex(/^[A-Z]{3}$/, 'Expected an ISO currency code.');
const DateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Expected an ISO date.').refine((value) => {
  const parsed = new Date(`${value}T00:00:00Z`);
  return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}, 'Expected a valid date.');

const TenderRateSourceSchema = z.object({
  id: EntityIdSchema,
  description: NonEmptyString,
  sourceRef: TenderSourceLocatorSchema,
  currency: CurrencySchema,
  effectiveAt: DateSchema,
}).strict();

const TenderCostComponentSchema = z.object({
  id: EntityIdSchema,
  kind: z.enum([
    'labour',
    'plant',
    'material',
    'subcontract',
    'overhead',
    'contingency',
    'tax',
    'escalation',
    'financing',
    'other',
  ]),
  description: NonEmptyString,
  quantity: DecimalString,
  unit: NonEmptyString,
  rate: DecimalString,
  rateSourceId: EntityIdSchema.optional(),
  scenarioId: EntityIdSchema.optional(),
  assumptionStatus: z.enum(['sourced', 'scenario', 'unverified']),
}).strict();

const TenderBoqCostBuildUpSchema = z.object({
  boqItemId: EntityIdSchema,
  componentIds: z.array(EntityIdSchema).min(1),
  total: DecimalString,
}).strict();

const TenderCashFlowPeriodSchema = z.object({
  period: z.string().regex(/^\d{4}-(?:0[1-9]|1[0-2])$/, 'Expected a YYYY-MM period.'),
  activityIds: z.array(EntityIdSchema).min(1),
  plannedCost: DecimalString,
  cumulativeCost: DecimalString,
}).strict();

const TenderCostScenarioSchema = z.object({
  id: EntityIdSchema,
  title: NonEmptyString,
  assumptions: z.array(NonEmptyString).min(1),
  active: z.boolean(),
}).strict();

export const TenderCostCashFlowDataSchema = z.object({
  currency: CurrencySchema,
  costStatus: z.enum(['draft', 'reviewed', 'blocked']),
  rateSources: uniqueBy(TenderRateSourceSchema, 'id'),
  components: uniqueBy(TenderCostComponentSchema, 'id'),
  buildUps: uniqueBy(TenderBoqCostBuildUpSchema, 'boqItemId'),
  cashFlow: uniqueBy(TenderCashFlowPeriodSchema, 'period'),
  scenarios: uniqueBy(TenderCostScenarioSchema, 'id').superRefine((scenarios, context) => {
    if (scenarios.filter((scenario) => scenario.active).length > 1) {
      context.addIssue({ code: 'custom', message: 'Only one cost scenario can be active.' });
    }
  }),
}).strict();

export function parseTenderCostCashFlowData(value: unknown): TenderCostCashFlowData {
  return TenderCostCashFlowDataSchema.parse(value) as TenderCostCashFlowData;
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
