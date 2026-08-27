---
name: resource-investment-mandate-screening
description: Use when screening a resource, mining, quarry, energy, or infrastructure investment opportunity against an explicit investor mandate and stage-gate criteria.
---

# Resource Investment Mandate Screening

Use `investment_capability` with `mandate_screening` after the Investment Workspace core is ready.

## Guardrails

- Use only registered investment sources selected by the user. Do not scan the working directory.
- Do not read Tender Workspace or Delivery Workspace private files.
- Treat an approved, user-confirmed knowledge snapshot as corroboration only.
- Every verified mandate, opportunity, and stage-gate finding requires active direct investment evidence.
- Separate exclusion facts, investor preferences, assumptions, and unresolved questions.
- Do not present a screening score as an investment decision.

## Workflow

1. Read `investment_workspace` status and confirm mandate, opportunity identity, stage, currency, valuation date, and source revisions.
2. Record verified findings for `mandate`, `opportunity`, and `stage_gate`, with exact source locators.
3. Record approved assumptions, screening metrics, and material risks without converting scenarios into facts.
4. Call `investment_capability` with `init` or revision-safe `replace`.
5. Call `validate`; resolve missing categories, direct evidence, and blocked findings.

Report readiness, failed gates, unresolved user decisions, and audit path. Do not claim investment approval.
