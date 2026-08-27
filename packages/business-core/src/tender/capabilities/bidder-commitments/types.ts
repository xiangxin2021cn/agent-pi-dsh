import type { TenderSourceLocator } from '../../types.ts';
import type { TenderCapabilityAuditIssue, TenderCapabilityReadiness } from '../types.ts';

export const TENDER_BIDDER_COMMITMENT_CATEGORIES = [
  'labour',
  'management',
  'plant',
  'materials',
  'temporary_facilities',
  'method',
  'productivity',
  'sequence_timing',
  'subcontracting',
] as const;

export type TenderBidderCommitmentCategory = typeof TENDER_BIDDER_COMMITMENT_CATEGORIES[number];
export type TenderBidderCommitmentStatus = 'confirmed' | 'accepted_assumption' | 'not_applicable';

export interface TenderBidderCommitment {
  id: string;
  category: TenderBidderCommitmentCategory;
  subject: string;
  decision: string;
  status: TenderBidderCommitmentStatus;
  quantity?: string;
  unit?: string;
  mode?: string;
  location?: string;
  effectivePeriod?: string;
  appliesToAllBoqItems: boolean;
  affectedBoqItemIds: string[];
  inputReference: string;
  sourceRefs: TenderSourceLocator[];
  riskTreatment?: string;
}

export interface TenderBidderCommitmentsData {
  confirmation: {
    confirmed: boolean;
    confirmedBy: string;
    confirmedAt: string;
    basisStatement: string;
  };
  commitments: TenderBidderCommitment[];
  openItems: string[];
}

export interface TenderBidderCommitmentsAudit {
  schemaVersion: 1;
  capability: 'bidder_commitments';
  projectId: string;
  coreRevision: number;
  generatedAt: string;
  readiness: TenderCapabilityReadiness;
  summary: {
    commitments: number;
    confirmedCommitments: number;
    acceptedAssumptions: number;
    notApplicable: number;
    missingCategories: number;
    openItems: number;
  };
  issues: TenderCapabilityAuditIssue[];
}
