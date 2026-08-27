import { describe, expect, test } from 'bun:test';

describe('tender capability registry', () => {
  test('returns stable dependencies for each implemented stage', async () => {
    const tender = await import('../index.ts') as Record<string, unknown>;
    expect(typeof tender.getTenderCapabilityDependencies).toBe('function');

    const dependencies = tender.getTenderCapabilityDependencies as (
      capability: string,
      enabled?: string[],
    ) => string[];

    expect(dependencies('document_analysis')).toEqual(['core']);
    expect(dependencies('evaluation_strategy')).toEqual(['core', 'document_analysis']);
    expect(dependencies('boq_reconciliation')).toEqual(['core', 'document_analysis']);
    expect(dependencies('project_boundary')).toEqual(['core', 'document_analysis']);
    expect(dependencies('boq_five_step_pricing')).toEqual([
      'core',
      'document_analysis',
      'boq_reconciliation',
    ]);
    expect(dependencies('bidder_commitments')).toEqual([
      'core',
      'document_analysis',
      'boq_five_step_pricing',
    ]);
    expect(dependencies('execution_plan')).toEqual([
      'core',
      'document_analysis',
      'boq_reconciliation',
      'boq_five_step_pricing',
      'bidder_commitments',
    ]);
    expect(dependencies('schedule_resources')).toEqual([
      'core',
      'execution_plan',
      'boq_five_step_pricing',
    ]);
    expect(dependencies('cost_cashflow')).toEqual([
      'core',
      'boq_reconciliation',
      'boq_five_step_pricing',
      'schedule_resources',
    ]);
    expect(dependencies('submission_documents')).toEqual([
      'core',
      'execution_plan',
      'schedule_resources',
      'cost_cashflow',
    ]);
    expect(dependencies('submission_audit', [
      'document_analysis',
      'evaluation_strategy',
      'boq_reconciliation',
      'boq_five_step_pricing',
      'bidder_commitments',
      'execution_plan',
      'schedule_resources',
      'cost_cashflow',
      'submission_documents',
      'submission_audit',
    ])).toEqual([
      'core',
      'document_analysis',
      'evaluation_strategy',
      'boq_reconciliation',
      'boq_five_step_pricing',
      'bidder_commitments',
      'execution_plan',
      'schedule_resources',
      'cost_cashflow',
      'submission_documents',
    ]);
  });

  test('marks an envelope stale when core or upstream revisions change', async () => {
    const tender = await import('../index.ts') as Record<string, unknown>;
    expect(typeof tender.isTenderCapabilityStale).toBe('function');

    const isStale = tender.isTenderCapabilityStale as (
      envelope: Record<string, unknown>,
      coreRevision: number,
      revisions: Record<string, number>,
    ) => boolean;
    const envelope = {
      schemaVersion: 1,
      capability: 'execution_plan',
      projectId: 'n3-upgrade',
      revision: 2,
      coreRevision: 4,
      upstream: [
        { capability: 'core', revision: 4 },
        { capability: 'evaluation_strategy', revision: 2 },
        { capability: 'boq_reconciliation', revision: 3 },
      ],
      updatedAt: '2026-07-12T10:00:00.000Z',
      data: {},
    };

    expect(isStale(envelope, 4, {
      evaluation_strategy: 2,
      boq_reconciliation: 3,
    })).toBe(false);
    expect(isStale(envelope, 5, {
      evaluation_strategy: 2,
      boq_reconciliation: 3,
    })).toBe(true);
    expect(isStale(envelope, 4, {
      evaluation_strategy: 2,
      boq_reconciliation: 4,
    })).toBe(true);
  });
});
