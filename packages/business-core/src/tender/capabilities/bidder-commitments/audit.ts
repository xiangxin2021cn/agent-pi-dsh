import type { TenderSourceLocator, TenderWorkspace } from '../../types.ts';
import { parseTenderBoqFiveStepPricingData } from '../boq-pricing/schema.ts';
import type { TenderCapabilityAuditIssue } from '../types.ts';
import { parseTenderBidderCommitmentsData } from './schema.ts';
import {
  TENDER_BIDDER_COMMITMENT_CATEGORIES,
  type TenderBidderCommitmentsAudit,
  type TenderBidderCommitmentsData,
} from './types.ts';

export function auditTenderBidderCommitments(
  workspace: TenderWorkspace,
  pricingValue: unknown,
  value: TenderBidderCommitmentsData | unknown,
  generatedAt = new Date().toISOString(),
): TenderBidderCommitmentsAudit {
  const pricing = parseTenderBoqFiveStepPricingData(pricingValue);
  const data = parseTenderBidderCommitmentsData(value);
  const issues: TenderCapabilityAuditIssue[] = [];
  const documentById = new Map(workspace.documents.map((document) => [document.id, document]));
  const boqItemIds = new Set(pricing.itemBuildUps.map((buildUp) => buildUp.boqItemId));
  const coveredCategories = new Set(data.commitments.map((commitment) => commitment.category));
  const missingCategories = TENDER_BIDDER_COMMITMENT_CATEGORIES.filter((category) => !coveredCategories.has(category));

  if (!data.confirmation.confirmed) {
    issues.push({
      code: 'bidder_commitments_not_user_confirmed',
      severity: 'error',
      entityType: 'bidder_commitments',
      message: 'Bidder commitments require explicit user confirmation before construction planning.',
    });
  }
  if (data.commitments.length === 0) {
    issues.push({
      code: 'bidder_commitments_empty',
      severity: 'error',
      entityType: 'bidder_commitments',
      message: 'Bidder commitments require an explicit decision for every planning category.',
    });
  }
  for (const category of missingCategories) {
    issues.push({
      code: 'bidder_commitment_category_missing',
      severity: 'error',
      entityType: 'bidder_commitment_category',
      entityId: category,
      message: `Bidder planning category ${category} has not been confirmed or marked not applicable.`,
    });
  }
  for (const openItem of data.openItems) {
    issues.push({
      code: 'bidder_commitment_open_item',
      severity: 'warning',
      entityType: 'bidder_commitment_open_item',
      message: `Bidder planning input remains open: ${openItem}`,
    });
  }

  for (const commitment of data.commitments) {
    for (const boqItemId of commitment.affectedBoqItemIds) {
      if (!boqItemIds.has(boqItemId)) {
        issues.push({
          code: 'bidder_commitment_boq_item_missing',
          severity: 'error',
          entityType: 'bidder_commitment',
          entityId: commitment.id,
          message: `Bidder commitment ${commitment.id} references missing priced BOQ item ${boqItemId}.`,
        });
      }
    }
    for (const source of commitment.sourceRefs) {
      inspectSource(documentById, source, issues, commitment.id);
    }
  }

  const readiness = issues.some((issue) => issue.severity === 'error')
    ? 'not_ready'
    : issues.length > 0
      ? 'needs_review'
      : 'ready';

  return {
    schemaVersion: 1,
    capability: 'bidder_commitments',
    projectId: workspace.project.id,
    coreRevision: workspace.revision,
    generatedAt,
    readiness,
    summary: {
      commitments: data.commitments.length,
      confirmedCommitments: data.commitments.filter((commitment) => commitment.status === 'confirmed').length,
      acceptedAssumptions: data.commitments.filter((commitment) => commitment.status === 'accepted_assumption').length,
      notApplicable: data.commitments.filter((commitment) => commitment.status === 'not_applicable').length,
      missingCategories: missingCategories.length,
      openItems: data.openItems.length,
    },
    issues,
  };
}

function inspectSource(
  documentById: Map<string, { status: string }>,
  source: TenderSourceLocator,
  issues: TenderCapabilityAuditIssue[],
  commitmentId: string,
): void {
  const document = documentById.get(source.documentId);
  if (!document) {
    issues.push({
      code: 'bidder_commitment_source_missing',
      severity: 'error',
      entityType: 'bidder_commitment',
      entityId: commitmentId,
      message: `Bidder commitment ${commitmentId} references missing document ${source.documentId}.`,
    });
  } else if (document.status !== 'active') {
    issues.push({
      code: 'bidder_commitment_source_inactive',
      severity: document.status === 'withdrawn' ? 'error' : 'warning',
      entityType: 'bidder_commitment',
      entityId: commitmentId,
      message: `Bidder commitment ${commitmentId} cites ${document.status} document ${source.documentId}.`,
    });
  }
}
