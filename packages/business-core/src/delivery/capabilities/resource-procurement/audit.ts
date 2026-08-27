import type { DeliveryEvidenceRef, DeliveryWorkspace } from '../../types.ts';
import { parseDeliveryWorkspace } from '../../schema.ts';
import type { DeliveryContractScopeData } from '../contract-scope/types.ts';
import { parseDeliveryContractScopeData } from '../contract-scope/schema.ts';
import type { DeliveryProgrammeProgressData } from '../programme-progress/types.ts';
import { parseDeliveryProgrammeProgressData } from '../programme-progress/schema.ts';
import type { DeliveryCapabilityAuditIssue } from '../types.ts';
import { parseDeliveryResourceProcurementData } from './schema.ts';
import type { DeliveryResourceProcurementAudit, DeliveryResourceProcurementData } from './types.ts';

export function auditDeliveryResourceProcurement(
  workspaceValue: DeliveryWorkspace | unknown,
  contractScopeValue: DeliveryContractScopeData | unknown,
  programmeValue: DeliveryProgrammeProgressData | unknown,
  value: DeliveryResourceProcurementData | unknown,
  generatedAt = new Date().toISOString(),
): DeliveryResourceProcurementAudit {
  const workspace = parseDeliveryWorkspace(workspaceValue);
  const contractScope = parseDeliveryContractScopeData(contractScopeValue);
  const programme = parseDeliveryProgrammeProgressData(programmeValue);
  const data = parseDeliveryResourceProcurementData(value);
  const issues: DeliveryCapabilityAuditIssue[] = [];
  const sourceById = new Map(workspace.sources.map((source) => [source.id, source]));
  const snapshotById = new Map(workspace.snapshots.map((snapshot) => [snapshot.id, snapshot]));
  const resourceById = new Map(data.resources.map((resource) => [resource.id, resource]));
  const activityById = new Map(programme.activities.map((activity) => [activity.id, activity]));

  if (!workspace.baselines.some((baseline) => baseline.kind === 'organization' && baseline.status === 'approved')) {
    issues.push(issue('approved_organization_baseline_missing', 'baseline', undefined, 'No approved local organization baseline is registered.'));
  }
  if (workspace.project.dataDate && workspace.project.dataDate !== data.dataDate) {
    issues.push(issue('resource_data_date_mismatch', 'capability', undefined, `Resource data date ${data.dataDate} does not match project data date ${workspace.project.dataDate}.`));
  }
  if (data.controlStatus === 'blocked') issues.push(issue('resource_procurement_blocked', 'capability', undefined, 'Resource and procurement control is blocked.'));
  if (data.controlStatus === 'draft') issues.push(warning('resource_procurement_not_reviewed', 'capability', undefined, 'Resource and procurement control has not been reviewed.'));

  for (const resource of data.resources) {
    inspectEvidence(resource.evidenceRefs, resource.id, sourceById, snapshotById, issues);
    if (resource.status === 'confirmed' && !hasDirectEvidence(resource.evidenceRefs, sourceById)) {
      issues.push(issue('resource_direct_evidence_missing', 'resource', resource.id, `Confirmed resource ${resource.id} has no active direct implementation evidence.`));
    }
    if (resource.status === 'blocked') issues.push(issue('resource_blocked', 'resource', resource.id, `Resource ${resource.id} is blocked.`));
    if (resource.status === 'draft') issues.push(warning('resource_not_confirmed', 'resource', resource.id, `Resource ${resource.id} is still draft.`));
  }

  const allocationsByActivity = new Map<string, DeliveryResourceProcurementData['allocations']>();
  for (const allocation of data.allocations) {
    const resource = resourceById.get(allocation.resourceId);
    if (!resource) issues.push(issue('allocation_resource_missing', 'allocation', allocation.id, `Allocation ${allocation.id} references missing resource ${allocation.resourceId}.`));
    if (!activityById.has(allocation.activityId)) issues.push(issue('allocation_activity_missing', 'allocation', allocation.id, `Allocation ${allocation.id} references missing activity ${allocation.activityId}.`));
    if (allocation.plannedStart > allocation.plannedFinish) issues.push(issue('allocation_dates_invalid', 'allocation', allocation.id, `Allocation ${allocation.id} starts after it finishes.`));
    inspectEvidence(allocation.evidenceRefs, allocation.id, sourceById, snapshotById, issues);
    if (allocation.status === 'reviewed' && !hasDirectEvidence(allocation.evidenceRefs, sourceById)) {
      issues.push(issue('allocation_direct_evidence_missing', 'allocation', allocation.id, `Reviewed allocation ${allocation.id} has no active direct implementation evidence.`));
    }
    if (allocation.status === 'blocked') issues.push(issue('allocation_blocked', 'allocation', allocation.id, `Allocation ${allocation.id} is blocked.`));
    if (allocation.status === 'draft') issues.push(warning('allocation_not_reviewed', 'allocation', allocation.id, `Allocation ${allocation.id} is still draft.`));
    if (resource?.capacityPerDay && allocation.demandPerDay && allocation.demandPerDay > resource.capacityPerDay * resource.availableQuantity) {
      issues.push(issue('resource_capacity_exceeded', 'allocation', allocation.id, `Allocation ${allocation.id} exceeds confirmed daily capacity for resource ${resource.id}.`));
    }
    const activityAllocations = allocationsByActivity.get(allocation.activityId) ?? [];
    activityAllocations.push(allocation);
    allocationsByActivity.set(allocation.activityId, activityAllocations);
  }

  const activeActivities = programme.activities.filter((activity) => activity.status !== 'completed');
  for (const activity of activeActivities) {
    const allocations = allocationsByActivity.get(activity.id) ?? [];
    const hasExecutionCapacity = allocations.some((allocation) => {
      const category = resourceById.get(allocation.resourceId)?.category;
      return category === 'labour' || category === 'plant' || category === 'subcontract';
    });
    if (!hasExecutionCapacity) issues.push(issue('activity_resource_category_missing', 'activity', activity.id, `Active activity ${activity.id} has no labour, plant, or subcontract execution allocation.`));
  }

  const packageResourceIds = new Set(data.procurementPackages.flatMap((item) => item.resourceIds));
  for (const allocation of data.allocations) {
    const category = resourceById.get(allocation.resourceId)?.category;
    if ((category === 'material' || category === 'subcontract') && !packageResourceIds.has(allocation.resourceId)) {
      issues.push(issue('procurement_package_missing', 'resource', allocation.resourceId, `Allocated ${category} resource ${allocation.resourceId} has no procurement package.`));
    }
  }

  for (const procurementPackage of data.procurementPackages) {
    inspectEvidence(procurementPackage.evidenceRefs, procurementPackage.id, sourceById, snapshotById, issues);
    if (procurementPackage.confidence === 'confirmed' && !hasDirectEvidence(procurementPackage.evidenceRefs, sourceById)) {
      issues.push(issue('procurement_direct_evidence_missing', 'procurement_package', procurementPackage.id, `Confirmed procurement package ${procurementPackage.id} has no active direct implementation evidence.`));
    }
    for (const resourceId of procurementPackage.resourceIds) {
      if (!resourceById.has(resourceId)) issues.push(issue('procurement_resource_missing', 'procurement_package', procurementPackage.id, `Procurement package ${procurementPackage.id} references missing resource ${resourceId}.`));
    }
    for (const activityId of procurementPackage.activityIds) {
      if (!activityById.has(activityId)) issues.push(issue('procurement_activity_missing', 'procurement_package', procurementPackage.id, `Procurement package ${procurementPackage.id} references missing activity ${activityId}.`));
    }
    if (procurementPackage.forecastDeliveryDate > procurementPackage.requiredOnSiteDate) {
      issues.push(issue('procurement_delivery_late', 'procurement_package', procurementPackage.id, `Procurement package ${procurementPackage.id} is forecast after its required-on-site date.`));
    }
    if (procurementPackage.status === 'delivered' && !procurementPackage.actualDeliveryDate) {
      issues.push(issue('procurement_actual_delivery_missing', 'procurement_package', procurementPackage.id, `Delivered package ${procurementPackage.id} has no actual delivery date.`));
    }
    if (procurementPackage.status === 'blocked') issues.push(issue('procurement_package_blocked', 'procurement_package', procurementPackage.id, `Procurement package ${procurementPackage.id} is blocked.`));
    if (procurementPackage.confidence !== 'confirmed') issues.push(warning('procurement_package_not_confirmed', 'procurement_package', procurementPackage.id, `Procurement package ${procurementPackage.id} is ${procurementPackage.confidence}.`));
  }

  for (const constraint of data.constraints) {
    for (const resourceId of constraint.resourceIds) if (!resourceById.has(resourceId)) issues.push(issue('constraint_resource_missing', 'constraint', constraint.id, `Constraint ${constraint.id} references missing resource ${resourceId}.`));
    for (const activityId of constraint.activityIds) if (!activityById.has(activityId)) issues.push(issue('constraint_activity_missing', 'constraint', constraint.id, `Constraint ${constraint.id} references missing activity ${activityId}.`));
    if (constraint.status === 'blocked') issues.push(issue('resource_constraint_blocked', 'constraint', constraint.id, `Constraint ${constraint.id} is blocked.`));
    else if (constraint.status === 'open' && constraint.dueDate <= data.dataDate) issues.push(issue('resource_constraint_overdue', 'constraint', constraint.id, `Constraint ${constraint.id} is open at or beyond its due date.`));
    else if (constraint.status === 'open') issues.push(warning('resource_constraint_open', 'constraint', constraint.id, `Constraint ${constraint.id} remains open.`));
  }

  const coveredActivities = activeActivities.filter((activity) => (allocationsByActivity.get(activity.id) ?? []).length > 0).length;
  const lateProcurementPackages = data.procurementPackages.filter((item) => item.forecastDeliveryDate > item.requiredOnSiteDate).length;
  const readiness = issues.some((entry) => entry.severity === 'error') ? 'not_ready' : issues.length ? 'needs_review' : 'ready';
  return {
    schemaVersion: 1,
    capability: 'resource_procurement',
    projectId: workspace.project.id,
    coreRevision: workspace.revision,
    generatedAt,
    readiness,
    summary: {
      resources: data.resources.length,
      allocations: data.allocations.length,
      coveredActivities,
      procurementPackages: data.procurementPackages.length,
      lateProcurementPackages,
      openConstraints: data.constraints.filter((constraint) => constraint.status === 'open' || constraint.status === 'blocked').length,
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

function hasDirectEvidence(
  references: DeliveryEvidenceRef[],
  sources: Map<string, DeliveryWorkspace['sources'][number]>,
): boolean {
  return references.some((reference) => reference.kind === 'source' && sources.get(reference.sourceId)?.status === 'active');
}

function issue(code: string, entityType: string, entityId: string | undefined, message: string): DeliveryCapabilityAuditIssue {
  return { code, severity: 'error', entityType, entityId, message };
}

function warning(code: string, entityType: string, entityId: string | undefined, message: string): DeliveryCapabilityAuditIssue {
  return { code, severity: 'warning', entityType, entityId, message };
}
