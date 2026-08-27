import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

function fixture(name: 'complete' | 'incomplete') {
  return JSON.parse(readFileSync(join(import.meta.dir, 'fixtures', `${name}.json`), 'utf8'));
}

function workspace() {
  return {
    schemaVersion: 1,
    revision: 8,
    project: { id: 'n3-upgrade', title: 'N3 Upgrade', status: 'active' },
    documents: [
      { id: 'spec', name: 'Specification', path: 'C:/tender/spec.pdf', kind: 'specification', status: 'active' },
    ],
    requirements: [
      {
        id: 'req-completion',
        title: 'Contract completion',
        text: 'Complete the works within the tender period.',
        type: 'deadline',
        criticality: 'critical',
        source: { documentId: 'spec', page: 5, clause: '1.2' },
        evidenceNeeded: [],
        status: 'planned',
      },
    ],
    criteria: [],
    deliverables: [],
    responses: [],
  };
}

function executionData() {
  return {
    workPackages: [
      {
        id: 'wp-drainage-01',
        title: 'Drainage works',
        boqItemIds: ['boq-5201'],
        requirementIds: ['req-completion'],
        methodSteps: ['Set out', 'Excavate', 'Construct'],
        resourceNeeds: [],
        holdPoints: [],
        interfaces: ['Traffic accommodation'],
        constraints: ['Live traffic'],
        temporaryWorks: [],
        hseControls: ['Excavation controls'],
        environmentalControls: ['Sediment control'],
        sourceRefs: [{ documentId: 'spec', page: 20 }],
        status: 'reviewed',
      },
    ],
  };
}

function completeScheduleData(): any {
  return {
    programmeStart: '2026-08-03',
    programmeStatus: 'reviewed',
    calendars: [
      { id: 'cal-1', name: 'Tender calendar', workingDays: [1, 2, 3, 4, 5], exceptions: [] },
    ],
    activities: [
      activity('setout', 'Set out drainage works', 1, []),
      activity('excavate', 'Excavate drainage', 2, [{ activityId: 'setout', type: 'FS', lagDays: 0 }]),
      activity('concrete', 'Construct concrete drain', 3, [{ activityId: 'excavate', type: 'FS', lagDays: 0 }]),
    ],
    resources: [
      { id: 'crew', class: 'drainage-crew', capacity: '1', unit: 'crew', calendarId: 'cal-1' },
    ],
    assignments: [
      { activityId: 'setout', resourceId: 'crew', demand: '1' },
      { activityId: 'excavate', resourceId: 'crew', demand: '1' },
      { activityId: 'concrete', resourceId: 'crew', demand: '1' },
    ],
    milestones: [
      {
        id: 'milestone-completion',
        name: 'Drainage package complete',
        activityId: 'concrete',
        kind: 'contractual',
        requirementIds: ['req-completion'],
      },
    ],
  };
}

describe('tender schedule and resource capability', () => {
  test('reports ready for a reviewed acyclic, resourced programme', async () => {
    const tender = await import('../../index.ts') as Record<string, unknown>;
    expect(typeof tender.parseTenderScheduleResourceData).toBe('function');
    expect(typeof tender.auditTenderScheduleResources).toBe('function');

    const data = (tender.parseTenderScheduleResourceData as (value: unknown) => unknown)(fixture('complete'));
    const audit = (tender.auditTenderScheduleResources as (
      workspace: unknown,
      executionData: unknown,
      data: unknown,
      generatedAt: string,
    ) => any)(workspace(), executionData(), data, '2026-07-12T13:00:00.000Z');

    expect(audit.readiness).toBe('ready');
    expect(audit.issues).toEqual([]);
    expect(audit.summary.projectDurationDays).toBe(6);
    expect(audit.summary.programmeStart).toBe('2026-08-03');
    expect(audit.summary.criticalActivities).toBe(3);
  });

  test('blocks cycles and dangling predecessors', async () => {
    const tender = await import('../../index.ts') as Record<string, unknown>;
    expect(typeof tender.auditTenderScheduleResources).toBe('function');
    const data = fixture('incomplete');

    const audit = (tender.auditTenderScheduleResources as (
      workspace: unknown,
      executionData: unknown,
      data: unknown,
      generatedAt: string,
    ) => any)(workspace(), executionData(), data, '2026-07-12T13:00:00.000Z');
    const codes = audit.issues.map((issue: { code: string }) => issue.code);

    expect(audit.readiness).toBe('not_ready');
    expect(codes).toContain('activity_predecessor_missing');
    expect(codes).toContain('activity_logic_cycle');
  });

  test('blocks resource demand above overlapping capacity', async () => {
    const tender = await import('../../index.ts') as Record<string, unknown>;
    expect(typeof tender.auditTenderScheduleResources).toBe('function');
    const data = completeScheduleData();
    data.activities.push(activity('parallel', 'Parallel drainage work', 2, []));
    data.assignments.push({ activityId: 'parallel', resourceId: 'crew', demand: '1' });

    const audit = (tender.auditTenderScheduleResources as (
      workspace: unknown,
      executionData: unknown,
      data: unknown,
      generatedAt: string,
    ) => any)(workspace(), executionData(), data, '2026-07-12T13:00:00.000Z');

    expect(audit.readiness).toBe('not_ready');
    expect(audit.issues.map((issue: { code: string }) => issue.code)).toContain('resource_capacity_exceeded');
  });

  test('keeps unverified durations and draft programmes in review', async () => {
    const tender = await import('../../index.ts') as Record<string, unknown>;
    expect(typeof tender.auditTenderScheduleResources).toBe('function');
    const data = completeScheduleData();
    data.programmeStatus = 'draft';
    data.activities[1].confidence = 'unverified';

    const audit = (tender.auditTenderScheduleResources as (
      workspace: unknown,
      executionData: unknown,
      data: unknown,
      generatedAt: string,
    ) => any)(workspace(), executionData(), data, '2026-07-12T13:00:00.000Z');
    const codes = audit.issues.map((issue: { code: string }) => issue.code);

    expect(audit.readiness).toBe('needs_review');
    expect(codes).toContain('programme_not_reviewed');
    expect(codes).toContain('activity_duration_unverified');
  });

  test('rejects impossible programme start dates', async () => {
    const tender = await import('../../index.ts') as Record<string, unknown>;
    expect(typeof tender.parseTenderScheduleResourceData).toBe('function');
    const data = completeScheduleData();
    data.programmeStart = '2026-02-30';

    expect(() => (tender.parseTenderScheduleResourceData as (value: unknown) => unknown)(data))
      .toThrow(/valid date/i);
  });
});

function activity(id: string, name: string, durationDays: number, predecessors: unknown[]) {
  return {
    id,
    workPackageId: 'wp-drainage-01',
    name,
    durationDays,
    durationBasis: 'Derived from the reviewed tender work package.',
    calendarId: 'cal-1',
    predecessors,
    requirementIds: ['req-completion'],
    sourceRefs: [{ documentId: 'spec', page: 20 }],
    confidence: 'confirmed',
  };
}
