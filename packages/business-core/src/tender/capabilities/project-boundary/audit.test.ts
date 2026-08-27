import { describe, expect, test } from 'bun:test';
import { auditTenderProjectBoundary } from './audit.ts';
import { parseTenderProjectBoundaryPack } from './schema.ts';
import {
  organizationOutlineMeetsMinimum,
  TENDER_PROJECT_BOUNDARY_OUTLINE_MIN_CHARS,
} from './types.ts';

const minimalPack = {
  schemaVersion: 1 as const,
  projectId: 'demo-project',
  profileId: 'generic-international',
  jurisdiction: { currency: 'USD', countryCode: 'NA' },
  standards: {
    technicalSpecs: [],
    measurementStandard: { id: 'employer-spec', title: 'Employer measurement rules' },
  },
  pricing: {
    pricingStandard: 'generic_direct_cost_v1',
    indirectCostPolicy: 'exclude_from_item_direct_cost',
    taxRegime: { vatTreatment: 'exclusive' },
    ratePolicy: {
      location: 'Windhoek',
      mustVerifyOnline: ['cement', 'diesel'],
      allowUnverifiedLabel: true as const,
    },
  },
  productivity: { basis: 'user_provided' as const, sources: [] },
  bidderResources: { outline: 'Own plant limited; major earthworks to be subcontracted.' },
  organizationOutline: {
    text: 'Establish site camps at km 12 and km 40; sequence earthworks ahead of pavement; '
      + 'protect school frontage traffic; use local borrow where EMP allows.',
  },
  readiness: 'needs_review' as const,
};

const workspace = {
  schemaVersion: 1 as const,
  revision: 1,
  project: {
    id: 'demo-project',
    name: 'Demo',
    currency: 'USD',
  },
  documents: [],
} as any;

describe('project_boundary capability', () => {
  test('parses a legacy pack without boundarySources', () => {
    const pack = parseTenderProjectBoundaryPack(minimalPack);
    expect(pack.pricing.pricingStandard).toBe('generic_direct_cost_v1');
    expect(pack.boundarySources).toEqual([]);
    expect(organizationOutlineMeetsMinimum(pack.organizationOutline.text)).toBe(true);
    const audit = auditTenderProjectBoundary(workspace, pack);
    expect(audit.issues.map((issue) => issue.code)).toContain('project_boundary_no_sources');
    expect(audit.summary.sourceCount).toBe(0);
  });

  test('rejects empty outline under soft-min helper and audit', () => {
    expect(organizationOutlineMeetsMinimum('short')).toBe(false);
    expect(TENDER_PROJECT_BOUNDARY_OUTLINE_MIN_CHARS).toBe(80);

    const audit = auditTenderProjectBoundary(workspace, {
      ...minimalPack,
      organizationOutline: { text: 'too short' },
    });
    expect(audit.readiness).toBe('not_ready');
    expect(audit.issues.map((issue) => issue.code)).toContain('project_boundary_outline_short');
  });

  test('marks draft with warnings when otherwise complete', () => {
    const audit = auditTenderProjectBoundary(workspace, {
      ...minimalPack,
      readiness: 'draft',
    });
    expect(audit.readiness).toBe('needs_review');
    expect(audit.issues.map((issue) => issue.code)).toContain('project_boundary_draft');
  });
});
