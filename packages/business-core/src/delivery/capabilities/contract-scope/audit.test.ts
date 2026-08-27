import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

function workspace(): any {
  return {
    schemaVersion: 1,
    revision: 5,
    project: { id: 'n3-delivery', title: 'N3 Delivery', status: 'active', dataDate: '2026-07-12' },
    sources: [
      { id: 'contract', name: 'Approved Contract', path: 'C:/project/contract.pdf', kind: 'contract', status: 'active', sha256: 'a'.repeat(64) },
      { id: 'scope', name: 'Approved Scope', path: 'C:/project/scope.pdf', kind: 'approved_scope', status: 'active', sha256: 'b'.repeat(64) },
    ],
    snapshots: [{
      id: 'tender-method', producerPlugin: 'tender', producerWorkspaceId: 'n3-tender', producerRevision: 8,
      managedArtifactPath: 'C:/kb/method.md', contentSha256: 'c'.repeat(64), approvalState: 'approved',
      importedAt: '2026-07-12T17:00:00.000Z', userConfirmed: true,
    }],
    baselines: [
      { id: 'contract-baseline', kind: 'contract', title: 'Contract baseline', status: 'approved', evidenceRefs: [{ kind: 'source', sourceId: 'contract', page: 1 }] },
      { id: 'scope-baseline', kind: 'scope', title: 'Scope baseline', status: 'approved', evidenceRefs: [{ kind: 'source', sourceId: 'scope', page: 2 }] },
    ],
    knowledgeUses: [],
  };
}

function completeData(): any {
  return JSON.parse(readFileSync(join(import.meta.dir, 'fixtures', 'complete.json'), 'utf8'));
}

describe('delivery contract and scope baseline capability', () => {
  test('is ready with approved local baselines, direct source evidence, and reviewed responsibilities', async () => {
    const delivery = await import('../../index.ts') as Record<string, unknown>;
    expect(typeof delivery.parseDeliveryContractScopeData).toBe('function');
    expect(typeof delivery.auditDeliveryContractScope).toBe('function');
    const audit = (delivery.auditDeliveryContractScope as Function)(workspace(), completeData(), '2026-07-12T19:00:00.000Z');

    expect(audit.readiness).toBe('ready');
    expect(audit.issues).toEqual([]);
    expect(audit.summary.scopeItems).toBe(1);
    expect(audit.summary.directlySupportedScopeItems).toBe(1);
  });

  test('does not allow a tender snapshot to be the sole evidence for reviewed implementation scope', async () => {
    const delivery = await import('../../index.ts') as Record<string, unknown>;
    const data = completeData();
    data.scopeItems[0].evidenceRefs = [{ kind: 'snapshot', snapshotId: 'tender-method' }];
    const audit = (delivery.auditDeliveryContractScope as Function)(workspace(), data);

    expect(audit.readiness).toBe('not_ready');
    expect(audit.issues.map((issue: { code: string }) => issue.code)).toContain('scope_direct_evidence_missing');
  });

  test('blocks missing approved baselines, uncovered scope, and incomplete acceptance controls', async () => {
    const delivery = await import('../../index.ts') as Record<string, unknown>;
    const model = workspace();
    model.baselines = model.baselines.filter((baseline: { kind: string }) => baseline.kind !== 'scope');
    const data = completeData();
    data.scopeItems[0].acceptanceCriteria = [];
    data.responsibilityAssignments = [];
    const audit = (delivery.auditDeliveryContractScope as Function)(model, data);
    const codes = audit.issues.map((issue: { code: string }) => issue.code);

    expect(codes).toContain('approved_scope_baseline_missing');
    expect(codes).toContain('scope_acceptance_criteria_missing');
    expect(codes).toContain('scope_responsibility_missing');
    expect(audit.readiness).toBe('not_ready');
  });

  test('keeps the incomplete fixture outside ready state', async () => {
    const delivery = await import('../../index.ts') as Record<string, unknown>;
    const data = JSON.parse(readFileSync(join(import.meta.dir, 'fixtures', 'incomplete.json'), 'utf8'));
    const audit = (delivery.auditDeliveryContractScope as Function)(workspace(), data);
    expect(audit.readiness).not.toBe('ready');
    expect(audit.issues.length).toBeGreaterThan(0);
  });
});
