import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'fs';
import { join } from 'path';

function fixture(name: 'complete' | 'incomplete'): any {
  return JSON.parse(readFileSync(join(import.meta.dir, 'fixtures', `${name}.json`), 'utf8'));
}

function workspace() {
  return {
    schemaVersion: 1,
    revision: 9,
    project: { id: 'n3-upgrade', title: 'N3 Upgrade', currency: 'ZAR', status: 'active' },
    documents: [
      { id: 'quote', name: 'Supplier Quote', path: 'C:/tender/quote.pdf', kind: 'supporting_evidence', status: 'active' },
    ],
    requirements: [],
    criteria: [],
    deliverables: [],
    responses: [],
  };
}

function boqData() {
  return {
    items: [
      {
        id: 'boq-5201',
        source: { documentId: 'quote', sheet: 'Synthetic', cell: 'A1' },
        code: '52.01',
        description: 'Concrete side drain',
        unit: 'm',
        quantity: '1250.5',
        quantityBasis: 'boq',
        quantityStatus: 'sourced',
        quantityRefs: [],
      },
    ],
    scopeLinks: [],
  };
}

function scheduleData() {
  return {
    programmeStart: '2026-08-03',
    programmeStatus: 'reviewed',
    calendars: [{ id: 'cal-1', name: 'Tender calendar', workingDays: [1, 2, 3, 4, 5], exceptions: [] }],
    activities: [
      {
        id: 'concrete',
        workPackageId: 'wp-drainage-01',
        name: 'Construct concrete drain',
        durationDays: 3,
        durationBasis: 'Synthetic cost test',
        calendarId: 'cal-1',
        predecessors: [],
        requirementIds: [],
        sourceRefs: [],
        confidence: 'confirmed',
      },
    ],
    resources: [],
    assignments: [],
    milestones: [],
  };
}

function completeCostData(): any {
  return fixture('complete');
}

describe('tender cost and cash-flow capability', () => {
  test('reports ready when sourced build-ups and cumulative cash flow reconcile exactly', async () => {
    const tender = await import('../../index.ts') as Record<string, unknown>;
    expect(typeof tender.parseTenderCostCashFlowData).toBe('function');
    expect(typeof tender.auditTenderCostCashFlow).toBe('function');

    const data = (tender.parseTenderCostCashFlowData as (value: unknown) => unknown)(completeCostData());
    const audit = (tender.auditTenderCostCashFlow as (
      workspace: unknown,
      boqData: unknown,
      scheduleData: unknown,
      data: unknown,
      generatedAt: string,
    ) => any)(workspace(), boqData(), scheduleData(), data, '2026-07-12T14:00:00.000Z');

    expect(audit.readiness).toBe('ready');
    expect(audit.issues).toEqual([]);
    expect(audit.summary.estimatedTotal).toBe('12817.625');
    expect(audit.summary.cashFlowTotal).toBe('12817.625');
  });

  test('blocks build-up and cumulative cash-flow mismatches', async () => {
    const tender = await import('../../index.ts') as Record<string, unknown>;
    expect(typeof tender.auditTenderCostCashFlow).toBe('function');
    const data = completeCostData();
    data.buildUps[0].total = '12817.62';
    data.cashFlow[0].cumulativeCost = '12000';

    const audit = (tender.auditTenderCostCashFlow as (
      workspace: unknown,
      boqData: unknown,
      scheduleData: unknown,
      data: unknown,
      generatedAt: string,
    ) => any)(workspace(), boqData(), scheduleData(), data, '2026-07-12T14:00:00.000Z');
    const codes = audit.issues.map((issue: { code: string }) => issue.code);

    expect(audit.readiness).toBe('not_ready');
    expect(codes).toContain('boq_cost_total_mismatch');
    expect(codes).toContain('cumulative_cashflow_mismatch');
  });

  test('keeps the incomplete regression fixture out of ready state', async () => {
    const tender = await import('../../index.ts') as Record<string, unknown>;
    const audit = (tender.auditTenderCostCashFlow as (
      workspace: unknown,
      boqData: unknown,
      scheduleData: unknown,
      data: unknown,
      generatedAt: string,
    ) => any)(workspace(), boqData(), scheduleData(), fixture('incomplete'), '2026-07-12T14:00:00.000Z');

    expect(audit.readiness).not.toBe('ready');
    expect(audit.issues.length).toBeGreaterThan(0);
  });

  test('keeps unverified rate assumptions in review', async () => {
    const tender = await import('../../index.ts') as Record<string, unknown>;
    expect(typeof tender.auditTenderCostCashFlow).toBe('function');
    const data = completeCostData();
    data.components[0].assumptionStatus = 'unverified';
    delete data.components[0].rateSourceId;

    const audit = (tender.auditTenderCostCashFlow as (
      workspace: unknown,
      boqData: unknown,
      scheduleData: unknown,
      data: unknown,
      generatedAt: string,
    ) => any)(workspace(), boqData(), scheduleData(), data, '2026-07-12T14:00:00.000Z');

    expect(audit.readiness).toBe('needs_review');
    expect(audit.issues.map((issue: { code: string }) => issue.code)).toContain('cost_component_unverified');
  });

  test('blocks sourced rates without a registered rate source', async () => {
    const tender = await import('../../index.ts') as Record<string, unknown>;
    expect(typeof tender.auditTenderCostCashFlow).toBe('function');
    const data = completeCostData();
    data.components[0].rateSourceId = 'missing-rate';

    const audit = (tender.auditTenderCostCashFlow as (
      workspace: unknown,
      boqData: unknown,
      scheduleData: unknown,
      data: unknown,
      generatedAt: string,
    ) => any)(workspace(), boqData(), scheduleData(), data, '2026-07-12T14:00:00.000Z');

    expect(audit.readiness).toBe('not_ready');
    expect(audit.issues.map((issue: { code: string }) => issue.code)).toContain('rate_source_missing');
  });
});
