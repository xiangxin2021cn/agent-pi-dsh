---
name: tender-evaluation-strategy
description: Build, revise, and validate an evidence-backed response strategy for evaluation criteria already registered in an Agent Pi Tender Workspace. Use for pass/fail, threshold, weighted scoring, response ownership, evidence planning, differentiators, and criterion-level tender review.
---

# Tender Evaluation Strategy

Create one controlled strategy record for every registered evaluation criterion. Use `tender_capability` as the evaluation-strategy system of record. Do not maintain a parallel scoring model in chat or in an unvalidated document.

## Guardrails

- Use only user-selected sources and registered Tender Workspace records.
- Do not scan the working directory.
- Read the Tender Workspace status before proposing strategy records.
- Preserve registered criterion IDs and exact evidence locators.
- Pass/fail criteria must not have target scores.
- Weighted target scores must not exceed the published weight.
- Threshold targets must not fall below the published minimum.
- Reviewed strategies require registered evidence locators or existing evidence artifacts.
- Do not state win probability or competitor claims as fact without sourced scenario evidence.
- Keep assumptions, differentiators, and risks separate from verified source facts.
- A stale capability pack is not ready.
- Do not spawn nested agents or expand the tender scope while using this skill.
- **Writing:** Follow tender-intelligence-core `references/writing-contract.md`. Criterion themes and evidence notes must use the employer's evaluation language, with AI filler stripped.

## Workflow

1. Call `tender_workspace` with `status` for the explicit project ID.
2. Confirm that the selected source boundary, criteria, linked requirements, scoring methods, weights,
   thresholds, and evidence expectations are registered. Pause for user confirmation when criteria,
   source precedence, scoring interpretation, or response authority is ambiguous.
3. Call `tender_capability` with `configure` to record whether `evaluation_strategy` is enabled and
   required for this tender.
4. Build exactly one strategy per criterion:
   - use `must_pass` for pass/fail or otherwise disqualifying criteria;
   - set a target score only where the criterion method supports it;
   - name the accountable response owner;
   - state a concise response theme;
   - list the evidence plan and exact available evidence;
   - label differentiators and risks without presenting them as source facts;
   - use `planned`, `evidenced`, `reviewed`, or `blocked` honestly.
5. Call `tender_capability` with `init`, or `replace` with the current `expectedRevision`.
6. Call `validate`. Correct schema, coverage, scoring, evidence, and reference failures rather than
   bypassing them.
7. If status reports stale, inspect only the changed registered core records, rebuild the affected
   strategies, replace the pack, and validate again.

## Completion

Report the capability revision, readiness, blocked criteria, unresolved user decisions, and audit
path. Do not claim professional approval or submission readiness. Evaluation audit tables are
internal control artifacts and must not be inserted into formal tender narrative unless the user
explicitly requests them.
