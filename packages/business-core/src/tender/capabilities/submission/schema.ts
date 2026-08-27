import { z } from 'zod';
import { TenderSourceLocatorSchema } from '../../schema.ts';
import type { TenderSubmissionAuditData } from './types.ts';

const EntityIdSchema = z.string().regex(/^[a-z0-9][a-z0-9._-]{0,79}$/i);

export const TenderSubmissionAuditDataSchema = z.object({
  submissionStatus: z.enum(['draft', 'reviewed', 'blocked']),
  items: z.array(z.object({
    deliverableId: EntityIdSchema,
    filePath: z.string().trim().min(1),
    format: z.string().trim().min(1),
    templatePath: z.string().trim().min(1).optional(),
    signatureStatus: z.enum(['not_required', 'missing', 'present', 'verified']),
    dependencies: z.array(EntityIdSchema).default([]),
    validationStatus: z.enum(['pending', 'passed', 'failed']),
    evidenceRefs: z.array(TenderSourceLocatorSchema).default([]),
    sha256: z.string().regex(/^[a-f0-9]{64}$/i),
    checks: z.object({
      filePresent: z.boolean(),
      formatMatch: z.boolean(),
      templateMatch: z.boolean(),
      renderPassed: z.boolean(),
      hashVerified: z.boolean(),
    }),
  })),
  contradictions: z.array(z.object({
    id: EntityIdSchema,
    deliverableIds: z.array(EntityIdSchema).min(1),
    requirementIds: z.array(EntityIdSchema).default([]),
    summary: z.string().trim().min(1),
    status: z.enum(['open', 'resolved']),
  })).default([]),
  redTeamFindings: z.array(z.object({
    id: EntityIdSchema,
    title: z.string().trim().min(1),
    severity: z.enum(['critical', 'major', 'minor']),
    status: z.enum(['open', 'resolved', 'accepted']),
    deliverableIds: z.array(EntityIdSchema).default([]),
    evidenceRefs: z.array(TenderSourceLocatorSchema).default([]),
    insertedIntoFormalNarrative: z.boolean(),
  })).default([]),
});

export function parseTenderSubmissionAuditData(value: unknown): TenderSubmissionAuditData {
  return TenderSubmissionAuditDataSchema.parse(value) as TenderSubmissionAuditData;
}
