import { z } from 'zod';
import { DeliveryEvidenceRefSchema } from '../../schema.ts';
import type { DeliveryRiskChangeData } from './types.ts';

const EntityId = z.string().regex(/^[A-Za-z0-9][A-Za-z0-9._-]{0,79}$/);
const Text = z.string().trim().min(1);
const Decimal = z.string().regex(/^(?:0|[1-9]\d*)(?:\.\d+)?$/, 'Expected a non-negative unformatted decimal string.');
const IsoDate = z.string().refine(
  (value) => /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(`${value}T00:00:00Z`)),
  'Expected an ISO date.',
);

export const DeliveryRiskChangeDataSchema = z.object({
  controlStatus: z.enum(['draft', 'reviewed', 'blocked']),
  dataDate: IsoDate,
  currency: z.string().regex(/^[A-Z]{3}$/),
  risks: z.array(z.object({
    id: EntityId, type: z.enum(['risk', 'opportunity']), title: Text,
    scopeItemIds: z.array(EntityId).default([]), cause: Text, effect: Text,
    probability: z.number().int().min(1).max(5), impact: z.number().int().min(1).max(5),
    rating: z.number().int().min(1).max(25), owner: Text, dueDate: IsoDate, response: Text,
    evidenceRefs: z.array(DeliveryEvidenceRefSchema).default([]),
    status: z.enum(['open', 'mitigated', 'closed', 'blocked']),
    confidence: z.enum(['confirmed', 'scenario', 'unverified']),
  })).default([]),
  issues: z.array(z.object({
    id: EntityId, title: Text, scopeItemIds: z.array(EntityId).default([]), owner: Text, dueDate: IsoDate,
    resolution: Text.optional(), evidenceRefs: z.array(DeliveryEvidenceRefSchema).default([]),
    status: z.enum(['open', 'resolved', 'blocked']),
  })).default([]),
  notices: z.array(z.object({
    id: EntityId, type: z.enum(['contractual', 'early_warning', 'instruction']), obligationId: EntityId.optional(),
    title: Text, dueDate: IsoDate, sentDate: IsoDate.optional(), evidenceRefs: z.array(DeliveryEvidenceRefSchema).default([]),
    status: z.enum(['draft', 'issued', 'acknowledged', 'overdue', 'blocked']),
  })).default([]),
  changes: z.array(z.object({
    id: EntityId, title: Text, scopeItemIds: z.array(EntityId).default([]), noticeIds: z.array(EntityId).default([]),
    costImpact: Decimal, scheduleImpactDays: z.number().int(), evidenceRefs: z.array(DeliveryEvidenceRefSchema).default([]),
    status: z.enum(['identified', 'submitted', 'approved', 'rejected', 'implemented', 'blocked']),
    confidence: z.enum(['confirmed', 'scenario', 'unverified']),
  })).default([]),
  claims: z.array(z.object({
    id: EntityId, title: Text, changeIds: z.array(EntityId).default([]), noticeIds: z.array(EntityId).default([]),
    amount: Decimal, extensionDays: z.number().int(), evidenceRefs: z.array(DeliveryEvidenceRefSchema).default([]),
    status: z.enum(['potential', 'submitted', 'agreed', 'rejected', 'blocked']),
  })).default([]),
  decisions: z.array(z.object({
    id: EntityId, title: Text, relatedEntityIds: z.array(EntityId).min(1), owner: Text, dueDate: IsoDate,
    decidedAt: IsoDate.optional(), decision: Text.optional(), evidenceRefs: z.array(DeliveryEvidenceRefSchema).default([]),
    status: z.enum(['pending', 'approved', 'rejected', 'blocked']),
  })).default([]),
});

export function parseDeliveryRiskChangeData(value: unknown): DeliveryRiskChangeData {
  return DeliveryRiskChangeDataSchema.parse(value) as DeliveryRiskChangeData;
}
