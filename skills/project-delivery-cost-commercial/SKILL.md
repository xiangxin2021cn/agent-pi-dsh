---
name: project-delivery-cost-commercial
description: Build and validate implementation budgets, commitments, actuals, accruals, variations, forecast-to-complete, and estimate-at-completion with exact arithmetic for a Delivery Workspace.
---

# Project Delivery Cost and Commercial

Use `delivery_capability` as the cost and commercial system of record.

## Guardrails

- Use only user-selected sources and registered Delivery Workspace records.
- Do not scan the working directory.
- Require ready contract-scope and resource-procurement capabilities plus an approved local budget baseline.
- Store all monetary values as exact decimal strings; do not use binary floating-point arithmetic.
- Require active direct implementation evidence for reviewed budgets, confirmed commitments, posted
  actual cost and accrual records, approved variations, and confirmed forecasts.
- A tender estimate, investment model, or knowledge snapshot may corroborate an assumption but cannot become an approved budget or posted cost without local verification and user approval.
- Reconcile approved budget plus approved variations to current budget for every cost code.
- Reconcile actual cost plus accrual plus forecast-to-complete to estimate-at-completion.
- Keep pending variations, draft transactions, scenarios, conflicts, and blocked records visible.
- Do not read or write Tender Workspace or Investment Workspace private files.
- Do not spawn nested agents.

## Workflow

1. Read `delivery_workspace`, ready `contract_scope`, and ready `resource_procurement` status.
2. Confirm the project currency, data date, approved budget revision, commercial ledger cut, and cost-code mapping.
3. Pause for user confirmation when budget revision, transaction status, commitment, variation
   approval, accrual basis, forecast assumption, or cost-code mapping is ambiguous.
4. Call `delivery_capability` with `configure` for `cost_commercial`.
5. Register reviewed budget lines mapped to reviewed scope and resourced activities.
6. Register commitments, posted actual costs, accruals, and variations with exact direct evidence.
7. Register one forecast for each cost code and reconcile estimate-at-completion deterministically.
8. Call `init`, or `replace` with `expectedRevision`, then call `validate`.
9. Resolve missing cost coverage, unsupported posted records, currency or data-date differences,
   budget differences, variation differences, and EAC differences before claiming readiness.

Report revision, data date, currency, readiness, current budget, commitments, actuals, accruals,
approved variations, forecast-to-complete, estimate-at-completion, exceptions, and audit path. This
pack does not approve cash flow, changes, claims, investment assumptions, or period-close records.
