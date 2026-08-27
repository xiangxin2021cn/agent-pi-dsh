---
name: resource-investment-market-offtake
description: Use when assessing demand, price formation, logistics, customer concentration, product specifications, sales scenarios, and offtake arrangements for a resource investment.
---

# Resource Investment Market And Offtake

Use `investment_capability` with `market_offtake` only after `mandate_screening` is ready.

## Guardrails

- Use registered user-selected investment sources. Do not scan the working directory.
- Do not read Tender Workspace or Delivery Workspace private files.
- A knowledge snapshot may corroborate market context but cannot replace active direct investment evidence for a core conclusion.
- Keep historical prices, forecasts, quotations, formula prices, and management targets separate.
- Label unsigned interest, conditional offtake, and binding contracts accurately.

## Workflow

1. Confirm products, specifications, target markets, pricing date, currency, logistics boundary, and source revisions.
2. Record verified findings for `market_demand`, `pricing`, and `offtake`.
3. Register price and volume assumptions, metrics, downside/base/upside scenarios, and exact evidence.
4. Record concentration, qualification, logistics, counterparty, and price risks.
5. Call `investment_capability` with `init` or revision-safe `replace`, then call `validate`.

Report readiness, scenario boundaries, unsupported commercial claims, and audit path. Do not present a forecast as contracted revenue.
