import type { TenderBoqItem } from './types.ts';

/**
 * Pricing eligibility for reconciled BOQ rows.
 *
 * Only real payment items (code/description/unit/quantity) may enter five-step
 * pricing batches. Schedule summary rows (Form C2.3 style subtotals) are
 * legitimate reconciliation cross-checks but must never be priced; synthetic
 * "composite" groupings invented during earlier sessions are rejected outright
 * so the reconciliation has to be rebuilt on real BOQ rows.
 */
export function boqPricingIneligibilityReason(item: TenderBoqItem): string | undefined {
  const unit = item.unit.trim();
  if (/^[A-Z]{3}$/.test(unit)) {
    return `summary row with currency unit ${unit} — subtotal rows are cross-checks, not payable items`;
  }
  if (/^(composite|组合)/i.test(unit) || /^(composite|组合)/i.test(item.code.trim()) || /^组合/.test(item.description.trim())) {
    return 'synthetic composite group — replace with real per-row BOQ payment items';
  }
  if (/^(sch(?:edule)?[-\s]|summary|total|subtotal)/i.test(item.code.trim())) {
    return 'schedule summary/total row — excluded from item pricing';
  }
  if (/(?:小计|合计|总计|summary of)/i.test(item.description) && !item.quantity) {
    return 'summary row without payable quantity';
  }
  if (!item.quantity && item.quantityBasis === 'not_provided') {
    return 'no BOQ quantity — cannot build a per-unit direct-cost rate';
  }
  return undefined;
}

export function isBoqPricingEligibleItem(item: TenderBoqItem): boolean {
  return boqPricingIneligibilityReason(item) === undefined;
}
