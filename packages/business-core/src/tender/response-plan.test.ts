import { describe, expect, test } from 'bun:test';
import { parseTenderWorkspace, tenderResponseSchemaHint } from './schema.ts';
import { auditTenderWorkspace } from './audit.ts';
import { tenderMaterialIssues } from './response-audit.ts';
import type { TenderResponseMaterial } from './response-plan.ts';

function fixture() {
  return parseTenderWorkspace({
    schemaVersion: 1, revision: 1, project: { id: 'road', title: 'Road tender', status: 'active' },
    documents: [{ id: 'source', name: 'Tender', path: 'tender.md', kind: 'tender_data', status: 'active' }],
    requirements: [{ id: 'traffic', title: 'Traffic', text: 'Keep traffic open', type: 'mandatory', criticality: 'critical', source: { documentId: 'source', page: 1 }, status: 'planned' }],
    criteria: [{ id: 'method', title: 'Method', method: 'weighted', weight: 10, requirementIds: ['traffic'], source: { documentId: 'source', page: 2 }, status: 'planned', rubric: { text: 'Assess traffic and drainage', points: [{ id: 'traffic', text: 'Traffic sequence' }, { id: 'drainage', text: 'Drainage sequence' }], bands: [{ id: 'good', label: 'Good', text: 'Both sequences are feasible', score: 10 }] } }],
    deliverables: [{ id: 'technical', title: 'Technical proposal', requirementIds: ['traffic'], status: 'planned' }],
    responses: [{ id: 'chapter', title: 'Construction', requirementIds: ['traffic'], criterionIds: ['method'], deliverableId: 'technical', status: 'planned', chapter: { id: 'method-chapter', title: 'Construction', generationMode: 'generate', requiredContent: ['Traffic sequence'], pointResponses: [{ criterionId: 'method', pointId: 'traffic', plannedResponse: 'Explain lane staging' }] } }],
  });
}
const codes = (value: ReturnType<typeof fixture>) => auditTenderWorkspace(value, '2026-10-07T00:00:00Z').issues.map(row => row.code);

describe('response planning', () => {
  test('keeps legacy schemas compatible and exposes actual new tool schema', () => {
    const workspace = fixture();
    delete workspace.criteria[0]!.rubric;
    delete workspace.responses[0]!.chapter;
    expect(parseTenderWorkspace(workspace).schemaVersion).toBe(1);
    expect(JSON.stringify(tenderResponseSchemaHint())).toContain('generationMode');
  });
  test('reports uncovered rubric points and permits many chapters per criterion', () => {
    const workspace = fixture();
    expect(codes(workspace)).toContain('rubric_point_unplanned');
    workspace.responses.push({ ...workspace.responses[0]!, id: 'drainage-chapter', chapter: { ...workspace.responses[0]!.chapter!, id: 'drainage-chapter', pointResponses: [{ criterionId: 'method', pointId: 'drainage', plannedResponse: 'Explain drainage staging' }] } });
    expect(codes(workspace)).not.toContain('rubric_point_unplanned');
    workspace.responses[1]!.chapter!.pointResponses[0]!.pointId = 'invented';
    expect(codes(workspace)).toContain('rubric_point_reference_invalid');
  });
  test('does not allow numeric scoring bands for pass/fail conditions', () => {
    const workspace = fixture();
    workspace.criteria[0]!.method = 'pass_fail';
    expect(codes(workspace)).toContain('rubric_band_score_invalid');
  });
  test('rejects duplicate rubric identities and unsupported material attestations', () => {
    const workspace = fixture();
    workspace.criteria[0]!.rubric!.points.push(workspace.criteria[0]!.rubric!.points[0]!);
    expect(() => parseTenderWorkspace(workspace)).toThrow(/Duplicate/);
    const other = fixture();
    other.responses[0]!.chapter!.materials = [{ id: 'cert', title: 'Certificate', path: 'cert.pdf', mode: 'original', subject: 'Bidder A', expectedSubject: 'Bidder A', purpose: 'Qualification', conditions: [], availability: 'confirmed', authorization: 'confirmed', verification: 'verified' }];
    expect(() => parseTenderWorkspace(other)).toThrow(/reviewer/);
  });
  test('checks expiry, bidder identity, availability, authorization and immutable knowledge', () => {
    const material: TenderResponseMaterial = { id: 'cert', title: 'Certificate', path: 'cert.pdf', mode: 'original', subject: 'Old bidder', expectedSubject: 'Current bidder', purpose: 'Staffing', conditions: [], validUntil: '2026-01-01T00:00:00Z', availability: 'unknown', authorization: 'denied', verification: 'verified', reviewer: 'Reviewer', reviewedAt: '2026-01-01T00:00:00Z', note: 'Checked original', knowledgeCitation: '[kb:company:chunk1]' };
    const reasons = tenderMaterialIssues(material, '2026-10-07T00:00:00Z');
    expect(reasons.length).toBe(5);
    expect(reasons.join(' ')).toContain('主体');
    expect(reasons.join(' ')).toContain('过期');
  });
  test('withdrawn sources cannot remain a valid response basis', () => {
    const workspace = fixture();
    workspace.documents[0]!.status = 'withdrawn';
    expect(codes(workspace)).toContain('withdrawn_source_reference');
  });
  test('standalone chapter plans cannot inflate response coverage without a requirement or criterion', () => {
    const workspace = fixture();
    workspace.responses[0]!.requirementIds = [];
    workspace.responses[0]!.criterionIds = [];
    expect(codes(workspace)).toContain('chapter_response_unlinked');
  });
  test('unreadable source state stays distinct from withdrawal and blocks evidence reuse', () => {
    const workspace = fixture();
    workspace.documents[0]!.status = 'unreadable';
    expect(parseTenderWorkspace(workspace).documents[0]!.status).toBe('unreadable');
    expect(codes(workspace)).toContain('unreadable_source_reference');
    expect(codes(workspace)).not.toContain('withdrawn_source_reference');
  });
});
