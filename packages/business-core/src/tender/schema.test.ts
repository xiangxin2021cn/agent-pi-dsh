import { describe, expect, test } from 'bun:test';
import { parseTenderWorkspace } from './schema.ts';

function validWorkspace(): unknown {
  return {
    schemaVersion: 1,
    revision: 1,
    project: {
      id: 'n3-upgrade',
      title: 'N3 Upgrade Tender',
      reference: 'NRA-N003-001',
      currency: 'ZAR',
      closingAt: '2026-08-31T11:00:00+02:00',
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
        status: 'open',
      },
    ],
    criteria: [
      {
        id: 'crit-methodology',
        title: 'Construction methodology',
        method: 'weighted',
        weight: 30,
        requirementIds: ['req-site-visit'],
        source: { documentId: 'book-1', page: 18, section: 'Functionality' },
        evidenceNeeded: ['Project methodology'],
        status: 'open',
      },
    ],
    deliverables: [
      {
        id: 'del-technical',
        title: 'Technical proposal',
        format: 'pdf',
        requirementIds: ['req-site-visit'],
        status: 'planned',
      },
    ],
    responses: [
      {
        id: 'resp-methodology',
        title: 'Methodology response',
        requirementIds: ['req-site-visit'],
        criterionIds: ['crit-methodology'],
        deliverableId: 'del-technical',
        responseSection: '4. Construction Methodology',
        evidenceRefs: [{ documentId: 'book-1', page: 18 }],
        status: 'planned',
      },
    ],
  };
}

describe('TenderWorkspaceSchema', () => {
  test('accepts a versioned tender workspace with exact source locators', () => {
    const parsed = parseTenderWorkspace(validWorkspace());
    expect(parsed.schemaVersion).toBe(1);
    expect(parsed.requirements[0]?.source.clause).toBe('C.2.7');
    expect(parsed.criteria[0]?.weight).toBe(30);
  });

  test('rejects malformed entity ids', () => {
    const input = validWorkspace() as any;
    input.requirements[0].id = '../escape';
    expect(() => parseTenderWorkspace(input)).toThrow();
  });

  test('rejects duplicate ids within an entity collection', () => {
    const input = validWorkspace() as any;
    input.documents.push({ ...input.documents[0] });
    expect(() => parseTenderWorkspace(input)).toThrow(/duplicate/i);
  });

  test('rejects malformed project dates', () => {
    const input = validWorkspace() as any;
    input.project.closingAt = 'next Thursday';
    expect(() => parseTenderWorkspace(input)).toThrow();
  });

  test('rejects weights outside zero to one hundred', () => {
    const input = validWorkspace() as any;
    input.criteria[0].weight = 120;
    expect(() => parseTenderWorkspace(input)).toThrow();
  });

  test('requires every source locator to name a registered document id later in audit', () => {
    const input = validWorkspace() as any;
    delete input.requirements[0].source.documentId;
    expect(() => parseTenderWorkspace(input)).toThrow();
  });
});
