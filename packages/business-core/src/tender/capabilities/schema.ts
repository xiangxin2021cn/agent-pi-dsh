import { z } from 'zod';
import type { TenderCapabilityEnvelope, TenderCapabilityIndex } from './types.ts';

export const TenderCapabilityIdSchema = z.enum([
  'document_analysis',
  'evaluation_strategy',
  'boq_reconciliation',
  'project_boundary',
  'boq_five_step_pricing',
  'construction_resource_schedule',
  'bidder_commitments',
  'execution_plan',
  'schedule_resources',
  'cost_cashflow',
  'submission_documents',
  'submission_audit',
]);

const TenderCapabilityDependencySchema = z.union([
  z.literal('core'),
  TenderCapabilityIdSchema,
]);

const TenderCapabilityRevisionRefSchema = z.object({
  capability: TenderCapabilityDependencySchema,
  revision: z.number().int().nonnegative(),
}).strict();

export const TenderCapabilityEnvelopeSchema = z.object({
  schemaVersion: z.literal(1),
  capability: TenderCapabilityIdSchema,
  projectId: z.string().regex(/^[a-z0-9][a-z0-9._-]{0,127}$/i, 'Project ID must be filesystem-safe.'),
  revision: z.number().int().positive(),
  coreRevision: z.number().int().nonnegative(),
  upstream: z.array(TenderCapabilityRevisionRefSchema).superRefine((references, context) => {
    const seen = new Set<string>();
    references.forEach((reference, index) => {
      if (seen.has(reference.capability)) {
        context.addIssue({
          code: 'custom',
          path: [index, 'capability'],
          message: `Duplicate upstream capability: ${reference.capability}`,
        });
      }
      seen.add(reference.capability);
    });
  }),
  updatedAt: z.string().datetime(),
  data: z.unknown(),
}).strict();

export function parseTenderCapabilityEnvelope(value: unknown): TenderCapabilityEnvelope {
  return TenderCapabilityEnvelopeSchema.parse(value) as TenderCapabilityEnvelope;
}

const TenderCapabilityIndexEntrySchema = z.object({
  capability: TenderCapabilityIdSchema,
  enabled: z.boolean(),
  required: z.boolean(),
  revision: z.number().int().nonnegative(),
  readiness: z.enum(['not_ready', 'needs_review', 'ready']),
  issueCount: z.number().int().nonnegative(),
  stale: z.boolean(),
  updatedAt: z.string().datetime(),
}).strict().superRefine((entry, context) => {
  if (entry.required && !entry.enabled) {
    context.addIssue({ code: 'custom', path: ['required'], message: 'A required capability must be enabled.' });
  }
});

export const TenderCapabilityIndexSchema = z.object({
  schemaVersion: z.literal(1),
  projectId: z.string().regex(/^[a-z0-9][a-z0-9._-]{0,127}$/i, 'Project ID must be filesystem-safe.'),
  coreRevision: z.number().int().nonnegative(),
  capabilities: z.array(TenderCapabilityIndexEntrySchema).superRefine((entries, context) => {
    const seen = new Set<string>();
    entries.forEach((entry, index) => {
      if (seen.has(entry.capability)) {
        context.addIssue({
          code: 'custom',
          path: [index, 'capability'],
          message: `Duplicate capability index entry: ${entry.capability}`,
        });
      }
      seen.add(entry.capability);
    });
  }),
}).strict();

export function parseTenderCapabilityIndex(value: unknown): TenderCapabilityIndex {
  return TenderCapabilityIndexSchema.parse(value) as TenderCapabilityIndex;
}
