import type { TenderDocumentKind, TenderSourceLocator, TenderWorkspace } from '../../types.ts';
import type { TenderCapabilityAuditIssue } from '../types.ts';
import { boqPricingIneligibilityReason } from './pricing-eligibility.ts';
import { parseTenderBoqReconciliationData } from './schema.ts';
import type {
  TenderBoqReconciliationAudit,
  TenderBoqReconciliationData,
} from './types.ts';

export function auditTenderBoqReconciliation(
  workspace: TenderWorkspace,
  value: TenderBoqReconciliationData | unknown,
  generatedAt = new Date().toISOString(),
): TenderBoqReconciliationAudit {
  const data = parseTenderBoqReconciliationData(value);
  const issues: TenderCapabilityAuditIssue[] = [];
  const documentById = new Map(workspace.documents.map((document) => [document.id, document]));
  const requirementIds = new Set(workspace.requirements.map((requirement) => requirement.id));
  const itemById = new Map(data.items.map((item) => [item.id, item]));
  const scopeLinkByItemId = new Map(data.scopeLinks.map((link) => [link.boqItemId, link]));

  if (data.items.length === 0) {
    issues.push({
      code: 'boq_items_empty',
      severity: 'error',
      entityType: 'boq_reconciliation',
      message: 'BOQ reconciliation requires at least one registered BOQ item.',
    });
  }

  const inspectReference = (
    source: TenderSourceLocator,
    entityId: string,
    expectedKinds?: TenderDocumentKind[],
  ): void => {
    const document = documentById.get(source.documentId);
    if (!document) {
      issues.push({
        code: 'broken_document_reference',
        severity: 'error',
        entityType: 'boq_scope_link',
        entityId,
        message: `Source document ${source.documentId} is not registered.`,
      });
      return;
    }
    if (expectedKinds && !expectedKinds.includes(document.kind)) {
      issues.push({
        code: 'source_kind_mismatch',
        severity: 'error',
        entityType: 'boq_scope_link',
        entityId,
        message: `Source document ${source.documentId} has kind ${document.kind}; expected ${expectedKinds.join(' or ')}.`,
      });
    }
    if (document.status !== 'active') {
      issues.push({
        code: 'inactive_source_reference',
        severity: document.status === 'withdrawn' ? 'error' : 'warning',
        entityType: 'boq_scope_link',
        entityId,
        message: `Source document ${source.documentId} is ${document.status}.`,
      });
    }
  };

  const locationOwners = new Map<string, string>();
  const unitByCode = new Map<string, string>();
  for (const item of data.items) {
    inspectReference(item.source, item.id, ['boq']);
    if (!item.source.sheet || !item.source.cell) {
      issues.push({
        code: 'boq_location_imprecise',
        severity: 'error',
        entityType: 'boq_item',
        entityId: item.id,
        message: `BOQ item ${item.id} requires an exact sheet and cell or range.`,
      });
    } else {
      const location = `${item.source.documentId}:${item.source.sheet}:${item.source.cell}`;
      const existingItemId = locationOwners.get(location);
      if (existingItemId) {
        issues.push({
          code: 'duplicate_boq_location',
          severity: 'error',
          entityType: 'boq_item',
          entityId: item.id,
          message: `BOQ items ${existingItemId} and ${item.id} share source location ${location}.`,
        });
      }
      locationOwners.set(location, item.id);
    }

    const existingUnit = unitByCode.get(item.code);
    if (existingUnit && existingUnit !== item.unit) {
      issues.push({
        code: 'boq_unit_conflict',
        severity: 'error',
        entityType: 'boq_item',
        entityId: item.id,
        message: `BOQ code ${item.code} uses both ${existingUnit} and ${item.unit}.`,
      });
    }
    unitByCode.set(item.code, item.unit);

    if (item.quantityStatus === 'unverified') {
      issues.push({
        code: 'quantity_unverified',
        severity: 'warning',
        entityType: 'boq_item',
        entityId: item.id,
        message: `Quantity for ${item.id} remains unverified.`,
      });
    }
    if (item.quantityBasis === 'calculated' && item.quantityStatus === 'verified' && item.quantityRefs.length === 0) {
      issues.push({
        code: 'verified_quantity_missing_evidence',
        severity: 'error',
        entityType: 'boq_item',
        entityId: item.id,
        message: `Verified calculated quantity for ${item.id} has no source reference.`,
      });
    }
    for (const source of item.quantityRefs) inspectReference(source, item.id);

    const ineligibility = boqPricingIneligibilityReason(item);
    if (ineligibility) {
      issues.push({
        code: 'boq_item_not_pricable',
        severity: 'warning',
        entityType: 'boq_item',
        entityId: item.id,
        message: `BOQ item ${item.id} is excluded from pricing batches: ${ineligibility}.`,
      });
    }

    if (!scopeLinkByItemId.has(item.id) && !ineligibility) {
      issues.push({
        code: 'boq_scope_link_missing',
        severity: 'error',
        entityType: 'boq_item',
        entityId: item.id,
        message: `BOQ item ${item.id} has no scope reconciliation link.`,
      });
    }
  }

  for (const link of data.scopeLinks) {
    if (!itemById.has(link.boqItemId)) {
      issues.push({
        code: 'unknown_boq_scope_link',
        severity: 'error',
        entityType: 'boq_scope_link',
        entityId: link.boqItemId,
        message: `Scope link references missing BOQ item ${link.boqItemId}.`,
      });
      continue;
    }
    for (const requirementId of link.requirementIds) {
      if (!requirementIds.has(requirementId)) {
        issues.push({
          code: 'broken_requirement_reference',
          severity: 'error',
          entityType: 'boq_scope_link',
          entityId: link.boqItemId,
          message: `Scope link references missing requirement ${requirementId}.`,
        });
      }
    }
    for (const source of link.specificationRefs) {
      inspectReference(source, link.boqItemId, ['specification', 'scope', 'contract_data', 'addendum']);
    }
    for (const source of link.drawingRefs) {
      inspectReference(source, link.boqItemId, ['drawing', 'addendum']);
    }
    for (const source of link.measurementRuleRefs) {
      inspectReference(source, link.boqItemId, ['specification', 'tender_data', 'contract_data', 'addendum']);
    }

    const supportCount = link.specificationRefs.length + link.drawingRefs.length + link.measurementRuleRefs.length;
    if (supportCount === 0 && link.gapStatus === 'clear') {
      issues.push({
        code: 'scope_support_missing',
        severity: 'error',
        entityType: 'boq_scope_link',
        entityId: link.boqItemId,
        message: `BOQ item ${link.boqItemId} is marked clear without specification, drawing, or measurement support.`,
      });
    }
    if (link.gapStatus === 'needs_review') {
      issues.push({
        code: 'scope_gap_needs_review',
        severity: 'warning',
        entityType: 'boq_scope_link',
        entityId: link.boqItemId,
        message: `BOQ item ${link.boqItemId} has an unresolved scope gap.`,
      });
    } else if (link.gapStatus === 'blocked') {
      issues.push({
        code: 'scope_gap_blocked',
        severity: 'error',
        entityType: 'boq_scope_link',
        entityId: link.boqItemId,
        message: `BOQ item ${link.boqItemId} has a blocking scope gap.`,
      });
    }

    for (const assumption of link.assumptions) {
      if (assumption.status === 'unverified') {
        issues.push({
          code: 'scope_assumption_unverified',
          severity: 'warning',
          entityType: 'boq_scope_link',
          entityId: link.boqItemId,
          message: `BOQ item ${link.boqItemId} contains an unverified scope assumption.`,
        });
      } else if (assumption.status === 'rejected') {
        issues.push({
          code: 'scope_assumption_rejected',
          severity: 'error',
          entityType: 'boq_scope_link',
          entityId: link.boqItemId,
          message: `BOQ item ${link.boqItemId} still contains a rejected scope assumption.`,
        });
      }
      for (const source of assumption.sourceRefs) inspectReference(source, link.boqItemId);
    }
  }

  const readiness = issues.some((issue) => issue.severity === 'error')
    ? 'not_ready'
    : issues.length > 0
      ? 'needs_review'
      : 'ready';

  return {
    schemaVersion: 1,
    capability: 'boq_reconciliation',
    projectId: workspace.project.id,
    coreRevision: workspace.revision,
    generatedAt,
    readiness,
    summary: {
      items: data.items.length,
      linkedItems: data.items.filter((item) => scopeLinkByItemId.has(item.id)).length,
      clearItems: data.scopeLinks.filter((link) => link.gapStatus === 'clear').length,
      reviewGaps: data.scopeLinks.filter((link) => link.gapStatus === 'needs_review').length,
      blockedGaps: data.scopeLinks.filter((link) => link.gapStatus === 'blocked').length,
      unverifiedQuantities: data.items.filter((item) => item.quantityStatus === 'unverified').length,
      unverifiedAssumptions: data.scopeLinks.reduce(
        (sum, link) => sum + link.assumptions.filter((assumption) => assumption.status === 'unverified').length,
        0,
      ),
    },
    issues,
  };
}
