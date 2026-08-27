import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

function fixture(name: 'complete' | 'incomplete') {
  return JSON.parse(readFileSync(join(import.meta.dir, 'fixtures', `${name}.json`), 'utf8'));
}

function workspace() {
  return {
    schemaVersion: 1,
    revision: 7,
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

function boqData() {
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
    scopeLinks: [],
  };
}

function completeExecutionData(): any {
  return {
    workPackages: [
      {
        id: 'wp-drainage-01',
        title: 'Construct concrete side drains',
        boqItemIds: ['boq-5201'],
        requirementIds: ['req-drainage'],
        methodSteps: [
          'Confirm setting-out and service clearances.',
          'Excavate and prepare the founding surface.',
          'Place, finish, cure, and inspect the concrete drain.',
        ],
        resourceNeeds: [
          {
            resourceClass: 'excavator',
            quantity: '1',
            unit: 'item',
            basis: 'One active drainage workfront',
            status: 'verified',
          },
        ],
        holdPoints: ['Founding surface acceptance before concrete placement'],
        interfaces: ['Traffic accommodation and adjacent earthworks'],
        constraints: ['Maintain access through the live work zone'],
        temporaryWorks: [],
        hseControls: ['Approved excavation and plant-pedestrian controls'],
        environmentalControls: ['Prevent sediment discharge from excavation'],
        sourceRefs: [
          { documentId: 'spec', page: 20, clause: '5.2' },
          { documentId: 'drawing', page: 3, section: 'DRAIN-01' },
        ],
        status: 'reviewed',
      },
    ],
  };
}

describe('tender execution planning capability', () => {
  test('reports ready when every reconciled BOQ item has a reviewed, controlled work package', async () => {
    const tender = await import('../../index.ts') as Record<string, unknown>;
    expect(typeof tender.parseTenderExecutionPlanData).toBe('function');
    expect(typeof tender.auditTenderExecutionPlan).toBe('function');

    const data = (tender.parseTenderExecutionPlanData as (value: unknown) => unknown)(fixture('complete'));
    const audit = (tender.auditTenderExecutionPlan as (
      workspace: unknown,
      boqData: unknown,
      data: unknown,
      generatedAt: string,
    ) => any)(workspace(), boqData(), data, '2026-07-12T12:00:00.000Z');

    expect(audit.readiness).toBe('ready');
    expect(audit.issues).toEqual([]);
    expect(audit.summary.workPackages).toBe(1);
    expect(audit.summary.coveredBoqItems).toBe(1);
  });

  test('blocks missing and duplicate BOQ work-package ownership', async () => {
    const tender = await import('../../index.ts') as Record<string, unknown>;
    expect(typeof tender.auditTenderExecutionPlan).toBe('function');
    const data = completeExecutionData();
    data.workPackages.push({
      ...data.workPackages[0],
      id: 'wp-drainage-duplicate',
      title: 'Duplicate drainage package',
    });

    const audit = (tender.auditTenderExecutionPlan as (
      workspace: unknown,
      boqData: unknown,
      data: unknown,
      generatedAt: string,
    ) => any)(workspace(), boqData(), data, '2026-07-12T12:00:00.000Z');

    expect(audit.readiness).toBe('not_ready');
    expect(audit.issues.map((issue: { code: string }) => issue.code)).toContain('boq_item_multiple_work_packages');
  });

  test('blocks reviewed work packages without source, HSE, or environmental controls', async () => {
    const tender = await import('../../index.ts') as Record<string, unknown>;
    expect(typeof tender.auditTenderExecutionPlan).toBe('function');
    const data = fixture('incomplete');

    const audit = (tender.auditTenderExecutionPlan as (
      workspace: unknown,
      boqData: unknown,
      data: unknown,
      generatedAt: string,
    ) => any)(workspace(), boqData(), data, '2026-07-12T12:00:00.000Z');
    const codes = audit.issues.map((issue: { code: string }) => issue.code);

    expect(audit.readiness).toBe('not_ready');
    expect(codes).toContain('reviewed_work_package_missing_source');
    expect(codes).toContain('hse_controls_missing');
    expect(codes).toContain('environmental_controls_missing');
  });

  test('keeps draft work and unverified resource assumptions in review', async () => {
    const tender = await import('../../index.ts') as Record<string, unknown>;
    expect(typeof tender.auditTenderExecutionPlan).toBe('function');
    const data = completeExecutionData();
    data.workPackages[0].status = 'draft';
    data.workPackages[0].resourceNeeds[0].status = 'unverified';

    const audit = (tender.auditTenderExecutionPlan as (
      workspace: unknown,
      boqData: unknown,
      data: unknown,
      generatedAt: string,
    ) => any)(workspace(), boqData(), data, '2026-07-12T12:00:00.000Z');
    const codes = audit.issues.map((issue: { code: string }) => issue.code);

    expect(audit.readiness).toBe('needs_review');
    expect(codes).toContain('work_package_not_reviewed');
    expect(codes).toContain('resource_need_unverified');
  });
});
