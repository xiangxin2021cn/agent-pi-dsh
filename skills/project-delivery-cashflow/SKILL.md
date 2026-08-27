---
name: project-delivery-cashflow
description: Build and validate implementation planned, actual, and forecast cash flow, rolling balances, programme coverage, cost reconciliation, and funding constraints for a Delivery Workspace.
---

# Project Delivery Cash Flow

Use `delivery_capability` as the cash-flow system of record.

## Guardrails

- Use only user-selected sources and registered Delivery Workspace records.
- Do not scan the working directory.
- Require ready programme-progress and cost-commercial capabilities.
- Do not treat cost recognition as cash payment.
- Store all cash values as exact decimal strings; do not use binary floating-point arithmetic.
- Require direct implementation evidence for every reviewed cash-flow period and active funding constraint.
- Reconcile period opening plus inflow to outflow plus closing for planned, actual, and forecast views.
- Reconcile rolling opening balances to the previous period closing balances.
- Reconcile total planned outflow to current approved budget and forecast outflow to estimate-at-completion.
- Cover every active programme month without inventing receipts, payment timing, or funding facilities.
- Keep draft periods, funding gaps, scenarios, and blocked constraints visible.
- Do not read or write Tender Workspace or Investment Workspace private files.
- Do not spawn nested agents.

## Workflow

1. Read `delivery_workspace`, ready `programme_progress`, and ready `cost_commercial` status.
2. Confirm currency, data date, reporting periods, payment assumptions, receipts, and funding records.
3. Pause for user confirmation when payment timing, receipts, retention, tax, advance recovery,
   funding availability, or period boundaries are ambiguous.
4. Call `delivery_capability` with `configure` for `cashflow`.
5. Register planned, actual, and forecast positions for each programme period with exact evidence.
6. Register funding constraints with amount, owner, due date, evidence, and status.
7. Call `init`, or `replace` with `expectedRevision`, then call `validate`.
8. Resolve period arithmetic, rolling balances, programme coverage, evidence gaps, budget differences,
   EAC differences, and funding constraints before claiming readiness.

Report revision, data date, currency, readiness, planned, actual, and forecast inflows and outflows,
ending forecast balance, open funding constraints, exceptions, and audit path. This pack does not
approve cost transactions, changes, claims, investment assumptions, or period-close records.
