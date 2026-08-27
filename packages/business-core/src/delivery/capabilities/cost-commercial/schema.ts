import { z } from 'zod';
import { DeliveryEvidenceRefSchema } from '../../schema.ts';
import type { DeliveryCostCommercialData } from './types.ts';

const EntityId = z.string().regex(/^[A-Za-z0-9][A-Za-z0-9._-]{0,79}$/);
const Text = z.string().trim().min(1);
const Decimal = z.string().regex(/^(?:0|[1-9]\d*)(?:\.\d+)?$/, 'Expected a non-negative unformatted decimal string.');
const IsoDate = z.string().refine(
  (value) => /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(`${value}T00:00:00Z`)),
  'Expected an ISO date.',
);
const Period = z.string().regex(/^\d{4}-(?:0[1-9]|1[0-2])$/);

const Transaction = z.object({
  id: EntityId,
  costCodeId: EntityId,
  period: Period,
  amount: Decimal,
  evidenceRefs: z.array(DeliveryEvidenceRefSchema).default([]),
  status: z.enum(['draft', 'posted', 'reversed']),
});

export const DeliveryCostCommercialDataSchema = z.object({
  controlStatus: z.enum(['draft', 'reviewed', 'blocked']),
  dataDate: IsoDate,
  currency: z.string().regex(/^[A-Z]{3}$/),
  budgetLines: z.array(z.object({
    id: EntityId,
    scopeItemId: EntityId,
    activityIds: z.array(EntityId).min(1),
    title: Text,
    approvedBudget: Decimal,
    approvedVariationAmount: Decimal,
    currentBudget: Decimal,
    evidenceRefs: z.array(DeliveryEvidenceRefSchema).default([]),
    status: z.enum(['draft', 'reviewed', 'blocked']),
  })),
  commitments: z.array(z.object({
    id: EntityId,
    costCodeId: EntityId,
    supplier: Text,
    committedAmount: Decimal,
    evidenceRefs: z.array(DeliveryEvidenceRefSchema).default([]),
    status: z.enum(['draft', 'confirmed', 'cancelled', 'blocked']),
  })).default([]),
  actualCosts: z.array(Transaction).default([]),
  accruals: z.array(Transaction).default([]),
  variations: z.array(z.object({
    id: EntityId,
    costCodeId: EntityId,
    title: Text,
    amount: Decimal,
    evidenceRefs: z.array(DeliveryEvidenceRefSchema).default([]),
    status: z.enum(['pending', 'approved', 'rejected', 'blocked']),
  })).default([]),
  forecasts: z.array(z.object({
    costCodeId: EntityId,
    forecastToComplete: Decimal,
    estimateAtCompletion: Decimal,
    evidenceRefs: z.array(DeliveryEvidenceRefSchema).default([]),
    confidence: z.enum(['confirmed', 'scenario', 'unverified']),
  })).default([]),
});

export function parseDeliveryCostCommercialData(value: unknown): DeliveryCostCommercialData {
  return DeliveryCostCommercialDataSchema.parse(value) as DeliveryCostCommercialData;
}
