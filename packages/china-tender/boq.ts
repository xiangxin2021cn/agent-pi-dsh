import { createHash } from 'node:crypto';
import type {
  BoqBaselineRow, BoqBaselineSource, BoqDifference, ChinaBoqBaseline, ChinaBoqComparison,
} from './types.ts';
import { requireDate, requireOneOf, requireText, requireUniqueIds } from './validation.ts';

function decimal(value: unknown, name: string): string {
  if (typeof value !== 'string' || !/^\d+(?:\.\d+)?$/.test(value)) {
    throw new Error(`${name} 必须为不含分组符的非负十进制字符串`);
  }
  const [integer, fraction = ''] = value.split('.');
  const whole = integer.replace(/^0+(?=\d)/, '');
  const digits = fraction.replace(/0+$/, '');
  return digits ? `${whole}.${digits}` : whole;
}

function copyRows(rows: readonly Readonly<BoqBaselineRow>[]): BoqBaselineRow[] {
  requireUniqueIds(rows, 'boq.rows');
  return rows.map((row) => {
    for (const key of ['code', 'description', 'unit'] as const) requireText(row[key], `boq.${key}`);
    decimal(row.quantity, 'boq.quantity');
    if (row.fixedAmount !== undefined) decimal(row.fixedAmount, 'boq.fixedAmount');
    if (row.features !== undefined && typeof row.features !== 'string') throw new Error('boq.features 必须是字符串');
    // Preserve original formatting and zero rows; the snapshot is not a computed quantity list.
    return {
      id: row.id, code: row.code, description: row.description, unit: row.unit,
      quantity: row.quantity,
      ...(row.features !== undefined ? { features: row.features } : {}),
      ...(row.fixedAmount !== undefined ? { fixedAmount: row.fixedAmount } : {}),
    };
  });
}

function copySource(source: Readonly<BoqBaselineSource>): BoqBaselineSource {
  requireText(source.documentId, 'boq.source.documentId');
  if (typeof source.sha256 !== 'string' || !/^[a-f\d]{64}$/i.test(source.sha256)) throw new Error('清单来源需要 SHA-256');
  if (source.issuedAt) requireDate(source.issuedAt, 'boq.source.issuedAt');
  if (source.revision !== undefined) requireText(source.revision, 'boq.source.revision');
  return {
    documentId: source.documentId, sha256: source.sha256.toLowerCase(),
    ...(source.revision !== undefined ? { revision: source.revision } : {}),
    ...(source.issuedAt !== undefined ? { issuedAt: source.issuedAt } : {}),
  };
}

function fingerprint(baselineId: string, source: BoqBaselineSource, rows: BoqBaselineRow[]): string {
  return createHash('sha256').update(JSON.stringify({ schemaVersion: 1, baselineId, source, rows })).digest('hex');
}

export function createChinaBoqBaseline(
  baselineId: string,
  source: BoqBaselineSource,
  rows: readonly BoqBaselineRow[],
): ChinaBoqBaseline {
  requireText(baselineId, 'baselineId');
  if (!rows.length) throw new Error('清单基线不能没有清单行');
  const snapshotSource = copySource(source);
  const snapshotRows = copyRows(rows);
  const digest = fingerprint(baselineId, snapshotSource, snapshotRows);
  return Object.freeze({
    schemaVersion: 1 as const, baselineId,
    source: Object.freeze(snapshotSource),
    rows: Object.freeze(snapshotRows.map((row) => Object.freeze(row))),
    fingerprint: digest,
  });
}

export function verifyChinaBoqBaseline(baseline: ChinaBoqBaseline): void {
  if (baseline.schemaVersion !== 1) throw new Error('不支持的清单基线版本');
  requireText(baseline.baselineId, 'baselineId');
  if (!baseline.rows.length) throw new Error('清单基线不能没有清单行');
  const expected = fingerprint(baseline.baselineId, copySource(baseline.source), copyRows(baseline.rows));
  if (expected !== baseline.fingerprint) throw new Error('清单基线完整性校验失败；不得用复算量或报价覆盖原始清单');
}

function subtract(after: string, before: string): string {
  const [a, af = ''] = decimal(after, 'comparedQuantity').split('.');
  const [b, bf = ''] = decimal(before, 'baselineQuantity').split('.');
  const places = Math.max(af.length, bf.length);
  const difference = BigInt(a + af.padEnd(places, '0')) - BigInt(b + bf.padEnd(places, '0'));
  const sign = difference < 0n ? '-' : '';
  const absolute = (difference < 0n ? -difference : difference).toString().padStart(places + 1, '0');
  const rendered = places ? `${absolute.slice(0, -places)}.${absolute.slice(-places)}` : absolute;
  return sign + decimal(rendered, 'quantityDelta');
}

export function compareChinaBoq(
  baseline: ChinaBoqBaseline,
  comparedRows: readonly BoqBaselineRow[],
  kind: ChinaBoqComparison['kind'],
): ChinaBoqComparison {
  requireOneOf(kind, ['recalculation', 'submission'], 'boq.kind');
  verifyChinaBoqBaseline(baseline);
  const compared = copyRows(comparedRows);
  const byCompared = new Map(compared.map((row) => [row.id, row]));
  const byBaseline = new Map(baseline.rows.map((row) => [row.id, row]));
  const differences: BoqDifference[] = [];
  for (const row of baseline.rows) {
    const other = byCompared.get(row.id);
    if (!other) {
      differences.push({ rowId: row.id, kind: 'missing', fields: ['row'], baselineQuantity: row.quantity });
      continue;
    }
    const fields: string[] = [];
    for (const key of ['code', 'description', 'unit', 'features'] as const) {
      if (row[key] !== other[key]) fields.push(key);
    }
    if (decimal(row.quantity, 'quantity') !== decimal(other.quantity, 'quantity')) fields.push('quantity');
    if ((row.fixedAmount === undefined) !== (other.fixedAmount === undefined)
      || (row.fixedAmount !== undefined && other.fixedAmount !== undefined
        && decimal(row.fixedAmount, 'fixedAmount') !== decimal(other.fixedAmount, 'fixedAmount'))) fields.push('fixedAmount');
    if (fields.length) differences.push({
      rowId: row.id, kind: 'changed', fields,
      baselineQuantity: row.quantity, comparedQuantity: other.quantity,
      ...(row.unit === other.unit ? { quantityDelta: subtract(other.quantity, row.quantity) } : {}),
    });
  }
  for (const row of compared) {
    if (!byBaseline.has(row.id)) differences.push({ rowId: row.id, kind: 'added', fields: ['row'], comparedQuantity: row.quantity });
  }
  return {
    baselineId: baseline.baselineId, baselineFingerprint: baseline.fingerprint,
    kind, status: differences.length ? 'needs_review' : 'unchanged', differences,
    note: kind === 'recalculation'
      ? '复算差异仅供核对、询疑和成本分析，未修改招标清单基线。'
      : '报价清单差异需按有效招标文件及补遗复核，不自动判定无效投标；基线保持原样。',
  };
}
