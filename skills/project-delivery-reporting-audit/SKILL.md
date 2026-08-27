---
name: project-delivery-reporting-audit
description: Close an implementation reporting period by attesting enabled Delivery Workspace capabilities, explaining variances, registering approved management reports, and preserving an immutable audit chain.
---

# Project Delivery Reporting and Audit

Use `delivery_capability` as the reporting and audit system of record.

## Guardrails

- Use only user-selected sources and registered Delivery Workspace records.
- Do not scan the working directory.
- Require every enabled delivery capability to be ready before period close.
- Attest every enabled delivery capability explicitly; do not require disabled packs.
- Require direct implementation evidence for reviewed variances, approved reports, and period-close approval.
- Generate only the report formats required by an explicit user request or approved delivery template.
- Do not generate PDF by default.
- Keep evidence matrices, audit details, and control metadata out of the professional report body
  unless the user or required template explicitly asks for them.
- Preserve content hashes and a contiguous audit history; never rewrite prior audit events.
- A tender, investment, or knowledge snapshot may corroborate a statement but cannot replace a
  ready implementation capability or period-close approval.
- Do not read or write Tender Workspace or Investment Workspace private files.
- Do not spawn nested agents.

## Workflow

1. Read `delivery_workspace` status and the capability index.
2. Confirm reporting period, data date, enabled packs, requested output formats, and approved template.
3. Pause for user confirmation when a capability exception, variance explanation, report format,
   report approval, or close authority is ambiguous.
4. Call `delivery_capability` with `configure` for `reporting_audit` after all enabled packs are ready.
5. Record one reviewed attestation for each enabled pack and evidence-backed variance explanations.
6. Create only requested management-report artifacts, then register path, format, hash, coverage,
   evidence, and approval state.
7. Record explicit period-close approval and append immutable audit history entries.
8. Call `init`, or `replace` with `expectedRevision`, then call `validate`.
9. Resolve missing attestations, uncovered capabilities, unsupported reports, approval gaps, broken
   audit links, and stale upstream packs before claiming period close.

Report revision, period, data date, readiness, enabled and attested packs, reviewed variances,
approved reports, close approval, audit-chain length, exceptions, and audit path. Reporting
readiness closes only this registered period and does not mutate upstream control records.
