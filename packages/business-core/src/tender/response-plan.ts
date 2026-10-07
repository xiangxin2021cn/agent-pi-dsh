import { z } from 'zod';

const Id = z.string().regex(/^[a-z0-9][a-z0-9._-]{0,79}$/i);
const Text = z.string().trim().min(1);
const Hash = z.string().regex(/^[a-f0-9]{64}$/i);
const DateTime = Text.refine(value => value.includes('T') && Number.isFinite(Date.parse(value)), 'Expected an ISO date-time.');
const uniqueIds = <T extends z.ZodType<{ id: string }>>(schema: T) => z.array(schema).superRefine((rows, context) => {
  const seen = new Set<string>();
  rows.forEach((row, index) => {
    if (seen.has(row.id)) context.addIssue({ code: 'custom', path: [index, 'id'], message: 'Duplicate ID.' });
    seen.add(row.id);
  });
});

/** These are verbatim tender rules, never model-created scoring suggestions. */
export const TenderCriterionRubricSchema = z.object({
  text: Text,
  points: uniqueIds(z.object({ id: Id, text: Text, evidenceNeeded: z.array(Text).default([]) })).default([]),
  bands: uniqueIds(z.object({ id: Id, label: Text, text: Text, score: z.number().nonnegative().optional() })).default([]),
}).strict();
export type TenderCriterionRubric = z.infer<typeof TenderCriterionRubricSchema>;

export const TenderResponseMaterialSchema = z.object({
  id: Id, title: Text,
  documentId: Id.optional(), path: Text.optional(), knowledgeCitation: Text.optional(),
  mode: z.enum(['original', 'adapt']),
  subject: Text, expectedSubject: Text, purpose: Text,
  conditions: z.array(Text).default([]), validUntil: DateTime.optional(),
  availability: z.enum(['confirmed', 'unknown', 'unavailable']),
  authorization: z.enum(['confirmed', 'unknown', 'not_required', 'denied']),
  verification: z.enum(['verified', 'unverified', 'rejected']),
  reviewer: Text.optional(), reviewedAt: DateTime.optional(), note: Text.optional(),
}).strict().superRefine((material, context) => {
  if (!material.documentId && !material.path && !material.knowledgeCitation) context.addIssue({ code: 'custom', message: 'Material needs a registered document, file or versioned knowledge citation.' });
  if (material.verification === 'verified' && (!material.reviewer || !material.reviewedAt || !material.note)) context.addIssue({ code: 'custom', message: 'Material verification needs reviewer, time and an evidence-based note.' });
});
export type TenderResponseMaterial = z.infer<typeof TenderResponseMaterialSchema>;

export const TenderChapterPlanSchema = z.object({
  id: Id, title: Text,
  type: z.enum(['analysis', 'plan', 'organization', 'technical', 'management', 'cross_reference']).optional(),
  generationMode: z.enum(['reuse', 'adapt', 'generate']),
  templateRole: z.enum(['employer_required', 'user_selected', 'reference']).optional(),
  requiredContent: z.array(Text).default([]),
  pointResponses: z.array(z.object({ criterionId: Id, pointId: Id, plannedResponse: Text }).strict()).default([]),
  materials: uniqueIds(TenderResponseMaterialSchema).default([]),
  dependencies: z.array(z.object({ kind: z.enum(['requirement', 'criterion', 'document', 'file']), id: Text }).strict()).default([]),
}).strict();
export type TenderChapterPlan = z.infer<typeof TenderChapterPlanSchema>;

export const TenderResponseDependencySnapshotSchema = z.object({ capturedAt: DateTime, fingerprints: z.record(Text, Hash.nullable()) }).strict();
export type TenderResponseDependencySnapshot = z.infer<typeof TenderResponseDependencySnapshotSchema>;

export const TenderResponseLocationSchema = z.object({
    section: Text.optional(), page: z.number().int().positive().optional(),
    lineStart: z.number().int().positive().optional(), lineEnd: z.number().int().positive().optional(), excerpt: Text,
  }).strict().superRefine((location, context) => {
    if (location.lineEnd && (!location.lineStart || location.lineEnd < location.lineStart)) context.addIssue({ code: 'custom', message: 'Invalid line range.' });
    if (!location.section && !location.page && !location.lineStart) context.addIssue({ code: 'custom', message: 'A chapter, page or line position is required.' });
  });
export const TenderResponsePointReviewSchema = z.object({
  criterionId: Id, pointId: Id, location: TenderResponseLocationSchema,
  verdict: z.enum(['supported', 'needs_revision', 'uncertain']), note: Text,
}).strict();
const uniquePointReviews = <T extends z.ZodType<{ criterionId: string; pointId: string }>>(schema: T) => z.array(schema).superRefine((rows, context) => {
  const seen = new Set<string>();
  rows.forEach((row, index) => {
    const key = `${row.criterionId}:${row.pointId}`;
    if (seen.has(key)) context.addIssue({ code: 'custom', path: [index], message: 'Duplicate rubric point review.' });
    seen.add(key);
  });
});
export const TenderResponseReviewInputSchema = z.object({
  artifactPath: Text,
  location: TenderResponseLocationSchema,
  contentReview: z.object({ verdict: z.enum(['supported', 'needs_revision', 'uncertain']), reviewer: Text, note: Text }).strict(),
  pointReviews: uniquePointReviews(TenderResponsePointReviewSchema).optional(),
}).strict();
export type TenderResponseReviewInput = z.infer<typeof TenderResponseReviewInputSchema>;
export const TenderResponseArtifactReviewSchema = TenderResponseReviewInputSchema.extend({
  artifactSha256: Hash, checkedAt: DateTime, locationStatus: z.enum(['verified', 'manual_review']), dependencyFingerprints: z.record(Text, Hash.nullable()),
  pointReviews: uniquePointReviews(TenderResponsePointReviewSchema.extend({ locationStatus: z.enum(['verified', 'manual_review']) })).optional(),
});
export type TenderResponseArtifactReview = z.infer<typeof TenderResponseArtifactReviewSchema>;
