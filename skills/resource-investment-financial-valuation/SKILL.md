---
name: resource-investment-financial-valuation
description: Use when building evidence-backed resource investment economics, exact CAPEX and OPEX assumptions, revenue scenarios, financing effects, valuation metrics, and sensitivities.
---

# Resource Investment Financial Valuation

Use `investment_capability` with `financial_valuation` only after `resource_technical`, `market_offtake`, and `legal_esg` are ready.

## Guardrails

- Use registered user-selected investment sources. Do not scan the working directory.
- Do not read Tender Workspace or Delivery Workspace private files.
- A knowledge snapshot may corroborate a benchmark but cannot replace active direct investment evidence.
- Use decimal-string values and explicit units; do not silently round material values.
- Keep verified inputs, approved assumptions, scenarios, sensitivities, and model outputs distinct.
- Do not hide tax, royalty, escalation, working-capital, closure, or financing assumptions.

## Workflow

1. Confirm valuation date, currency, price basis, production case, tax regime, discount basis, and upstream revisions.
2. Record verified findings for `capex`, `opex`, `revenue`, and `valuation`.
3. Register assumptions and metrics with exact source evidence and at least one reviewed scenario.
4. Reconcile valuation inputs to technical, market, and legal/ESG packs; expose conflicts rather than selecting silently.
5. Call `investment_capability` with `init` or revision-safe `replace`, then call `validate`.

Report readiness, scenario results, sensitivities, unresolved model inputs, and audit path. Do not claim investment approval.
