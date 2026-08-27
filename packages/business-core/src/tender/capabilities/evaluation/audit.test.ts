import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

function fixture(name: 'complete' | 'incomplete') {
  return JSON.parse(readFileSync(join(import.meta.dir, 'fixtures', `${name}.json`), 'utf8'));
}

function workspace() {
  return {
    schemaVersion: 1,
    revision: 4,
    project: { id: 'n3-upgrade', title: 'N3 Upgrade', status: 'active' },
    documents: [
      { id: 'tender-data', name: 'Tender Data', path: 'C:/tender/data.pdf', kind: 'tender_data', status: 'active' },
    ],
    requirements: [
      {
        id: 'req-method',
        title: 'Technical methodology',
        text: 'Submit the project methodology.',
        type: 'evaluated',
        criticality: 'high',
        source: { documentId: 'tender-data', page: 12 },
        evidenceNeeded: ['Relevant project record'],
        status: 'planned',
      },
      {
        id: 'req-safety',
        title: 'Safety threshold',
        text: 'Meet the minimum safety threshold.',
        type: 'mandatory',
        criticality: 'critical',
        source: { documentId: 'tender-data', page: 13 },
        evidenceNeeded: ['Safety statistics'],
        status: 'planned',
      },
    ],
    criteria: [
      {
        id: 'criterion-method',
        title: 'Methodology quality',
        method: 'weighted',
        weight: 20,
        requirementIds: ['req-method'],
        source: { documentId: 'tender-data', page: 12 },
        evidenceNeeded: ['Method statement'],
        status: 'planned',
      },
      {
        id: 'criterion-safety',
        title: 'Safety compliance',
        method: 'pass_fail',
        requirementIds: ['req-safety'],
        source: { documentId: 'tender-data', page: 13 },
        evidenceNeeded: ['Safety statistics'],
        status: 'planned',
      },
    ],
    deliverables: [],
    responses: [],
  };
}

function completeStrategyData() {
  return {
    strategies: [
      {
        criterionId: 'criterion-method',
        priority: 'high',
        targetScore: 17,
        responseOwner: 'Technical Manager',
        responseTheme: 'A buildable methodology with verified controls.',
        evidencePlan: ['Cite the approved method statement and relevant experience.'],
        evidenceRefs: [{ documentId: 'tender-data', page: 12 }],
        evidenceArtifactPaths: [],
        differentiators: ['Verified comparable-project evidence'],
        risks: ['Method statement approval remains pending'],
        status: 'reviewed',
      },
      {
        criterionId: 'criterion-safety',
        priority: 'must_pass',
        responseOwner: 'HSE Manager',
        responseTheme: 'Demonstrate the stated threshold with current evidence.',
        evidencePlan: ['Cite current safety statistics.'],
        evidenceRefs: [{ documentId: 'tender-data', page: 13 }],
        evidenceArtifactPaths: [],
        differentiators: [],
        risks: [],
        status: 'reviewed',
      },
    ],
  };
}

describe('tender evaluation strategy capability', () => {
  test('reports ready when every criterion has a reviewed, evidenced strategy', async () => {
    const tender = await import('../../index.ts') as Record<string, unknown>;
    expect(typeof tender.parseTenderEvaluationStrategyData).toBe('function');
    expect(typeof tender.auditTenderEvaluationStrategy).toBe('function');

    const complete = fixture('complete');
    const data = (tender.parseTenderEvaluationStrategyData as (value: unknown) => unknown)(complete.data);
    const audit = (tender.auditTenderEvaluationStrategy as (
      workspace: unknown,
      data: unknown,
      generatedAt: string,
    ) => any)(complete.workspace, data, '2026-07-12T10:00:00.000Z');

    expect(audit.readiness).toBe('ready');
    expect(audit.issues).toEqual([]);
    expect(audit.summary.coveredCriteria).toBe(2);
    expect(audit.summary.reviewedCriteria).toBe(2);
  });

  test('blocks missing criteria and invalid target scores', async () => {
    const tender = await import('../../index.ts') as Record<string, unknown>;
    expect(typeof tender.auditTenderEvaluationStrategy).toBe('function');

    const incomplete = fixture('incomplete');
    const audit = (tender.auditTenderEvaluationStrategy as (
      workspace: unknown,
      data: unknown,
      generatedAt: string,
    ) => any)(incomplete.workspace, incomplete.data, '2026-07-12T10:00:00.000Z');
    const codes = audit.issues.map((issue: { code: string }) => issue.code);

    expect(audit.readiness).toBe('not_ready');
    expect(codes).toContain('criterion_strategy_missing');
    expect(codes).toContain('target_score_exceeds_weight');
  });

  test('rejects a target score on a pass fail criterion and unregistered evidence', async () => {
    const tender = await import('../../index.ts') as Record<string, unknown>;
    expect(typeof tender.auditTenderEvaluationStrategy).toBe('function');

    const data = completeStrategyData();
    data.strategies[1] = {
      ...data.strategies[1],
      targetScore: 1,
      evidenceRefs: [{ documentId: 'unknown-document', page: 1 }],
    };
    const audit = (tender.auditTenderEvaluationStrategy as (
      workspace: unknown,
      data: unknown,
      generatedAt: string,
    ) => any)(workspace(), data, '2026-07-12T10:00:00.000Z');
    const codes = audit.issues.map((issue: { code: string }) => issue.code);

    expect(audit.readiness).toBe('not_ready');
    expect(codes).toContain('pass_fail_target_score_forbidden');
    expect(codes).toContain('broken_document_reference');
  });

  test('requires evidence before a strategy can be reviewed', async () => {
    const tender = await import('../../index.ts') as Record<string, unknown>;
    expect(typeof tender.auditTenderEvaluationStrategy).toBe('function');

    const data = completeStrategyData();
    data.strategies[0] = {
      ...data.strategies[0],
      evidenceRefs: [],
      evidenceArtifactPaths: [],
    };
    const audit = (tender.auditTenderEvaluationStrategy as (
      workspace: unknown,
      data: unknown,
      generatedAt: string,
    ) => any)(workspace(), data, '2026-07-12T10:00:00.000Z');

    expect(audit.readiness).toBe('not_ready');
    expect(audit.issues.map((issue: { code: string }) => issue.code)).toContain('reviewed_strategy_missing_evidence');
  });
});
