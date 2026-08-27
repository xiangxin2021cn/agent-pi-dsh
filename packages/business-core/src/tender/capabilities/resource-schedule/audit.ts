import type { TenderWorkspace } from '../../types.ts';
import type { TenderCapabilityIndex } from '../types.ts';
import type {
  TenderConstructionResourceScheduleAudit,
  TenderConstructionResourceScheduleData,
} from './types.ts';

export function auditTenderConstructionResourceSchedule(
  workspace: TenderWorkspace,
  data: TenderConstructionResourceScheduleData,
  _index: TenderCapabilityIndex,
  generatedAt = new Date().toISOString(),
): TenderConstructionResourceScheduleAudit {
  const issues: TenderConstructionResourceScheduleAudit['issues'] = [];
  if (data.rows.length === 0) {
    issues.push({
      code: 'resource-schedule-empty',
      severity: 'error',
      entityType: 'construction_resource_schedule',
      message: 'Construction resource schedule has no rows.',
    });
  }
  const unverifiedRows = data.rows.filter((row) => row.assumptionStatus === 'unverified').length;
  if (unverifiedRows > 0) {
    issues.push({
      code: 'resource-schedule-unverified',
      severity: 'warning',
      entityType: 'construction_resource_schedule',
      message: `${unverifiedRows} resource row(s) remain unverified.`,
    });
  }
  const readiness = issues.some((issue) => issue.severity === 'error')
    ? 'not_ready'
    : unverifiedRows > 0
      ? 'needs_review'
      : 'ready';
  return {
    schemaVersion: 1,
    capability: 'construction_resource_schedule',
    projectId: workspace.project.id,
    coreRevision: workspace.revision,
    generatedAt,
    readiness,
    summary: {
      rows: data.rows.length,
      categories: new Set(data.rows.map((row) => row.category)).size,
      unverifiedRows,
    },
    issues,
  };
}
