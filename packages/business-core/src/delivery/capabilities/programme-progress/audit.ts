import type { DeliveryEvidenceRef, DeliveryWorkspace } from '../../types.ts';
import { parseDeliveryWorkspace } from '../../schema.ts';
import type { DeliveryContractScopeData } from '../contract-scope/types.ts';
import { parseDeliveryContractScopeData } from '../contract-scope/schema.ts';
import type { DeliveryCapabilityAuditIssue } from '../types.ts';
import { parseDeliveryProgrammeProgressData } from './schema.ts';
import type { DeliveryProgrammeProgressAudit, DeliveryProgrammeProgressData } from './types.ts';

export function auditDeliveryProgrammeProgress(
  workspaceValue: DeliveryWorkspace | unknown,
  contractScopeValue: DeliveryContractScopeData | unknown,
  value: DeliveryProgrammeProgressData | unknown,
  generatedAt = new Date().toISOString(),
): DeliveryProgrammeProgressAudit {
  const workspace = parseDeliveryWorkspace(workspaceValue);
  const contractScope = parseDeliveryContractScopeData(contractScopeValue);
  const data = parseDeliveryProgrammeProgressData(value);
  const issues: DeliveryCapabilityAuditIssue[] = [];
  const sourceById = new Map(workspace.sources.map((source) => [source.id, source]));
  const snapshotById = new Map(workspace.snapshots.map((snapshot) => [snapshot.id, snapshot]));
  const scopeById = new Map(contractScope.scopeItems.map((item) => [item.id, item]));
  const calendarIds = new Set(data.calendars.map((calendar) => calendar.id));
  const activityIds = new Set(data.activities.map((activity) => activity.id));

  if (!workspace.baselines.some((baseline) => baseline.kind === 'schedule' && baseline.status === 'approved')) {
    issues.push(issue('approved_programme_baseline_missing', 'baseline', undefined, 'No approved local programme baseline is registered.'));
  }
  if (workspace.project.dataDate && workspace.project.dataDate !== data.dataDate) {
    issues.push(issue('programme_data_date_mismatch', 'capability', undefined, `Programme data date ${data.dataDate} does not match project data date ${workspace.project.dataDate}.`));
  }
  if (data.programmeStatus === 'blocked') issues.push(issue('programme_progress_blocked', 'capability', undefined, 'Programme and progress control is blocked.'));
  if (data.programmeStatus === 'draft') issues.push(warning('programme_progress_not_reviewed', 'capability', undefined, 'Programme and progress control has not been reviewed.'));

  for (const activity of data.activities) {
    if (!scopeById.has(activity.scopeItemId)) issues.push(issue('activity_scope_missing', 'activity', activity.id, `Activity ${activity.id} references missing scope item ${activity.scopeItemId}.`));
    if (!calendarIds.has(activity.calendarId)) issues.push(issue('activity_calendar_missing', 'activity', activity.id, `Activity ${activity.id} references missing calendar ${activity.calendarId}.`));
    if (activity.baselineStart > activity.baselineFinish) issues.push(issue('activity_baseline_dates_invalid', 'activity', activity.id, `Activity ${activity.id} baseline start is after baseline finish.`));
    if (activity.forecastStart > activity.forecastFinish) issues.push(issue('activity_forecast_dates_invalid', 'activity', activity.id, `Activity ${activity.id} forecast start is after forecast finish.`));

    const hasDirectProgressEvidence = activity.progressEvidenceRefs.some((reference) =>
      reference.kind === 'source' && sourceById.get(reference.sourceId)?.status === 'active',
    );
    inspectEvidence(activity.progressEvidenceRefs, activity.id, sourceById, snapshotById, issues);
    if ((activity.status === 'completed' || activity.status === 'in_progress') && !hasDirectProgressEvidence) {
      issues.push(issue('progress_evidence_missing', 'activity', activity.id, `Activity ${activity.id} has no active direct progress evidence.`));
    }

    if (activity.status === 'completed' && (activity.percentComplete !== 100 || activity.remainingDurationDays !== 0 || !activity.actualFinish)) {
      issues.push(issue('completed_activity_inconsistent', 'activity', activity.id, `Completed activity ${activity.id} must be 100 percent complete with zero remaining duration and an actual finish.`));
    }
    if (activity.status === 'in_progress' && (!activity.actualStart || activity.actualFinish || activity.percentComplete <= 0 || activity.percentComplete >= 100 || activity.remainingDurationDays <= 0)) {
      issues.push(issue('in_progress_activity_inconsistent', 'activity', activity.id, `In-progress activity ${activity.id} has inconsistent actuals or progress values.`));
    }
    if (activity.status === 'not_started' && (activity.actualStart || activity.actualFinish || activity.percentComplete !== 0)) {
      issues.push(issue('not_started_activity_inconsistent', 'activity', activity.id, `Not-started activity ${activity.id} has actuals or progress.`));
    }
    if (activity.status === 'blocked') issues.push(issue('activity_blocked', 'activity', activity.id, `Activity ${activity.id} is blocked.`));
    if (activity.confidence !== 'confirmed') issues.push(warning('activity_not_confirmed', 'activity', activity.id, `Activity ${activity.id} is ${activity.confidence}.`));

    for (const predecessor of activity.predecessors) {
      if (!activityIds.has(predecessor.activityId)) issues.push(issue('activity_predecessor_missing', 'activity', activity.id, `Activity ${activity.id} references missing predecessor ${predecessor.activityId}.`));
    }
  }

  const coveredScopeIds = new Set(data.activities.map((activity) => activity.scopeItemId));
  for (const scopeItem of contractScope.scopeItems) {
    if (scopeItem.inclusionStatus === 'included' && scopeItem.status === 'reviewed' && !coveredScopeIds.has(scopeItem.id)) {
      issues.push(issue('scope_activity_missing', 'scope_item', scopeItem.id, `Reviewed scope item ${scopeItem.id} has no programme activity.`));
    }
  }
  if (hasActivityCycle(data)) issues.push(issue('activity_logic_cycle', 'capability', undefined, 'Activity predecessor logic contains a cycle.'));

  for (const milestone of data.milestones) {
    if (!activityIds.has(milestone.activityId)) issues.push(issue('milestone_activity_missing', 'milestone', milestone.id, `Milestone ${milestone.id} references missing activity ${milestone.activityId}.`));
    inspectEvidence(milestone.evidenceRefs, milestone.id, sourceById, snapshotById, issues);
    if (milestone.evidenceRefs.length === 0) issues.push(issue('milestone_evidence_missing', 'milestone', milestone.id, `Milestone ${milestone.id} has no evidence.`));
  }

  for (const scenario of data.recoveryScenarios) {
    for (const adjustment of scenario.activityAdjustments) {
      if (!activityIds.has(adjustment.activityId)) issues.push(issue('recovery_activity_missing', 'recovery_scenario', scenario.id, `Recovery scenario ${scenario.id} references missing activity ${adjustment.activityId}.`));
    }
    if (scenario.status === 'draft') issues.push(warning('recovery_scenario_not_reviewed', 'recovery_scenario', scenario.id, `Recovery scenario ${scenario.id} has not been reviewed.`));
  }

  const readiness = issues.some((entry) => entry.severity === 'error') ? 'not_ready' : issues.length ? 'needs_review' : 'ready';
  return {
    schemaVersion: 1,
    capability: 'programme_progress',
    projectId: workspace.project.id,
    coreRevision: workspace.revision,
    generatedAt,
    readiness,
    summary: {
      calendars: data.calendars.length,
      activities: data.activities.length,
      completedActivities: data.activities.filter((activity) => activity.status === 'completed').length,
      inProgressActivities: data.activities.filter((activity) => activity.status === 'in_progress').length,
      notStartedActivities: data.activities.filter((activity) => activity.status === 'not_started').length,
      blockedActivities: data.activities.filter((activity) => activity.status === 'blocked').length,
      milestones: data.milestones.length,
      recoveryScenarios: data.recoveryScenarios.length,
    },
    issues,
  };
}

function inspectEvidence(
  references: DeliveryEvidenceRef[],
  entityId: string,
  sources: Map<string, DeliveryWorkspace['sources'][number]>,
  snapshots: Map<string, DeliveryWorkspace['snapshots'][number]>,
  issues: DeliveryCapabilityAuditIssue[],
): void {
  for (const reference of references) {
    if (reference.kind === 'source') {
      const source = sources.get(reference.sourceId);
      if (!source || source.status !== 'active') issues.push(issue('delivery_source_evidence_invalid', 'evidence', entityId, `Source ${reference.sourceId} is missing or inactive.`));
    } else {
      const snapshot = snapshots.get(reference.snapshotId);
      if (!snapshot || snapshot.approvalState !== 'approved' || !snapshot.userConfirmed) issues.push(issue('delivery_snapshot_evidence_invalid', 'evidence', entityId, `Snapshot ${reference.snapshotId} is missing or unverified.`));
    }
  }
}

function hasActivityCycle(data: DeliveryProgrammeProgressData): boolean {
  const graph = new Map(data.activities.map((activity) => [activity.id, activity.predecessors.map((entry) => entry.activityId)]));
  const visiting = new Set<string>();
  const visited = new Set<string>();
  const visit = (activityId: string): boolean => {
    if (visiting.has(activityId)) return true;
    if (visited.has(activityId)) return false;
    visiting.add(activityId);
    for (const predecessorId of graph.get(activityId) ?? []) {
      if (graph.has(predecessorId) && visit(predecessorId)) return true;
    }
    visiting.delete(activityId);
    visited.add(activityId);
    return false;
  };
  return [...graph.keys()].some(visit);
}

function issue(code: string, entityType: string, entityId: string | undefined, message: string): DeliveryCapabilityAuditIssue {
  return { code, severity: 'error', entityType, entityId, message };
}

function warning(code: string, entityType: string, entityId: string | undefined, message: string): DeliveryCapabilityAuditIssue {
  return { code, severity: 'warning', entityType, entityId, message };
}
