# `boq_five_step_pricing` pack schema

The pack is Zod `.strict()`. Unknown keys are rejected. Call `tender_capability` with `action: schema` and `capability: boq_five_step_pricing` before the first `replace`. Do not probe fields.

Authoritative parser: `packages/business-core/src/tender/capabilities/boq-pricing/schema.ts`.

## Top-level object

Required:

| Field | Type |
|---|---|
| `currency` | ISO-4217, three letters (`ZAR`) |
| `pricingStatus` | `draft` \| `reviewed` \| `blocked` |
| `itemBuildUps` | array, unique `boqItemId` |
| `assumptions` | array, unique `id` |

Optional:

| Field | Type | Reviewed value |
|---|---|---|
| `pricingStandard` | string | `c51_pure_direct_cost_v1` |
| `vatTreatment` | string | `exclusive` |
| `indirectCostPolicy` | string | `excluded_from_item_direct_cost` |
| `resourceSummary` | array (default `[]`) | — |

`pricingStandard`, `vatTreatment`, and `indirectCostPolicy` are **pack top-level**, not item fields.

## Keys that are not top-level

These fail if placed on the pack root:

| Rejected top-level key | Actual path |
|---|---|
| `rateBasis` | `itemBuildUps[].costComponents[].rateBasis` |
| `planningBasis` | `itemBuildUps[].planningBasis` |
| `sources` | does not exist; use `sourceRefs` / `sourceRef` / `rateSourceRef` |

## `itemBuildUps[]`

Required: `boqItemId`, `status` (`draft` \| `reviewed` \| `blocked`), `steps`, `directCost`.

`steps` has five objects, each `{ narrative, sourceRefs? }`:

- `scopeQuantity`
- `methodProductivity`
- `resourceConsumption`
- `sourcedRatesDirectCost`
- `reconciliationRisk`

Optional / defaulted item fields:

- `itemIdentity` — `code`, `description`, `unit`, `quantity`, `sourceRef`
- `scopeBasis` — `specificationRefs`, `measurementRuleRefs`, `inclusions`, `exclusions`, `testingRequirements`, `methodConstraints`
- `productivityBasis` — `methodSequence`, `crew`, `workingHoursPerDay`, `bottleneck`, `theoreticalProductionRate`, `calculationFormula`, `scenarios` (`optimistic` / `base` / `pessimistic`). Hours and effective factor come from this site. Source is `local_verified` or `international_adjusted` (see [local-productivity.md](local-productivity.md)); never a Chinese norm.
- `resourceCoverage` — labour / plant / material / subcontract / transport / waste, each `included` or `not_applicable`
- `resourceConsumptions` — per-BOQ-unit quantities; link `costComponentId`
- `planningBasis` — `methodId`, `productionRate`, `quantityUnit`, `timeUnit`, `duration`, `calendarId`, `activityId`, `assumptionStatus`, `sourceRefs`
- `initialCashFlow` — optional here
- `costComponents` — `id`, `kind`, `description`, `quantity`, `unit`, `rate`, `amount`, `rateSourceRef?`, `rateBasis?`, `assumptionStatus`
- `directCostSummary` — category subtotals plus `unitDirectCost`, `boqQuantity`, `itemDirectCost`
- `riskScenarios`, `conditions`, `riskNotes`

## `rateBasis` (on each cost component)

`sourceType`, `acquisitionMode`, `location`, `effectiveDate`, `vatTreatment: exclusive`, optional `webEvidence[]`.

`webEvidence[]`: `url` (`http`/`https`), `accessedAt` (`YYYY-MM-DD`), optional `title`, `note`.

Key market rates (fuel, wages, plant hire, cement, aggregates, asphalt, subcontract) must be verified with `web_search` / `web_fetch` and recorded here. This is independent of `webDiligenceAuthorized`. South African civil wages: see [sa-labour-wages.md](sa-labour-wages.md). Site-bound productivity and suppliers: [local-site-intel.md](local-site-intel.md), [local-productivity.md](local-productivity.md), and [supplier-rfq.md](supplier-rfq.md). Discover tags with `anysearch_capabilities` before `anysearch_search`; batch local queries with `anysearch_batch_search` (`zone: "intl"`, `language: "en"`). Put the site string on `rateBasis.location`. If the supplier / productivity pack cannot be completed, `waive_pricing` plus `组价依据说明.md` lets planning use web quotes and derived outputs.

## Locators

There is no `sources` array. Use:

- `sourceRef` — single locator (`itemIdentity`)
- `rateSourceRef` — single locator on a cost component
- `sourceRefs` — locator arrays on steps, crew, consumptions, planning, assumptions, risks
