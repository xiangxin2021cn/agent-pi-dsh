import { z } from 'zod';
import { TenderSourceLocatorSchema } from '../../schema.ts';
import type { TenderExecutionPlanData } from './types.ts';

const EntityIdSchema = z.string().regex(/^[a-z0-9][a-z0-9._-]{0,79}$/i, 'Entity ID must be filesystem-safe.');
const NonEmptyString = z.string().trim().min(1);
const DecimalStringSchema = z.string().regex(/^(?:0|[1-9]\d*)(?:\.\d+)?$/, 'Expected a non-negative unformatted decimal string.');

const TenderWorkPackageResourceNeedSchema = z.object({
  resourceClass: NonEmptyString,
  quantity: DecimalStringSchema.optional(),
  unit: NonEmptyString.optional(),
  basis: NonEmptyString.optional(),
  status: z.enum(['sourced', 'verified', 'unverified']),
}).strict().superRefine((need, context) => {
  if (need.quantity !== undefined && (!need.unit || !need.basis)) {
    context.addIssue({
      code: 'custom',
      path: ['quantity'],
      message: 'A quantified resource need requires a unit and basis.',
    });
  }
});

export const TenderWorkPackageSchema = z.object({
  id: EntityIdSchema,
  title: NonEmptyString,
  boqItemIds: z.array(EntityIdSchema).min(1),
  requirementIds: z.array(EntityIdSchema).min(1),
  methodSteps: z.array(NonEmptyString).min(1),
  resourceNeeds: z.array(TenderWorkPackageResourceNeedSchema).default([]),
  holdPoints: z.array(NonEmptyString).default([]),
  interfaces: z.array(NonEmptyString).default([]),
  constraints: z.array(NonEmptyString).default([]),
  temporaryWorks: z.array(NonEmptyString).default([]),
  hseControls: z.array(NonEmptyString).default([]),
  environmentalControls: z.array(NonEmptyString).default([]),
  sourceRefs: z.array(TenderSourceLocatorSchema).default([]),
  status: z.enum(['draft', 'reviewed', 'blocked']),
}).strict();

export const TenderExecutionPlanDataSchema = z.object({
  workPackages: z.array(TenderWorkPackageSchema).superRefine((packages, context) => {
    const seen = new Set<string>();
    packages.forEach((workPackage, index) => {
      if (seen.has(workPackage.id)) {
        context.addIssue({ code: 'custom', path: [index, 'id'], message: `Duplicate work package: ${workPackage.id}` });
      }
      seen.add(workPackage.id);
    });
  }),
}).strict();

export function parseTenderExecutionPlanData(value: unknown): TenderExecutionPlanData {
  return TenderExecutionPlanDataSchema.parse(value) as TenderExecutionPlanData;
}
