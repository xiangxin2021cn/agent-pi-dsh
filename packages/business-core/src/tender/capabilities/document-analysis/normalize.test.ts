import { describe, expect, test } from 'bun:test';
import { parseTenderDocumentAnalysisData } from './schema.ts';
import { normalizeDocumentAnalysis } from './normalize.ts';

describe('normalizeDocumentAnalysis', () => {
  test('string sourceRefs become objects and parse', () => {
    const { data, warnings } = normalizeDocumentAnalysis({
      sections: [{
        id: 's1',
        documentId: 'book1',
        title: 'Tender data',
        kind: 'project_information',
        summary: 'Summary text long enough for review',
        sourceRefs: ['book1'],
        status: 'reviewed',
      }],
    });
    expect(data.sections[0]?.sourceRefs[0]).toEqual({ documentId: 'book1' });
    expect(warnings.some((w) => /sourceRefs/i.test(w))).toBe(true);
    expect(() => parseTenderDocumentAnalysisData(data)).not.toThrow();
  });

  test('parseTenderDocumentAnalysisData accepts string sourceRefs via normalize', () => {
    const parsed = parseTenderDocumentAnalysisData({
      sections: [{
        id: 's1',
        documentId: 'book1',
        title: 'Tender data',
        kind: 'tender_requirements',
        summary: 'Mandatory attendance',
        sourceRefs: ['book1'],
        status: 'draft',
      }],
    });
    expect(parsed.sections[0]?.sourceRefs).toEqual([{ documentId: 'book1' }]);
  });

  test('single-doc child reports may omit documentId and use locator/excerpt only', () => {
    const parsed = parseTenderDocumentAnalysisData({
      documentId: 'src-hse-doc',
      sections: [{
        id: 'pi-01',
        title: 'Project identity',
        kind: 'project_information',
        summary: 'Health and safety specification for package B',
        sourceRefs: [{ locator: '封面页', excerpt: 'WORK PACKAGE B' }],
        status: 'reviewed',
      }],
    }, { defaultDocumentId: 'src-hse-doc' });
    expect(parsed.sections[0]?.documentId).toBe('src-hse-doc');
    expect(parsed.sections[0]?.sourceRefs[0]?.documentId).toBe('src-hse-doc');
    expect(parsed.sections[0]?.sourceRefs[0]?.clause).toBe('封面页');
  });
});
