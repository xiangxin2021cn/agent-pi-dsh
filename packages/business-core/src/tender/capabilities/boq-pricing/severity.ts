/**
 * BOQ pricing issue severity policy.
 *
 * Machine gates protect *completeness and identity* (every BOQ row priced,
 * five steps present, scope/spec cited, no indirect cost in the direct rate).
 * Pure arithmetic self-consistency (quantity × rate = amount, scenario formula,
 * subtotal reconciliation) is downgraded to warnings: LLM-produced estimates
 * routinely round intermediate values, and a commercial reviewer — not an
 * exact-decimal gate — signs off the numbers. Without this split, batches
 * deadlocked in invalid → retry loops on rounding differences.
 */
const ARITHMETIC_WARNING_CODES = new Set([
  'boq_pricing_productivity_formula_mismatch',
  'boq_pricing_productivity_scenario_order',
  'boq_pricing_base_productivity_mismatch',
  'boq_pricing_resource_component_quantity_mismatch',
  'boq_pricing_direct_cost_subtotal_mismatch',
  'boq_pricing_unit_direct_cost_mismatch',
  'boq_pricing_item_direct_cost_mismatch',
  'boq_pricing_component_total_mismatch',
  'boq_pricing_direct_cost_mismatch',
  'boq_pricing_cash_flow_allocation_mismatch',
  'boq_pricing_cash_flow_weight_mismatch',
  'boq_pricing_cash_flow_amount_mismatch',
  // Honest unverified rates (e.g. no web evidence found) must not deadlock a
  // reviewed item — the pack lands as needs_review for human sign-off instead.
  'boq_pricing_reviewed_core_unverified',
]);

export function remapBoqPricingIssueSeverity(code: string, severity: 'error' | 'warning'): 'error' | 'warning' {
  if (severity === 'error' && ARITHMETIC_WARNING_CODES.has(code)) return 'warning';
  return severity;
}
