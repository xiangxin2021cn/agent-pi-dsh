---
name: resource-investment-technical-diligence
description: Use when evaluating resource statements, extraction or production plans, processing routes, infrastructure, capital scope, operating constraints, and technical risks for an investment.
---

# Resource Investment Technical Diligence

Use `investment_capability` with `resource_technical` only after `mandate_screening` is ready.

## Guardrails

- Use registered user-selected investment sources. Do not scan the working directory.
- Do not read Tender Workspace or Delivery Workspace private files.
- A knowledge snapshot may corroborate benchmarks but cannot replace active direct investment evidence.
- Keep declared resources, reserves, inferred potential, recovery assumptions, and production scenarios distinct.
- Do not convert engineering assumptions into verified quantities without source support.

## Workflow

1. Confirm the accepted screening pack, technical source revisions, competent-person basis, and study accuracy class.
2. Record verified findings for `resource_statement`, `technical_plan`, and `infrastructure`.
3. Register assumptions and metrics with units, evidence locators, confidence, and scenario ownership.
4. Record material technical risks, mitigation owners, and blocked data requests.
5. Call `investment_capability` with `init` or revision-safe `replace`, then call `validate`.

Report readiness, unsupported quantities, material technical risks, and audit path. Do not claim bankability or feasibility approval.
