import type { TenderSourceLocator } from '../../types.ts';
import type { TenderCapabilityAuditIssue, TenderCapabilityReadiness } from '../types.ts';

export type TenderBoqQuantityBasis = 'boq' | 'calculated' | 'assumption' | 'not_provided';
export type TenderBoqQuantityStatus = 'sourced' | 'verified' | 'unverified';

export interface TenderBoqItem {
  id: string;
  source: TenderSourceLocator;
  code: string;
  description: string;
  unit: string;
  quantity?: string;
  quantityBasis: TenderBoqQuantityBasis;
  quantityStatus: TenderBoqQuantityStatus;
  quantityRefs: TenderSourceLocator[];
}

export interface TenderScopeAssumption {
  text: string;
  status: 'unverified' | 'confirmed' | 'rejected';
  sourceRefs: TenderSourceLocator[];
}

export interface TenderScopeLink {
  boqItemId: string;
  requirementIds: string[];
  specificationRefs: TenderSourceLocator[];
  drawingRefs: TenderSourceLocator[];
  measurementRuleRefs: TenderSourceLocator[];
  inclusions: string[];
  exclusions: string[];
  assumptions: TenderScopeAssumption[];
  gapStatus: 'clear' | 'needs_review' | 'blocked';
}

export interface TenderBoqReconciliationData {
  items: TenderBoqItem[];
  scopeLinks: TenderScopeLink[];
}

export interface TenderBoqReconciliationAudit {
  schemaVersion: 1;
  capability: 'boq_reconciliation';
  projectId: string;
  coreRevision: number;
  generatedAt: string;
  readiness: TenderCapabilityReadiness;
  summary: {
    items: number;
    linkedItems: number;
    clearItems: number;
    reviewGaps: number;
    blockedGaps: number;
    unverifiedQuantities: number;
    unverifiedAssumptions: number;
  };
  issues: TenderCapabilityAuditIssue[];
}
