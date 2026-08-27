import { z } from 'zod';
import { TenderSourceLocatorSchema } from '../../schema.ts';
import type { TenderBoqReconciliationData } from './types.ts';

const EntityIdSchema = z.string().regex(/^[a-z0-9][a-z0-9._-]{0,79}$/i, 'Entity ID must be filesystem-safe.');
const NonEmptyString = z.string().trim().min(1);
const DecimalStringSchema = z.string().regex(/^-?(?:0|[1-9]\d*)(?:\.\d+)?$/, 'Expected an unformatted decimal string.');

export const TenderBoqItemSchema = z.object({
  id: EntityIdSchema,
  source: TenderSourceLocatorSchema,
  code: NonEmptyString,
  description: NonEmptyString,
  unit: NonEmptyString,
  quantity: DecimalStringSchema.optional(),
  quantityBasis: z.enum(['boq', 'calculated', 'assumption', 'not_provided']),
  quantityStatus: z.enum(['sourced', 'verified', 'unverified']),
  quantityRefs: z.array(TenderSourceLocatorSchema).default([]),
}).strict().superRefine((item, context) => {
  if (item.quantityBasis === 'not_provided' && item.quantity !== undefined) {
    context.addIssue({ code: 'custom', path: ['quantity'], message: 'A not_provided quantity basis cannot include a quantity.' });
  }
  if (item.quantityBasis !== 'not_provided' && item.quantity === undefined) {
    context.addIssue({ code: 'custom', path: ['quantity'], message: 'The selected quantity basis requires a quantity.' });
  }
  if (item.quantityBasis === 'boq' && item.quantityStatus !== 'sourced') {
    context.addIssue({ code: 'custom', path: ['quantityStatus'], message: 'A BOQ quantity must be marked sourced.' });
  }
});

const TenderScopeAssumptionSchema = z.object({
  text: NonEmptyString,
  status: z.enum(['unverified', 'confirmed', 'rejected']),
  sourceRefs: z.array(TenderSourceLocatorSchema).default([]),
}).strict();

export const TenderScopeLinkSchema = z.object({
  boqItemId: EntityIdSchema,
  requirementIds: z.array(EntityIdSchema).default([]),
  specificationRefs: z.array(TenderSourceLocatorSchema).default([]),
  drawingRefs: z.array(TenderSourceLocatorSchema).default([]),
  measurementRuleRefs: z.array(TenderSourceLocatorSchema).default([]),
  inclusions: z.array(NonEmptyString).default([]),
  exclusions: z.array(NonEmptyString).default([]),
  assumptions: z.array(TenderScopeAssumptionSchema).default([]),
  gapStatus: z.enum(['clear', 'needs_review', 'blocked']),
}).strict();

export const TenderBoqReconciliationDataSchema = z.object({
  items: uniqueBy(TenderBoqItemSchema, 'id'),
  scopeLinks: uniqueBy(TenderScopeLinkSchema, 'boqItemId'),
}).strict();

export function parseTenderBoqReconciliationData(value: unknown): TenderBoqReconciliationData {
  return TenderBoqReconciliationDataSchema.parse(value) as TenderBoqReconciliationData;
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
