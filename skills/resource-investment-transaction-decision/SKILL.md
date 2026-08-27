---
name: resource-investment-transaction-decision
description: Use when preparing an investment committee decision, financing and transaction structure, conditions precedent, recommendation, approval record, or rejection record for a resource investment.
---

# Resource Investment Transaction Decision

Use `investment_capability` with `transaction_decision` only after `financial_valuation` is ready.

## Guardrails

- Use registered user-selected investment sources. Do not scan the working directory.
- Do not read Tender Workspace or Delivery Workspace private files.
- A knowledge snapshot may corroborate a decision paper but cannot replace active direct investment evidence.
- Keep recommendation, authority, decision, conditions precedent, and post-approval actions separate.
- Do not mark a transaction approved without an identified authority, decision record, and direct evidence.

## Workflow

1. Confirm decision authority, transaction perimeter, valuation revision, financing constraints, and required approvals.
2. Record verified findings for `financing`, `transaction`, and `recommendation`.
3. Register material assumptions, metrics, risks, conditions precedent, and alternative structures.
4. Record the decision as pending, approved, or rejected with exact evidence and decision time.
5. Call `investment_capability` with `init` or revision-safe `replace`, then call `validate`.

Report readiness, recommendation, decision authority, conditions, unresolved risks, and audit path. Only an evidenced approved decision may close this capability.
