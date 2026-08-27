import { z } from 'zod';
import { TenderSourceLocatorSchema } from '../../schema.ts';
import type { TenderConstructionResourceScheduleData } from './types.ts';

const EntityIdSchema = z.string().regex(/^[a-z0-9][a-z0-9._-]{0,79}$/i, 'Entity ID must be filesystem-safe.');
const NonEmptyString = z.string().trim().min(1);
const DecimalStringSchema = z.string().regex(/^(?:0|[1-9]\d*)(?:\.\d+)?$/, 'Expected a non-negative unformatted decimal string.');

const RowSchema = z.object({
  id: EntityIdSchema,
  category: z.enum(['labour', 'plant', 'material', 'subcontract', 'transport', 'waste', 'other']),
  name: NonEmptyString,
  unit: NonEmptyString,
  totalQuantity: DecimalStringSchema,
  unitRate: DecimalStringSchema.optional(),
  currency: z.string().regex(/^[A-Z]{3}$/).optional(),
  sourceBoqItemIds: z.array(EntityIdSchema).min(1),
  assumptionStatus: z.enum(['sourced', 'scenario', 'unverified']),
  sourceRefs: z.array(TenderSourceLocatorSchema).default([]),
}).strict();

export const TenderConstructionResourceScheduleDataSchema = z.object({
  currency: z.string().regex(/^[A-Z]{3}$/).optional(),
  location: NonEmptyString.optional(),
  asOf: z.string().optional(),
  rows: z.array(RowSchema).min(1),
  notes: z.array(NonEmptyString).optional(),
}).strict();

export function parseTenderConstructionResourceScheduleData(value: unknown): TenderConstructionResourceScheduleData {
  return TenderConstructionResourceScheduleDataSchema.parse(value) as TenderConstructionResourceScheduleData;
}
