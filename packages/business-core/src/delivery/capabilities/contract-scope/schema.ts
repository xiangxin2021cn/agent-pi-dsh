import { z } from 'zod';
import { DeliveryEvidenceRefSchema } from '../../schema.ts';
import type { DeliveryContractScopeData } from './types.ts';

const EntityId = z.string().regex(/^[A-Za-z0-9][A-Za-z0-9._-]{0,79}$/);
const Text = z.string().trim().min(1);

export const DeliveryContractScopeDataSchema = z.object({
  baselineStatus: z.enum(['draft', 'reviewed', 'blocked']),
  obligations: z.array(z.object({
    id: EntityId,
    title: Text,
    type: z.enum(['notice', 'payment', 'time', 'quality', 'hse', 'environment', 'insurance', 'bond', 'other']),
    owner: Text,
    evidenceRefs: z.array(DeliveryEvidenceRefSchema).default([]),
    status: z.enum(['open', 'planned', 'compliant', 'noncompliant', 'blocked']),
  })),
  scopeItems: z.array(z.object({
    id: EntityId,
    wbsCode: Text,
    title: Text,
    inclusionStatus: z.enum(['included', 'excluded', 'clarification']),
    owner: Text,
    acceptanceCriteria: z.array(Text).default([]),
    evidenceRefs: z.array(DeliveryEvidenceRefSchema).default([]),
    status: z.enum(['draft', 'reviewed', 'blocked']),
  })),
  responsibilityAssignments: z.array(z.object({
    id: EntityId,
    scopeItemIds: z.array(EntityId).min(1),
    responsible: z.array(Text).min(1),
    accountable: Text,
    consulted: z.array(Text).default([]),
    informed: z.array(Text).default([]),
    interfaces: z.array(Text).default([]),
    status: z.enum(['draft', 'reviewed', 'blocked']),
  })),
});

export function parseDeliveryContractScopeData(value: unknown): DeliveryContractScopeData {
  return DeliveryContractScopeDataSchema.parse(value) as DeliveryContractScopeData;
}
