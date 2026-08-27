import { z } from 'zod';
import type { DeliveryCapabilityEnvelope, DeliveryCapabilityIndex } from './types.ts';

const CapabilityIdSchema = z.enum([
  'contract_scope', 'programme_progress', 'resource_procurement', 'cost_commercial',
  'cashflow', 'risk_change', 'reporting_audit',
]);

export const DeliveryCapabilityEnvelopeSchema = z.object({
  schemaVersion: z.literal(1),
  capability: CapabilityIdSchema,
  projectId: z.string().regex(/^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/),
  revision: z.number().int().positive(),
  coreRevision: z.number().int().nonnegative(),
  upstream: z.array(z.object({
    capability: z.union([z.literal('core'), CapabilityIdSchema]),
    revision: z.number().int().nonnegative(),
  })).superRefine((refs, context) => {
    const seen = new Set<string>();
    refs.forEach((ref, index) => {
      if (seen.has(ref.capability)) context.addIssue({ code: 'custom', path: [index, 'capability'], message: `Duplicate upstream capability ${ref.capability}.` });
      seen.add(ref.capability);
    });
  }),
  updatedAt: z.string().refine((value) => value.includes('T') && Number.isFinite(Date.parse(value))),
  data: z.unknown(),
});

export const DeliveryCapabilityIndexSchema = z.object({
  schemaVersion: z.literal(1),
  projectId: z.string().regex(/^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/),
  coreRevision: z.number().int().nonnegative(),
  capabilities: z.array(z.object({
    capability: CapabilityIdSchema,
    enabled: z.boolean(),
    required: z.boolean(),
    revision: z.number().int().nonnegative(),
    readiness: z.enum(['not_ready', 'needs_review', 'ready']),
    issueCount: z.number().int().nonnegative(),
    stale: z.boolean(),
    updatedAt: z.string().refine((value) => value.includes('T') && Number.isFinite(Date.parse(value))),
  })),
});

export function parseDeliveryCapabilityEnvelope(value: unknown): DeliveryCapabilityEnvelope {
  return DeliveryCapabilityEnvelopeSchema.parse(value) as DeliveryCapabilityEnvelope;
}

export function parseDeliveryCapabilityIndex(value: unknown): DeliveryCapabilityIndex {
  return DeliveryCapabilityIndexSchema.parse(value) as DeliveryCapabilityIndex;
}
