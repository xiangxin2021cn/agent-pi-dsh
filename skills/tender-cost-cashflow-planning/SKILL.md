---
name: tender-cost-cashflow-planning
description: Build and validate tender-stage sourced cost build-ups, scenarios, and schedule-linked cash flow using exact decimal arithmetic. Use for tender pricing and bid cash-flow planning, not post-award budget baselines or cost control.
---

# Tender Cost and Cash-Flow Planning

Build the structured tender cost model before producing pricing schedules, cash-flow charts, or
commercial narratives. Use `tender_capability` as the cost-cash-flow system of record.

## Guardrails

- Use only user-selected sources and registered Tender Workspace records.
- Do not scan the working directory.
- Require ready, non-stale `boq_reconciliation`, `schedule_resources`, and `construction_resource_schedule` packs.
- Emit `S-Curve_Cash_Flow_Chart.html` under `Agent Pi Outputs/<projectId>/planning/` (Official Outputs; stage 4-B gate). Prefer the bound cash-flow HTML template from project `bindings.json`.
- Do not use JavaScript floating-point arithmetic for financial reconciliation.
- Every sourced rate needs a registered source, currency, and effective date.
- Label unsupported values as `scenario` or `unverified`; do not present them as sourced facts.
- Keep labour, plant, material, subcontract, overhead, contingency, tax, escalation, financing,
  and other components explicit.
- Do not embed hard-coded market rates or productivity benchmarks.
- Link cash-flow periods to validated schedule activities and reconcile period, cumulative, and
  total amounts exactly.
- Do not create or overwrite a Project Delivery Controls budget baseline.
- A stale capability pack is not ready.
- If you need to split cash-flow periods, use dsh native subagent / workflow. Do not wait for a workbench runner.
- **Writing:** Follow tender-intelligence-core `references/writing-contract.md`. Cash-flow notes and commercial narratives must use this tender's currency, items, and periods, with AI filler stripped.

## Five-Step BOQ Item Build-Up

Every BOQ item must be derived separately through all five steps. Do not replace item-level work with
section totals, representative items, or a single blended rate.

1. **Scope and quantity basis** - identify the exact BOQ reference, description, unit, quantity,
   specification clause, drawing or schedule locator, inclusions, exclusions, and measurement basis.
2. **Method and productivity** - define the construction method, work sequence, crew or plant
   arrangement, production cycle, productivity basis, constraints, and supporting source.
3. **Resource consumption** - calculate labour, plant, material, subcontract, waste, transport, and
   other resource consumption per BOQ unit using explicit units and exact arithmetic.
4. **Sourced rates and direct cost** - apply source-traced rates with currency and effective date,
   calculate each direct-cost component, and reconcile the item direct cost.
5. **Reconciliation, conditions, and risk** - reconcile the build-up to the BOQ unit and quantity,
   state commercial conditions and exclusions, identify unresolved inputs, and label unsupported
   values `scenario` or `unverified` rather than presenting them as facts.

An item is incomplete when any step is missing. Unresolved values may produce conditional branches,
but they must not be promoted to the recommended rate until the required user decision or evidence is
recorded.

## Workflow

1. Call `tender_workspace` with `status`, then call `tender_capability` with `status` for
   `boq_reconciliation` and `schedule_resources`.
2. Confirm both dependency packs are ready and non-stale. Pause for user confirmation when a
   rate basis, currency, effective date, productivity basis, tax, escalation, contingency,
   financing assumption, or schedule allocation is ambiguous.
3. Call `tender_capability` with `configure` for `cost_cashflow`.
4. Register source-traced rate records and explicit scenarios before using them in components.
5. Build each BOQ item from explicit decimal quantities and rates. Reconcile every component and
   BOQ build-up with exact decimal arithmetic.
6. Allocate costs to validated schedule activities and chronological periods. Reconcile each
   cumulative value and the final cash-flow total.
7. Call `tender_capability` with `init`, or `replace` with the current `expectedRevision`.
8. Call `validate`. Correct missing rate sources, currency mismatches, uncovered BOQ items,
   unknown schedule activities, and arithmetic differences instead of masking them in prose.
9. If status reports stale, refresh only affected rates, build-ups, or periods, replace the pack,
   and validate again.

## Outputs

After validation, report the pack revision, readiness, currency, rate-source count, unverified
components, estimated total, cash-flow total, and audit path. Any chart or office-document export
must be rendered from the validated structured data. Tender cost readiness is not approval of a
post-award budget, forecast, earned-value baseline, or actual-cost record.
