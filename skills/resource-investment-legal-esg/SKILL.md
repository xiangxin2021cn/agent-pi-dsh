---
name: resource-investment-legal-esg
description: Use when reviewing title, permits, regulatory obligations, environmental liabilities, social licence, land access, closure, governance, and ESG conditions for a resource investment.
---

# Resource Investment Legal And ESG Diligence

Use `investment_capability` with `legal_esg` only after `mandate_screening` is ready.

## Guardrails

- Use registered user-selected investment sources. Do not scan the working directory.
- Do not read Tender Workspace or Delivery Workspace private files.
- A knowledge snapshot may corroborate jurisdiction context but cannot replace active direct investment evidence.
- Distinguish issued rights, pending applications, conditions precedent, legal opinion, and management representation.
- Do not infer regulatory compliance from absence of evidence.

## Workflow

1. Confirm jurisdiction, asset ownership, licence perimeter, permit register, land access, and source revisions.
2. Record verified findings for `title_permit`, `environment`, and `social`.
3. Register assumptions and measurable obligations with dates, authorities, and evidence locators.
4. Record legal, permitting, rehabilitation, closure, community, governance, and ESG risks with owners.
5. Call `investment_capability` with `init` or revision-safe `replace`, then call `validate`.

Report readiness, conditions precedent, missing opinions or permits, material liabilities, and audit path. Do not provide an unqualified legal conclusion.
