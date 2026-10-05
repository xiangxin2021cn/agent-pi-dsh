import type { ChinaTenderProfile, ChinaTenderRule, RuleAssessment } from './types.ts';
import { PROCUREMENT_ARTICLE_7 } from './profile.ts';
import { requireDate, requireOneOf, requireText, requireUniqueIds } from './validation.ts';

// A small source-backed catalogue, not a complete national or provincial rules database.
export const CHINA_TENDER_RULES: readonly ChinaTenderRule[] = [
  {
    id: 'cn-government-procurement-procedure',
    title: '政府采购工程程序与政策适用',
    status: 'effective', effectiveFrom: '2015-03-01', checkedAt: '2026-10-05',
    contexts: ['government_procurement'], source: PROCUREMENT_ARTICLE_7,
  },
  {
    id: 'cn-highway-fair-competition-2025',
    title: '公路工程资格预审文件和招标文件公平竞争合规指引',
    status: 'effective', effectiveFrom: '2025-03-28', checkedAt: '2026-10-05',
    industries: ['highway'], methods: ['tender'], mandatoryTenderOnly: true,
    source: {
      title: '交公路规〔2025〕1号',
      url: 'https://xxgk.mot.gov.cn/xzgfxwj/202504/t20250403_4166461.html',
      article: '第二条、第四条、第八条',
    },
  },
  {
    id: 'cn-government-goods-services-tender',
    title: '政府采购独立货物和服务招标投标管理',
    status: 'effective', effectiveFrom: '2017-10-01', checkedAt: '2026-10-05',
    contexts: ['government_procurement'], subjects: ['goods', 'services'], methods: ['tender'],
    source: {
      title: '财政部令第87号',
      url: 'https://www.mof.gov.cn/gp/xxgkml/tfs/201707/t20170718_2652766.htm',
      article: '第一条、第二条',
    },
  },
];

export function assessChinaTenderRules(rules: readonly ChinaTenderRule[], profile: ChinaTenderProfile): RuleAssessment[] {
  requireUniqueIds(rules, 'rules');
  if (profile.projectDate) requireDate(profile.projectDate, 'projectDate');
  return rules.map((rule) => {
    requireText(rule.title, 'rule.title');
    requireText(rule.source.title, 'rule.source.title');
    requireText(rule.source.url, 'rule.source.url');
    if (!/^https?:\/\//.test(rule.source.url)) throw new Error('rule.source.url 必须是 HTTP(S) 出处');
    requireOneOf(rule.status, ['effective', 'pending', 'draft', 'repealed'], 'rule.status');
    requireDate(rule.checkedAt, 'rule.checkedAt');
    if (rule.effectiveFrom) requireDate(rule.effectiveFrom, 'rule.effectiveFrom');
    if (rule.effectiveTo) requireDate(rule.effectiveTo, 'rule.effectiveTo');
    if (rule.effectiveFrom && rule.effectiveTo && rule.effectiveTo <= rule.effectiveFrom) {
      throw new Error(`规则 ${rule.id} 有效期必须为开始日早于结束日`);
    }
    const excluded: string[] = [];
    const review: string[] = [];
    if (rule.status === 'draft') excluded.push('修订草案不能作为生效规则执行。');
    if (rule.status === 'pending') review.push('规则尚未确认实施，需核验当前官方效力状态。');
    if (rule.status === 'repealed') {
      if (profile.projectDate && rule.effectiveTo && profile.projectDate < rule.effectiveTo) {
        review.push('规则已废止；历史项目是否仍按原版本执行需核对合同和衔接规定。');
      } else excluded.push('规则已废止，不能直接作为当前生效规则执行。');
    }
    if (!profile.projectDate) review.push('缺项目适用日期。');
    if (!rule.effectiveFrom) review.push('缺官方生效日期。');
    if (profile.projectDate) {
      if (rule.effectiveFrom && profile.projectDate < rule.effectiveFrom) excluded.push('项目日期早于规则生效日。');
      if (rule.effectiveTo && profile.projectDate >= rule.effectiveTo) excluded.push('项目日期已到规则失效日。');
      if (profile.projectDate > rule.checkedAt) review.push('项目日期晚于规则效力核验日期，需更新核验。');
    }
    const scopes = [
      ['province', rule.provinces, profile.province],
      ['industry', rule.industries, profile.industry],
      ['context', rule.contexts, profile.context],
      ['subject', rule.subjects, profile.subject],
      ['method', rule.methods, profile.method],
    ] as const;
    for (const [name, allowed, value] of scopes) {
      if (!allowed?.length) continue;
      for (const item of allowed) requireText(item, `rule.${name}`);
      if (!value || value === 'unknown') review.push(`缺 ${name}，无法核对规则适用范围。`);
      else if (!(allowed as readonly string[]).includes(value)) excluded.push(`${name} 不在此规则的适用范围。`);
    }
    if (rule.mandatoryTenderOnly) {
      if (profile.mandatoryTender === 'no') excluded.push('此规则适用于依法必须招标的项目。');
      else if (profile.mandatoryTender !== 'yes') review.push('需确认是否依法必须招标。');
    }
    const status = excluded.length ? 'not_applicable' : review.length ? 'needs_review' : 'applicable';
    return {
      ruleId: rule.id, status, eligibleForCheck: status === 'applicable',
      reasons: [...excluded, ...review], source: { ...rule.source },
    };
  });
}
