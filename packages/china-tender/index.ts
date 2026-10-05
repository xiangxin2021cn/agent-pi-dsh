import type { ChinaTenderInput } from './types.ts';
import { assessChinaTenderProfile } from './profile.ts';
import { assessChinaTenderRules, CHINA_TENDER_RULES } from './rules.ts';
import { assessChinaTenderResponses } from './responses.ts';
import { compareChinaBoq } from './boq.ts';

export * from './types.ts';
export * from './profile.ts';
export * from './rules.ts';
export * from './responses.ts';
export * from './boq.ts';

export function analyzeChinaTender(input: ChinaTenderInput) {
  const profileAssessment = assessChinaTenderProfile(input.profile);
  const ruleAssessments = assessChinaTenderRules(input.rules ?? CHINA_TENDER_RULES, input.profile);
  const responseMatrix = assessChinaTenderResponses(
    input.requirements ?? [], input.evidence ?? [], input.responses ?? [],
    input.profile.projectDate, ruleAssessments,
  );
  return {
    schemaVersion: 1 as const,
    advisoryOnly: true as const,
    scopeLimitations: [
      '结果为制度适用建议和资料一致性核对，不代替法律适用判断、资格审查或评标结论。',
      '内置目录仅覆盖三个已列明的国家或公路行业来源，不包含完整全国及省级规则。',
      '规则效力以官方最新信息及项目实际适用版本为准；草案不能作为生效规则执行。',
      '证据核验状态由调用方提供，本模块不访问证照、信用、交易平台，也不验证文件签章真伪。',
      '清单哈希校验识别快照变化，不等同电子签名；持久化层须保留原基线及补遗形成的新版本。',
    ],
    profileAssessment,
    ruleAssessments,
    responseMatrix,
    summary: {
      requirements: responseMatrix.length,
      supported: responseMatrix.filter((row) => row.status === 'supported').length,
      conflicts: responseMatrix.filter((row) => row.status === 'conflict').length,
      needsEvidence: responseMatrix.filter((row) => row.status === 'needs_evidence').length,
      needsReview: responseMatrix.filter((row) => row.status === 'needs_review').length,
      hasRequirements: responseMatrix.length > 0,
    },
    ...(input.boq ? { boqComparison: compareChinaBoq(input.boq.baseline, input.boq.comparedRows, input.boq.kind) } : {}),
  };
}
