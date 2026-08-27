import type { DeliveryEvidenceRef } from '../../types.ts';
import type { DeliveryCapabilityAuditIssue, DeliveryCapabilityReadiness } from '../types.ts';

export interface DeliveryBudgetLine {
  id: string;
  scopeItemId: string;
  activityIds: string[];
  title: string;
  approvedBudget: string;
  approvedVariationAmount: string;
  currentBudget: string;
  evidenceRefs: DeliveryEvidenceRef[];
  status: 'draft' | 'reviewed' | 'blocked';
}

export interface DeliveryCommitment {
  id: string;
  costCodeId: string;
  supplier: string;
  committedAmount: string;
  evidenceRefs: DeliveryEvidenceRef[];
  status: 'draft' | 'confirmed' | 'cancelled' | 'blocked';
}

export interface DeliveryCostTransaction {
  id: string;
  costCodeId: string;
  period: string;
  amount: string;
  evidenceRefs: DeliveryEvidenceRef[];
  status: 'draft' | 'posted' | 'reversed';
}

export interface DeliveryVariation {
  id: string;
  costCodeId: string;
  title: string;
  amount: string;
  evidenceRefs: DeliveryEvidenceRef[];
  status: 'pending' | 'approved' | 'rejected' | 'blocked';
}

export interface DeliveryCostForecast {
  costCodeId: string;
  forecastToComplete: string;
  estimateAtCompletion: string;
  evidenceRefs: DeliveryEvidenceRef[];
  confidence: 'confirmed' | 'scenario' | 'unverified';
}

export interface DeliveryCostCommercialData {
  controlStatus: 'draft' | 'reviewed' | 'blocked';
  dataDate: string;
  currency: string;
  budgetLines: DeliveryBudgetLine[];
  commitments: DeliveryCommitment[];
  actualCosts: DeliveryCostTransaction[];
  accruals: DeliveryCostTransaction[];
  variations: DeliveryVariation[];
  forecasts: DeliveryCostForecast[];
}

export interface DeliveryCostCommercialAudit {
  schemaVersion: 1;
  capability: 'cost_commercial';
  projectId: string;
  coreRevision: number;
  generatedAt: string;
  readiness: DeliveryCapabilityReadiness;
  summary: {
    currency: string;
    costCodes: number;
    currentBudget: string;
    commitments: string;
    actualCost: string;
    accruals: string;
    approvedVariations: string;
    forecastToComplete: string;
    estimateAtCompletion: string;
  };
  issues: DeliveryCapabilityAuditIssue[];
}
