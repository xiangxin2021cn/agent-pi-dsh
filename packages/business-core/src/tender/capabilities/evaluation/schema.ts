import { z } from 'zod';
import { TenderSourceLocatorSchema } from '../../schema.ts';
import type { TenderEvaluationStrategyData } from './types.ts';

const EntityIdSchema = z.string().regex(/^[a-z0-9][a-z0-9._-]{0,79}$/i, 'Entity ID must be filesystem-safe.');
const NonEmptyString = z.string().trim().min(1);

export const TenderCriterionStrategySchema = z.object({
  criterionId: EntityIdSchema,
  priority: z.enum(['must_pass', 'high', 'normal']),
  targetScore: z.number().min(0).max(100).optional(),
  responseOwner: NonEmptyString,
  responseTheme: NonEmptyString,
  evidencePlan: z.array(NonEmptyString).min(1),
  evidenceRefs: z.array(TenderSourceLocatorSchema).default([]),
  evidenceArtifactPaths: z.array(NonEmptyString).default([]),
  differentiators: z.array(NonEmptyString).default([]),
  risks: z.array(NonEmptyString).default([]),
  status: z.enum(['planned', 'evidenced', 'reviewed', 'blocked']),
}).strict();

export const TenderEvaluationStrategyDataSchema = z.object({
  strategies: z.array(TenderCriterionStrategySchema).superRefine((strategies, context) => {
    const seen = new Set<string>();
    strategies.forEach((strategy, index) => {
      if (seen.has(strategy.criterionId)) {
        context.addIssue({
          code: 'custom',
          path: [index, 'criterionId'],
          message: `Duplicate criterion strategy: ${strategy.criterionId}`,
        });
      }
      seen.add(strategy.criterionId);
    });
  }),
}).strict();

export function parseTenderEvaluationStrategyData(value: unknown): TenderEvaluationStrategyData {
  return TenderEvaluationStrategyDataSchema.parse(value) as TenderEvaluationStrategyData;
}
