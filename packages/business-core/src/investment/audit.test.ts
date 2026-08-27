import { describe, expect, test } from 'bun:test';

describe('Resource Investment Intelligence core', () => {
  test('initializes from direct investment inputs without tender or delivery dependencies', async () => {
    const investment = await import('../investment/index.ts') as Record<string, unknown>;
    expect(typeof investment.auditInvestmentWorkspace).toBe('function');
    const workspace = {
      schemaVersion: 1, revision: 1,
      project: { id: 'quarry-investment', title: 'Quarry Investment', stage: 'screening', status: 'active', baseCurrency: 'USD', valuationDate: '2026-07-12' },
      sources: [{ id: 'mandate', name: 'Investment Mandate', path: 'C:/mandate.pdf', kind: 'mandate', status: 'active', sha256: 'a'.repeat(64) }],
      snapshots: [],
      assumptionSets: [{ id: 'screening-assumptions', title: 'Screening Assumptions', status: 'approved', evidenceRefs: [{ kind: 'source', sourceId: 'mandate' }] }],
      knowledgeUses: [],
    };
    const audit = (investment.auditInvestmentWorkspace as Function)(workspace, '2026-07-12T20:00:00.000Z');
    expect(audit.readiness).toBe('ready');
    expect(audit.summary.directSources).toBe(1);
    expect(JSON.stringify(workspace)).not.toContain('tenderWorkspace');
    expect(JSON.stringify(workspace)).not.toContain('deliveryWorkspace');
  });

  test('does not allow a knowledge snapshot to replace direct investment input', async () => {
    const investment = await import('../investment/index.ts') as Record<string, unknown>;
    const workspace = {
      schemaVersion: 1, revision: 1,
      project: { id: 'quarry-investment', title: 'Quarry Investment', stage: 'screening', status: 'active', baseCurrency: 'USD', valuationDate: '2026-07-12' },
      sources: [],
      snapshots: [{ id: 'delivery-cost', producerPlugin: 'delivery', producerWorkspaceId: 'mine-build', producerRevision: 4, managedArtifactPath: 'C:/kb/delivery-cost.json', contentSha256: 'b'.repeat(64), approvalState: 'approved', importedAt: '2026-07-12T10:00:00.000Z', userConfirmed: true }],
      assumptionSets: [{ id: 'screening-assumptions', title: 'Screening Assumptions', status: 'approved', evidenceRefs: [{ kind: 'snapshot', snapshotId: 'delivery-cost' }] }],
      knowledgeUses: [],
    };
    const audit = (investment.auditInvestmentWorkspace as Function)(workspace);
    const codes = audit.issues.map((issue: { code: string }) => issue.code);
    expect(codes).toContain('direct_investment_source_missing');
    expect(codes).toContain('assumption_direct_evidence_missing');
    expect(audit.readiness).toBe('not_ready');
  });
});
