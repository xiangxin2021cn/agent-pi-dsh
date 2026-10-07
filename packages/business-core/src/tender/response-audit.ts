import type { TenderWorkspace } from './types.ts';
import type { TenderAuditIssue } from './audit.ts';
import type { TenderResponseMaterial } from './response-plan.ts';

/** Applicability is a recorded review, not a claim of independently verified authenticity. */
export function tenderMaterialIssues(material: TenderResponseMaterial, asOf: string): string[] {
  const reasons: string[] = [];
  if (material.subject.trim() !== material.expectedSubject.trim()) reasons.push('材料主体与本次要求主体不一致。');
  if (material.validUntil && Date.parse(material.validUntil) < Date.parse(asOf)) reasons.push('材料在本次检查/递交时点已过期。');
  if (material.verification !== 'verified' || !material.reviewer || !material.reviewedAt || !material.note) reasons.push('材料真实性与适用性尚未留下完整复核记录。');
  if (material.availability !== 'confirmed') reasons.push('人员、设备或材料的本项目可用性尚未确认。');
  if (!['confirmed', 'not_required'].includes(material.authorization)) reasons.push('材料使用授权尚未确认或已拒绝。');
  if (material.knowledgeCitation && !/^\[kb:[a-z0-9][a-z0-9-]*@[a-f0-9]{64}:[A-Za-z0-9][A-Za-z0-9_.()-]*\]$/.test(material.knowledgeCitation)) reasons.push('企业知识引用需要固定不可变版本。');
  return reasons;
}

export function auditTenderResponsePlans(workspace: TenderWorkspace, generatedAt: string): TenderAuditIssue[] {
  const issues: TenderAuditIssue[] = [];
  const add = (code: string, entityType: 'criterion' | 'response', entityId: string, message: string, severity: 'error' | 'warning' = 'error') => issues.push({ code, entityType, entityId, message, severity });
  const criteria = new Map(workspace.criteria.map(row => [row.id, row]));
  const requirements = new Set(workspace.requirements.map(row => row.id));
  const documents = new Map(workspace.documents.map(row => [row.id, row]));
  const asOf = workspace.project.closingAt && Date.parse(workspace.project.closingAt) > Date.parse(generatedAt) ? workspace.project.closingAt : generatedAt;
  for (const criterion of workspace.criteria) {
    for (const band of criterion.rubric?.bands ?? []) {
      if (band.score !== undefined && (criterion.method === 'pass_fail' || criterion.method === 'weighted' && band.score > (criterion.weight ?? 0))) add('rubric_band_score_invalid', 'criterion', criterion.id, `评分档次 ${band.label} 与该项评分方法或分值不符。`);
    }
    for (const point of criterion.rubric?.points ?? []) {
      if (!workspace.responses.some(response => response.status !== 'blocked' && response.criterionIds.includes(criterion.id) && response.chapter?.pointResponses.some(row => row.criterionId === criterion.id && row.pointId === point.id))) add('rubric_point_unplanned', 'criterion', criterion.id, `评分子点“${point.text}”尚无章节响应计划。`);
    }
  }
  for (const response of workspace.responses) {
    if (!response.chapter) continue;
    if (!response.requirementIds.length && !response.criterionIds.length) add('chapter_response_unlinked', 'response', response.id, '章节尚未关联本次要求或评分项。');
    if (response.chapter.requiredContent.length === 0) add('chapter_content_unspecified', 'response', response.id, '章节尚未明确必答内容。', 'warning');
    if (['reuse', 'adapt'].includes(response.chapter.generationMode) && response.chapter.materials.length === 0) add('chapter_reuse_material_missing', 'response', response.id, '复用或调整章节尚未选择适用材料。');
    const pointKeys = new Set<string>();
    for (const point of response.chapter.pointResponses) {
      const key = `${point.criterionId}:${point.pointId}`;
      if (pointKeys.has(key)) add('duplicate_rubric_response', 'response', response.id, `评分子点 ${key} 重复登记。`);
      pointKeys.add(key);
      if (!response.criterionIds.includes(point.criterionId) || !criteria.get(point.criterionId)?.rubric?.points.some(row => row.id === point.pointId)) add('rubric_point_reference_invalid', 'response', response.id, `评分子点 ${key} 未登记或未关联到本响应。`);
    }
    for (const material of response.chapter.materials) {
      for (const reason of tenderMaterialIssues(material, asOf)) add('response_material_not_ready', 'response', response.id, `${material.title}：${reason}`);
      if (material.documentId && documents.get(material.documentId)?.status !== 'active') add('response_material_source_inactive', 'response', response.id, `${material.title}：材料来源未登记或已失效。`);
    }
    for (const dependency of response.chapter.dependencies) {
      if (dependency.kind === 'document' && documents.get(dependency.id)?.status !== 'active' || dependency.kind === 'requirement' && !requirements.has(dependency.id) || dependency.kind === 'criterion' && !criteria.has(dependency.id)) add('response_dependency_missing', 'response', response.id, `章节依赖 ${dependency.kind}:${dependency.id} 未登记或已失效。`);
    }
  }
  return issues;
}
