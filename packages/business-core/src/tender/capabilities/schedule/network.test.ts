import { describe, expect, test } from 'bun:test';

describe('tender schedule network calculation', () => {
  test('calculates early and late dates, float, and critical path', async () => {
    const tender = await import('../../index.ts') as Record<string, unknown>;
    expect(typeof tender.calculateTenderScheduleNetwork).toBe('function');

    const result = (tender.calculateTenderScheduleNetwork as (activities: unknown[]) => any)([
      activity('a', 5, []),
      activity('b', 3, [{ activityId: 'a', type: 'FS', lagDays: 0 }]),
      activity('c', 2, []),
    ]);

    expect(result.projectDurationDays).toBe(8);
    expect(result.activities).toContainEqual({
      activityId: 'a',
      earlyStart: 0,
      earlyFinish: 5,
      lateStart: 0,
      lateFinish: 5,
      totalFloat: 0,
      critical: true,
    });
    expect(result.activities).toContainEqual({
      activityId: 'c',
      earlyStart: 0,
      earlyFinish: 2,
      lateStart: 6,
      lateFinish: 8,
      totalFloat: 6,
      critical: false,
    });
  });

  test('rejects cyclic activity logic', async () => {
    const tender = await import('../../index.ts') as Record<string, unknown>;
    expect(typeof tender.calculateTenderScheduleNetwork).toBe('function');

    expect(() => (tender.calculateTenderScheduleNetwork as (activities: unknown[]) => unknown)([
      activity('a', 1, [{ activityId: 'b', type: 'FS', lagDays: 0 }]),
      activity('b', 1, [{ activityId: 'a', type: 'FS', lagDays: 0 }]),
    ])).toThrow(/cycle/i);
  });
});

function activity(id: string, durationDays: number, predecessors: unknown[]) {
  return {
    id,
    workPackageId: 'wp-1',
    name: id,
    durationDays,
    durationBasis: 'Synthetic test basis',
    calendarId: 'cal-1',
    predecessors,
    requirementIds: [],
    sourceRefs: [],
    confidence: 'confirmed',
  };
}
