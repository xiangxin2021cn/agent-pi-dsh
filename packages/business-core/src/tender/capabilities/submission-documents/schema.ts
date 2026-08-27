import { z } from 'zod';
import { TenderSourceLocatorSchema } from '../../schema.ts';
import type { TenderSubmissionDocumentsData } from './types.ts';

const EntityIdSchema = z.string().regex(/^[a-z0-9][a-z0-9._-]{0,79}$/i, 'Entity ID must be filesystem-safe.');
const NonEmptyString = z.string().trim().min(1);

const TenderSubmissionDocumentItemSchema = z.object({
  id: EntityIdSchema,
  kind: z.enum(['work_plan_methodology', 'programme', 'resource_plan', 'cashflow_plan', 'cost_plan', 'other']),
  title: NonEmptyString,
  filePath: NonEmptyString,
  format: NonEmptyString,
  deliverableId: EntityIdSchema.optional(),
  requirementIds: z.array(EntityIdSchema).default([]),
  sourceRefs: z.array(TenderSourceLocatorSchema).default([]),
  status: z.enum(['draft', 'ready', 'blocked']),
}).strict();

export const TenderSubmissionDocumentsDataSchema = z.object({
  items: z.array(TenderSubmissionDocumentItemSchema).superRefine((items, context) => {
    const seen = new Set<string>();
    items.forEach((item, index) => {
      if (seen.has(item.id)) {
        context.addIssue({ code: 'custom', path: [index, 'id'], message: `Duplicate id: ${item.id}` });
      }
      seen.add(item.id);
    });
  }),
}).strict();

export function parseTenderSubmissionDocumentsData(value: unknown): TenderSubmissionDocumentsData {
  return TenderSubmissionDocumentsDataSchema.parse(value) as TenderSubmissionDocumentsData;
}
