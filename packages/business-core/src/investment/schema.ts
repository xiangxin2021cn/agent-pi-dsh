import { z } from 'zod';
import type { InvestmentWorkspace } from './types.ts';

const EntityId = z.string().regex(/^[A-Za-z0-9][A-Za-z0-9._-]{0,79}$/);
const Sha256 = z.string().regex(/^[a-f0-9]{64}$/i);
const Text = z.string().trim().min(1);
const OptionalText = Text.optional();
const IsoDate = z.string().refine((value) => /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(`${value}T00:00:00Z`)));
const IsoDateTime = z.string().refine((value) => value.includes('T') && Number.isFinite(Date.parse(value)));

export const InvestmentEvidenceRefSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('source'), sourceId: EntityId, page: z.number().int().positive().optional(), sheet: OptionalText, clause: OptionalText, cell: OptionalText }),
  z.object({ kind: z.literal('snapshot'), snapshotId: EntityId }),
]);

export const InvestmentWorkspaceSchema = z.object({
  schemaVersion: z.literal(1),
  revision: z.number().int().nonnegative(),
  project: z.object({
    id: EntityId, title: Text, reference: OptionalText,
    stage: z.enum(['screening', 'pre_feasibility', 'feasibility', 'due_diligence', 'investment_committee', 'approved', 'rejected', 'on_hold']),
    status: z.enum(['active', 'on_hold', 'completed', 'archived']),
    baseCurrency: z.string().regex(/^[A-Z]{3}$/), valuationDate: IsoDate,
  }),
  sources: uniqueById(z.object({
    id: EntityId, name: Text, path: Text,
    kind: z.enum(['mandate', 'geology', 'resource_statement', 'technical', 'market', 'offtake', 'legal', 'permit', 'esg', 'financial', 'tax', 'financing', 'management', 'supporting_evidence', 'other']),
    status: z.enum(['active', 'superseded', 'withdrawn']), revision: OptionalText, sha256: Sha256,
  })),
  snapshots: uniqueById(z.object({
    id: EntityId, producerPlugin: z.enum(['tender', 'delivery', 'investment', 'knowledge']),
    producerWorkspaceId: EntityId, producerRevision: z.number().int().nonnegative(), managedArtifactPath: Text,
    contentSha256: Sha256, approvalState: z.enum(['draft', 'approved', 'withdrawn']), importedAt: IsoDateTime, userConfirmed: z.boolean(),
  })),
  assumptionSets: uniqueById(z.object({
    id: EntityId, title: Text, status: z.enum(['draft', 'approved', 'superseded']), evidenceRefs: z.array(InvestmentEvidenceRefSchema).default([]),
  })),
  knowledgeUses: z.array(z.object({
    publicationId: EntityId, expectedSha256: Sha256, relation: z.enum(['derived_from', 'corroborates', 'contradicts', 'supersedes']),
    localEntityIds: z.array(EntityId).default([]), verificationState: z.enum(['unverified', 'corroborated', 'conflicted', 'stale']),
    verifiedAt: IsoDateTime.optional(), note: OptionalText,
  })).default([]),
});

export function parseInvestmentWorkspace(value: unknown): InvestmentWorkspace {
  return InvestmentWorkspaceSchema.parse(value) as InvestmentWorkspace;
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
