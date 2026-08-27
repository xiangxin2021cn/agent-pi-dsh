import type {
  TenderCapabilityAuditIssue,
  TenderCapabilityReadiness,
} from '../types.ts';
import type { TenderSourceLocator } from '../../types.ts';

export type TenderEvaluationStrategyStatus = 'planned' | 'evidenced' | 'reviewed' | 'blocked';

export interface TenderCriterionStrategy {
  criterionId: string;
  priority: 'must_pass' | 'high' | 'normal';
  targetScore?: number;
  responseOwner: string;
  responseTheme: string;
  evidencePlan: string[];
  evidenceRefs: TenderSourceLocator[];
  evidenceArtifactPaths: string[];
  differentiators: string[];
  risks: string[];
  status: TenderEvaluationStrategyStatus;
}

export interface TenderEvaluationStrategyData {
  strategies: TenderCriterionStrategy[];
}

export interface TenderEvaluationStrategyAudit {
  schemaVersion: 1;
  capability: 'evaluation_strategy';
  projectId: string;
  coreRevision: number;
  generatedAt: string;
  readiness: TenderCapabilityReadiness;
  summary: {
    criteria: number;
    coveredCriteria: number;
    reviewedCriteria: number;
    blockedCriteria: number;
    targetWeightedScore: number;
  };
  issues: TenderCapabilityAuditIssue[];
}
