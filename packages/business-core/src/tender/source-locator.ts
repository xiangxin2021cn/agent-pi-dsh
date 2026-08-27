import type { TenderSourceLocator } from './types.ts';

const ENTITY_ID_MAX = 80;

function normalizeText(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

/** Coerce free-form document ids (incl. spaces) into filesystem-safe entity ids. */
export function coerceDocumentId(value: string): string | undefined {
  const trimmed = value.trim();
  if (!trimmed) return undefined;
  if (/^[a-z0-9][a-z0-9._-]{0,79}$/i.test(trimmed)) return trimmed.slice(0, ENTITY_ID_MAX);
  const slug = trimmed
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, ENTITY_ID_MAX);
  if (!slug || !/^[a-z0-9]/i.test(slug)) return undefined;
  return slug;
}

export interface NormalizeSourceRefOptions {
  /**
   * When a locator/excerpt/page citation omits documentId (common for single-doc
   * child agents), bind the citation to this assigned document instead of dropping it.
   */
  fallbackDocumentId?: string;
}

function citationHasLocation(record: Record<string, unknown>): boolean {
  if (normalizeText(record.locator) || normalizeText(record.excerpt) || normalizeText(record.clause)
    || normalizeText(record.section) || normalizeText(record.sheet) || normalizeText(record.cell)
    || normalizeText(record.blockId)) {
    return true;
  }
  const page = Number(record.page);
  return Number.isInteger(page) && page > 0;
}

export function normalizeSourceRef(
  value: unknown,
  options: NormalizeSourceRefOptions = {},
): TenderSourceLocator | undefined {
  if (typeof value === 'string') {
    const documentId = coerceDocumentId(value) ?? coerceDocumentId(options.fallbackDocumentId ?? '');
    return documentId ? { documentId } : undefined;
  }
  if (!value || typeof value !== 'object') return undefined;
  const record = value as Record<string, unknown>;
  const rawId = typeof record.documentId === 'string' ? record.documentId : '';
  const documentId = coerceDocumentId(rawId)
    ?? (citationHasLocation(record) ? coerceDocumentId(options.fallbackDocumentId ?? '') : undefined);
  if (!documentId) return undefined;

  const ref: TenderSourceLocator = { documentId };
  for (const key of ['sheet', 'clause', 'section', 'cell', 'blockId', 'excerpt'] as const) {
    const text = normalizeText(record[key]);
    if (text) ref[key] = text;
  }
  // OCR/LLM agents often emit `locator` instead of clause/section — keep the cue.
  const locator = normalizeText(record.locator);
  if (locator) {
    if (!ref.clause) ref.clause = locator;
    else if (!ref.excerpt) ref.excerpt = locator;
    else if (!ref.section) ref.section = locator;
  }
  const page = Number(record.page);
  if (Number.isInteger(page) && page > 0) ref.page = page;
  if (Array.isArray(record.bbox) && record.bbox.length === 4) {
    const bbox = record.bbox.map(Number);
    if (bbox.every((n) => Number.isFinite(n))) {
      ref.bbox = bbox as [number, number, number, number];
    }
  }
  return ref;
}

export function normalizeSourceRefs(
  value: unknown,
  options: NormalizeSourceRefOptions = {},
): TenderSourceLocator[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((entry) => {
    const ref = normalizeSourceRef(entry, options);
    return ref ? [ref] : [];
  });
}

/** True when any array entry needed string→object (or id slug) coercion. */
export function sourceRefsNeededCoercion(value: unknown): boolean {
  if (!Array.isArray(value)) return false;
  return value.some((entry) => {
    if (typeof entry === 'string') return true;
    if (!entry || typeof entry !== 'object') return false;
    const documentId = (entry as { documentId?: unknown }).documentId;
    return typeof documentId === 'string' && coerceDocumentId(documentId) !== documentId.trim();
  });
}
