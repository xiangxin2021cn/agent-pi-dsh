import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { auditTenderWorkspace } from './audit.ts';
import { parseTenderWorkspace } from './schema.ts';

function fixture(name: string) {
  const value = JSON.parse(readFileSync(join(import.meta.dir, 'fixtures', name), 'utf8'));
  return parseTenderWorkspace(value);
}

describe('Tender Intelligence regression fixtures', () => {
  test('complete synthetic tender is deterministically ready', () => {
    const workspace = fixture('complete-tender.json');
    const first = auditTenderWorkspace(workspace, '2026-07-12T09:00:00.000Z');
    const second = auditTenderWorkspace(workspace, '2026-07-12T09:00:00.000Z');

    expect(first).toEqual(second);
    expect(first.readiness).toBe('ready');
    expect(first.summary.coveredMandatoryRequirements).toBe(first.summary.mandatoryRequirements);
    expect(first.summary.coveredCriteriaWeight).toBe(first.summary.weightedCriteriaWeight);
  });

  test('incomplete synthetic tender exposes stable blocking issue codes', () => {
    const workspace = fixture('incomplete-tender.json');
    const audit = auditTenderWorkspace(workspace, '2026-07-12T09:00:00.000Z');
    const codes = audit.issues.map((issue) => issue.code);

    expect(audit.readiness).toBe('not_ready');
    expect(codes).toContain('mandatory_requirement_uncovered');
    expect(codes).toContain('evaluation_criterion_uncovered');
    expect(codes).toContain('deliverable_unlinked');
  });
});
