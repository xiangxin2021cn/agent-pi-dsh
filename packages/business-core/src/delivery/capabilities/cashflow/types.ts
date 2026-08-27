import type { DeliveryEvidenceRef } from '../../types.ts';
import type { DeliveryCapabilityAuditIssue, DeliveryCapabilityReadiness } from '../types.ts';

export interface DeliveryCashPosition {
  openingBalance: string;
  inflow: string;
  outflow: string;
  closingBalance: string;
}

export interface DeliveryCashflowPeriod {
  period: string;
  planned: DeliveryCashPosition;
  actual: DeliveryCashPosition;
  forecast: DeliveryCashPosition;
  evidenceRefs: DeliveryEvidenceRef[];
  status: 'draft' | 'reviewed' | 'blocked';
}

export interface DeliveryFundingConstraint {
  id: string;
  title: string;
  requiredAmount: string;
  availableAmount: string;
  dueDate: string;
  owner: string;
  evidenceRefs: DeliveryEvidenceRef[];
  status: 'open' | 'mitigated' | 'closed' | 'blocked';
}

export interface DeliveryCashflowData {
  controlStatus: 'draft' | 'reviewed' | 'blocked';
  dataDate: string;
  currency: string;
  periods: DeliveryCashflowPeriod[];
  fundingConstraints: DeliveryFundingConstraint[];
}

export interface DeliveryCashflowAudit {
  schemaVersion: 1;
  capability: 'cashflow';
  projectId: string;
  coreRevision: number;
  generatedAt: string;
  readiness: DeliveryCapabilityReadiness;
  summary: {
    currency: string;
    periods: number;
    plannedInflow: string;
    plannedOutflow: string;
    actualInflow: string;
    actualOutflow: string;
    forecastInflow: string;
    forecastOutflow: string;
    endingForecastBalance: string;
    openFundingConstraints: number;
  };
  issues: DeliveryCapabilityAuditIssue[];
}
