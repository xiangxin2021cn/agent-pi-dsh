import type { TenderSourceLocator } from '../../types.ts';
import type { TenderCapabilityAuditIssue, TenderCapabilityReadiness } from '../types.ts';

export interface TenderWorkPackageResourceNeed {
  resourceClass: string;
  quantity?: string;
  unit?: string;
  basis?: string;
  status: 'sourced' | 'verified' | 'unverified';
}

export interface TenderWorkPackage {
  id: string;
  title: string;
  boqItemIds: string[];
  requirementIds: string[];
  methodSteps: string[];
  resourceNeeds: TenderWorkPackageResourceNeed[];
  holdPoints: string[];
  interfaces: string[];
  constraints: string[];
  temporaryWorks: string[];
  hseControls: string[];
  environmentalControls: string[];
  sourceRefs: TenderSourceLocator[];
  status: 'draft' | 'reviewed' | 'blocked';
}

export interface TenderExecutionPlanData {
  workPackages: TenderWorkPackage[];
}

export interface TenderExecutionPlanAudit {
  schemaVersion: 1;
  capability: 'execution_plan';
  projectId: string;
  coreRevision: number;
  generatedAt: string;
  readiness: TenderCapabilityReadiness;
  summary: {
    workPackages: number;
    reviewedWorkPackages: number;
    blockedWorkPackages: number;
    boqItems: number;
    coveredBoqItems: number;
    unverifiedResourceNeeds: number;
  };
  issues: TenderCapabilityAuditIssue[];
}
