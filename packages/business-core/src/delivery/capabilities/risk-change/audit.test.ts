import { describe, expect, test } from 'bun:test';

function workspace(): any {
  return {
    schemaVersion: 1, revision: 11,
    project: { id: 'n3-delivery', title: 'N3 Delivery', currency: 'ZAR', status: 'active', dataDate: '2026-07-12' },
    sources: [
      { id: 'risk-register', name: 'Risk Register', path: 'C:/risk.xlsx', kind: 'risk', status: 'active', sha256: 'a'.repeat(64) },
      { id: 'change-register', name: 'Change Register', path: 'C:/change.xlsx', kind: 'change', status: 'active', sha256: 'b'.repeat(64) },
    ],
    snapshots: [], baselines: [], knowledgeUses: [],
  };
}

function contractScope(): any {
  return {
    baselineStatus: 'reviewed',
    obligations: [{ id: 'notice-28d', title: 'Notice within 28 days', type: 'notice', owner: 'Commercial Manager', evidenceRefs: [], status: 'compliant' }],
    scopeItems: [{ id: 'drainage', wbsCode: '1.1', title: 'Drainage', inclusionStatus: 'included', owner: 'CM', acceptanceCriteria: ['ITP'], evidenceRefs: [], status: 'reviewed' }],
    responsibilityAssignments: [],
  };
}

function completeData(): any {
  const riskEvidence = [{ kind: 'source', sourceId: 'risk-register', sheet: 'Risks', cell: 'B2:N2' }];
  const changeEvidence = [{ kind: 'source', sourceId: 'change-register', sheet: 'Changes', cell: 'B2:N2' }];
  return {
    controlStatus: 'reviewed', dataDate: '2026-07-12', currency: 'ZAR',
    risks: [{ id: 'risk-1', type: 'risk', title: 'Utility conflict', scopeItemIds: ['drainage'], cause: 'Unknown utility', effect: 'Delay', probability: 2, impact: 3, rating: 6, owner: 'Construction Manager', dueDate: '2026-07-20', response: 'Trial holes complete', evidenceRefs: riskEvidence, status: 'mitigated', confidence: 'confirmed' }],
    issues: [{ id: 'issue-1', title: 'Utility exposed', scopeItemIds: ['drainage'], owner: 'Construction Manager', dueDate: '2026-07-10', resolution: 'Rerouted', evidenceRefs: riskEvidence, status: 'resolved' }],
    notices: [{ id: 'notice-1', type: 'contractual', obligationId: 'notice-28d', title: 'Utility notice', dueDate: '2026-07-05', sentDate: '2026-07-04', evidenceRefs: changeEvidence, status: 'acknowledged' }],
    changes: [{ id: 'change-1', title: 'Utility reroute', scopeItemIds: ['drainage'], noticeIds: ['notice-1'], costImpact: '100.20', scheduleImpactDays: 2, evidenceRefs: changeEvidence, status: 'approved', confidence: 'confirmed' }],
    claims: [{ id: 'claim-1', title: 'Utility reroute claim', changeIds: ['change-1'], noticeIds: ['notice-1'], amount: '100.20', extensionDays: 2, evidenceRefs: changeEvidence, status: 'agreed' }],
    decisions: [{ id: 'decision-1', title: 'Approve reroute', relatedEntityIds: ['change-1'], owner: 'Project Manager', dueDate: '2026-07-06', decidedAt: '2026-07-06', decision: 'Approved', evidenceRefs: changeEvidence, status: 'approved' }],
  };
}

describe('delivery risk, change, and decision capability', () => {
  test('is ready with evidenced and resolved implementation controls', async () => {
    const delivery = await import('../../index.ts') as Record<string, unknown>;
    expect(typeof delivery.auditDeliveryRiskChange).toBe('function');
    const audit = (delivery.auditDeliveryRiskChange as Function)(workspace(), contractScope(), completeData(), '2026-07-12T20:00:00.000Z');
    expect(audit.readiness).toBe('ready');
    expect(audit.issues).toEqual([]);
    expect(audit.summary.approvedChanges).toBe(1);
    expect(audit.summary.agreedClaims).toBe(1);
  });

  test('blocks risk-rating errors, overdue notices, and unsupported approved changes', async () => {
    const delivery = await import('../../index.ts') as Record<string, unknown>;
    const data = completeData();
    data.risks[0].rating = 5;
    data.notices[0].sentDate = undefined;
    data.notices[0].status = 'draft';
    data.changes[0].evidenceRefs = [];
    const audit = (delivery.auditDeliveryRiskChange as Function)(workspace(), contractScope(), data);
    const codes = audit.issues.map((issue: { code: string }) => issue.code);
    expect(codes).toContain('risk_rating_mismatch');
    expect(codes).toContain('notice_overdue');
    expect(codes).toContain('change_direct_evidence_missing');
    expect(audit.readiness).toBe('not_ready');
  });

  test('blocks broken scope, notice, change, and decision links', async () => {
    const delivery = await import('../../index.ts') as Record<string, unknown>;
    const data = completeData();
    data.risks[0].scopeItemIds = ['missing'];
    data.changes[0].noticeIds = ['missing'];
    data.claims[0].changeIds = ['missing'];
    data.decisions[0].relatedEntityIds = ['missing'];
    const audit = (delivery.auditDeliveryRiskChange as Function)(workspace(), contractScope(), data);
    const codes = audit.issues.map((issue: { code: string }) => issue.code);
    expect(codes).toContain('risk_scope_missing');
    expect(codes).toContain('change_notice_missing');
    expect(codes).toContain('claim_change_missing');
    expect(codes).toContain('decision_entity_missing');
  });
});
