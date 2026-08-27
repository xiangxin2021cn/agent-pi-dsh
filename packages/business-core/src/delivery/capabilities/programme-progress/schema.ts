import { z } from 'zod';
import { DeliveryEvidenceRefSchema } from '../../schema.ts';
import type { DeliveryProgrammeProgressData } from './types.ts';

const EntityId = z.string().regex(/^[A-Za-z0-9][A-Za-z0-9._-]{0,79}$/);
const Text = z.string().trim().min(1);
const IsoDate = z.string().refine(
  (value) => /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(`${value}T00:00:00Z`)),
  'Expected an ISO date.',
);

export const DeliveryProgrammeProgressDataSchema = z.object({
  programmeStatus: z.enum(['draft', 'reviewed', 'blocked']),
  dataDate: IsoDate,
  calendars: z.array(z.object({
    id: EntityId,
    name: Text,
    workingDays: z.array(z.number().int().min(0).max(6)).min(1),
    exceptions: z.array(IsoDate).default([]),
  })),
  activities: z.array(z.object({
    id: EntityId,
    scopeItemId: EntityId,
    name: Text,
    calendarId: EntityId,
    baselineStart: IsoDate,
    baselineFinish: IsoDate,
    actualStart: IsoDate.optional(),
    actualFinish: IsoDate.optional(),
    remainingDurationDays: z.number().int().nonnegative(),
    forecastStart: IsoDate,
    forecastFinish: IsoDate,
    percentComplete: z.number().min(0).max(100),
    predecessors: z.array(z.object({
      activityId: EntityId,
      type: z.enum(['FS', 'SS', 'FF', 'SF']),
      lagDays: z.number().int(),
    })).default([]),
    progressEvidenceRefs: z.array(DeliveryEvidenceRefSchema).default([]),
    status: z.enum(['completed', 'in_progress', 'not_started', 'blocked']),
    confidence: z.enum(['confirmed', 'scenario', 'unverified']),
  })),
  milestones: z.array(z.object({
    id: EntityId,
    title: Text,
    activityId: EntityId,
    kind: z.enum(['contractual', 'internal']),
    baselineDate: IsoDate,
    forecastDate: IsoDate,
    evidenceRefs: z.array(DeliveryEvidenceRefSchema).default([]),
  })).default([]),
  recoveryScenarios: z.array(z.object({
    id: EntityId,
    title: Text,
    status: z.enum(['draft', 'reviewed']),
    assumptions: z.array(Text).default([]),
    activityAdjustments: z.array(z.object({
      activityId: EntityId,
      forecastFinish: IsoDate,
      remainingDurationDays: z.number().int().nonnegative(),
    })).default([]),
  })).default([]),
});

export function parseDeliveryProgrammeProgressData(value: unknown): DeliveryProgrammeProgressData {
  return DeliveryProgrammeProgressDataSchema.parse(value) as DeliveryProgrammeProgressData;
}
