import { describe, expect, test } from 'bun:test';

function workspace(): any {
  return {
    schemaVersion: 1, revision: 8,
    project: { id: 'n3-delivery', title: 'N3 Delivery', status: 'active', dataDate: '2026-07-12' },
    sources: [
      { id: 'resource-plan', name: 'Resource Plan', path: 'C:/resource.xlsx', kind: 'resource', status: 'active', sha256: 'a'.repeat(64) },
      { id: 'procurement', name: 'Procurement Register', path: 'C:/procurement.xlsx', kind: 'commitment', status: 'active', sha256: 'b'.repeat(64) },
      { id: 'organization', name: 'Approved Organization', path: 'C:/org.pdf', kind: 'organization', status: 'active', sha256: 'c'.repeat(64) },
    ],
    snapshots: [],
    baselines: [{ id: 'org-baseline', kind: 'organization', title: 'Approved Organization', status: 'approved', evidenceRefs: [{ kind: 'source', sourceId: 'organization' }] }],
    knowledgeUses: [],
  };
}

function contractScope(): any {
  return {
    baselineStatus: 'reviewed', obligations: [],
    scopeItems: [{ id: 'drainage', wbsCode: '1.1', title: 'Drainage', inclusionStatus: 'included', owner: 'Construction Manager', acceptanceCriteria: ['ITP'], evidenceRefs: [], status: 'reviewed' }],
    responsibilityAssignments: [],
  };
}

function programme(): any {
  return {
    programmeStatus: 'reviewed', dataDate: '2026-07-12',
    calendars: [{ id: 'cal', name: 'Calendar', workingDays: [1, 2, 3, 4, 5], exceptions: [] }],
    activities: [{
      id: 'drainage-works', scopeItemId: 'drainage', name: 'Drainage works', calendarId: 'cal',
      baselineStart: '2026-07-01', baselineFinish: '2026-07-20', actualStart: '2026-07-01',
      remainingDurationDays: 5, forecastStart: '2026-07-01', forecastFinish: '2026-07-22', percentComplete: 60,
      predecessors: [], progressEvidenceRefs: [], status: 'in_progress', confidence: 'confirmed',
    }],
    milestones: [], recoveryScenarios: [],
  };
}

function completeData(): any {
  return {
    controlStatus: 'reviewed', dataDate: '2026-07-12',
    resources: [
      { id: 'crew', category: 'labour', name: 'Drainage crew', unit: 'crew', availableQuantity: 1, capacityPerDay: 20, evidenceRefs: [{ kind: 'source', sourceId: 'resource-plan', sheet: 'Labour', cell: 'B2:H2' }], status: 'confirmed' },
      { id: 'pipes', category: 'material', name: 'Concrete pipes', unit: 'm', availableQuantity: 500, evidenceRefs: [{ kind: 'source', sourceId: 'procurement', sheet: 'Materials', cell: 'B4:H4' }], status: 'confirmed' },
    ],
    allocations: [
      { id: 'crew-drainage', resourceId: 'crew', activityId: 'drainage-works', plannedStart: '2026-07-01', plannedFinish: '2026-07-22', requiredQuantity: 1, demandPerDay: 20, evidenceRefs: [{ kind: 'source', sourceId: 'resource-plan', sheet: 'Allocations', cell: 'B2:H2' }], status: 'reviewed' },
      { id: 'pipes-drainage', resourceId: 'pipes', activityId: 'drainage-works', plannedStart: '2026-07-10', plannedFinish: '2026-07-22', requiredQuantity: 400, evidenceRefs: [{ kind: 'source', sourceId: 'resource-plan', sheet: 'Materials', cell: 'B4:H4' }], status: 'reviewed' },
    ],
    procurementPackages: [{
      id: 'pipes-package', title: 'Concrete pipes', category: 'material', resourceIds: ['pipes'], activityIds: ['drainage-works'],
      requiredOnSiteDate: '2026-07-15', forecastDeliveryDate: '2026-07-14', leadTimeDays: 21, supplier: 'Approved Supplier',
      evidenceRefs: [{ kind: 'source', sourceId: 'procurement', sheet: 'Packages', cell: 'B2:H2' }], status: 'ordered', confidence: 'confirmed',
    }],
    constraints: [],
  };
}

describe('delivery resource and procurement capability', () => {
  test('is ready with evidenced capacity, activity allocations, and on-time procurement', async () => {
    const delivery = await import('../../index.ts') as Record<string, unknown>;
    expect(typeof delivery.auditDeliveryResourceProcurement).toBe('function');
    const audit = (delivery.auditDeliveryResourceProcurement as Function)(workspace(), contractScope(), programme(), completeData(), '2026-07-12T20:00:00.000Z');
    expect(audit.readiness).toBe('ready');
    expect(audit.issues).toEqual([]);
    expect(audit.summary.coveredActivities).toBe(1);
    expect(audit.summary.procurementPackages).toBe(1);
  });

  test('blocks capacity overload, late procurement, and unsupported confirmed records', async () => {
    const delivery = await import('../../index.ts') as Record<string, unknown>;
    const data = completeData();
    data.resources[0].evidenceRefs = [];
    data.allocations[0].demandPerDay = 25;
    data.procurementPackages[0].forecastDeliveryDate = '2026-07-18';
    const audit = (delivery.auditDeliveryResourceProcurement as Function)(workspace(), contractScope(), programme(), data);
    const codes = audit.issues.map((issue: { code: string }) => issue.code);
    expect(codes).toContain('resource_direct_evidence_missing');
    expect(codes).toContain('resource_capacity_exceeded');
    expect(codes).toContain('procurement_delivery_late');
    expect(audit.readiness).toBe('not_ready');
  });

  test('blocks uncovered active activities and material allocations without procurement packages', async () => {
    const delivery = await import('../../index.ts') as Record<string, unknown>;
    const data = completeData();
    data.allocations = data.allocations.filter((allocation: { resourceId: string }) => allocation.resourceId === 'pipes');
    data.procurementPackages = [];
    const audit = (delivery.auditDeliveryResourceProcurement as Function)(workspace(), contractScope(), programme(), data);
    const codes = audit.issues.map((issue: { code: string }) => issue.code);
    expect(codes).toContain('activity_resource_category_missing');
    expect(codes).toContain('procurement_package_missing');
  });
});
