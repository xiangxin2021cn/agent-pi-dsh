import { describe, expect, test } from 'bun:test';
import type { TenderWorkspace } from '../../types.ts';
import { auditTenderBidderCommitments } from './audit.ts';
import {
  TENDER_BIDDER_COMMITMENT_CATEGORIES,
  type TenderBidderCommitmentsData,
} from './types.ts';

const workspace: TenderWorkspace = {
  schemaVersion: 1,
  revision: 2,
  project: { id: 'n3', title: 'N3 Tender', status: 'active' },
  documents: [],
  requirements: [],
  criteria: [],
  deliverables: [],
  responses: [],
};

const pricing = {
  currency: 'ZAR',
  pricingStatus: 'reviewed',
  itemBuildUps: [],
  resourceSummary: [],
  assumptions: [],
};

function completeData(): TenderBidderCommitmentsData {
  return {
    confirmation: {
      confirmed: true,
      confirmedBy: 'Bid Manager',
      confirmedAt: '2026-07-17T08:00:00.000Z',
      basisStatement: 'User-confirmed tender planning basis.',
    },
    commitments: TENDER_BIDDER_COMMITMENT_CATEGORIES.map((category) => ({
      id: `commitment-${category}`,
      category,
      subject: category,
      decision: `Confirmed ${category} basis.`,
      status: 'confirmed' as const,
      appliesToAllBoqItems: true,
      affectedBoqItemIds: [],
      inputReference: 'User statement in bidder commitments stage',
      sourceRefs: [],
    })),
    openItems: [],
  };
}

describe('tender bidder commitments audit', () => {
  test('passes a complete user-confirmed planning basis', () => {
    const audit = auditTenderBidderCommitments(workspace, pricing, completeData());

    expect(audit.readiness).toBe('ready');
    expect(audit.summary.missingCategories).toBe(0);
  });

  test('rejects missing user confirmation and planning categories', () => {
    const data = completeData();
    data.confirmation.confirmed = false;
    data.commitments = data.commitments.filter((item) => item.category !== 'subcontracting');

    const audit = auditTenderBidderCommitments(workspace, pricing, data);
    const codes = audit.issues.map((issue) => issue.code);

    expect(audit.readiness).toBe('not_ready');
    expect(codes).toContain('bidder_commitments_not_user_confirmed');
    expect(codes).toContain('bidder_commitment_category_missing');
  });

  test('keeps unresolved user decisions from becoming planning-ready', () => {
    const data = completeData();
    data.openItems = ['Confirm owned plant transfer date.'];

    const audit = auditTenderBidderCommitments(workspace, pricing, data);

    expect(audit.readiness).toBe('needs_review');
    expect(audit.issues.map((issue) => issue.code)).toContain('bidder_commitment_open_item');
  });
});
