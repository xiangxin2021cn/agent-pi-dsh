import type { TenderWorkspace } from '../../types.ts';
import { parseTenderExecutionPlanData } from '../execution/schema.ts';
import type { TenderCapabilityAuditIssue } from '../types.ts';
import { calculateTenderScheduleNetwork } from './network.ts';
import { parseTenderScheduleResourceData } from './schema.ts';
import type {
  TenderScheduleNetworkResult,
  TenderScheduleResourceAudit,
  TenderScheduleResourceData,
} from './types.ts';

export function auditTenderScheduleResources(
  workspace: TenderWorkspace,
  executionData: unknown,
  value: TenderScheduleResourceData | unknown,
  generatedAt = new Date().toISOString(),
): TenderScheduleResourceAudit {
  const execution = parseTenderExecutionPlanData(executionData);
  const data = parseTenderScheduleResourceData(value);
  const issues: TenderCapabilityAuditIssue[] = [];
  const workPackageIds = new Set(execution.workPackages.map((workPackage) => workPackage.id));
  const requirementIds = new Set(workspace.requirements.map((requirement) => requirement.id));
  const documentById = new Map(workspace.documents.map((document) => [document.id, document]));
  const calendarIds = new Set(data.calendars.map((calendar) => calendar.id));
  const activityById = new Map(data.activities.map((activity) => [activity.id, activity]));
  const resourceById = new Map(data.resources.map((resource) => [resource.id, resource]));

  if (data.programmeStatus === 'blocked') {
    issues.push({ code: 'programme_blocked', severity: 'error', entityType: 'programme', message: 'The tender programme is blocked.' });
  } else if (data.programmeStatus !== 'reviewed') {
    issues.push({ code: 'programme_not_reviewed', severity: 'warning', entityType: 'programme', message: 'The tender programme has not been reviewed.' });
  }

  let hasMissingPredecessor = false;
  for (const activity of data.activities) {
    if (!workPackageIds.has(activity.workPackageId)) {
      issues.push({
        code: 'activity_work_package_missing',
        severity: 'error',
        entityType: 'activity',
        entityId: activity.id,
        message: `Activity ${activity.id} references missing work package ${activity.workPackageId}.`,
      });
    }
    if (!calendarIds.has(activity.calendarId)) {
      issues.push({
        code: 'activity_calendar_missing',
        severity: 'error',
        entityType: 'activity',
        entityId: activity.id,
        message: `Activity ${activity.id} references missing calendar ${activity.calendarId}.`,
      });
    }
    for (const predecessor of activity.predecessors) {
      if (!activityById.has(predecessor.activityId)) {
        hasMissingPredecessor = true;
        issues.push({
          code: 'activity_predecessor_missing',
          severity: 'error',
          entityType: 'activity',
          entityId: activity.id,
          message: `Activity ${activity.id} references missing predecessor ${predecessor.activityId}.`,
        });
      }
    }
    for (const requirementId of activity.requirementIds) {
      if (!requirementIds.has(requirementId)) {
        issues.push({
          code: 'activity_requirement_missing',
          severity: 'error',
          entityType: 'activity',
          entityId: activity.id,
          message: `Activity ${activity.id} references missing requirement ${requirementId}.`,
        });
      }
    }
    for (const source of activity.sourceRefs) {
      const document = documentById.get(source.documentId);
      if (!document) {
        issues.push({
          code: 'broken_document_reference',
          severity: 'error',
          entityType: 'activity',
          entityId: activity.id,
          message: `Activity ${activity.id} references missing document ${source.documentId}.`,
        });
      } else if (document.status !== 'active') {
        issues.push({
          code: 'inactive_source_reference',
          severity: document.status === 'withdrawn' ? 'error' : 'warning',
          entityType: 'activity',
          entityId: activity.id,
          message: `Activity ${activity.id} cites ${document.status} document ${source.documentId}.`,
        });
      }
    }
    if (activity.sourceRefs.length === 0) {
      issues.push({
        code: 'activity_source_missing',
        severity: 'warning',
        entityType: 'activity',
        entityId: activity.id,
        message: `Activity ${activity.id} has no registered source locator.`,
      });
    }
    if (activity.confidence !== 'confirmed') {
      issues.push({
        code: 'activity_duration_unverified',
        severity: 'warning',
        entityType: 'activity',
        entityId: activity.id,
        message: `Activity ${activity.id} duration is ${activity.confidence}.`,
      });
    }
  }

  for (const resource of data.resources) {
    if (!calendarIds.has(resource.calendarId)) {
      issues.push({
        code: 'resource_calendar_missing',
        severity: 'error',
        entityType: 'resource',
        entityId: resource.id,
        message: `Resource ${resource.id} references missing calendar ${resource.calendarId}.`,
      });
    }
  }

  const assignedActivities = new Set<string>();
  for (const assignment of data.assignments) {
    assignedActivities.add(assignment.activityId);
    if (!activityById.has(assignment.activityId)) {
      issues.push({
        code: 'assignment_activity_missing',
        severity: 'error',
        entityType: 'assignment',
        entityId: `${assignment.activityId}:${assignment.resourceId}`,
        message: `Assignment references missing activity ${assignment.activityId}.`,
      });
    }
    if (!resourceById.has(assignment.resourceId)) {
      issues.push({
        code: 'assignment_resource_missing',
        severity: 'error',
        entityType: 'assignment',
        entityId: `${assignment.activityId}:${assignment.resourceId}`,
        message: `Assignment references missing resource ${assignment.resourceId}.`,
      });
    }
  }
  for (const activity of data.activities) {
    if (!assignedActivities.has(activity.id)) {
      issues.push({
        code: 'activity_resource_unassigned',
        severity: 'warning',
        entityType: 'activity',
        entityId: activity.id,
        message: `Activity ${activity.id} has no resource assignment.`,
      });
    }
  }

  for (const milestone of data.milestones) {
    if (!activityById.has(milestone.activityId)) {
      issues.push({
        code: 'milestone_activity_missing',
        severity: 'error',
        entityType: 'milestone',
        entityId: milestone.id,
        message: `Milestone ${milestone.id} references missing activity ${milestone.activityId}.`,
      });
    }
    for (const requirementId of milestone.requirementIds) {
      if (!requirementIds.has(requirementId)) {
        issues.push({
          code: 'milestone_requirement_missing',
          severity: 'error',
          entityType: 'milestone',
          entityId: milestone.id,
          message: `Milestone ${milestone.id} references missing requirement ${requirementId}.`,
        });
      }
    }
    if (milestone.kind === 'contractual' && milestone.requirementIds.length === 0) {
      issues.push({
        code: 'contractual_milestone_unlinked',
        severity: 'error',
        entityType: 'milestone',
        entityId: milestone.id,
        message: `Contractual milestone ${milestone.id} has no requirement link.`,
      });
    }
  }

  const deadlineRequirements = workspace.requirements.filter((requirement) => requirement.type === 'deadline');
  const milestoneRequirementIds = new Set(data.milestones.flatMap((milestone) => milestone.requirementIds));
  for (const requirement of deadlineRequirements) {
    if (!milestoneRequirementIds.has(requirement.id)) {
      issues.push({
        code: 'deadline_milestone_missing',
        severity: 'error',
        entityType: 'requirement',
        entityId: requirement.id,
        message: `Deadline requirement ${requirement.id} has no programme milestone.`,
      });
    }
  }

  let network: TenderScheduleNetworkResult | undefined;
  if (!hasMissingPredecessor) {
    try {
      network = calculateTenderScheduleNetwork(data.activities);
    } catch (error) {
      issues.push({
        code: 'activity_logic_cycle',
        severity: 'error',
        entityType: 'programme',
        message: error instanceof Error ? error.message : String(error),
      });
    }
  } else if (containsCycleIgnoringMissing(data.activities)) {
    issues.push({
      code: 'activity_logic_cycle',
      severity: 'error',
      entityType: 'programme',
      message: 'Activity logic contains a cycle.',
    });
  }

  if (network) inspectResourceCapacity(data, network, issues);

  const readiness = issues.some((issue) => issue.severity === 'error')
    ? 'not_ready'
    : issues.length > 0
      ? 'needs_review'
      : 'ready';

  return {
    schemaVersion: 1,
    capability: 'schedule_resources',
    projectId: workspace.project.id,
    coreRevision: workspace.revision,
    generatedAt,
    readiness,
    summary: {
      calendars: data.calendars.length,
      activities: data.activities.length,
      milestones: data.milestones.length,
      resources: data.resources.length,
      assignments: data.assignments.length,
      programmeStart: data.programmeStart,
      projectDurationDays: network?.projectDurationDays,
      criticalActivities: network?.activities.filter((activity) => activity.critical).length ?? 0,
      unverifiedActivities: data.activities.filter((activity) => activity.confidence !== 'confirmed').length,
    },
    network,
    issues,
  };
}

function inspectResourceCapacity(
  data: TenderScheduleResourceData,
  network: TenderScheduleNetworkResult,
  issues: TenderCapabilityAuditIssue[],
): void {
  const datesByActivity = new Map(network.activities.map((activity) => [activity.activityId, activity]));
  for (const resource of data.resources) {
    const assignments = data.assignments.filter((assignment) => assignment.resourceId === resource.id);
    if (assignments.length === 0) continue;
    if (resource.capacity === undefined) {
      issues.push({
        code: 'resource_capacity_unverified',
        severity: 'warning',
        entityType: 'resource',
        entityId: resource.id,
        message: `Resource ${resource.id} has assignments but no stated capacity.`,
      });
      continue;
    }
    const events: Array<{ time: number; delta: number }> = [];
    for (const assignment of assignments) {
      const dates = datesByActivity.get(assignment.activityId);
      if (!dates) continue;
      const demand = Number(assignment.demand);
      events.push({ time: dates.earlyStart, delta: demand });
      events.push({ time: dates.earlyFinish, delta: -demand });
    }
    events.sort((left, right) => left.time - right.time || left.delta - right.delta);
    let demand = 0;
    let exceeded = false;
    for (const event of events) {
      demand += event.delta;
      if (demand > Number(resource.capacity) + 1e-9) exceeded = true;
    }
    if (exceeded) {
      issues.push({
        code: 'resource_capacity_exceeded',
        severity: 'error',
        entityType: 'resource',
        entityId: resource.id,
        message: `Resource ${resource.id} demand exceeds its stated capacity.`,
      });
    }
  }
}

function containsCycleIgnoringMissing(activities: TenderScheduleResourceData['activities']): boolean {
  const ids = new Set(activities.map((activity) => activity.id));
  const indegree = new Map(activities.map((activity) => [activity.id, 0]));
  const successors = new Map<string, string[]>();
  for (const activity of activities) {
    for (const predecessor of activity.predecessors) {
      if (!ids.has(predecessor.activityId)) continue;
      indegree.set(activity.id, (indegree.get(activity.id) ?? 0) + 1);
      successors.set(predecessor.activityId, [...(successors.get(predecessor.activityId) ?? []), activity.id]);
    }
  }
  const queue = [...indegree.entries()].filter(([, count]) => count === 0).map(([id]) => id);
  let visited = 0;
  while (queue.length > 0) {
    const id = queue.shift()!;
    visited += 1;
    for (const successor of successors.get(id) ?? []) {
      const remaining = (indegree.get(successor) ?? 0) - 1;
      indegree.set(successor, remaining);
      if (remaining === 0) queue.push(successor);
    }
  }
  return visited !== activities.length;
}
