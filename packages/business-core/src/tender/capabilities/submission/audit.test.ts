import { describe, expect, test } from 'bun:test';

function workspace() {
  return {
    schemaVersion: 1,
    revision: 12,
    project: { id: 'n3-upgrade', title: 'N3 Upgrade', status: 'active' },
    documents: [
      { id: 'tender-data', name: 'Tender Data', path: 'C:/tender/data.pdf', kind: 'tender_data', status: 'active' },
    ],
    requirements: [
      {
        id: 'req-form',
        title: 'Signed returnable schedule',
        text: 'Submit the signed returnable schedule as PDF.',
        type: 'mandatory',
        criticality: 'critical',
        source: { documentId: 'tender-data', page: 4 },
        evidenceNeeded: ['signed form'],
        status: 'compliant',
      },
    ],
    criteria: [],
    deliverables: [
      {
        id: 'returnable-form',
        title: 'Returnable form',
        format: 'pdf',
        templatePath: 'C:/tender/template.docx',
        requirementIds: ['req-form'],
        status: 'ready',
      },
    ],
    responses: [
      {
        id: 'response-form',
        title: 'Returnable form response',
        requirementIds: ['req-form'],
        criterionIds: [],
        deliverableId: 'returnable-form',
        evidenceRefs: [{ documentId: 'tender-data', page: 4 }],
        status: 'verified',
      },
    ],
  };
}

function capabilityIndex() {
  return {
    schemaVersion: 1,
    projectId: 'n3-upgrade',
    coreRevision: 12,
    capabilities: [
      {
        capability: 'evaluation_strategy',
        enabled: true,
        required: true,
        revision: 2,
        readiness: 'ready',
        issueCount: 0,
        stale: false,
        updatedAt: '2026-07-12T16:00:00.000Z',
      },
    ],
  };
}

function completeSubmission(): any {
  return {
    submissionStatus: 'reviewed',
    items: [
      {
        deliverableId: 'returnable-form',
        filePath: 'C:/outputs/returnable-form.pdf',
        format: 'pdf',
        templatePath: 'C:/tender/template.docx',
        signatureStatus: 'verified',
        dependencies: [],
        validationStatus: 'passed',
        evidenceRefs: [{ documentId: 'tender-data', page: 4 }],
        sha256: 'a'.repeat(64),
        checks: {
          filePresent: true,
          formatMatch: true,
          templateMatch: true,
          renderPassed: true,
          hashVerified: true,
        },
      },
    ],
    contradictions: [],
    redTeamFindings: [],
  };
}

describe('tender submission assembly and red-team audit capability', () => {
  test('reports ready only when the submission and required packs pass all gates', async () => {
    const tender = await import('../../index.ts') as Record<string, unknown>;
    expect(typeof tender.parseTenderSubmissionAuditData).toBe('function');
    expect(typeof tender.auditTenderSubmission).toBe('function');

    const data = (tender.parseTenderSubmissionAuditData as (value: unknown) => unknown)(completeSubmission());
    const audit = (tender.auditTenderSubmission as Function)(
      workspace(), capabilityIndex(), data, '2026-07-12T16:00:00.000Z',
    );

    expect(audit.readiness).toBe('ready');
    expect(audit.issues).toEqual([]);
    expect(audit.summary.requiredDeliverables).toBe(1);
    expect(audit.summary.passedSubmissionItems).toBe(1);
  });

  test('blocks missing, duplicate, and failed deliverable validation', async () => {
    const tender = await import('../../index.ts') as Record<string, unknown>;
    const missing = completeSubmission();
    missing.items = [];
    const missingAudit = (tender.auditTenderSubmission as Function)(workspace(), capabilityIndex(), missing);
    expect(missingAudit.issues.map((issue: { code: string }) => issue.code)).toContain('submission_item_missing');

    const duplicate = completeSubmission();
    duplicate.items.push(structuredClone(duplicate.items[0]));
    duplicate.items[0].checks.renderPassed = false;
    duplicate.items[0].validationStatus = 'failed';
    const duplicateAudit = (tender.auditTenderSubmission as Function)(workspace(), capabilityIndex(), duplicate);
    const codes = duplicateAudit.issues.map((issue: { code: string }) => issue.code);
    expect(codes).toContain('submission_item_duplicate');
    expect(codes).toContain('submission_validation_failed');
    expect(codes).toContain('submission_render_failed');
  });

  test('blocks stale required packs, broken cross-references, and unresolved contradictions', async () => {
    const tender = await import('../../index.ts') as Record<string, unknown>;
    const index = capabilityIndex();
    index.capabilities[0].stale = true;
    const data = completeSubmission();
    data.items[0].dependencies = ['missing-deliverable'];
    data.contradictions.push({
      id: 'conflict-1',
      deliverableIds: ['returnable-form'],
      requirementIds: ['req-form'],
      summary: 'Signature date conflicts with the cover letter.',
      status: 'open',
    });

    const audit = (tender.auditTenderSubmission as Function)(workspace(), index, data);
    const codes = audit.issues.map((issue: { code: string }) => issue.code);
    expect(codes).toContain('required_capability_not_ready');
    expect(codes).toContain('submission_dependency_missing');
    expect(codes).toContain('submission_contradiction_open');
    expect(audit.readiness).toBe('not_ready');
  });

  test('keeps red-team findings outside formal narrative and blocks unresolved major findings', async () => {
    const tender = await import('../../index.ts') as Record<string, unknown>;
    const data = completeSubmission();
    data.redTeamFindings.push({
      id: 'finding-1',
      title: 'Unsigned annexure',
      severity: 'major',
      status: 'open',
      deliverableIds: ['returnable-form'],
      evidenceRefs: [{ documentId: 'tender-data', page: 4 }],
      insertedIntoFormalNarrative: true,
    });

    const audit = (tender.auditTenderSubmission as Function)(workspace(), capabilityIndex(), data);
    const codes = audit.issues.map((issue: { code: string }) => issue.code);
    expect(codes).toContain('red_team_finding_unresolved');
    expect(codes).toContain('red_team_finding_in_formal_narrative');
  });
});
