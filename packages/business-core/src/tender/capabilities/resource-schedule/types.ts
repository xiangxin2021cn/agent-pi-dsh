import type { TenderSourceLocator } from '../../types.ts';
import type { TenderCapabilityAuditIssue, TenderCapabilityReadiness } from '../types.ts';
import type { TenderBoqPricingAssumptionStatus, TenderBoqPricingResourceKind } from '../boq-pricing/types.ts';

export interface TenderConstructionResourceRow {
  id: string;
  category: TenderBoqPricingResourceKind;
  name: string;
  unit: string;
  totalQuantity: string;
  unitRate?: string;
  currency?: string;
  sourceBoqItemIds: string[];
  assumptionStatus: TenderBoqPricingAssumptionStatus;
  sourceRefs: TenderSourceLocator[];
}

export interface TenderConstructionResourceScheduleData {
  currency?: string;
  location?: string;
  asOf?: string;
  rows: TenderConstructionResourceRow[];
  notes?: string[];
}

export interface TenderConstructionResourceScheduleAudit {
  schemaVersion: 1;
  capability: 'construction_resource_schedule';
  projectId: string;
  coreRevision: number;
  generatedAt: string;
  readiness: TenderCapabilityReadiness;
  summary: {
    rows: number;
    categories: number;
    unverifiedRows: number;
  };
  issues: TenderCapabilityAuditIssue[];
}
