import { describe, expect, test } from 'bun:test';
import type { TenderWorkspace } from './types.ts';
import { auditTenderWorkspace } from './audit.ts';

function readyWorkspace(): TenderWorkspace {
  return {
    schemaVersion: 1,
    revision: 4,
    project: {
      id: 'n3-upgrade',
      title: 'N3 Upgrade Tender',
      status: 'active',
    },
    documents: [
      {
        id: 'book-1',
        name: 'Tender Book 1',
        path: 'C:/tender/Book 1.pdf',
        kind: 'tender_data',
        status: 'active',
      },
    ],
    requirements: [
      {
        id: 'req-site-visit',
        title: 'Compulsory site visit',
        text: 'Attend the compulsory site clarification meeting.',
        type: 'mandatory',
        criticality: 'critical',
        source: { documentId: 'book-1', page: 12, clause: 'C.2.7' },
        evidenceNeeded: ['Signed attendance certificate'],
        status: 'compliant',
      },
    ],
    criteria: [
      {
        id: 'crit-methodology',
        title: 'Construction methodology',
        method: 'weighted',
        weight: 30,
        requirementIds: ['req-site-visit'],
        source: { documentId: 'book-1', page: 18 },
        evidenceNeeded: ['Project methodology'],
        status: 'verified',
      },
    ],
    deliverables: [
      {
        id: 'del-technical',
        title: 'Technical proposal',
        format: 'pdf',
        requirementIds: ['req-site-visit'],
        status: 'ready',
      },
    ],
    responses: [
      {
        id: 'resp-methodology',
        title: 'Methodology response',
        requirementIds: ['req-site-visit'],
        criterionIds: ['crit-methodology'],
        deliverableId: 'del-technical',
        evidenceRefs: [{ documentId: 'book-1', page: 18 }],
        evidenceArtifacts: ['evidence/site-visit-certificate.pdf'],
        status: 'verified',
      },
    ],
  };
}

function issueCodes(workspace: TenderWorkspace): string[] {
  return auditTenderWorkspace(workspace, '2026-07-12T09:00:00.000Z').issues.map((issue) => issue.code);
}

describe('auditTenderWorkspace', () => {
  test('does not report an empty initialized workspace as ready', () => {
    const workspace = readyWorkspace();
    workspace.documents = [];
    workspace.requirements = [];
    workspace.criteria = [];
    workspace.deliverables = [];
    workspace.responses = [];

    const audit = auditTenderWorkspace(workspace, '2026-07-12T09:00:00.000Z');
    expect(audit.readiness).toBe('not_ready');
    expect(audit.issues.map((issue) => issue.code)).toContain('no_source_documents');
    expect(audit.issues.map((issue) => issue.code)).toContain('no_requirements_registered');
  });

  test('marks a complete, referenced workspace ready', () => {
    const audit = auditTenderWorkspace(readyWorkspace(), '2026-07-12T09:00:00.000Z');

    expect(audit.readiness).toBe('ready');
    expect(audit.issues).toEqual([]);
    expect(audit.summary.coveredMandatoryRequirements).toBe(1);
    expect(audit.summary.coveredCriteriaWeight).toBe(30);
  });

  test('rejects broken requirement, criterion, and deliverable references', () => {
    const workspace = readyWorkspace();
    workspace.criteria[0]!.requirementIds = ['req-missing'];
    workspace.deliverables[0]!.requirementIds = ['req-missing'];
    workspace.responses[0]!.criterionIds = ['crit-missing'];
    workspace.responses[0]!.deliverableId = 'del-missing';

    const audit = auditTenderWorkspace(workspace, '2026-07-12T09:00:00.000Z');
    expect(audit.readiness).toBe('not_ready');
    expect(issueCodes(workspace)).toContain('broken_entity_reference');
  });

  test('does not accept uncovered mandatory requirements or evaluation criteria', () => {
    const workspace = readyWorkspace();
    workspace.responses = [];

    const audit = auditTenderWorkspace(workspace, '2026-07-12T09:00:00.000Z');
    expect(audit.readiness).toBe('not_ready');
    expect(audit.issues.map((issue) => issue.code)).toContain('mandatory_requirement_uncovered');
    expect(audit.issues.map((issue) => issue.code)).toContain('evaluation_criterion_uncovered');
  });

  test('requires a deliverable or explicit acceptance for non-document responses', () => {
    const unresolved = readyWorkspace();
    delete unresolved.responses[0]!.deliverableId;
    expect(issueCodes(unresolved)).toContain('response_delivery_unresolved');
    expect(auditTenderWorkspace(unresolved).readiness).toBe('not_ready');

    const accepted = readyWorkspace();
    delete accepted.responses[0]!.deliverableId;
    accepted.responses[0]!.nonDocumentResponseAccepted = true;
    expect(auditTenderWorkspace(accepted).readiness).toBe('ready');
  });

  test('requires evidence for responses marked verified', () => {
    const workspace = readyWorkspace();
    workspace.responses[0]!.evidenceRefs = [];
    workspace.responses[0]!.evidenceArtifacts = [];

    const audit = auditTenderWorkspace(workspace, '2026-07-12T09:00:00.000Z');
    expect(audit.readiness).toBe('not_ready');
    expect(audit.issues.map((issue) => issue.code)).toContain('verified_response_missing_evidence');
  });

  test('flags citations to superseded documents for review', () => {
    const workspace = readyWorkspace();
    workspace.documents[0]!.status = 'superseded';

    const audit = auditTenderWorkspace(workspace, '2026-07-12T09:00:00.000Z');
    expect(audit.readiness).toBe('needs_review');
    expect(audit.issues.map((issue) => issue.code)).toContain('superseded_source_reference');
  });

  test('flags unlinked deliverables without hiding stronger failures', () => {
    const workspace = readyWorkspace();
    workspace.deliverables[0]!.requirementIds = [];

    const audit = auditTenderWorkspace(workspace, '2026-07-12T09:00:00.000Z');
    expect(audit.readiness).toBe('needs_review');
    expect(audit.issues.map((issue) => issue.code)).toContain('deliverable_unlinked');
  });
});
