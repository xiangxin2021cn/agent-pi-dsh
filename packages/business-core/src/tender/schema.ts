import { z } from 'zod';
import type { TenderWorkspace } from './types.ts';

const EntityIdSchema = z.string().regex(/^[a-z0-9][a-z0-9._-]{0,79}$/i, 'Entity ID must be filesystem-safe.');
const DateTimeSchema = z.string().refine(value => value.includes('T') && Number.isFinite(Date.parse(value)), 'Expected an ISO date-time.');
const OptionalNonEmptyString = z.string().trim().min(1).optional();

export const TenderSourceLocatorSchema = z.object({
  documentId: EntityIdSchema,
  page: z.number().int().positive().optional(),
  sheet: OptionalNonEmptyString,
  clause: OptionalNonEmptyString,
  section: OptionalNonEmptyString,
  cell: OptionalNonEmptyString,
  blockId: OptionalNonEmptyString,
  bbox: z.tuple([z.number(), z.number(), z.number(), z.number()]).optional(),
  excerpt: OptionalNonEmptyString,
});

export const TenderDocumentSchema = z.object({
  id: EntityIdSchema,
  name: z.string().trim().min(1),
  path: z.string().trim().min(1),
  kind: z.enum(['notice', 'tender_data', 'contract_data', 'scope', 'specification', 'drawing', 'boq', 'returnable_schedule', 'addendum', 'template', 'supporting_evidence', 'other']),
  revision: OptionalNonEmptyString,
  issuedAt: DateTimeSchema.optional(),
  sha256: z.string().regex(/^[a-f0-9]{64}$/i).optional(),
  supersedesIds: z.array(EntityIdSchema).default([]),
  status: z.enum(['active', 'superseded', 'withdrawn']),
});

export const TenderRequirementSchema = z.object({
  id: EntityIdSchema,
  title: z.string().trim().min(1),
  text: z.string().trim().min(1),
  type: z.enum(['mandatory', 'qualification', 'technical', 'contractual', 'pricing', 'deadline', 'format', 'evaluated']),
  criticality: z.enum(['critical', 'high', 'normal']),
  source: TenderSourceLocatorSchema,
  evidenceNeeded: z.array(z.string().trim().min(1)).default([]),
  owner: OptionalNonEmptyString,
  status: z.enum(['open', 'planned', 'compliant', 'noncompliant', 'blocked', 'waived']),
});

export const TenderEvaluationCriterionSchema = z.object({
  id: EntityIdSchema,
  title: z.string().trim().min(1),
  method: z.enum(['pass_fail', 'threshold', 'weighted']),
  weight: z.number().min(0).max(100).optional(),
  minimumScore: z.number().min(0).max(100).optional(),
  requirementIds: z.array(EntityIdSchema).default([]),
  source: TenderSourceLocatorSchema,
  evidenceNeeded: z.array(z.string().trim().min(1)).default([]),
  status: z.enum(['open', 'planned', 'covered', 'verified', 'blocked']),
}).superRefine((criterion, context) => {
  if (criterion.method === 'weighted' && criterion.weight === undefined) {
    context.addIssue({ code: 'custom', path: ['weight'], message: 'Weighted criteria require a weight.' });
  }
  if (criterion.method === 'threshold' && criterion.minimumScore === undefined) {
    context.addIssue({ code: 'custom', path: ['minimumScore'], message: 'Threshold criteria require a minimum score.' });
  }
});

export const TenderDeliverableSchema = z.object({
  id: EntityIdSchema,
  title: z.string().trim().min(1),
  format: OptionalNonEmptyString,
  submissionSection: OptionalNonEmptyString,
  dueAt: DateTimeSchema.optional(),
  templatePath: OptionalNonEmptyString,
  requirementIds: z.array(EntityIdSchema).default([]),
  status: z.enum(['planned', 'drafting', 'ready', 'blocked', 'submitted']),
});

export const TenderResponsePlanSchema = z.object({
  id: EntityIdSchema,
  title: z.string().trim().min(1),
  requirementIds: z.array(EntityIdSchema).default([]),
  criterionIds: z.array(EntityIdSchema).default([]),
  deliverableId: EntityIdSchema.optional(),
  nonDocumentResponseAccepted: z.boolean().optional(),
  responseSection: OptionalNonEmptyString,
  evidenceRefs: z.array(TenderSourceLocatorSchema).default([]),
  evidenceArtifacts: z.array(z.string().trim().min(1)).default([]),
  owner: OptionalNonEmptyString,
  status: z.enum(['planned', 'drafting', 'verified', 'blocked']),
});

export const TenderWorkspaceSchema = z.object({
  schemaVersion: z.literal(1),
  revision: z.number().int().nonnegative(),
  project: z.object({
    id: EntityIdSchema,
    title: z.string().trim().min(1),
    reference: OptionalNonEmptyString,
    employer: OptionalNonEmptyString,
    jurisdiction: OptionalNonEmptyString,
    currency: z.string().trim().regex(/^[A-Z]{3}$/).optional(),
    closingAt: DateTimeSchema.optional(),
    status: z.enum(['active', 'submitted', 'awarded', 'lost', 'archived']),
  }),
  documents: uniqueEntityArray(TenderDocumentSchema),
  requirements: uniqueEntityArray(TenderRequirementSchema),
  criteria: uniqueEntityArray(TenderEvaluationCriterionSchema),
  deliverables: uniqueEntityArray(TenderDeliverableSchema),
  responses: uniqueEntityArray(TenderResponsePlanSchema),
});

export function parseTenderWorkspace(value: unknown): TenderWorkspace {
  return TenderWorkspaceSchema.parse(value) as TenderWorkspace;
}

function uniqueEntityArray<T extends z.ZodType<{ id: string }>>(schema: T) {
  return z.array(schema).superRefine((entities, context) => {
    const seen = new Set<string>();
    entities.forEach((entity, index) => {
      if (seen.has(entity.id)) {
        context.addIssue({ code: 'custom', path: [index, 'id'], message: `Duplicate entity ID: ${entity.id}` });
      }
      seen.add(entity.id);
    });
  });
}
