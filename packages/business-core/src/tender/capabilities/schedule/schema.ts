import { z } from 'zod';
import { TenderSourceLocatorSchema } from '../../schema.ts';
import type { TenderScheduleResourceData } from './types.ts';

const EntityIdSchema = z.string().regex(/^[a-z0-9][a-z0-9._-]{0,79}$/i, 'Entity ID must be filesystem-safe.');
const NonEmptyString = z.string().trim().min(1);
const PositiveDecimalString = z.string().regex(/^(?:0*[1-9]\d*)(?:\.\d+)?$|^0*\.\d*[1-9]\d*$/, 'Expected a positive unformatted decimal string.');
const DateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Expected an ISO date.').refine(
  (value) => {
    const parsed = new Date(`${value}T00:00:00Z`);
    return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
  },
  'Expected a valid date.',
);

const TenderCalendarSchema = z.object({
  id: EntityIdSchema,
  name: NonEmptyString,
  workingDays: z.array(z.number().int().min(1).max(7)).min(1).superRefine(uniqueNumbers),
  exceptions: z.array(NonEmptyString).default([]),
}).strict();

const TenderActivitySchema = z.object({
  id: EntityIdSchema,
  workPackageId: EntityIdSchema,
  name: NonEmptyString,
  durationDays: z.number().positive().finite(),
  durationBasis: NonEmptyString,
  calendarId: EntityIdSchema,
  predecessors: z.array(z.object({
    activityId: EntityIdSchema,
    type: z.enum(['FS', 'SS', 'FF', 'SF']),
    lagDays: z.number().finite(),
  }).strict()).default([]),
  requirementIds: z.array(EntityIdSchema).default([]),
  sourceRefs: z.array(TenderSourceLocatorSchema).default([]),
  confidence: z.enum(['confirmed', 'scenario', 'unverified']),
}).strict();

const TenderResourceSchema = z.object({
  id: EntityIdSchema,
  class: NonEmptyString,
  capacity: PositiveDecimalString.optional(),
  unit: NonEmptyString.optional(),
  calendarId: EntityIdSchema,
}).strict().superRefine((resource, context) => {
  if (resource.capacity !== undefined && !resource.unit) {
    context.addIssue({ code: 'custom', path: ['unit'], message: 'A resource capacity requires a unit.' });
  }
});

const TenderResourceAssignmentSchema = z.object({
  activityId: EntityIdSchema,
  resourceId: EntityIdSchema,
  demand: PositiveDecimalString,
}).strict();

const TenderMilestoneSchema = z.object({
  id: EntityIdSchema,
  name: NonEmptyString,
  activityId: EntityIdSchema,
  kind: z.enum(['contractual', 'internal']),
  requirementIds: z.array(EntityIdSchema).default([]),
}).strict();

export const TenderScheduleResourceDataSchema = z.object({
  programmeStart: DateSchema,
  programmeStatus: z.enum(['draft', 'reviewed', 'blocked']),
  calendars: uniqueBy(TenderCalendarSchema, 'id'),
  activities: uniqueBy(TenderActivitySchema, 'id'),
  resources: uniqueBy(TenderResourceSchema, 'id'),
  assignments: z.array(TenderResourceAssignmentSchema).superRefine((assignments, context) => {
    const seen = new Set<string>();
    assignments.forEach((assignment, index) => {
      const key = `${assignment.activityId}:${assignment.resourceId}`;
      if (seen.has(key)) {
        context.addIssue({ code: 'custom', path: [index], message: `Duplicate resource assignment: ${key}` });
      }
      seen.add(key);
    });
  }),
  milestones: uniqueBy(TenderMilestoneSchema, 'id'),
}).strict();

export function parseTenderScheduleResourceData(value: unknown): TenderScheduleResourceData {
  return TenderScheduleResourceDataSchema.parse(value) as TenderScheduleResourceData;
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

function uniqueNumbers(values: number[], context: z.RefinementCtx): void {
  if (new Set(values).size !== values.length) {
    context.addIssue({ code: 'custom', message: 'Working days must be unique.' });
  }
}
