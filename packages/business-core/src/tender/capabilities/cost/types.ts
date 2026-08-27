import type { TenderSourceLocator } from '../../types.ts';
import type { TenderCapabilityAuditIssue, TenderCapabilityReadiness } from '../types.ts';

export interface TenderRateSource {
  id: string;
  description: string;
  sourceRef: TenderSourceLocator;
  currency: string;
  effectiveAt: string;
}

export interface TenderCostComponent {
  id: string;
  kind:
    | 'labour'
    | 'plant'
    | 'material'
    | 'subcontract'
    | 'overhead'
    | 'contingency'
    | 'tax'
    | 'escalation'
    | 'financing'
    | 'other';
  description: string;
  quantity: string;
  unit: string;
  rate: string;
  rateSourceId?: string;
  scenarioId?: string;
  assumptionStatus: 'sourced' | 'scenario' | 'unverified';
}

export interface TenderBoqCostBuildUp {
  boqItemId: string;
  componentIds: string[];
  total: string;
}

export interface TenderCashFlowPeriod {
  period: string;
  activityIds: string[];
  plannedCost: string;
  cumulativeCost: string;
}

export interface TenderCostScenario {
  id: string;
  title: string;
  assumptions: string[];
  active: boolean;
}

export interface TenderCostCashFlowData {
  currency: string;
  costStatus: 'draft' | 'reviewed' | 'blocked';
  rateSources: TenderRateSource[];
  components: TenderCostComponent[];
  buildUps: TenderBoqCostBuildUp[];
  cashFlow: TenderCashFlowPeriod[];
  scenarios: TenderCostScenario[];
}

export interface TenderCostCashFlowAudit {
  schemaVersion: 1;
  capability: 'cost_cashflow';
  projectId: string;
  coreRevision: number;
  generatedAt: string;
  readiness: TenderCapabilityReadiness;
  summary: {
    currency: string;
    rateSources: number;
    components: number;
    buildUps: number;
    cashFlowPeriods: number;
    estimatedTotal: string;
    cashFlowTotal: string;
    unverifiedComponents: number;
  };
  issues: TenderCapabilityAuditIssue[];
}
