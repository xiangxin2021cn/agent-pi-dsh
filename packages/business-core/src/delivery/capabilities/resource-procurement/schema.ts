import { z } from 'zod';
import { DeliveryEvidenceRefSchema } from '../../schema.ts';
import type { DeliveryResourceProcurementData } from './types.ts';

const EntityId = z.string().regex(/^[A-Za-z0-9][A-Za-z0-9._-]{0,79}$/);
const Text = z.string().trim().min(1);
const IsoDate = z.string().refine(
  (value) => /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(`${value}T00:00:00Z`)),
  'Expected an ISO date.',
);

export const DeliveryResourceProcurementDataSchema = z.object({
  controlStatus: z.enum(['draft', 'reviewed', 'blocked']),
  dataDate: IsoDate,
  resources: z.array(z.object({
    id: EntityId,
    category: z.enum(['labour', 'plant', 'material', 'subcontract']),
    name: Text,
    unit: Text,
    availableQuantity: z.number().positive(),
    capacityPerDay: z.number().positive().optional(),
    evidenceRefs: z.array(DeliveryEvidenceRefSchema).default([]),
    status: z.enum(['draft', 'confirmed', 'blocked']),
  })),
  allocations: z.array(z.object({
    id: EntityId,
    resourceId: EntityId,
    activityId: EntityId,
    plannedStart: IsoDate,
    plannedFinish: IsoDate,
    requiredQuantity: z.number().positive(),
    demandPerDay: z.number().positive().optional(),
    evidenceRefs: z.array(DeliveryEvidenceRefSchema).default([]),
    status: z.enum(['draft', 'reviewed', 'blocked']),
  })),
  procurementPackages: z.array(z.object({
    id: EntityId,
    title: Text,
    category: z.enum(['material', 'subcontract', 'plant']),
    resourceIds: z.array(EntityId).min(1),
    activityIds: z.array(EntityId).min(1),
    requiredOnSiteDate: IsoDate,
    forecastDeliveryDate: IsoDate,
    actualDeliveryDate: IsoDate.optional(),
    leadTimeDays: z.number().int().nonnegative(),
    supplier: Text.optional(),
    evidenceRefs: z.array(DeliveryEvidenceRefSchema).default([]),
    status: z.enum(['planned', 'ordered', 'delivered', 'blocked']),
    confidence: z.enum(['confirmed', 'scenario', 'unverified']),
  })).default([]),
  constraints: z.array(z.object({
    id: EntityId,
    type: z.enum(['capacity', 'delivery', 'approval', 'supplier', 'storage', 'interface']),
    resourceIds: z.array(EntityId).default([]),
    activityIds: z.array(EntityId).default([]),
    description: Text,
    owner: Text,
    dueDate: IsoDate,
    status: z.enum(['open', 'mitigated', 'closed', 'blocked']),
  })).default([]),
});

export function parseDeliveryResourceProcurementData(value: unknown): DeliveryResourceProcurementData {
  return DeliveryResourceProcurementDataSchema.parse(value) as DeliveryResourceProcurementData;
}
