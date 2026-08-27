import type { TenderCapabilityAuditIssue, TenderCapabilityReadiness } from '../types.ts';

export const TENDER_PROJECT_BOUNDARY_OUTLINE_MIN_CHARS = 80;

export const TENDER_PROJECT_BOUNDARY_PROFILES = [
  'generic-international',
  'sa-sanral-highway',
] as const;

export type TenderProjectBoundaryProfileId = (typeof TENDER_PROJECT_BOUNDARY_PROFILES)[number];

export const TENDER_PROJECT_BOUNDARY_PRODUCTIVITY_BASES = [
  'enterprise_norms',
  'published_quota',
  'spec_derived',
  'user_provided',
  'mixed',
] as const;

export type TenderProjectBoundaryProductivityBasis =
  (typeof TENDER_PROJECT_BOUNDARY_PRODUCTIVITY_BASES)[number];

export type TenderProjectBoundaryStandardRole = 'primary' | 'secondary' | 'reference';
export type TenderProjectBoundaryReadiness = 'draft' | 'ready' | 'needs_review';

export const TENDER_BOUNDARY_SOURCE_KINDS = [
  'knowledge_standard',
  'tender_spec_binding',
  'bidder_resource',
] as const;

export type TenderBoundarySourceKind = (typeof TENDER_BOUNDARY_SOURCE_KINDS)[number];

export const TENDER_BOUNDARY_SOURCE_ROLES = [
  'primary_spec',
  'secondary_spec',
  'reference_spec',
  'measurement',
  'quota',
  'method',
  'plant',
  'labour',
  'material',
  'camp',
  'rates',
  'organisation',
  'other',
] as const;

export type TenderBoundarySourceRole = (typeof TENDER_BOUNDARY_SOURCE_ROLES)[number];

export const TENDER_BOUNDARY_PARSE_STATUSES = [
  'registered',
  'parsed',
  'failed',
  'not_required',
] as const;

export type TenderBoundaryParseStatus = (typeof TENDER_BOUNDARY_PARSE_STATUSES)[number];

export interface TenderProjectBoundaryStandardRef {
  id: string;
  title: string;
  version?: string;
  role: TenderProjectBoundaryStandardRole;
}

/** Registered fence source: enterprise KB, this-tender spec binding, or bidder-owned file. */
export interface TenderProjectBoundarySource {
  id: string;
  kind: TenderBoundarySourceKind;
  role: TenderBoundarySourceRole;
  title: string;
  path?: string;
  knowledgeSlug?: string;
  documentId?: string;
  markdownPath?: string;
  parseStatus: TenderBoundaryParseStatus;
}

export interface TenderProjectBoundaryExtractedInventory {
  plant: string[];
  labour: string[];
  materialSources: string[];
  constraints: string[];
}

export interface TenderProjectBoundaryPack {
  schemaVersion: 1;
  projectId: string;
  profileId?: TenderProjectBoundaryProfileId | string;
  jurisdiction: {
    countryCode?: string;
    region?: string;
    authority?: string;
    currency: string;
  };
  standards: {
    technicalSpecs: TenderProjectBoundaryStandardRef[];
    contractForm?: { id: string; title: string; version?: string };
    measurementStandard: { id: string; title: string; notes?: string };
  };
  pricing: {
    pricingStandard: string;
    indirectCostPolicy: string;
    taxRegime: { vatTreatment: string; notes?: string };
    ratePolicy: {
      location: string;
      effectiveDateHint?: string;
      mustVerifyOnline: string[];
      allowUnverifiedLabel: true;
    };
  };
  productivity: {
    basis: TenderProjectBoundaryProductivityBasis;
    notes?: string;
    sources: Array<{ title: string; pathOrUrl?: string; confidence: 'high' | 'medium' | 'low' }>;
  };
  bidderResources: {
    outline: string;
    ownedPlant?: string[];
    ownedLabour?: string[];
    materialSources?: string[];
    subcontractBoundaries?: string;
  };
  organizationOutline: {
    text: string;
    derivedAssumptions?: string[];
  };
  /** Fence corpus for BOQ: KB standards, tender spec bindings, bidder-owned files. */
  boundarySources?: TenderProjectBoundarySource[];
  extractedInventory?: TenderProjectBoundaryExtractedInventory;
  suggestedFromAnalysis?: {
    documentAnalysisPackPath?: string;
    notes?: string[];
  };
  humanConfirmedAt?: string;
  readiness: TenderProjectBoundaryReadiness;
}

export interface TenderProjectBoundaryAudit {
  schemaVersion: 1;
  capability: 'project_boundary';
  projectId: string;
  coreRevision: number;
  generatedAt: string;
  readiness: TenderCapabilityReadiness;
  summary: {
    profileId: string | null;
    currency: string;
    pricingStandard: string;
    measurementStandard: string;
    outlineChars: number;
    outlineMeetsMinimum: boolean;
    humanConfirmed: boolean;
    sourceCount: number;
    parsedSourceCount: number;
  };
  issues: TenderCapabilityAuditIssue[];
}

export function organizationOutlineMeetsMinimum(text: string, min = TENDER_PROJECT_BOUNDARY_OUTLINE_MIN_CHARS): boolean {
  return text.trim().length >= min;
}
