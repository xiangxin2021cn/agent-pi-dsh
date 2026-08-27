import { normalizeSourceRefs, sourceRefsNeededCoercion } from '../../source-locator.ts';
import type { TenderDocumentAnalysisData, TenderDocumentAnalysisSection } from './types.ts';

const SECTION_KINDS = new Set<TenderDocumentAnalysisSection['kind']>([
  'project_information',
  'tender_requirements',
  'special_conditions',
  'addenda_clarifications',
  'boq_characteristics',
  'risk_gap',
  'other',
]);

const SECTION_STATUSES = new Set<TenderDocumentAnalysisSection['status']>([
  'draft',
  'reviewed',
  'blocked',
]);

export interface DocumentAnalysisNormalizationResult {
  data: TenderDocumentAnalysisData;
  warnings: string[];
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : undefined;
}

export interface NormalizeDocumentAnalysisOptions {
  /** Assigned single-document id for child batch reports that omit documentId on sections/refs. */
  defaultDocumentId?: string;
}

function normalizeSection(
  value: unknown,
  index: number,
  warnings: string[],
  options: NormalizeDocumentAnalysisOptions,
): TenderDocumentAnalysisSection | undefined {
  const record = asRecord(value);
  if (!record) {
    warnings.push(`sections[${index}]: skipped non-object`);
    return undefined;
  }

  const id = typeof record.id === 'string' ? record.id.trim() : '';
  const rawDocumentId = typeof record.documentId === 'string' ? record.documentId.trim() : '';
  const documentId = rawDocumentId || (options.defaultDocumentId?.trim() ?? '');
  if (!rawDocumentId && documentId) {
    warnings.push(`sections[${index}].documentId filled from assigned document ${documentId}`);
  }
  const title = typeof record.title === 'string' ? record.title.trim() : '';
  if (!id || !documentId || !title) {
    warnings.push(`sections[${index}]: missing id/documentId/title`);
    return undefined;
  }

  const kindRaw = typeof record.kind === 'string' ? record.kind.trim() : 'other';
  const kind = SECTION_KINDS.has(kindRaw as TenderDocumentAnalysisSection['kind'])
    ? kindRaw as TenderDocumentAnalysisSection['kind']
    : 'other';
  if (kind !== kindRaw) warnings.push(`sections[${index}].kind coerced ${kindRaw} → ${kind}`);

  const statusRaw = typeof record.status === 'string' ? record.status.trim() : 'draft';
  const status = SECTION_STATUSES.has(statusRaw as TenderDocumentAnalysisSection['status'])
    ? statusRaw as TenderDocumentAnalysisSection['status']
    : 'draft';
  if (status !== statusRaw) warnings.push(`sections[${index}].status coerced ${statusRaw} → ${status}`);

  if (sourceRefsNeededCoercion(record.sourceRefs)) {
    warnings.push(`sections[${index}].sourceRefs: string/object coercion applied`);
  }

  const sourceRefs = normalizeSourceRefs(record.sourceRefs, { fallbackDocumentId: documentId });
  if (Array.isArray(record.sourceRefs) && record.sourceRefs.length > 0 && sourceRefs.length === 0) {
    warnings.push(`sections[${index}].sourceRefs: all entries dropped after normalize`);
  } else if (Array.isArray(record.sourceRefs) && sourceRefs.length < record.sourceRefs.length) {
    warnings.push(`sections[${index}].sourceRefs: bound locator/excerpt citations to ${documentId}`);
  }

  return {
    id,
    documentId,
    title,
    kind,
    summary: typeof record.summary === 'string' ? record.summary : '',
    sourceRefs,
    status,
  };
}

/**
 * Lenient normalization for LLM-produced document-analysis payloads.
 * Coerces string sourceRefs to locator objects before Zod parse.
 * Single-doc child reports may omit documentId and use locator/excerpt only.
 */
export function normalizeDocumentAnalysis(
  input: unknown,
  options: NormalizeDocumentAnalysisOptions = {},
): DocumentAnalysisNormalizationResult {
  const warnings: string[] = [];
  const root = asRecord(input);
  const defaultDocumentId = typeof root?.documentId === 'string' && root.documentId.trim()
    ? root.documentId.trim()
    : options.defaultDocumentId?.trim();
  const rawSections = Array.isArray(root?.sections) ? root.sections : [];
  if (!Array.isArray(root?.sections)) {
    warnings.push('sections missing or not an array');
  }

  const sections = rawSections.flatMap((entry, index) => {
    const section = normalizeSection(entry, index, warnings, { defaultDocumentId });
    return section ? [section] : [];
  });

  return { data: { sections }, warnings };
}
