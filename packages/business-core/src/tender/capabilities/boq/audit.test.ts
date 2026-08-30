import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

function fixture(name: 'complete' | 'incomplete') {
  return JSON.parse(readFileSync(join(import.meta.dir, 'fixtures', `${name}.json`), 'utf8'));
}

function workspace() {
  return {
    schemaVersion: 1,
    revision: 6,
    project: { id: 'n3-upgrade', title: 'N3 Upgrade', status: 'active' },
    documents: [
      { id: 'boq', name: 'BOQ', path: 'C:/tender/boq.xlsx', kind: 'boq', status: 'active' },
      { id: 'spec', name: 'Specification', path: 'C:/tender/spec.pdf', kind: 'specification', status: 'active' },
      { id: 'drawing', name: 'Drawing', path: 'C:/tender/drawing.pdf', kind: 'drawing', status: 'active' },
    ],
    requirements: [
      {
        id: 'req-drainage',
        title: 'Drainage scope',
        text: 'Construct the scheduled drainage works.',
        type: 'technical',
        criticality: 'high',
        source: { documentId: 'spec', page: 20, clause: '5.2' },
        evidenceNeeded: [],
        status: 'planned',
      },
    ],
    criteria: [],
    deliverables: [],
    responses: [],
  };
}

function completeData(): any {
  return {
    items: [
      {
        id: 'boq-5201',
        source: { documentId: 'boq', sheet: 'Drainage', cell: 'B18:F18' },
        code: '52.01',
        description: 'Concrete side drain',
        unit: 'm',
        quantity: '1250.5',
        quantityBasis: 'boq',
        quantityStatus: 'sourced',
        quantityRefs: [{ documentId: 'boq', sheet: 'Drainage', cell: 'F18' }],
      },
    ],
    scopeLinks: [
      {
        boqItemId: 'boq-5201',
        requirementIds: ['req-drainage'],
        specificationRefs: [{ documentId: 'spec', page: 20, clause: '5.2' }],
        drawingRefs: [{ documentId: 'drawing', page: 3, section: 'DRAIN-01' }],
        measurementRuleRefs: [{ documentId: 'spec', page: 24, clause: '5.2.4' }],
        inclusions: ['Excavation and concrete finish stated in the item scope'],
        exclusions: [],
        assumptions: [],
        gapStatus: 'clear',
      },
    ],
  };
}

describe('tender boq reconciliation capability', () => {
  test('reports ready for exact BOQ locations with supported scope links', async () => {
    const tender = await import('../../index.ts') as Record<string, unknown>;
    expect(typeof tender.parseTenderBoqReconciliationData).toBe('function');
    expect(typeof tender.auditTenderBoqReconciliation).toBe('function');

    const data = (tender.parseTenderBoqReconciliationData as (value: unknown) => unknown)(fixture('complete'));
    const audit = (tender.auditTenderBoqReconciliation as (
      workspace: unknown,
      data: unknown,
      generatedAt: string,
    ) => any)(workspace(), data, '2026-07-12T11:00:00.000Z');

    expect(audit.readiness).toBe('ready');
    expect(audit.issues).toEqual([]);
    expect(audit.summary.items).toBe(1);
    expect(audit.summary.linkedItems).toBe(1);
  });

  test('blocks imprecise BOQ locations and unsupported clear scope', async () => {
    const tender = await import('../../index.ts') as Record<string, unknown>;
    expect(typeof tender.auditTenderBoqReconciliation).toBe('function');
    const data = fixture('incomplete');

    const audit = (tender.auditTenderBoqReconciliation as (
      workspace: unknown,
      data: unknown,
      generatedAt: string,
    ) => any)(workspace(), data, '2026-07-12T11:00:00.000Z');
    const codes = audit.issues.map((issue: { code: string }) => issue.code);

    expect(audit.readiness).toBe('not_ready');
    expect(codes).toContain('boq_location_imprecise');
    expect(codes).toContain('scope_support_missing');
  });

  test('requires one scope link for every analyzed BOQ item', async () => {
    const tender = await import('../../index.ts') as Record<string, unknown>;
    expect(typeof tender.auditTenderBoqReconciliation).toBe('function');
    const data = completeData();
    data.scopeLinks = [];

    const audit = (tender.auditTenderBoqReconciliation as (
      workspace: unknown,
      data: unknown,
      generatedAt: string,
    ) => any)(workspace(), data, '2026-07-12T11:00:00.000Z');

    expect(audit.readiness).toBe('not_ready');
    expect(audit.issues.map((issue: { code: string }) => issue.code)).toContain('boq_scope_link_missing');
  });

  test('keeps unverified calculated quantities and assumptions in review', async () => {
    const tender = await import('../../index.ts') as Record<string, unknown>;
    expect(typeof tender.auditTenderBoqReconciliation).toBe('function');
    const data = completeData();
    data.items[0] = {
      ...data.items[0],
      quantity: '1300',
      quantityBasis: 'calculated',
      quantityStatus: 'unverified',
      quantityRefs: [{ documentId: 'drawing', page: 3, section: 'DRAIN-01' }],
    };
    data.scopeLinks[0].assumptions = [
      {
        text: 'The drawing scale is suitable for quantity take-off.',
        status: 'unverified',
        sourceRefs: [{ documentId: 'drawing', page: 3 }],
      },
    ];

    const audit = (tender.auditTenderBoqReconciliation as (
      workspace: unknown,
      data: unknown,
      generatedAt: string,
    ) => any)(workspace(), data, '2026-07-12T11:00:00.000Z');
    const codes = audit.issues.map((issue: { code: string }) => issue.code);

    expect(audit.readiness).toBe('needs_review');
    expect(codes).toContain('quantity_unverified');
    expect(codes).toContain('scope_assumption_unverified');
  });

  test('keeps a sourced rate-only row traceable without blocking reconciliation', async () => {
    const tender = await import('../../index.ts') as Record<string, unknown>;
    expect(typeof tender.auditTenderBoqReconciliation).toBe('function');
    const data = completeData();
    data.items[0] = {
      ...data.items[0],
      quantity: undefined,
      quantityBasis: 'not_provided',
      quantityStatus: 'unverified',
      quantityRefs: [],
    };
    data.scopeLinks = [];

    const audit = (tender.auditTenderBoqReconciliation as (
      workspace: unknown,
      data: unknown,
      generatedAt: string,
    ) => any)(workspace(), data, '2026-07-12T11:00:00.000Z');
    const codes = audit.issues.map((issue: { code: string }) => issue.code);

    expect(audit.readiness).toBe('ready');
    expect(codes).toEqual(['boq_item_not_pricable']);
  });

  test('does not let non-blocking pricing exclusions hide real reconciliation warnings', async () => {
    const tender = await import('../../index.ts') as Record<string, unknown>;
    expect(typeof tender.auditTenderBoqReconciliation).toBe('function');
    const data = completeData();
    data.items[0] = {
      ...data.items[0],
      quantity: undefined,
      quantityBasis: 'not_provided',
      quantityStatus: 'unverified',
      quantityRefs: [],
    };
    data.scopeLinks = [{
      ...data.scopeLinks[0],
      gapStatus: 'needs_review',
    }];

    const audit = (tender.auditTenderBoqReconciliation as (
      workspace: unknown,
      data: unknown,
      generatedAt: string,
    ) => any)(workspace(), data, '2026-07-12T11:00:00.000Z');

    expect(audit.readiness).toBe('needs_review');
    expect(audit.issues.map((issue: { code: string }) => issue.code)).toContain('scope_gap_needs_review');
  });

  test('still blocks synthetic BOQ groups that are not employer source rows', async () => {
    const tender = await import('../../index.ts') as Record<string, unknown>;
    expect(typeof tender.auditTenderBoqReconciliation).toBe('function');
    const data = completeData();
    data.items[0] = {
      ...data.items[0],
      unit: 'composite',
    };

    const audit = (tender.auditTenderBoqReconciliation as (
      workspace: unknown,
      data: unknown,
      generatedAt: string,
    ) => any)(workspace(), data, '2026-07-12T11:00:00.000Z');

    expect(audit.readiness).toBe('not_ready');
    expect(audit.issues.map((issue: { code: string }) => issue.code)).toContain('synthetic_boq_item');
  });

  test('rejects malformed decimal quantities before audit', async () => {
    const tender = await import('../../index.ts') as Record<string, unknown>;
    expect(typeof tender.parseTenderBoqReconciliationData).toBe('function');
    const data = completeData();
    data.items[0].quantity = '1,250.5';

    expect(() => (tender.parseTenderBoqReconciliationData as (value: unknown) => unknown)(data))
      .toThrow(/decimal string/i);
  });
});
