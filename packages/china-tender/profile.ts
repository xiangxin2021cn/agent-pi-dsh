import type { ChinaTenderProfile, LegalSource, ProfileAssessment } from './types.ts';
import { requireDate, requireOneOf, requireText } from './validation.ts';

export const PROCUREMENT_ARTICLE_7: LegalSource = {
  title: '中华人民共和国政府采购法实施条例',
  url: 'https://www.mof.gov.cn/zhengwuxinxi/zhengcefabu/201502/t20150227_1195516.htm',
  article: '第七条',
};

export function assessChinaTenderProfile(profile: ChinaTenderProfile): ProfileAssessment {
  requireOneOf(profile.context, ['government_procurement', 'enterprise_procurement', 'unknown'], 'context');
  requireOneOf(profile.subject, ['construction', 'engineering_goods', 'engineering_services', 'goods', 'services', 'unknown'], 'subject');
  requireOneOf(profile.method, ['tender', 'non_tender', 'unknown'], 'method');
  if (profile.mandatoryTender !== undefined) requireOneOf(profile.mandatoryTender, ['yes', 'no', 'unknown'], 'mandatoryTender');
  if (profile.projectDate !== undefined) requireDate(profile.projectDate, 'projectDate');
  if (profile.province !== undefined) requireText(profile.province, 'province');
  if (profile.industry !== undefined) requireText(profile.industry, 'industry');
  const missing = ['province', 'industry', 'projectDate'].filter((key) => !profile[key as keyof ChinaTenderProfile]);
  for (const key of ['context', 'subject', 'method'] as const) {
    if (profile[key] === 'unknown') missing.push(key);
  }
  const result: ProfileAssessment = {
    advisoryOnly: true,
    procedure: 'undetermined',
    governmentProcurementPolicies: profile.context === 'unknown' ? 'unknown' : profile.context === 'government_procurement',
    missing,
    reasons: [],
    sources: [],
  };
  const engineering = ['construction', 'engineering_goods', 'engineering_services'].includes(profile.subject);
  if (profile.context === 'unknown' || profile.subject === 'unknown') {
    result.reasons.push('采购制度或标的类型尚未明确；不能仅凭政府项目、国企或交易平台名称判断法律适用。');
    return result;
  }
  if (engineering && profile.method === 'non_tender' && profile.mandatoryTender !== 'no') {
    if (profile.mandatoryTender !== 'yes') result.missing.push('mandatoryTender');
    result.reasons.push(profile.mandatoryTender === 'yes'
      ? '已标为依法必须招标，但选择了非招标方式；需核实法定例外及实际采购程序。'
      : '工程相关采购采用非招标方式前，需核实是否属于依法必须招标及法定例外。');
    return result;
  }
  if (profile.context === 'government_procurement') {
    result.sources.push(PROCUREMENT_ARTICLE_7);
    if (engineering) {
      if (profile.method === 'unknown') {
        result.reasons.push('政府采购工程及相关货物、服务需根据采购方式判断程序适用。');
      } else {
        result.procedure = profile.method === 'tender' ? 'tendering_law' : 'government_procurement_law';
        result.reasons.push('按实施条例第七条形成程序建议，仍需执行适用的政府采购政策；工程相关性应有项目依据。');
      }
    } else {
      result.procedure = 'government_procurement_law';
      result.reasons.push('独立货物、服务政府采购不能因采用招标方式直接套用工程招标制度。');
      result.sources.push({
        title: '政府采购货物和服务招标投标管理办法',
        url: 'https://www.mof.gov.cn/gp/xxgkml/tfs/201707/t20170718_2652766.htm',
        article: '第一条、第二条',
      });
    }
  } else if (profile.method === 'tender') {
    result.procedure = 'tendering_law';
    result.reasons.push('企业招标活动建议核对招标投标制度及行业要求；是否依法必须招标需要另行确认。');
    result.sources.push({
      title: '中华人民共和国招标投标法',
      url: 'https://wb.flk.npc.gov.cn/flfg/PDF/6d37209a0fc04005a9da2545eade97fc.pdf',
      article: '第二条',
    });
  } else if (profile.method === 'non_tender') {
    result.procedure = 'enterprise_rules';
    result.reasons.push('应核对适用的企业采购制度、行业要求及采用非招标方式的依据，不能自动套用政府采购政策。');
  } else {
    result.reasons.push('尚未确定企业采购方式。');
  }
  return result;
}
