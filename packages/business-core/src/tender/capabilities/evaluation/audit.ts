import type { TenderWorkspace } from '../../types.ts';
import type { TenderCapabilityAuditIssue } from '../types.ts';
import { parseTenderEvaluationStrategyData } from './schema.ts';
import type {
  TenderEvaluationStrategyAudit,
  TenderEvaluationStrategyData,
} from './types.ts';

export function auditTenderEvaluationStrategy(
  workspace: TenderWorkspace,
  value: TenderEvaluationStrategyData | unknown,
  generatedAt = new Date().toISOString(),
): TenderEvaluationStrategyAudit {
  const data = parseTenderEvaluationStrategyData(value);
  const issues: TenderCapabilityAuditIssue[] = [];
  const criterionById = new Map(workspace.criteria.map((criterion) => [criterion.id, criterion]));
  const documentById = new Map(workspace.documents.map((document) => [document.id, document]));
  const strategyByCriterionId = new Map(data.strategies.map((strategy) => [strategy.criterionId, strategy]));

  for (const criterion of workspace.criteria) {
    if (!strategyByCriterionId.has(criterion.id)) {
      issues.push({
        code: 'criterion_strategy_missing',
        severity: 'error',
        entityType: 'criterion',
        entityId: criterion.id,
        message: `Criterion ${criterion.id} has no evaluation strategy.`,
      });
    }
  }

  for (const strategy of data.strategies) {
    const criterion = criterionById.get(strategy.criterionId);
    if (!criterion) {
      issues.push({
        code: 'unknown_criterion_strategy',
        severity: 'error',
        entityType: 'strategy',
        entityId: strategy.criterionId,
        message: `Strategy references missing criterion ${strategy.criterionId}.`,
      });
      continue;
    }

    if (criterion.method === 'pass_fail' && strategy.targetScore !== undefined) {
      issues.push({
        code: 'pass_fail_target_score_forbidden',
        severity: 'error',
        entityType: 'strategy',
        entityId: strategy.criterionId,
        message: `Pass/fail criterion ${strategy.criterionId} cannot have a target score.`,
      });
    }
    if (
      criterion.method === 'weighted'
      && strategy.targetScore !== undefined
      && strategy.targetScore > (criterion.weight ?? 0)
    ) {
      issues.push({
        code: 'target_score_exceeds_weight',
        severity: 'error',
        entityType: 'strategy',
        entityId: strategy.criterionId,
        message: `Target score for ${strategy.criterionId} exceeds its criterion weight.`,
      });
    }
    if (
      criterion.method === 'threshold'
      && strategy.targetScore !== undefined
      && strategy.targetScore < (criterion.minimumScore ?? 0)
    ) {
      issues.push({
        code: 'target_score_below_threshold',
        severity: 'error',
        entityType: 'strategy',
        entityId: strategy.criterionId,
        message: `Target score for ${strategy.criterionId} is below the required threshold.`,
      });
    }
    if (strategy.status === 'blocked') {
      issues.push({
        code: 'criterion_strategy_blocked',
        severity: 'error',
        entityType: 'strategy',
        entityId: strategy.criterionId,
        message: `Strategy for ${strategy.criterionId} is blocked.`,
      });
    } else if (strategy.status !== 'reviewed') {
      issues.push({
        code: 'criterion_strategy_not_reviewed',
        severity: 'warning',
        entityType: 'strategy',
        entityId: strategy.criterionId,
        message: `Strategy for ${strategy.criterionId} has not been reviewed.`,
      });
    }

    if (
      strategy.status === 'reviewed'
      && strategy.evidenceRefs.length === 0
      && strategy.evidenceArtifactPaths.length === 0
    ) {
      issues.push({
        code: 'reviewed_strategy_missing_evidence',
        severity: 'error',
        entityType: 'strategy',
        entityId: strategy.criterionId,
        message: `Reviewed strategy for ${strategy.criterionId} has no evidence.`,
      });
    }

    for (const source of strategy.evidenceRefs) {
      const document = documentById.get(source.documentId);
      if (!document) {
        issues.push({
          code: 'broken_document_reference',
          severity: 'error',
          entityType: 'strategy',
          entityId: strategy.criterionId,
          message: `Evidence document ${source.documentId} is not registered.`,
        });
      } else if (document.status !== 'active') {
        issues.push({
          code: 'inactive_evidence_reference',
          severity: document.status === 'withdrawn' ? 'error' : 'warning',
          entityType: 'strategy',
          entityId: strategy.criterionId,
          message: `Evidence document ${source.documentId} is ${document.status}.`,
        });
      }
    }
  }

  const readiness = issues.some((issue) => issue.severity === 'error')
    ? 'not_ready'
    : issues.length > 0
      ? 'needs_review'
      : 'ready';

  const coveredStrategies = data.strategies.filter((strategy) => criterionById.has(strategy.criterionId));
  return {
    schemaVersion: 1,
    capability: 'evaluation_strategy',
    projectId: workspace.project.id,
    coreRevision: workspace.revision,
    generatedAt,
    readiness,
    summary: {
      criteria: workspace.criteria.length,
      coveredCriteria: coveredStrategies.length,
      reviewedCriteria: coveredStrategies.filter((strategy) => strategy.status === 'reviewed').length,
      blockedCriteria: coveredStrategies.filter((strategy) => strategy.status === 'blocked').length,
      targetWeightedScore: coveredStrategies.reduce((sum, strategy) => {
        const criterion = criterionById.get(strategy.criterionId);
        return sum + (criterion?.method === 'weighted' ? (strategy.targetScore ?? 0) : 0);
      }, 0),
    },
    issues,
  };
}
