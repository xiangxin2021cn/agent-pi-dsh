import { z } from 'zod';
import {
  TENDER_BOUNDARY_PARSE_STATUSES,
  TENDER_BOUNDARY_SOURCE_KINDS,
  TENDER_BOUNDARY_SOURCE_ROLES,
  TENDER_PROJECT_BOUNDARY_PRODUCTIVITY_BASES,
  TENDER_PROJECT_BOUNDARY_PROFILES,
  type TenderProjectBoundaryPack,
} from './types.ts';

const NonEmptyString = z.string().trim().min(1);
const DateTimeSchema = z.string().refine(
  (value) => value.includes('T') && Number.isFinite(Date.parse(value)),
  'Expected an ISO date-time.',
);

const StandardRefSchema = z.object({
  id: NonEmptyString,
  title: NonEmptyString,
  version: NonEmptyString.optional(),
  role: z.enum(['primary', 'secondary', 'reference']),
}).strict();

const BoundarySourceSchema = z.object({
  id: NonEmptyString,
  kind: z.enum(TENDER_BOUNDARY_SOURCE_KINDS),
  role: z.enum(TENDER_BOUNDARY_SOURCE_ROLES),
  title: NonEmptyString,
  path: NonEmptyString.optional(),
  knowledgeSlug: NonEmptyString.optional(),
  documentId: NonEmptyString.optional(),
  markdownPath: NonEmptyString.optional(),
  parseStatus: z.enum(TENDER_BOUNDARY_PARSE_STATUSES),
}).strict();

const ExtractedInventorySchema = z.object({
  plant: z.array(NonEmptyString).default([]),
  labour: z.array(NonEmptyString).default([]),
  materialSources: z.array(NonEmptyString).default([]),
  constraints: z.array(NonEmptyString).default([]),
}).strict();

export const TenderProjectBoundaryPackSchema = z.object({
  schemaVersion: z.literal(1),
  projectId: z.string().regex(/^[a-z0-9][a-z0-9._-]{0,127}$/i, 'Project ID must be filesystem-safe.'),
  profileId: z.union([z.enum(TENDER_PROJECT_BOUNDARY_PROFILES), NonEmptyString]).optional(),
  jurisdiction: z.object({
    countryCode: z.string().trim().min(2).max(2).optional(),
    region: NonEmptyString.optional(),
    authority: NonEmptyString.optional(),
    currency: z.string().trim().min(3).max(3),
  }).strict(),
  standards: z.object({
    technicalSpecs: z.array(StandardRefSchema).default([]),
    contractForm: z.object({
      id: NonEmptyString,
      title: NonEmptyString,
      version: NonEmptyString.optional(),
    }).strict().optional(),
    measurementStandard: z.object({
      id: NonEmptyString,
      title: NonEmptyString,
      notes: NonEmptyString.optional(),
    }).strict(),
  }).strict(),
  pricing: z.object({
    pricingStandard: NonEmptyString,
    indirectCostPolicy: NonEmptyString,
    taxRegime: z.object({
      vatTreatment: NonEmptyString,
      notes: NonEmptyString.optional(),
    }).strict(),
    ratePolicy: z.object({
      location: NonEmptyString,
      effectiveDateHint: NonEmptyString.optional(),
      mustVerifyOnline: z.array(NonEmptyString).default([]),
      allowUnverifiedLabel: z.literal(true),
    }).strict(),
  }).strict(),
  productivity: z.object({
    basis: z.enum(TENDER_PROJECT_BOUNDARY_PRODUCTIVITY_BASES),
    notes: NonEmptyString.optional(),
    sources: z.array(z.object({
      title: NonEmptyString,
      pathOrUrl: NonEmptyString.optional(),
      confidence: z.enum(['high', 'medium', 'low']),
    }).strict()).default([]),
  }).strict(),
  bidderResources: z.object({
    outline: NonEmptyString,
    ownedPlant: z.array(NonEmptyString).optional(),
    ownedLabour: z.array(NonEmptyString).optional(),
    materialSources: z.array(NonEmptyString).optional(),
    subcontractBoundaries: NonEmptyString.optional(),
  }).strict(),
  organizationOutline: z.object({
    text: z.string(),
    derivedAssumptions: z.array(NonEmptyString).optional(),
  }).strict(),
  boundarySources: z.array(BoundarySourceSchema).default([]),
  extractedInventory: ExtractedInventorySchema.optional(),
  suggestedFromAnalysis: z.object({
    documentAnalysisPackPath: NonEmptyString.optional(),
    notes: z.array(NonEmptyString).optional(),
  }).strict().optional(),
  humanConfirmedAt: DateTimeSchema.optional(),
  readiness: z.enum(['draft', 'ready', 'needs_review']),
}).strict();

export function parseTenderProjectBoundaryPack(value: unknown): TenderProjectBoundaryPack {
  return TenderProjectBoundaryPackSchema.parse(value) as TenderProjectBoundaryPack;
}
