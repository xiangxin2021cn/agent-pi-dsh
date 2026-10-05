import type {
  ChinaTenderEvidence, ChinaTenderRequirement, ChinaTenderResponse,
  ChinaTenderResponseResult, RuleAssessment,
} from './types.ts';
import { requireDate, requireOneOf, requireText, requireUniqueIds } from './validation.ts';

export function assessChinaTenderResponses(
  requirements: readonly ChinaTenderRequirement[],
  evidence: readonly ChinaTenderEvidence[],
  responses: readonly ChinaTenderResponse[],
  projectDate?: string,
  rules: readonly RuleAssessment[] = [],
): ChinaTenderResponseResult[] {
  requireUniqueIds(requirements, 'requirements');
  requireUniqueIds(evidence, 'evidence');
  requireUniqueIds(responses.map((row) => ({ id: row.requirementId })), 'responses');
  if (projectDate) requireDate(projectDate, 'projectDate');
  const byEvidence = new Map(evidence.map((row) => [row.id, row]));
  const byResponse = new Map(responses.map((row) => [row.requirementId, row]));
  const byRule = new Map(rules.map((row) => [row.ruleId, row]));
  const ids = new Set(requirements.map((row) => row.id));
  for (const response of responses) {
    if (!ids.has(response.requirementId)) throw new Error(`响应引用未登记要求：${response.requirementId}`);
    requireOneOf(response.assessment, ['supports', 'contradicts', 'unknown'], 'response.assessment');
    for (const id of response.evidenceIds) requireText(id, 'response.evidenceId');
    if (new Set(response.evidenceIds).size !== response.evidenceIds.length) throw new Error('响应存在重复证据编号');
    if (response.reviewedAt) requireDate(response.reviewedAt, 'response.reviewedAt');
  }
  for (const row of evidence) {
    requireText(row.source.documentId, 'evidence.source.documentId');
    requireOneOf(row.source.status, ['active', 'superseded', 'withdrawn'], 'evidence.source.status');
    requireOneOf(row.verification, ['verified', 'unverified', 'not_found'], 'evidence.verification');
    if (row.validFrom) requireDate(row.validFrom, 'evidence.validFrom');
    if (row.validUntil) requireDate(row.validUntil, 'evidence.validUntil');
    if (row.checkedAt) requireDate(row.checkedAt, 'evidence.checkedAt');
    if (row.validFrom && row.validUntil && row.validUntil < row.validFrom) throw new Error('证据有效期开始晚于结束');
  }
  return requirements.map((requirement) => {
    requireText(requirement.title, 'requirement.title');
    requireText(requirement.source.documentId, 'requirement.source.documentId');
    requireOneOf(requirement.source.status, ['active', 'superseded', 'withdrawn'], 'requirement.source.status');
    requireOneOf(requirement.category, ['qualification', 'mandatory', 'scored', 'technical', 'pricing', 'format', 'other'], 'requirement.category');
    if (requirement.evaluationDate) requireDate(requirement.evaluationDate, 'requirement.evaluationDate');
    const date = requirement.evaluationDate ?? projectDate;
    const response = byResponse.get(requirement.id);
    const reasons: string[] = [];
    let missingEvidence = false;
    if (requirement.source.status !== 'active') reasons.push('要求来源已替代或撤回，需按有效文件重新核对。');
    if (requirement.source.sha256 && requirement.source.sha256 !== response?.requirementSourceSha256) {
      reasons.push('响应未绑定当前要求来源版本，需按当前文件重新复核。');
    }
    if (requirement.ruleId && !byRule.get(requirement.ruleId)?.eligibleForCheck) {
      reasons.push('所关联规则未确认适用，不能据此形成已核对结论。');
    }
    if (!response?.evidenceIds.length) {
      missingEvidence = true;
      reasons.push('缺响应证据，尚不能判断是否满足。');
    }
    for (const id of response?.evidenceIds ?? []) {
      const row = byEvidence.get(id);
      if (!row || row.verification === 'not_found') {
        missingEvidence = true;
        reasons.push(`证据 ${id} 未提供或未检索到；未检索到不等于不符合要求。`);
        continue;
      }
      if (row.verification !== 'verified') reasons.push(`证据 ${id} 尚未核验。`);
      if (row.source.status !== 'active') reasons.push(`证据 ${id} 来源已替代或撤回。`);
      if (!row.checkedAt) reasons.push(`证据 ${id} 缺核验日期。`);
      if (!date) reasons.push(`证据 ${id} 缺项目适用日期。`);
      if (date && row.validFrom && date < row.validFrom) reasons.push(`证据 ${id} 在适用日期尚未生效。`);
      // Certificate validUntil is inclusive; legal rule effectiveTo is exclusive.
      if (date && row.validUntil && date > row.validUntil) reasons.push(`证据 ${id} 在适用日期已过期。`);
      if (date && row.checkedAt && date > row.checkedAt) reasons.push(`证据 ${id} 的核验早于适用日期，需复核状态。`);
    }
    if (response && (!response.reviewedBy?.trim() || !response.reviewedAt || !response.note?.trim())) {
      reasons.push('缺复核人、复核日期或判断说明。');
    }
    if (response?.assessment === 'supports' && !response.responseLocation?.trim()) reasons.push('缺响应文件位置。');
    if (response?.assessment === 'unknown') reasons.push('响应与要求的关系尚未确认。');
    const status = missingEvidence ? 'needs_evidence' : reasons.length ? 'needs_review'
      : response?.assessment === 'contradicts' ? 'conflict' : 'supported';
    return {
      requirementId: requirement.id, title: requirement.title, status,
      reasons: [...new Set(reasons)], source: { ...requirement.source },
      evidenceIds: [...(response?.evidenceIds ?? [])], responseLocation: response?.responseLocation,
    };
  });
}
