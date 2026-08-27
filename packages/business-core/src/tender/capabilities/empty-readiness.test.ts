import { describe, expect, test } from 'bun:test';
import type { TenderWorkspace } from '../types.ts';
import { auditTenderDocumentAnalysis } from './document-analysis/audit.ts';
import { auditTenderBoqReconciliation } from './boq/audit.ts';
import { auditTenderBoqFiveStepPricing } from './boq-pricing/audit.ts';

const EMPTY_WORKSPACE: TenderWorkspace = {
  schemaVersion: 1,
  revision: 1,
  project: { id: 'empty-tender', title: 'Empty tender', status: 'active', currency: 'ZAR' },
  documents: [],
  requirements: [],
  criteria: [],
  deliverables: [],
  responses: [],
};

describe('tender capability empty-pack readiness', () => {
  test('rejects an empty document analysis pack', () => {
    const audit = auditTenderDocumentAnalysis(EMPTY_WORKSPACE, { sections: [] });

    expect(audit.readiness).toBe('not_ready');
    expect(audit.issues.map((issue) => issue.code)).toContain('document_analysis_empty');
  });

  test('rejects an empty BOQ reconciliation pack', () => {
    const audit = auditTenderBoqReconciliation(EMPTY_WORKSPACE, { items: [], scopeLinks: [] });

    expect(audit.readiness).toBe('not_ready');
    expect(audit.issues.map((issue) => issue.code)).toContain('boq_items_empty');
  });

  test('rejects an empty BOQ five-step pricing pack', () => {
    const audit = auditTenderBoqFiveStepPricing(
      EMPTY_WORKSPACE,
      { items: [], scopeLinks: [] },
      {
        currency: 'ZAR',
        pricingStatus: 'reviewed',
        itemBuildUps: [],
        resourceSummary: [],
        assumptions: [],
      },
    );

    expect(audit.readiness).toBe('not_ready');
    expect(audit.issues.map((issue) => issue.code)).toContain('boq_pricing_items_empty');
  });
});
