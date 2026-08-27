import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { getTenderCapabilityDependencies, isTenderCapabilityStale } from './index.ts';
import type { TenderCapabilityEnvelope, TenderCapabilityId } from './types.ts';

function fixture(name: 'complete-project' | 'incomplete-project' | 'stale-project'): any {
  return JSON.parse(readFileSync(join(import.meta.dir, 'fixtures', name, 'expectations.json'), 'utf8'));
}

describe('V2.2 tender project regression gate', () => {
  test('keeps all tender packs inside the tender business domain', () => {
    const complete = fixture('complete-project');
    const expected: TenderCapabilityId[] = [
      'document_analysis', 'evaluation_strategy', 'boq_reconciliation',
      'boq_five_step_pricing', 'bidder_commitments', 'execution_plan', 'schedule_resources',
      'cost_cashflow', 'submission_documents', 'submission_audit',
    ];

    expect(complete.requiredCapabilities).toEqual(expected);
    expect(complete.forbiddenBusinessDomains).toEqual(['delivery', 'investment']);
    for (const capability of expected) {
      expect(getTenderCapabilityDependencies(capability, expected)[0]).toBe('core');
    }
  });

  test('records the stable blocking cases covered by the pack audit suites', () => {
    const incomplete = fixture('incomplete-project');
    expect(incomplete.expectedReadiness).toBe('not_ready');
    expect(incomplete.expectedIssueCodes).toEqual(expect.arrayContaining([
      'evaluation_criterion_uncovered',
      'scope_support_missing',
      'activity_logic_cycle',
      'project_currency_mismatch',
      'submission_signature_missing',
      'submission_format_mismatch',
    ]));
    expect(incomplete.unverifiedConclusionPolicy).toBe('conditional_only');
  });

  test('propagates a core/addendum revision change as stale capability state', () => {
    const stale = fixture('stale-project');
    const envelope: TenderCapabilityEnvelope = {
      schemaVersion: 1,
      capability: 'boq_reconciliation',
      projectId: stale.projectId,
      revision: 2,
      coreRevision: 4,
      upstream: [
        { capability: 'core', revision: 4 },
        { capability: 'document_analysis', revision: 1 },
      ],
      updatedAt: '2026-07-12T17:00:00.000Z',
      data: {},
    };

    expect(isTenderCapabilityStale(envelope, 5, { document_analysis: 1 })).toBe(true);
    expect(stale.expectedStaleCapabilities).toContain('submission_audit');
  });
});
