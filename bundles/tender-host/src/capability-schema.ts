/**
 * Model-facing pack field maps. `tender_capability` action=schema returns these
 * so replace no longer has to probe unrecognized keys.
 */

import { PRICING_LOCAL_INTEL_CHECK } from './pricing-local-intel.ts'
import { SA_LABOUR_WAGE_CHECK } from './sa-labour.ts'

export const BOQ_FIVE_STEP_PRICING_TOP_LEVEL_REQUIRED = [
  'currency',
  'pricingStatus',
  'itemBuildUps',
  'assumptions',
] as const

export const BOQ_FIVE_STEP_PRICING_TOP_LEVEL_OPTIONAL = [
  'pricingStandard',
  'vatTreatment',
  'indirectCostPolicy',
  'resourceSummary',
] as const

/** Keys the model has tried at pack top level. All belong elsewhere or do not exist. */
export const BOQ_FIVE_STEP_PRICING_NOT_TOP_LEVEL = {
  rateBasis: 'itemBuildUps[].costComponents[].rateBasis',
  planningBasis: 'itemBuildUps[].planningBasis',
  sources: 'does not exist — use sourceRefs / sourceRef / rateSourceRef',
} as const

export const PRICING_WEB_RATE_CHECK = {
  required: true,
  tools: ['web_search', 'web_fetch', 'anysearch_batch_search', 'anysearch_search'] as const,
  writePath: 'itemBuildUps[].costComponents[].rateBasis.webEvidence',
  fields: ['url', 'accessedAt'] as const,
  keyRates: ['fuel', 'wages', 'plant hire', 'cement', 'aggregates', 'asphalt', 'subcontract'],
  note: 'Verify key rates from applicable current sources. The current professional task webDiligence policy governs market-rate research too; when restricted, retain gaps and provisional estimates instead of browsing. Select region and language from the actual project. AnySearch is optional; use available native web_search/web_fetch. South African wage checks apply only to supported South African jurisdiction.',
}

export { SA_LABOUR_WAGE_CHECK, PRICING_LOCAL_INTEL_CHECK }

const ITEM_BUILD_UP_FIELDS = [
  'boqItemId',
  'status',
  'steps',
  'itemIdentity',
  'scopeBasis',
  'productivityBasis',
  'resourceCoverage',
  'resourceConsumptions',
  'planningBasis',
  'initialCashFlow',
  'costComponents',
  'directCost',
  'directCostSummary',
  'riskScenarios',
  'conditions',
  'riskNotes',
] as const

export function capabilitySchemaHint(capability: string) {
  if (capability === 'boq_five_step_pricing') {
    return {
      capability,
      skill: 'tender-boq-five-step-pricing',
      skillReference: 'skills/tender-boq-five-step-pricing/references/schema.md',
      strict: true,
      topLevel: {
        required: [...BOQ_FIVE_STEP_PRICING_TOP_LEVEL_REQUIRED],
        optional: [...BOQ_FIVE_STEP_PRICING_TOP_LEVEL_OPTIONAL],
        reviewedMustDeclare: {
          pricingStandard: 'Project-applicable declared basis; generic_direct_cost_v1 unless C5.1 scope is confirmed',
          vatTreatment: 'exclusive',
          indirectCostPolicy: 'excluded_from_item_direct_cost',
        },
      },
      notTopLevel: { ...BOQ_FIVE_STEP_PRICING_NOT_TOP_LEVEL },
      itemBuildUpsFields: [...ITEM_BUILD_UP_FIELDS],
      webRateCheck: PRICING_WEB_RATE_CHECK,
      saLabourWageCheck: SA_LABOUR_WAGE_CHECK,
      localIntelCheck: PRICING_LOCAL_INTEL_CHECK,
    }
  }
  return {
    capability,
    note: 'A full field map is published for boq_five_step_pricing. Call action=schema with that capability, or read the owning skill.',
  }
}

export function wrapCapabilityParseError(capability: string, error: unknown): Error {
  const base = error instanceof Error ? error.message : String(error)
  if (capability !== 'boq_five_step_pricing') {
    return error instanceof Error ? error : new Error(base)
  }
  const hint = capabilitySchemaHint(capability)
  return new Error(
    `${base}\n\nboq_five_step_pricing pack is .strict(). `
    + `Top-level required: ${BOQ_FIVE_STEP_PRICING_TOP_LEVEL_REQUIRED.join(', ')}. `
    + `Optional: ${BOQ_FIVE_STEP_PRICING_TOP_LEVEL_OPTIONAL.join(', ')}. `
    + `Do not put rateBasis, planningBasis, or sources at the top level.\n`
    + JSON.stringify({ notTopLevel: hint.notTopLevel, topLevel: hint.topLevel }, null, 2),
  )
}
