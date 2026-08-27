import { z } from 'zod';
import { TenderSourceLocatorSchema } from '../../schema.ts';
import { normalizeDocumentAnalysis } from './normalize.ts';
import type { TenderDocumentAnalysisData } from './types.ts';

const EntityIdSchema = z.string().regex(/^[a-z0-9][a-z0-9._-]{0,79}$/i, 'Entity ID must be filesystem-safe.');
const NonEmptyString = z.string().trim().min(1);

const TenderDocumentAnalysisSectionSchema = z.object({
  id: EntityIdSchema,
  documentId: EntityIdSchema,
  title: NonEmptyString,
  kind: z.enum([
    'project_information',
    'tender_requirements',
    'special_conditions',
    'addenda_clarifications',
    'boq_characteristics',
    'risk_gap',
    'other',
  ]),
  summary: z.string(),
  sourceRefs: z.array(TenderSourceLocatorSchema).default([]),
  status: z.enum(['draft', 'reviewed', 'blocked']),
}).strict();

export const TenderDocumentAnalysisDataSchema = z.object({
  sections: z.array(TenderDocumentAnalysisSectionSchema),
}).strict();

export function parseTenderDocumentAnalysisData(
  value: unknown,
  options: { defaultDocumentId?: string } = {},
): TenderDocumentAnalysisData {
  const { data } = normalizeDocumentAnalysis(value, options);
  return TenderDocumentAnalysisDataSchema.parse(data) as TenderDocumentAnalysisData;
}
