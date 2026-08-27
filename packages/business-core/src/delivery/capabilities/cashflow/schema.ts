import { z } from 'zod';
import { DeliveryEvidenceRefSchema } from '../../schema.ts';
import type { DeliveryCashflowData } from './types.ts';

const EntityId = z.string().regex(/^[A-Za-z0-9][A-Za-z0-9._-]{0,79}$/);
const Text = z.string().trim().min(1);
const Decimal = z.string().regex(/^(?:0|[1-9]\d*)(?:\.\d+)?$/, 'Expected a non-negative unformatted decimal string.');
const IsoDate = z.string().refine(
  (value) => /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(`${value}T00:00:00Z`)),
  'Expected an ISO date.',
);
const Period = z.string().regex(/^\d{4}-(?:0[1-9]|1[0-2])$/);
const Position = z.object({
  openingBalance: Decimal,
  inflow: Decimal,
  outflow: Decimal,
  closingBalance: Decimal,
});

export const DeliveryCashflowDataSchema = z.object({
  controlStatus: z.enum(['draft', 'reviewed', 'blocked']),
  dataDate: IsoDate,
  currency: z.string().regex(/^[A-Z]{3}$/),
  periods: z.array(z.object({
    period: Period,
    planned: Position,
    actual: Position,
    forecast: Position,
    evidenceRefs: z.array(DeliveryEvidenceRefSchema).default([]),
    status: z.enum(['draft', 'reviewed', 'blocked']),
  })),
  fundingConstraints: z.array(z.object({
    id: EntityId,
    title: Text,
    requiredAmount: Decimal,
    availableAmount: Decimal,
    dueDate: IsoDate,
    owner: Text,
    evidenceRefs: z.array(DeliveryEvidenceRefSchema).default([]),
    status: z.enum(['open', 'mitigated', 'closed', 'blocked']),
  })).default([]),
});

export function parseDeliveryCashflowData(value: unknown): DeliveryCashflowData {
  return DeliveryCashflowDataSchema.parse(value) as DeliveryCashflowData;
}
