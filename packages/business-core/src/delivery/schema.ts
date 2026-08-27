import { z } from 'zod';
import type { DeliveryWorkspace } from './types.ts';

const EntityIdSchema = z.string().regex(/^[a-z0-9][a-z0-9._-]{0,79}$/i);
const Sha256Schema = z.string().regex(/^[a-f0-9]{64}$/i);
const OptionalText = z.string().trim().min(1).optional();
const IsoDateSchema = z.string().refine((value) => /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(`${value}T00:00:00Z`)), 'Expected an ISO date.');
const IsoDateTimeSchema = z.string().refine((value) => value.includes('T') && Number.isFinite(Date.parse(value)), 'Expected an ISO date-time.');

export const DeliveryEvidenceRefSchema = z.discriminatedUnion('kind', [
  z.object({
    kind: z.literal('source'),
    sourceId: EntityIdSchema,
    page: z.number().int().positive().optional(),
    sheet: OptionalText,
    clause: OptionalText,
    cell: OptionalText,
  }),
  z.object({ kind: z.literal('snapshot'), snapshotId: EntityIdSchema }),
]);

export const DeliveryWorkspaceSchema = z.object({
  schemaVersion: z.literal(1),
  revision: z.number().int().nonnegative(),
  project: z.object({
    id: EntityIdSchema,
    title: z.string().trim().min(1),
    reference: OptionalText,
    currency: z.string().regex(/^[A-Z]{3}$/).optional(),
    status: z.enum(['active', 'on_hold', 'completed', 'archived']),
    dataDate: IsoDateSchema.optional(),
  }),
  sources: uniqueById(z.object({
    id: EntityIdSchema,
    name: z.string().trim().min(1),
    path: z.string().trim().min(1),
    kind: z.enum(['contract', 'approved_scope', 'boq', 'baseline_programme', 'budget', 'organization', 'commitment', 'resource', 'progress', 'risk', 'change', 'supporting_evidence', 'other']),
    status: z.enum(['active', 'superseded', 'withdrawn']),
    revision: OptionalText,
    sha256: Sha256Schema,
  })),
  snapshots: uniqueById(z.object({
    id: EntityIdSchema,
    producerPlugin: z.enum(['tender', 'delivery', 'investment', 'knowledge']),
    producerWorkspaceId: EntityIdSchema,
    producerRevision: z.number().int().nonnegative(),
    managedArtifactPath: z.string().trim().min(1),
    contentSha256: Sha256Schema,
    approvalState: z.enum(['draft', 'approved', 'withdrawn']),
    importedAt: IsoDateTimeSchema,
    userConfirmed: z.boolean(),
  })),
  baselines: uniqueById(z.object({
    id: EntityIdSchema,
    kind: z.enum(['contract', 'scope', 'schedule', 'budget', 'organization', 'progress']),
    title: z.string().trim().min(1),
    status: z.enum(['draft', 'approved', 'superseded']),
    evidenceRefs: z.array(DeliveryEvidenceRefSchema).default([]),
  })),
  knowledgeUses: z.array(z.object({
    publicationId: EntityIdSchema,
    expectedSha256: Sha256Schema,
    relation: z.enum(['derived_from', 'corroborates', 'contradicts', 'supersedes']),
    localEntityIds: z.array(EntityIdSchema).default([]),
    verificationState: z.enum(['unverified', 'corroborated', 'conflicted', 'stale']),
    verifiedAt: IsoDateTimeSchema.optional(),
    note: OptionalText,
  })).default([]),
});

export function parseDeliveryWorkspace(value: unknown): DeliveryWorkspace {
  return DeliveryWorkspaceSchema.parse(value) as DeliveryWorkspace;
}

function uniqueById<T extends z.ZodType<{ id: string }>>(schema: T) {
  return z.array(schema).superRefine((items, context) => {
    const seen = new Set<string>();
    items.forEach((item, index) => {
      if (seen.has(item.id)) context.addIssue({ code: 'custom', path: [index, 'id'], message: `Duplicate entity ID: ${item.id}` });
      seen.add(item.id);
    });
  });
}
