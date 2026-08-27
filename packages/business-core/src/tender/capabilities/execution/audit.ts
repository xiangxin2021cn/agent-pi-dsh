import type { TenderWorkspace } from '../../types.ts';
import { parseTenderBoqReconciliationData } from '../boq/schema.ts';
import type { TenderCapabilityAuditIssue } from '../types.ts';
import { parseTenderExecutionPlanData } from './schema.ts';
import type { TenderExecutionPlanAudit, TenderExecutionPlanData } from './types.ts';

export function auditTenderExecutionPlan(
  workspace: TenderWorkspace,
  boqData: unknown,
  value: TenderExecutionPlanData | unknown,
  generatedAt = new Date().toISOString(),
): TenderExecutionPlanAudit {
  const parsedBoqData = parseTenderBoqReconciliationData(boqData);
  const data = parseTenderExecutionPlanData(value);
  const issues: TenderCapabilityAuditIssue[] = [];
  const documentById = new Map(workspace.documents.map((document) => [document.id, document]));
  const requirementIds = new Set(workspace.requirements.map((requirement) => requirement.id));
  const boqItemIds = new Set(parsedBoqData.items.map((item) => item.id));
  const workPackagesByBoqItem = new Map<string, string[]>();

  for (const workPackage of data.workPackages) {
    for (const boqItemId of workPackage.boqItemIds) {
      if (!boqItemIds.has(boqItemId)) {
        issues.push({
          code: 'broken_boq_item_reference',
          severity: 'error',
          entityType: 'work_package',
          entityId: workPackage.id,
          message: `Work package ${workPackage.id} references missing BOQ item ${boqItemId}.`,
        });
      }
      const owners = workPackagesByBoqItem.get(boqItemId) ?? [];
      owners.push(workPackage.id);
      workPackagesByBoqItem.set(boqItemId, owners);
    }
    for (const requirementId of workPackage.requirementIds) {
      if (!requirementIds.has(requirementId)) {
        issues.push({
          code: 'broken_requirement_reference',
          severity: 'error',
          entityType: 'work_package',
          entityId: workPackage.id,
          message: `Work package ${workPackage.id} references missing requirement ${requirementId}.`,
        });
      }
    }
    for (const source of workPackage.sourceRefs) {
      const document = documentById.get(source.documentId);
      if (!document) {
        issues.push({
          code: 'broken_document_reference',
          severity: 'error',
          entityType: 'work_package',
          entityId: workPackage.id,
          message: `Work package ${workPackage.id} references missing document ${source.documentId}.`,
        });
      } else if (document.status !== 'active') {
        issues.push({
          code: 'inactive_source_reference',
          severity: document.status === 'withdrawn' ? 'error' : 'warning',
          entityType: 'work_package',
          entityId: workPackage.id,
          message: `Work package ${workPackage.id} cites ${document.status} document ${source.documentId}.`,
        });
      }
    }

    if (workPackage.status === 'blocked') {
      issues.push({
        code: 'work_package_blocked',
        severity: 'error',
        entityType: 'work_package',
        entityId: workPackage.id,
        message: `Work package ${workPackage.id} is blocked.`,
      });
    } else if (workPackage.status !== 'reviewed') {
      issues.push({
        code: 'work_package_not_reviewed',
        severity: 'warning',
        entityType: 'work_package',
        entityId: workPackage.id,
        message: `Work package ${workPackage.id} has not been reviewed.`,
      });
    }

    if (workPackage.status === 'reviewed' && workPackage.sourceRefs.length === 0) {
      issues.push({
        code: 'reviewed_work_package_missing_source',
        severity: 'error',
        entityType: 'work_package',
        entityId: workPackage.id,
        message: `Reviewed work package ${workPackage.id} has no registered source reference.`,
      });
    }
    if (workPackage.status === 'reviewed' && workPackage.hseControls.length === 0) {
      issues.push({
        code: 'hse_controls_missing',
        severity: 'error',
        entityType: 'work_package',
        entityId: workPackage.id,
        message: `Reviewed work package ${workPackage.id} has no HSE control.`,
      });
    }
    if (workPackage.status === 'reviewed' && workPackage.environmentalControls.length === 0) {
      issues.push({
        code: 'environmental_controls_missing',
        severity: 'error',
        entityType: 'work_package',
        entityId: workPackage.id,
        message: `Reviewed work package ${workPackage.id} has no environmental control.`,
      });
    }
    if (workPackage.status === 'reviewed' && workPackage.interfaces.length === 0) {
      issues.push({
        code: 'interfaces_missing',
        severity: 'error',
        entityType: 'work_package',
        entityId: workPackage.id,
        message: `Reviewed work package ${workPackage.id} has no interface control.`,
      });
    }
    if (workPackage.status === 'reviewed' && workPackage.constraints.length === 0) {
      issues.push({
        code: 'constraints_missing',
        severity: 'error',
        entityType: 'work_package',
        entityId: workPackage.id,
        message: `Reviewed work package ${workPackage.id} has no stated constraint.`,
      });
    }
    for (const resourceNeed of workPackage.resourceNeeds) {
      if (resourceNeed.status === 'unverified') {
        issues.push({
          code: 'resource_need_unverified',
          severity: 'warning',
          entityType: 'work_package',
          entityId: workPackage.id,
          message: `Work package ${workPackage.id} contains an unverified ${resourceNeed.resourceClass} need.`,
        });
      }
    }
  }

  for (const boqItemId of boqItemIds) {
    const owners = workPackagesByBoqItem.get(boqItemId) ?? [];
    if (owners.length === 0) {
      issues.push({
        code: 'boq_work_package_missing',
        severity: 'error',
        entityType: 'boq_item',
        entityId: boqItemId,
        message: `BOQ item ${boqItemId} has no execution work package.`,
      });
    } else if (owners.length > 1) {
      issues.push({
        code: 'boq_item_multiple_work_packages',
        severity: 'error',
        entityType: 'boq_item',
        entityId: boqItemId,
        message: `BOQ item ${boqItemId} is assigned to multiple primary work packages: ${owners.join(', ')}.`,
      });
    }
  }

  const readiness = issues.some((issue) => issue.severity === 'error')
    ? 'not_ready'
    : issues.length > 0
      ? 'needs_review'
      : 'ready';

  return {
    schemaVersion: 1,
    capability: 'execution_plan',
    projectId: workspace.project.id,
    coreRevision: workspace.revision,
    generatedAt,
    readiness,
    summary: {
      workPackages: data.workPackages.length,
      reviewedWorkPackages: data.workPackages.filter((workPackage) => workPackage.status === 'reviewed').length,
      blockedWorkPackages: data.workPackages.filter((workPackage) => workPackage.status === 'blocked').length,
      boqItems: parsedBoqData.items.length,
      coveredBoqItems: parsedBoqData.items.filter((item) => (workPackagesByBoqItem.get(item.id)?.length ?? 0) === 1).length,
      unverifiedResourceNeeds: data.workPackages.reduce(
        (sum, workPackage) => sum + workPackage.resourceNeeds.filter((need) => need.status === 'unverified').length,
        0,
      ),
    },
    issues,
  };
}
