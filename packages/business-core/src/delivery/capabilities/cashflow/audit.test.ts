import { describe, expect, test } from 'bun:test';

function workspace(): any {
  return {
    schemaVersion: 1, revision: 10,
    project: { id: 'n3-delivery', title: 'N3 Delivery', currency: 'ZAR', status: 'active', dataDate: '2026-07-12' },
    sources: [{ id: 'cashflow', name: 'Cash Flow', path: 'C:/cashflow.xlsx', kind: 'budget', status: 'active', sha256: 'a'.repeat(64) }],
    snapshots: [], baselines: [], knowledgeUses: [],
  };
}

function programme(): any {
  return {
    programmeStatus: 'reviewed', dataDate: '2026-07-12', calendars: [],
    activities: [{ id: 'drainage-works', scopeItemId: 'drainage', name: 'Drainage', calendarId: 'cal', baselineStart: '2026-07-01', baselineFinish: '2026-07-20', remainingDurationDays: 5, forecastStart: '2026-07-01', forecastFinish: '2026-07-22', percentComplete: 60, predecessors: [], progressEvidenceRefs: [], status: 'in_progress', confidence: 'confirmed' }],
    milestones: [], recoveryScenarios: [],
  };
}

function costs(): any {
  return {
    controlStatus: 'reviewed', dataDate: '2026-07-12', currency: 'ZAR',
    budgetLines: [{ id: 'drainage-cost', scopeItemId: 'drainage', activityIds: ['drainage-works'], title: 'Drainage', approvedBudget: '1000.10', approvedVariationAmount: '100.20', currentBudget: '1100.30', evidenceRefs: [], status: 'reviewed' }],
    commitments: [], actualCosts: [], accruals: [], variations: [],
    forecasts: [{ costCodeId: 'drainage-cost', forecastToComplete: '950.50', estimateAtCompletion: '950.50', evidenceRefs: [], confidence: 'confirmed' }],
  };
}

function completeData(): any {
  return {
    controlStatus: 'reviewed', dataDate: '2026-07-12', currency: 'ZAR',
    periods: [{
      period: '2026-07',
      planned: { openingBalance: '2000.00', inflow: '100.30', outflow: '1100.30', closingBalance: '1000.00' },
      actual: { openingBalance: '2000.00', inflow: '50.00', outflow: '200.00', closingBalance: '1850.00' },
      forecast: { openingBalance: '2000.00', inflow: '100.50', outflow: '950.50', closingBalance: '1150.00' },
      evidenceRefs: [{ kind: 'source', sourceId: 'cashflow', sheet: 'Monthly', cell: 'B2:M2' }],
      status: 'reviewed',
    }],
    fundingConstraints: [],
  };
}

describe('delivery cash-flow capability', () => {
  test('reconciles planned and forecast cash flow exactly to budget and EAC', async () => {
    const delivery = await import('../../index.ts') as Record<string, unknown>;
    expect(typeof delivery.auditDeliveryCashflow).toBe('function');
    const audit = (delivery.auditDeliveryCashflow as Function)(workspace(), programme(), costs(), completeData(), '2026-07-12T20:00:00.000Z');
    expect(audit.readiness).toBe('ready');
    expect(audit.issues).toEqual([]);
    expect(audit.summary.plannedOutflow).toBe('1100.3');
    expect(audit.summary.forecastOutflow).toBe('950.5');
  });

  test('blocks period arithmetic, budget, EAC, and rolling-balance differences', async () => {
    const delivery = await import('../../index.ts') as Record<string, unknown>;
    const data = completeData();
    data.periods[0].planned.closingBalance = '1000.01';
    data.periods.push({
      period: '2026-08',
      planned: { openingBalance: '999.00', inflow: '0', outflow: '10.00', closingBalance: '989.00' },
      actual: { openingBalance: '1850.00', inflow: '0', outflow: '0', closingBalance: '1850.00' },
      forecast: { openingBalance: '1150.00', inflow: '0', outflow: '10.00', closingBalance: '1140.00' },
      evidenceRefs: [{ kind: 'source', sourceId: 'cashflow', sheet: 'Monthly', cell: 'B3:M3' }], status: 'reviewed',
    });
    const audit = (delivery.auditDeliveryCashflow as Function)(workspace(), programme(), costs(), data);
    const codes = audit.issues.map((issue: { code: string }) => issue.code);
    expect(codes).toContain('cashflow_period_reconciliation_mismatch');
    expect(codes).toContain('cashflow_rolling_balance_mismatch');
    expect(codes).toContain('cashflow_budget_reconciliation_mismatch');
    expect(codes).toContain('cashflow_eac_reconciliation_mismatch');
  });

  test('blocks missing programme-period coverage and unsupported reviewed periods', async () => {
    const delivery = await import('../../index.ts') as Record<string, unknown>;
    const data = completeData();
    data.periods[0].period = '2026-08';
    data.periods[0].evidenceRefs = [];
    const audit = (delivery.auditDeliveryCashflow as Function)(workspace(), programme(), costs(), data);
    const codes = audit.issues.map((issue: { code: string }) => issue.code);
    expect(codes).toContain('cashflow_programme_period_missing');
    expect(codes).toContain('cashflow_direct_evidence_missing');
  });
});
