import { describe, expect, test } from 'bun:test';

function workspace(): any {
  return {
    schemaVersion: 1, revision: 9,
    project: { id: 'n3-delivery', title: 'N3 Delivery', currency: 'ZAR', status: 'active', dataDate: '2026-07-12' },
    sources: [
      { id: 'budget', name: 'Approved Budget', path: 'C:/budget.xlsx', kind: 'budget', status: 'active', sha256: 'a'.repeat(64) },
      { id: 'commercial', name: 'Commercial Ledger', path: 'C:/commercial.xlsx', kind: 'commitment', status: 'active', sha256: 'b'.repeat(64) },
    ],
    snapshots: [],
    baselines: [{ id: 'budget-baseline', kind: 'budget', title: 'Approved Budget', status: 'approved', evidenceRefs: [{ kind: 'source', sourceId: 'budget' }] }],
    knowledgeUses: [],
  };
}

function contractScope(): any {
  return {
    baselineStatus: 'reviewed', obligations: [],
    scopeItems: [{ id: 'drainage', wbsCode: '1.1', title: 'Drainage', inclusionStatus: 'included', owner: 'CM', acceptanceCriteria: ['ITP'], evidenceRefs: [], status: 'reviewed' }],
    responsibilityAssignments: [],
  };
}

function resources(): any {
  return {
    controlStatus: 'reviewed', dataDate: '2026-07-12',
    resources: [{ id: 'crew', category: 'labour', name: 'Crew', unit: 'crew', availableQuantity: 1, evidenceRefs: [], status: 'confirmed' }],
    allocations: [{ id: 'crew-drainage', resourceId: 'crew', activityId: 'drainage-works', plannedStart: '2026-07-01', plannedFinish: '2026-07-22', requiredQuantity: 1, evidenceRefs: [], status: 'reviewed' }],
    procurementPackages: [], constraints: [],
  };
}

function completeData(): any {
  return {
    controlStatus: 'reviewed', dataDate: '2026-07-12', currency: 'ZAR',
    budgetLines: [{
      id: 'drainage-cost', scopeItemId: 'drainage', activityIds: ['drainage-works'], title: 'Drainage',
      approvedBudget: '1000.10', approvedVariationAmount: '100.20', currentBudget: '1100.30',
      evidenceRefs: [{ kind: 'source', sourceId: 'budget', sheet: 'Budget', cell: 'B2:H2' }], status: 'reviewed',
    }],
    commitments: [{
      id: 'po-1', costCodeId: 'drainage-cost', supplier: 'Supplier', committedAmount: '600.10',
      evidenceRefs: [{ kind: 'source', sourceId: 'commercial', sheet: 'Commitments', cell: 'B2:H2' }], status: 'confirmed',
    }],
    actualCosts: [{ id: 'actual-1', costCodeId: 'drainage-cost', period: '2026-07', amount: '200.10', evidenceRefs: [{ kind: 'source', sourceId: 'commercial', sheet: 'Actuals', cell: 'B2:H2' }], status: 'posted' }],
    accruals: [{ id: 'accrual-1', costCodeId: 'drainage-cost', period: '2026-07', amount: '50.20', evidenceRefs: [{ kind: 'source', sourceId: 'commercial', sheet: 'Accruals', cell: 'B2:H2' }], status: 'posted' }],
    variations: [{ id: 'vo-1', costCodeId: 'drainage-cost', title: 'Approved change', amount: '100.20', evidenceRefs: [{ kind: 'source', sourceId: 'commercial', sheet: 'Variations', cell: 'B2:H2' }], status: 'approved' }],
    forecasts: [{
      costCodeId: 'drainage-cost', forecastToComplete: '700.20', estimateAtCompletion: '950.50',
      evidenceRefs: [{ kind: 'source', sourceId: 'commercial', sheet: 'Forecast', cell: 'B2:H2' }], confidence: 'confirmed',
    }],
  };
}

describe('delivery cost and commercial capability', () => {
  test('uses exact decimal arithmetic for budget and estimate-at-completion reconciliation', async () => {
    const delivery = await import('../../index.ts') as Record<string, unknown>;
    expect(typeof delivery.auditDeliveryCostCommercial).toBe('function');
    expect((delivery.sumDeliveryDecimalStrings as Function)(['0.1', '0.20'])).toBe('0.3');
    const audit = (delivery.auditDeliveryCostCommercial as Function)(workspace(), contractScope(), resources(), completeData(), '2026-07-12T20:00:00.000Z');
    expect(audit.readiness).toBe('ready');
    expect(audit.issues).toEqual([]);
    expect(audit.summary.currentBudget).toBe('1100.3');
    expect(audit.summary.estimateAtCompletion).toBe('950.5');
  });

  test('blocks budget, variation, and forecast reconciliation differences', async () => {
    const delivery = await import('../../index.ts') as Record<string, unknown>;
    const data = completeData();
    data.budgetLines[0].currentBudget = '1100.31';
    data.budgetLines[0].approvedVariationAmount = '100.10';
    data.forecasts[0].estimateAtCompletion = '950.51';
    const audit = (delivery.auditDeliveryCostCommercial as Function)(workspace(), contractScope(), resources(), data);
    const codes = audit.issues.map((issue: { code: string }) => issue.code);
    expect(codes).toContain('budget_reconciliation_mismatch');
    expect(codes).toContain('approved_variation_reconciliation_mismatch');
    expect(codes).toContain('eac_reconciliation_mismatch');
    expect(audit.readiness).toBe('not_ready');
  });

  test('blocks unsupported posted costs and missing scope cost coverage', async () => {
    const delivery = await import('../../index.ts') as Record<string, unknown>;
    const data = completeData();
    data.actualCosts[0].evidenceRefs = [];
    data.budgetLines = [];
    const audit = (delivery.auditDeliveryCostCommercial as Function)(workspace(), contractScope(), resources(), data);
    const codes = audit.issues.map((issue: { code: string }) => issue.code);
    expect(codes).toContain('actual_cost_direct_evidence_missing');
    expect(codes).toContain('scope_cost_code_missing');
  });
});
