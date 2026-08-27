---
name: tender-boq-reconciliation
description: Reconcile registered tender BOQ items against specifications, drawings, measurement rules, and requirements with exact source locations, explicit quantity provenance, assumptions, inclusions, exclusions, and scope gaps. Use before methodology, programme, resource, cost, or cash-flow planning.
---

# Tender BOQ Reconciliation

Build the item-level scope chain used by later tender planning packs. Use `tender_capability` as the BOQ reconciliation system of record. Do not treat chat summaries or generated prose as the authoritative BOQ register.

## Guardrails

- Use only user-selected sources and registered Tender Workspace records.
- Do not scan the working directory.
- Record the exact BOQ document, sheet, and cell or range.
- Preserve exact specification clauses, drawing pages or identifiers, and measurement-rule locators.
- Every analyzed BOQ item needs supporting scope references or an explicit gap.
- Never label a calculated or assumed quantity as a sourced BOQ quantity.
- Keep inclusions, exclusions, assumptions, and unresolved gaps separate.
- Unverified quantities and assumptions may not become unconditional conclusions.
- Do not perform cost pricing in this skill.
- Do not invent missing BOQ items, drawing dimensions, measurement rules, or quantities.
- **Register one record per real BOQ payment row.** The pricing stage batches by BOQ page (one COTO chapter each) and prices every registered row — so reconciliation must extract actual line items from every BOQ sheet. Schedule summary/total rows (Form C2.3 style, currency-valued) may be kept as cross-check records but are excluded from pricing batches. Never register synthetic "composite" groupings that merge several chapters or rows into one pseudo-item; they are rejected as not pricable and leave the stage with no items.
- **Document analysis cannot close without this pack.** `tender_stage complete_stage` on `tender-document-analysis` refuses an empty, placeholder, or uncited inventory. Feature-gate / `force_pass` cannot waive it. If the tender has no BOQ file, stop and tell the user — do not fabricate rows.
- A stale capability pack is not ready.
- Do not spawn nested agents or expand beyond the selected BOQ scope.
- **Writing:** Follow tender-intelligence-core `references/writing-contract.md`. Any human-readable reconciliation note must use this BOQ's codes and measurement language, with AI filler stripped.

## Workflow

1. Call `tender_workspace` with `status` for the explicit project ID.
2. Confirm that the selected BOQ, specifications, drawings, addenda, requirements, and revision
   precedence are registered. Pause for user confirmation when source precedence, item boundaries,
   measurement interpretation, drawing scale, or quantity authority is ambiguous.
3. Call `tender_capability` with `configure` for `boq_reconciliation`.
4. Register each analyzed BOQ item with its stable ID, exact workbook locator, item code,
   description, unit, and quantity provenance:
   - `boq` + `sourced` only for an explicit BOQ quantity;
   - `calculated` for a traceable take-off;
   - `assumption` for a stated scenario;
   - `not_provided` when no quantity is available.
5. Create exactly one scope link per item. Link requirements, specification clauses, drawings,
   measurement rules, inclusions, exclusions, and assumptions. Use `needs_review` or `blocked` rather
   than marking unsupported scope clear.
6. Call `tender_capability` with `init`, or `replace` with the current `expectedRevision`.
7. Call `validate`. Resolve broken references, unit conflicts, duplicate locations, unsupported
   scope, and rejected assumptions instead of bypassing audit errors.
8. If status reports stale, inspect only changed registered records, revise affected items, replace
   the pack, and validate again.

## Completion

Report the pack revision, readiness, analyzed-item count, unresolved scope gaps, unverified
quantities, unverified assumptions, and audit path. Name the BOQ file and at least the first
item codes so 《工程量清单分析.md》 can cite them. Do not claim that reconciliation is engineering,
quantity-surveyor, or commercial approval. Keep reconciliation matrices as control artifacts unless
the user explicitly requests them in a formal deliverable.
