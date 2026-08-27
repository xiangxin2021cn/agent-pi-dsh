import { describe, expect, test } from 'bun:test';

function workspace(): any {
  return {
    schemaVersion: 1,
    revision: 7,
    project: { id: 'n3-delivery', title: 'N3 Delivery', status: 'active', dataDate: '2026-07-12' },
    sources: [
      { id: 'contract', name: 'Contract', path: 'C:/contract.pdf', kind: 'contract', status: 'active', sha256: 'a'.repeat(64) },
      { id: 'scope', name: 'Scope', path: 'C:/scope.pdf', kind: 'approved_scope', status: 'active', sha256: 'b'.repeat(64) },
      { id: 'programme', name: 'Approved Programme', path: 'C:/programme.xml', kind: 'baseline_programme', status: 'active', sha256: 'c'.repeat(64) },
      { id: 'progress', name: 'Progress Cut', path: 'C:/progress.xlsx', kind: 'progress', status: 'active', sha256: 'd'.repeat(64) },
    ],
    snapshots: [],
    baselines: [
      { id: 'contract-baseline', kind: 'contract', title: 'Contract', status: 'approved', evidenceRefs: [{ kind: 'source', sourceId: 'contract' }] },
      { id: 'scope-baseline', kind: 'scope', title: 'Scope', status: 'approved', evidenceRefs: [{ kind: 'source', sourceId: 'scope' }] },
      { id: 'programme-baseline', kind: 'schedule', title: 'Approved Programme', status: 'approved', evidenceRefs: [{ kind: 'source', sourceId: 'programme' }] },
    ],
    knowledgeUses: [],
  };
}

function contractScope(): any {
  return {
    baselineStatus: 'reviewed', obligations: [],
    scopeItems: [{
      id: 'drainage', wbsCode: '1.1', title: 'Drainage', inclusionStatus: 'included', owner: 'Construction Manager',
      acceptanceCriteria: ['Accepted inspection records'], evidenceRefs: [{ kind: 'source', sourceId: 'scope' }], status: 'reviewed',
    }],
    responsibilityAssignments: [{
      id: 'resp', scopeItemIds: ['drainage'], responsible: ['Construction Manager'], accountable: 'Project Manager',
      consulted: [], informed: [], interfaces: ['Traffic'], status: 'reviewed',
    }],
  };
}

function completeData(): any {
  return {
    programmeStatus: 'reviewed',
    dataDate: '2026-07-12',
    calendars: [{ id: 'cal-5d', name: 'Five day', workingDays: [1, 2, 3, 4, 5], exceptions: [] }],
    activities: [
      {
        id: 'excavate', scopeItemId: 'drainage', name: 'Excavate drains', calendarId: 'cal-5d',
        baselineStart: '2026-07-01', baselineFinish: '2026-07-10', actualStart: '2026-07-01',
        actualFinish: '2026-07-10', remainingDurationDays: 0, forecastStart: '2026-07-01',
        forecastFinish: '2026-07-10', percentComplete: 100, predecessors: [],
        progressEvidenceRefs: [{ kind: 'source', sourceId: 'progress', sheet: 'July', cell: 'B2:H2' }],
        status: 'completed', confidence: 'confirmed'
      },
      {
        id: 'concrete', scopeItemId: 'drainage', name: 'Construct drains', calendarId: 'cal-5d',
        baselineStart: '2026-07-11', baselineFinish: '2026-07-20', actualStart: '2026-07-11',
        remainingDurationDays: 5, forecastStart: '2026-07-11', forecastFinish: '2026-07-22',
        percentComplete: 20, predecessors: [{ activityId: 'excavate', type: 'FS', lagDays: 0 }],
        progressEvidenceRefs: [{ kind: 'source', sourceId: 'progress', sheet: 'July', cell: 'B3:H3' }],
        status: 'in_progress', confidence: 'confirmed'
      }
    ],
    milestones: [{
      id: 'drainage-complete', title: 'Drainage complete', activityId: 'concrete', kind: 'internal',
      baselineDate: '2026-07-20', forecastDate: '2026-07-22', evidenceRefs: [{ kind: 'source', sourceId: 'programme' }],
    }],
    recoveryScenarios: [],
  };
}

describe('delivery programme and progress capability', () => {
  test('is ready for an evidenced update against an approved schedule baseline', async () => {
    const delivery = await import('../../index.ts') as Record<string, unknown>;
    expect(typeof delivery.auditDeliveryProgrammeProgress).toBe('function');
    const audit = (delivery.auditDeliveryProgrammeProgress as Function)(workspace(), contractScope(), completeData(), '2026-07-12T20:00:00.000Z');
    expect(audit.readiness).toBe('ready');
    expect(audit.issues).toEqual([]);
    expect(audit.summary.completedActivities).toBe(1);
    expect(audit.summary.inProgressActivities).toBe(1);
  });

  test('blocks unsupported progress, completion inconsistencies, and logic cycles', async () => {
    const delivery = await import('../../index.ts') as Record<string, unknown>;
    const data = completeData();
    data.activities[0].progressEvidenceRefs = [];
    data.activities[0].percentComplete = 90;
    data.activities[1].predecessors.push({ activityId: 'concrete', type: 'FS', lagDays: 0 });
    const audit = (delivery.auditDeliveryProgrammeProgress as Function)(workspace(), contractScope(), data);
    const codes = audit.issues.map((issue: { code: string }) => issue.code);
    expect(codes).toContain('progress_evidence_missing');
    expect(codes).toContain('completed_activity_inconsistent');
    expect(codes).toContain('activity_logic_cycle');
    expect(audit.readiness).toBe('not_ready');
  });

  test('blocks missing approved programme baseline and scope coverage', async () => {
    const delivery = await import('../../index.ts') as Record<string, unknown>;
    const model = workspace();
    model.baselines = model.baselines.filter((baseline: { kind: string }) => baseline.kind !== 'schedule');
    const data = completeData();
    data.activities = [];
    const audit = (delivery.auditDeliveryProgrammeProgress as Function)(model, contractScope(), data);
    const codes = audit.issues.map((issue: { code: string }) => issue.code);
    expect(codes).toContain('approved_programme_baseline_missing');
    expect(codes).toContain('scope_activity_missing');
  });
});
