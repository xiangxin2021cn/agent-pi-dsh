import type {
  TenderActivity,
  TenderScheduleActivityResult,
  TenderScheduleNetworkResult,
} from './types.ts';

export function calculateTenderScheduleNetwork(
  activities: TenderActivity[],
): TenderScheduleNetworkResult {
  const activityById = new Map(activities.map((activity) => [activity.id, activity]));
  const indegree = new Map(activities.map((activity) => [activity.id, 0]));
  const successors = new Map<string, Array<{ successorId: string; type: string; lagDays: number }>>();

  for (const activity of activities) {
    for (const predecessor of activity.predecessors) {
      if (!activityById.has(predecessor.activityId)) {
        throw new Error(`Activity ${activity.id} references missing predecessor ${predecessor.activityId}.`);
      }
      indegree.set(activity.id, (indegree.get(activity.id) ?? 0) + 1);
      const entries = successors.get(predecessor.activityId) ?? [];
      entries.push({ successorId: activity.id, type: predecessor.type, lagDays: predecessor.lagDays });
      successors.set(predecessor.activityId, entries);
    }
  }

  const queue = activities.filter((activity) => indegree.get(activity.id) === 0).map((activity) => activity.id);
  const order: string[] = [];
  while (queue.length > 0) {
    const activityId = queue.shift()!;
    order.push(activityId);
    for (const successor of successors.get(activityId) ?? []) {
      const remaining = (indegree.get(successor.successorId) ?? 0) - 1;
      indegree.set(successor.successorId, remaining);
      if (remaining === 0) queue.push(successor.successorId);
    }
  }
  if (order.length !== activities.length) throw new Error('Activity logic contains a cycle.');

  const early = new Map<string, { start: number; finish: number }>();
  for (const activityId of order) {
    const activity = activityById.get(activityId)!;
    let earlyStart = 0;
    for (const predecessor of activity.predecessors) {
      const predecessorDates = early.get(predecessor.activityId)!;
      const candidate = predecessorConstraint(
        predecessor.type,
        predecessorDates.start,
        predecessorDates.finish,
        activity.durationDays,
        predecessor.lagDays,
      );
      earlyStart = Math.max(earlyStart, candidate);
    }
    earlyStart = round(Math.max(0, earlyStart));
    early.set(activityId, { start: earlyStart, finish: round(earlyStart + activity.durationDays) });
  }

  const projectDurationDays = round(Math.max(0, ...[...early.values()].map((dates) => dates.finish)));
  const late = new Map<string, { start: number; finish: number }>();
  for (const activityId of [...order].reverse()) {
    const activity = activityById.get(activityId)!;
    const outgoing = successors.get(activityId) ?? [];
    let lateFinish = projectDurationDays;
    if (outgoing.length > 0) {
      lateFinish = Math.min(...outgoing.map((successor) => {
        const successorDates = late.get(successor.successorId)!;
        return predecessorLateFinishConstraint(
          successor.type,
          successorDates.start,
          successorDates.finish,
          activity.durationDays,
          successor.lagDays,
        );
      }));
    }
    lateFinish = round(lateFinish);
    late.set(activityId, {
      start: round(lateFinish - activity.durationDays),
      finish: lateFinish,
    });
  }

  const results: TenderScheduleActivityResult[] = activities.map((activity) => {
    const earlyDates = early.get(activity.id)!;
    const lateDates = late.get(activity.id)!;
    const totalFloat = round(lateDates.start - earlyDates.start);
    return {
      activityId: activity.id,
      earlyStart: earlyDates.start,
      earlyFinish: earlyDates.finish,
      lateStart: lateDates.start,
      lateFinish: lateDates.finish,
      totalFloat,
      critical: Math.abs(totalFloat) < 1e-9,
    };
  });

  return { projectDurationDays, activities: results };
}

function predecessorConstraint(
  type: string,
  predecessorStart: number,
  predecessorFinish: number,
  successorDuration: number,
  lag: number,
): number {
  switch (type) {
    case 'SS': return predecessorStart + lag;
    case 'FF': return predecessorFinish + lag - successorDuration;
    case 'SF': return predecessorStart + lag - successorDuration;
    default: return predecessorFinish + lag;
  }
}

function predecessorLateFinishConstraint(
  type: string,
  successorStart: number,
  successorFinish: number,
  predecessorDuration: number,
  lag: number,
): number {
  switch (type) {
    case 'SS': return successorStart - lag + predecessorDuration;
    case 'FF': return successorFinish - lag;
    case 'SF': return successorFinish - lag + predecessorDuration;
    default: return successorStart - lag;
  }
}

function round(value: number): number {
  return Math.round(value * 1_000_000) / 1_000_000;
}
