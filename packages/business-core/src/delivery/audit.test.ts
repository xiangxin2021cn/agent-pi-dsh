import { describe, expect, test } from 'bun:test';

function directInputWorkspace(): any {
  return {
    schemaVersion: 1,
    revision: 2,
    project: { id: 'n3-delivery', title: 'N3 Delivery', status: 'active', dataDate: '2026-07-12' },
    sources: [
      {
        id: 'approved-contract',
        name: 'Approved Contract',
        path: 'C:/project/contract.pdf',
        kind: 'contract',
        status: 'active',
        sha256: 'a'.repeat(64),
      },
    ],
    snapshots: [],
    baselines: [
      {
        id: 'contract-baseline',
        kind: 'contract',
        title: 'Approved contract baseline',
        status: 'approved',
        evidenceRefs: [{ kind: 'source', sourceId: 'approved-contract', page: 1 }],
      },
    ],
    knowledgeUses: [],
  };
}

describe('Project Delivery Controls core', () => {
  test('initializes from direct user-owned inputs without any tender workspace', async () => {
    const delivery = await import('./index.ts') as Record<string, unknown>;
    expect(typeof delivery.parseDeliveryWorkspace).toBe('function');
    expect(typeof delivery.auditDeliveryWorkspace).toBe('function');

    const workspace = (delivery.parseDeliveryWorkspace as Function)(directInputWorkspace());
    const audit = (delivery.auditDeliveryWorkspace as Function)(workspace, '2026-07-12T18:00:00.000Z');

    expect(audit.readiness).toBe('ready');
    expect(audit.issues).toEqual([]);
    expect(audit.summary.directSources).toBe(1);
    expect(audit.summary.tenderSnapshots).toBe(0);
  });

  test('does not allow an optional tender snapshot to replace direct project input', async () => {
    const delivery = await import('./index.ts') as Record<string, unknown>;
    const workspace = directInputWorkspace();
    workspace.sources = [];
    workspace.baselines = [];
    workspace.snapshots = [{
      id: 'tender-snapshot', producerPlugin: 'tender', producerWorkspaceId: 'n3-tender',
      producerRevision: 9, managedArtifactPath: 'C:/kb/tender.json', contentSha256: 'b'.repeat(64),
      approvalState: 'approved', importedAt: '2026-07-12T17:00:00.000Z', userConfirmed: true,
    }];

    const audit = (delivery.auditDeliveryWorkspace as Function)(workspace);
    expect(audit.readiness).toBe('not_ready');
    expect(audit.issues.map((issue: { code: string }) => issue.code)).toContain('direct_project_input_missing');
  });

  test('blocks approved baselines with broken or unconfirmed evidence', async () => {
    const delivery = await import('./index.ts') as Record<string, unknown>;
    const workspace = directInputWorkspace();
    workspace.baselines[0].evidenceRefs = [{ kind: 'source', sourceId: 'missing-source' }];
    workspace.snapshots.push({
      id: 'knowledge-snapshot', producerPlugin: 'knowledge', producerWorkspaceId: 'enterprise-kb',
      producerRevision: 1, managedArtifactPath: 'C:/kb/history.json', contentSha256: 'c'.repeat(64),
      approvalState: 'approved', importedAt: '2026-07-12T17:00:00.000Z', userConfirmed: false,
    });

    const audit = (delivery.auditDeliveryWorkspace as Function)(workspace);
    const codes = audit.issues.map((issue: { code: string }) => issue.code);
    expect(codes).toContain('baseline_evidence_missing');
    expect(codes).toContain('snapshot_not_confirmed');
    expect(audit.readiness).toBe('not_ready');
  });
});
