---
name: tender-bidder-commitments
description: Capture and validate the bidder's user-confirmed labour, management, plant, material, temporary-facility, method, productivity, sequence, and subcontracting commitments after BOQ five-step pricing and before tender construction planning.
---

# Tender Bidder Commitments

Create the binding tender-planning input pack between calculated BOQ demand and the proposed
construction methodology. Use `tender_capability` with capability `bidder_commitments` as the
system of record.

## Guardrails

- Use only user-entered text, user-selected attachments, registered Tender Workspace records, and
  the ready `boq_five_step_pricing` pack. Do not scan the working directory.
- Keep **calculated BOQ demand** separate from **bidder-confirmed proposed inputs**.
- Never infer that a calculated resource quantity, production rate, procurement route, camp plan,
  construction sequence, or subcontract strategy has been accepted by the user.
- Do not mark this stage ready until the user explicitly confirms the complete planning basis.
- Do not start `execution_plan`, schedule, cost/cash-flow, or submission drafting in this skill.
- Do not spawn child agents. This is a focused user-decision and reconciliation stage.
- **Writing:** Follow tender-intelligence-core `references/writing-contract.md`. Confirmation summaries must record decisions in this tender's terms, with AI filler stripped.

## Required Decisions

Address every category explicitly, even when the answer is `not_applicable`:

1. `labour`: proposed labour quantities, crews, mobilization, and local/expatriate basis.
2. `management`: proposed management structure and total control headcount.
3. `plant`: quantities and owned transfer, new purchase, local hire, mixed, or subcontract route.
4. `materials`: own quotations, historical purchase data, procurement route, and price precedence.
5. `temporary_facilities`: camp/site establishment investment, location, capacity, and timing.
6. `method`: bidder-requested construction-method revisions.
7. `productivity`: bidder-accepted productivity or efficiency revisions.
8. `sequence_timing`: initial work sequence, work fronts, mobilization, and timing direction.
9. `subcontracting`: packages to self-perform or subcontract and the decision basis.

## Workflow

1. Call `tender_capability status` for `document_analysis` and `boq_five_step_pricing`. Stop if
   either pack is not ready or is stale.
2. Summarize the calculated resource, productivity, duration, cost-rate, and cash-flow basis that
   requires bidder confirmation. Present only decision-relevant differences and gaps.
3. Ask the user to enter decisions in the conversation or attach decision records, quotations,
   historic procurement data, organization plans, camp plans, plant lists, or subcontract plans.
4. Reconcile every user decision against the calculated BOQ basis. Record each item with category,
   decision, quantity/unit when quantified, mode/location/period where relevant, affected BOQ item
   IDs or project-wide scope, and the exact input reference.
5. Record unresolved values only in `openItems`. If the user accepts a provisional basis, use
   `accepted_assumption` and record its risk treatment. Never silently promote an open point.
6. Show a concise confirmation summary to the user. Only after explicit confirmation set
   `confirmation.confirmed: true`, including confirmer, timestamp, and basis statement.
7. Call `tender_capability configure`, then `init` or `replace` for `bidder_commitments`, and call
   `validate`. Resolve missing categories, invalid BOQ references, open items, and inactive sources.

## Completion

Report the capability revision, readiness, confirmation identity/time, commitment count, accepted
assumptions, open items, and audit path. A ready pack is the binding planning basis for the tender
methodology; it is not a post-award resource baseline or a procurement authorization.
