import { z } from 'zod';
import { TenderSourceLocatorSchema } from '../../schema.ts';
import {
  TENDER_BIDDER_COMMITMENT_CATEGORIES,
  type TenderBidderCommitmentsData,
} from './types.ts';

const EntityIdSchema = z.string().regex(/^[a-z0-9][a-z0-9._-]{0,79}$/i, 'Entity ID must be filesystem-safe.');
const NonEmptyString = z.string().trim().min(1);
const DecimalStringSchema = z.string().regex(/^(?:0|[1-9]\d*)(?:\.\d+)?$/, 'Expected a non-negative unformatted decimal string.');
const DateTimeSchema = z.string().refine(
  (value) => value.includes('T') && Number.isFinite(Date.parse(value)),
  'Expected an ISO date-time.',
);

export const TenderBidderCommitmentSchema = z.object({
  id: EntityIdSchema,
  category: z.enum(TENDER_BIDDER_COMMITMENT_CATEGORIES),
  subject: NonEmptyString,
  decision: NonEmptyString,
  status: z.enum(['confirmed', 'accepted_assumption', 'not_applicable']),
  quantity: DecimalStringSchema.optional(),
  unit: NonEmptyString.optional(),
  mode: NonEmptyString.optional(),
  location: NonEmptyString.optional(),
  effectivePeriod: NonEmptyString.optional(),
  appliesToAllBoqItems: z.boolean().default(false),
  affectedBoqItemIds: z.array(EntityIdSchema).default([]),
  inputReference: NonEmptyString,
  sourceRefs: z.array(TenderSourceLocatorSchema).default([]),
  riskTreatment: NonEmptyString.optional(),
}).strict().superRefine((commitment, context) => {
  if ((commitment.quantity === undefined) !== (commitment.unit === undefined)) {
    context.addIssue({
      code: 'custom',
      path: ['quantity'],
      message: 'A quantified bidder commitment requires both quantity and unit.',
    });
  }
  if (!commitment.appliesToAllBoqItems && commitment.affectedBoqItemIds.length === 0) {
    context.addIssue({
      code: 'custom',
      path: ['affectedBoqItemIds'],
      message: 'A bidder commitment must apply to all BOQ items or list affected BOQ item IDs.',
    });
  }
  if (commitment.status === 'accepted_assumption' && !commitment.riskTreatment) {
    context.addIssue({
      code: 'custom',
      path: ['riskTreatment'],
      message: 'An accepted assumption requires an explicit risk treatment.',
    });
  }
});

export const TenderBidderCommitmentsDataSchema = z.object({
  confirmation: z.object({
    confirmed: z.boolean(),
    confirmedBy: NonEmptyString,
    confirmedAt: DateTimeSchema,
    basisStatement: NonEmptyString,
  }).strict(),
  commitments: z.array(TenderBidderCommitmentSchema).superRefine((commitments, context) => {
    const seen = new Set<string>();
    commitments.forEach((commitment, index) => {
      if (seen.has(commitment.id)) {
        context.addIssue({ code: 'custom', path: [index, 'id'], message: `Duplicate bidder commitment: ${commitment.id}` });
      }
      seen.add(commitment.id);
    });
  }),
  openItems: z.array(NonEmptyString).default([]),
}).strict();

export function parseTenderBidderCommitmentsData(value: unknown): TenderBidderCommitmentsData {
  return TenderBidderCommitmentsDataSchema.parse(value) as TenderBidderCommitmentsData;
}
