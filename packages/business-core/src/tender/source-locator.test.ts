import { describe, expect, test } from 'bun:test';
import { normalizeSourceRef, normalizeSourceRefs, sourceRefsNeededCoercion } from './source-locator.ts';

describe('normalizeSourceRef', () => {
  test('coerces plain string documentId', () => {
    expect(normalizeSourceRef('book1')).toEqual({ documentId: 'book1' });
  });

  test('slugifies spaced string ids', () => {
    expect(normalizeSourceRef('Book 1')).toEqual({ documentId: 'book-1' });
  });

  test('keeps object locators', () => {
    expect(normalizeSourceRef({ documentId: 'boq', page: 3 })).toEqual({ documentId: 'boq', page: 3 });
  });

  test('drops empty', () => {
    expect(normalizeSourceRef('')).toBeUndefined();
    expect(normalizeSourceRef(null)).toBeUndefined();
  });

  test('binds locator/excerpt citations to fallbackDocumentId', () => {
    expect(normalizeSourceRef(
      { locator: 'PDF page 1', excerpt: 'WORK PACKAGE B' },
      { fallbackDocumentId: 'src-hse-doc' },
    )).toEqual({
      documentId: 'src-hse-doc',
      clause: 'PDF page 1',
      excerpt: 'WORK PACKAGE B',
    });
  });

  test('still drops empty objects without fallback evidence', () => {
    expect(normalizeSourceRef({}, { fallbackDocumentId: 'src-hse-doc' })).toBeUndefined();
  });
});

describe('normalizeSourceRefs', () => {
  test('maps mixed string/object arrays', () => {
    expect(normalizeSourceRefs(['doc-a', { documentId: 'doc-b', clause: '4.1' }])).toEqual([
      { documentId: 'doc-a' },
      { documentId: 'doc-b', clause: '4.1' },
    ]);
  });

  test('keeps locator-only refs when fallbackDocumentId is set', () => {
    expect(normalizeSourceRefs(
      [{ locator: '封面页', excerpt: 'CONTRACT NR: R573' }],
      { fallbackDocumentId: 'src-hse-doc' },
    )).toEqual([{
      documentId: 'src-hse-doc',
      clause: '封面页',
      excerpt: 'CONTRACT NR: R573',
    }]);
  });
});

describe('sourceRefsNeededCoercion', () => {
  test('detects string entries', () => {
    expect(sourceRefsNeededCoercion(['book1'])).toBe(true);
    expect(sourceRefsNeededCoercion([{ documentId: 'book1' }])).toBe(false);
  });
});
