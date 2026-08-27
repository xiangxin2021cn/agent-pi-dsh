---
name: tender-submission-documents
description: Compile formal tender submission documents after tender construction planning, programme/resource planning, and cost/cash-flow planning are ready, including WORK PLAN AND PROPOSED METHODOLOGY, construction programme, labour/material/plant plan, and cash-flow plan.
---

# Tender Submission Documents

Use `tender_capability` as the submission-documents system of record. This skill authors the formal bid deliverables after planning packs are ready; it does not invent new scope or silently change commercial assumptions.

## Guardrails

- Use only user-selected sources, registered Tender Workspace records, ready capability packs, and explicitly loaded knowledge-base entries.
- Do not scan the working directory as a source corpus.
- Require ready, non-stale `execution_plan`, `schedule_resources`, and `cost_cashflow` packs.
- Prepare formal deliverables only when required by the user or the tender requirements.
- For Agent Pi stage 4-C, always write `Work_Plan_and_Proposed_Methodology.docx` and
  `submission_audit.md` under `Agent Pi Outputs/<projectId>/planning/` (Official Outputs; use the bound Work Plan DOCX template when present).
- Other specialist formats remain optional unless the tender or user requires them.
- Keep internal evidence matrices, audit ledgers, and review notes out of formal deliverables unless explicitly requested.
- Match the tender template, language, headings, layout intent, and evaluation criteria when a template or instruction is provided.
- **Writing:** Follow tender-intelligence-core `references/writing-contract.md`. Formal returnables are the employer's document in the employer's terms, with AI filler stripped — not an AI report about the bid.

## Workflow

1. Call `tender_workspace` with `status`, then call `tender_capability` with `status` for `execution_plan`, `schedule_resources`, and `cost_cashflow`.
2. Confirm required deliverables, language, template, output formats, file naming, and submission sequence. Pause for user confirmation if any of these are ambiguous.
3. Compile the required formal deliverables:
   - WORK PLAN AND PROPOSED METHODOLOGY;
   - construction programme;
   - labour, material, and plant plan;
   - cash-flow plan;
   - other user-selected or tender-required documents.
4. Each deliverable must cite its source capability packs and tender requirements. Keep prose reader-facing and professional; move control registers to appendix only when requested.
5. Call `tender_capability` with `configure` for `submission_documents`.
6. Register every formal deliverable with title, kind, format, file path, linked requirements, source refs, and status.
7. Call `tender_capability` with `init`, or `replace` with the current `expectedRevision`.
8. Call `validate`. Resolve missing required document kinds, missing requirement links, missing source refs, and blocked deliverables before submission audit.

## Completion

Report the pack revision, readiness, generated deliverables, requested formats still pending, unresolved template decisions, and audit path. Do not claim the bid package is submission-ready until `submission_audit` passes.
