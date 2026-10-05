import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  analyzeChinaTender, assessChinaTenderProfile, assessChinaTenderRules, assessChinaTenderResponses,
  createChinaBoqBaseline, compareChinaBoq, verifyChinaBoqBaseline,
} from '../index.ts';
import type {
  ChinaTenderProfile, ChinaTenderRule, ChinaTenderRequirement, ChinaTenderEvidence,
  ChinaTenderResponse, BoqBaselineRow,
} from '../index.ts';

const profile: ChinaTenderProfile = {
  context: 'government_procurement', subject: 'construction', method: 'tender',
  mandatoryTender: 'yes', province: 'CN-44', industry: 'highway', projectDate: '2026-10-05',
};
const source = { documentId: 'tender-r1', status: 'active' as const, page: 12, clause: '3.2' };
const requirement: ChinaTenderRequirement = { id: 'req-1', title: '资质证明', category: 'qualification', source };
const evidence: ChinaTenderEvidence = {
  id: 'cert-1', source: { documentId: 'certificate', status: 'active' },
  verification: 'verified', checkedAt: '2026-10-05', validFrom: '2025-01-01', validUntil: '2026-10-05',
};
const response: ChinaTenderResponse = {
  requirementId: 'req-1', evidenceIds: ['cert-1'], assessment: 'supports',
  responseLocation: '资格文件第8页', reviewedBy: 'reviewer-1', reviewedAt: '2026-10-05', note: '按已登记证书与条款逐项核对。',
};
const row: BoqBaselineRow = {
  id: 'line-1', code: '010515001001', description: '现浇构件钢筋', features: 'HRB400，详见结构图', unit: 't', quantity: '100.10',
};
const boqSource = { documentId: 'boq-r1', sha256: 'a'.repeat(64), revision: 'R1' };

describe('China project procedure advice', () => {
  it('distinguishes government engineering tender and non-tender procedures', () => {
    const tender = assessChinaTenderProfile(profile);
    assert.equal(tender.procedure, 'tendering_law');
    assert.equal(tender.governmentProcurementPolicies, true);
    assert.equal(tender.sources[0].article, '第七条');
    const nonTender = assessChinaTenderProfile({ ...profile, method: 'non_tender', mandatoryTender: 'no' });
    assert.equal(nonTender.procedure, 'government_procurement_law');
  });
  it('keeps independent government goods under procurement law when tendered', () => {
    assert.equal(assessChinaTenderProfile({ ...profile, subject: 'goods' }).procedure, 'government_procurement_law');
    assert.equal(assessChinaTenderProfile({ ...profile, subject: 'engineering_goods' }).procedure, 'tendering_law');
  });
  it('does not infer legal context from a province or the word enterprise', () => {
    const result = assessChinaTenderProfile({ ...profile, context: 'unknown' });
    assert.equal(result.procedure, 'undetermined');
    assert.equal(result.governmentProcurementPolicies, 'unknown');
    assert.ok(result.missing.includes('context'));
    assert.equal(assessChinaTenderProfile({ ...profile, context: 'enterprise_procurement' }).governmentProcurementPolicies, false);
  });
  it('flags mandatory-tender conflicts and unknown exceptions without approving non-tender', () => {
    assert.equal(assessChinaTenderProfile({ ...profile, method: 'non_tender' }).procedure, 'undetermined');
    const result = assessChinaTenderProfile({ ...profile, method: 'non_tender', mandatoryTender: 'unknown' });
    assert.ok(result.missing.includes('mandatoryTender'));
  });
  it('reports missing locale and dates even when a procedure can be suggested', () => {
    const result = assessChinaTenderProfile({ context: 'government_procurement', subject: 'construction', method: 'tender' });
    assert.equal(result.procedure, 'tendering_law');
    assert.deepEqual(result.missing, ['province', 'industry', 'projectDate']);
  });
  it('rejects impossible dates and unknown enum input', () => {
    assert.throws(() => assessChinaTenderProfile({ ...profile, projectDate: '2026-02-30' }), /不是有效日期/);
    assert.throws(() => assessChinaTenderProfile({ ...profile, method: 'auction' as never }), /method 值无效/);
  });
});

describe('rule scope and temporal applicability', () => {
  const rule: ChinaTenderRule = {
    id: 'test-provincial-rule', title: '测试范围规则（不代表真实地方规定）', status: 'effective',
    effectiveFrom: '2025-09-01', effectiveTo: '2027-01-01', checkedAt: '2026-10-05',
    provinces: ['CN-44'], industries: ['highway'], contexts: ['government_procurement'],
    source: { title: '测试出处', url: 'https://example.test/rule' },
  };
  it('accepts matching effective scopes and includes the start but excludes expiry day', () => {
    assert.equal(assessChinaTenderRules([rule], profile)[0].eligibleForCheck, true);
    assert.equal(assessChinaTenderRules([rule], { ...profile, projectDate: '2025-09-01' })[0].status, 'applicable');
    assert.equal(assessChinaTenderRules([rule], { ...profile, projectDate: '2027-01-01' })[0].status, 'not_applicable');
  });
  it('never enforces drafts even with matching dates', () => {
    const result = assessChinaTenderRules([{ ...rule, status: 'draft' }], profile)[0];
    assert.equal(result.status, 'not_applicable');
    assert.equal(result.eligibleForCheck, false);
  });
  it('separates unknown scope from mismatched scope', () => {
    assert.equal(assessChinaTenderRules([rule], { ...profile, province: undefined })[0].status, 'needs_review');
    assert.equal(assessChinaTenderRules([rule], { ...profile, province: 'CN-11' })[0].status, 'not_applicable');
    assert.equal(assessChinaTenderRules([rule], { ...profile, industry: 'water' })[0].status, 'not_applicable');
  });
  it('requires current effect verification for future project dates and repealed historical rules', () => {
    assert.equal(assessChinaTenderRules([rule], { ...profile, projectDate: '2026-11-01' })[0].status, 'needs_review');
    assert.equal(assessChinaTenderRules([{ ...rule, status: 'repealed' }], profile)[0].status, 'needs_review');
  });
  it('does not mistake the highway guide for a rule for all road projects', () => {
    const result = analyzeChinaTender({ profile: { ...profile, mandatoryTender: 'unknown' } });
    assert.equal(result.ruleAssessments.find((r) => r.ruleId === 'cn-highway-fair-competition-2025')?.status, 'needs_review');
  });
  it('rejects duplicate rule ids and invalid effective intervals', () => {
    assert.throws(() => assessChinaTenderRules([rule, rule], profile), /重复编号/);
    assert.throws(() => assessChinaTenderRules([{ ...rule, effectiveTo: rule.effectiveFrom }], profile), /有效期/);
  });
});

describe('evidence response matrix', () => {
  const assess = (evidenceRows: ChinaTenderEvidence[] = [evidence], responseRows: ChinaTenderResponse[] = [response], requirements = [requirement]) =>
    assessChinaTenderResponses(requirements, evidenceRows, responseRows, profile.projectDate)[0];
  it('requires a located, reviewed response and current verified evidence', () => {
    assert.equal(assess().status, 'supported');
    assert.equal(assess([evidence], [{ ...response, responseLocation: undefined }]).status, 'needs_review');
    assert.equal(assess([evidence], [{ ...response, reviewedBy: undefined }]).status, 'needs_review');
  });
  it('missing evidence and a registry no-result never become ineligibility', () => {
    assert.equal(assess([], []).status, 'needs_evidence');
    const result = assess([{ ...evidence, verification: 'not_found' }], [{ ...response, assessment: 'contradicts' }]);
    assert.equal(result.status, 'needs_evidence');
    assert.match(result.reasons.join(''), /未检索到不等于不符合/);
  });
  it('flags expired and superseded sources for review, not automated rejection', () => {
    assert.equal(assess([{ ...evidence, validUntil: '2026-10-04' }]).status, 'needs_review');
    assert.equal(assess([{ ...evidence, source: { ...evidence.source, status: 'superseded' } }]).status, 'needs_review');
    assert.equal(assess([evidence], [response], [{ ...requirement, source: { ...source, status: 'withdrawn' } }]).status, 'needs_review');
  });
  it('accepts certificate expiry day and does not silently use stale verification', () => {
    assert.equal(assess().status, 'supported');
    assert.equal(assess([{ ...evidence, checkedAt: '2026-10-04' }]).status, 'needs_review');
  });
  it('reports substantiated reviewed contradictions as conflicts only', () => {
    assert.equal(assess([evidence], [{ ...response, assessment: 'contradicts' }]).status, 'conflict');
    assert.equal(assess([{ ...evidence, verification: 'unverified' }], [{ ...response, assessment: 'contradicts' }]).status, 'needs_review');
  });
  it('unmatched or inapplicable rule ids prevent a supported conclusion', () => {
    assert.equal(assess([evidence], [response], [{ ...requirement, ruleId: 'unknown-rule' }]).status, 'needs_review');
  });
  it('a reviewed response cannot silently survive a changed requirement source hash', () => {
    const versioned = { ...requirement, source: { ...source, sha256: 'a'.repeat(64) } };
    assert.equal(assess([evidence], [response], [versioned]).status, 'needs_review');
    const boundResponse = { ...response, requirementSourceSha256: 'a'.repeat(64) };
    assert.equal(assess([evidence], [boundResponse], [versioned]).status, 'supported');
    assert.equal(assess([evidence], [boundResponse], [{ ...versioned, source: { ...source, sha256: 'b'.repeat(64) } }]).status, 'needs_review');
  });
  it('rejects orphan responses and duplicate IDs instead of ignoring them', () => {
    assert.throws(() => assess([evidence], [{ ...response, requirementId: 'missing' }]), /未登记要求/);
    assert.throws(() => assess([evidence, evidence]), /重复编号/);
    assert.throws(() => assess([evidence], [response, response]), /重复编号/);
  });
});

describe('BOQ baseline preservation', () => {
  it('copies and freezes original lines including Chinese codes and zero quantities', () => {
    const rows = [{ ...row }, { ...row, id: 'zero', code: '040101001001', quantity: '0' }];
    const baseline = createChinaBoqBaseline('boq-r1', boqSource, rows);
    rows[0].quantity = '999';
    assert.equal(baseline.rows[0].quantity, '100.10');
    assert.equal(baseline.rows[1].quantity, '0');
    assert.throws(() => { (baseline.rows[0] as BoqBaselineRow).quantity = '999'; }, TypeError);
    assert.ok(Object.isFrozen(baseline.source));
  });
  it('compares exact decimal differences without changing baseline or losing precision', () => {
    const baseline = createChinaBoqBaseline('boq-r1', boqSource, [row]);
    const result = compareChinaBoq(baseline, [{ ...row, quantity: '100.20' }], 'recalculation');
    assert.equal(result.differences[0].quantityDelta, '0.1');
    assert.equal(result.status, 'needs_review');
    assert.equal(baseline.rows[0].quantity, '100.10');
    assert.equal(compareChinaBoq(baseline, [{ ...row, quantity: '100.1' }], 'submission').status, 'unchanged');
    const big = createChinaBoqBaseline('large', boqSource, [{ ...row, quantity: '9007199254740993.01' }]);
    assert.equal(compareChinaBoq(big, [{ ...row, quantity: '9007199254740993.02' }], 'recalculation').differences[0].quantityDelta, '0.01');
  });
  it('does not subtract quantities with changed units', () => {
    const baseline = createChinaBoqBaseline('boq-r1', boqSource, [row]);
    const difference = compareChinaBoq(baseline, [{ ...row, unit: 'kg', quantity: '100100' }], 'submission').differences[0];
    assert.ok(difference.fields.includes('unit'));
    assert.equal(difference.quantityDelta, undefined);
  });
  it('detects missing, added, changed description and fixed amounts', () => {
    const baseline = createChinaBoqBaseline('boq-r1', boqSource, [{ ...row, fixedAmount: '1000' }]);
    const changes = compareChinaBoq(baseline, [{ ...row, description: '修改', fixedAmount: '1001' }], 'submission').differences[0];
    assert.deepEqual(changes.fields, ['description', 'fixedAmount']);
    assert.deepEqual(compareChinaBoq(baseline, [{ ...row, id: 'new' }], 'recalculation').differences.map((d) => d.kind), ['missing', 'added']);
  });
  it('detects persisted snapshot tampering and gives addenda distinct fingerprints', () => {
    const baseline = createChinaBoqBaseline('boq-r1', boqSource, [row]);
    const restored = JSON.parse(JSON.stringify(baseline));
    verifyChinaBoqBaseline(restored);
    restored.rows[0].quantity = '200';
    assert.throws(() => compareChinaBoq(restored, [row], 'recalculation'), /完整性校验失败/);
    const addendum = createChinaBoqBaseline('boq-r2', { ...boqSource, sha256: 'b'.repeat(64), revision: 'R2' }, [{ ...row, quantity: '200' }]);
    assert.notEqual(addendum.fingerprint, baseline.fingerprint);
    assert.equal(baseline.rows[0].quantity, '100.10');
  });
  it('rejects duplicate rows, missing source hashes and ambiguous quantity strings', () => {
    assert.throws(() => createChinaBoqBaseline('r1', boqSource, [row, row]), /重复编号/);
    assert.throws(() => createChinaBoqBaseline('r1', { ...boqSource, sha256: '' }, [row]), /SHA-256/);
    assert.throws(() => createChinaBoqBaseline('r1', boqSource, [{ ...row, quantity: '1,000' }]), /十进制/);
    assert.throws(() => createChinaBoqBaseline('r1', boqSource, []), /不能没有/);
  });
});

it('returns reviewable suggestions without declaring nationwide compliance or empty requirements complete', () => {
  const report = analyzeChinaTender({ profile });
  assert.equal(report.advisoryOnly, true);
  assert.equal(report.summary.hasRequirements, false);
  assert.equal(report.summary.supported, 0);
  assert.ok(report.scopeLimitations.some((line) => line.includes('不包含完整全国及省级规则')));
  assert.equal(report.ruleAssessments.length, 3);
});
