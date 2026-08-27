import { describe, expect, test } from 'bun:test';

function workspace(): any {
  return {
    schemaVersion: 1, revision: 3,
    project: { id: 'quarry-investment', title: 'Quarry Investment', stage: 'screening', status: 'active', baseCurrency: 'USD', valuationDate: '2026-07-12' },
    sources: [{ id: 'mandate', name: 'Mandate', path: 'C:/mandate.pdf', kind: 'mandate', status: 'active', sha256: 'a'.repeat(64) }],
    snapshots: [], assumptionSets: [{ id: 'base', title: 'Base', status: 'approved', evidenceRefs: [{ kind: 'source', sourceId: 'mandate' }] }], knowledgeUses: [],
  };
}

function data(categories: string[]): any {
  const evidenceRefs = [{ kind: 'source', sourceId: 'mandate', page: 1 }];
  return {
    reviewStatus: 'reviewed',
    findings: categories.map((category) => ({ id: category, category, title: category, conclusion: 'Verified conclusion', evidenceRefs, status: 'verified', confidence: 'confirmed' })),
    assumptions: [{ id: 'base-assumption', name: 'Base assumption', value: '1.0', evidenceRefs, status: 'approved' }],
    metrics: [{ id: 'metric-1', name: 'Screening metric', value: '10.25', unit: 'USD', evidenceRefs, status: 'verified' }],
    risks: [], scenarios: [], approvals: [],
  };
}

describe('investment capability framework', () => {
  test('keeps a deterministic dependency chain independent from tender and delivery', async () => {
    const investment = await import('../index.ts') as Record<string, unknown>;
    const dependencies = investment.getInvestmentCapabilityDependencies as Function;
    expect(dependencies('mandate_screening')).toEqual(['core']);
    expect(dependencies('financial_valuation')).toEqual(['core', 'resource_technical', 'market_offtake', 'legal_esg']);
    expect(JSON.stringify(dependencies('transaction_decision'))).not.toMatch(/tender|delivery/);
  });

  test('requires capability-specific verified categories with active direct evidence', async () => {
    const investment = await import('../index.ts') as Record<string, unknown>;
    expect(typeof investment.auditInvestmentCapability).toBe('function');
    const ready = (investment.auditInvestmentCapability as Function)('mandate_screening', workspace(), data(['mandate', 'opportunity', 'stage_gate']));
    expect(ready.readiness).toBe('ready');
    const incomplete = data(['mandate']);
    incomplete.findings[0].evidenceRefs = [{ kind: 'snapshot', snapshotId: 'missing' }];
    const audit = (investment.auditInvestmentCapability as Function)('mandate_screening', workspace(), incomplete);
    const codes = audit.issues.map((issue: { code: string }) => issue.code);
    expect(codes).toContain('required_finding_category_missing');
    expect(codes).toContain('finding_direct_evidence_missing');
    expect(audit.readiness).toBe('not_ready');
  });

  test('requires approved decision evidence for transaction decision readiness', async () => {
    const investment = await import('../index.ts') as Record<string, unknown>;
    const value = data(['financing', 'transaction', 'recommendation']);
    const audit = (investment.auditInvestmentCapability as Function)('transaction_decision', workspace(), value);
    expect(audit.issues.map((issue: { code: string }) => issue.code)).toContain('approved_decision_missing');
  });
});
