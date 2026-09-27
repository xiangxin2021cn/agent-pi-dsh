---
name: tender-execution-planning
description: Build and validate tender-stage construction work packages, method steps, resource needs, interfaces, constraints, hold points, temporary works, HSE controls, and environmental controls from ready evaluation and BOQ reconciliation packs. Use for technical proposals and tender execution methodology, not post-award project controls.
---

# Tender Execution Planning

Translate reconciled tender scope into controlled work packages. Use `tender_capability` as the tender execution-plan system of record. Use the document-delivery kernel separately when the user requests formal method statements or proposal chapters.

The formal tender deliverable is **WORK PLAN AND PROPOSED METHODOLOGY**. Produce it only from a
ready user-confirmed `bidder_commitments` pack, validated work packages, and the user-selected
tender sources.

## Guardrails

- Use only user-selected sources and registered Tender Workspace records.
- Do not scan the working directory.
- Require ready, non-stale `document_analysis`, `boq_reconciliation`, `boq_five_step_pricing`,
  `construction_resource_schedule`, and `bidder_commitments` packs.
- Write the human-readable methodology draft to
  `Agent Pi Outputs/<projectId>/planning/施工策划报告.md` (Official Outputs; stage 4-A gate). Match the depth of the
  project-applicable planning depth template from `bindings.json`. N2/SANRAL examples supply structure only and require confirmed applicability for technical rules.
- Do not advance to programme XML or Work Plan DOCX until the user accepts the 4-A report.
- Treat bidder-confirmed resource, procurement, camp, method, productivity, sequence, and
  subcontract decisions as binding planning inputs. Explain conflicts with calculated BOQ demand;
  do not silently replace the user decision with a model estimate.
- Assign every reconciled BOQ item to exactly one primary work package.
- Trace every work package to registered BOQ items, requirements, and source locators.
- Do not invent productivity, resource quantities, engineering controls, or temporary works.
- If Official Outputs `项目特征.md` or the stage evidence ledger lists a gap (missing spec, geology, calendar, sequence), do not fill it from model memory. Use task-authorized public diligence for publicly verifiable gaps, keeping URL, access/effective date, region and applicability. Private geology, bidder commitments and formal quotations require project evidence; keep unresolved conditions explicit. Respect an explicit no-web restriction.
- Keep HSE controls, environmental controls, interfaces, constraints, and hold points explicit.
- Label unsupported resource needs `unverified`; never promote them to formal assumptions silently.
- Do not create or overwrite a Project Delivery Controls baseline.
- Do not expand tender scope or create downstream schedule and cost records in this skill.
- A stale capability pack is not ready.
- If you need to split chapters, use dsh native subagent / workflow. Do not wait for a workbench runner.
- **Writing:** Follow tender-intelligence-core `references/writing-contract.md`. The 施工策划报告 and any methodology narrative must be this job's method in the tender's terms, with AI filler stripped — not a generic construction textbook.

## Workflow

1. Call `tender_workspace` with `status`, then call `tender_capability` with `status` for
   `document_analysis`, `boq_reconciliation`, `boq_five_step_pricing`, and `bidder_commitments`.
2. Confirm that all upstream packs are ready, the selected BOQ scope is complete, and the bidder
   commitments are explicitly user-confirmed. Pause for user confirmation when method ownership,
   resource deviation, engineering interpretation, temporary works, source
   precedence, or construction constraints are ambiguous.
3. Call `tender_capability` with `configure` for `execution_plan`.
4. Build one primary work package per coherent execution scope. For each package record:
   - BOQ items and requirements;
   - ordered method steps;
   - resource classes, quantities, units, bases, and verification status;
   - hold points, interfaces, constraints, and temporary works;
   - HSE and environmental controls;
   - exact source locators and honest lifecycle status.
5. Call `tender_capability` with `init`, or `replace` with the current `expectedRevision`.
6. Call `validate`. Correct duplicate BOQ ownership, broken references, missing controls, blocked
   packages, and unverified resource assumptions instead of bypassing audit results.
7. If status reports stale, inspect only changed registered core or upstream records, revise affected
   work packages, replace the pack, and validate again.
8. Render the validated plan as a formal proposal narrative. Follow the tender template and requested
   language, preserve source traceability, and explain the proposed sequence, resources, interfaces,
   quality controls, HSE controls, and environmental controls as a coherent submission chapter.

## Completion

Report the revision, readiness, covered BOQ items, reviewed and blocked work packages, unverified
resource needs, user decisions, and audit path. Readiness is a tender-planning control state, not
construction approval, design approval, or an approved post-award baseline. Keep internal control
registers out of formal proposal narrative unless the user explicitly requests them.

## Current task applicability and diligence

Read `professional_task status` when available. Current user scope, source versions, project country/contract/specifications and verified applicability govern this assignment. Historical examples are structure/depth references only. Public read-only task-relevant diligence is allowed unless restricted; use available native search/fetch if AnySearch is absent and choose queries/language for the project locality. Do not interpret force-pass as proof or as authorization to invent private project facts. An explicit no-web restriction overrides legacy always-search instructions; retain missing rate evidence as provisional and report the limitation. Supplier RFQs are drafts until the user authorizes sending; generating or web-researching contacts is not a supplier response. Register calculation inputs, coverage gaps, required returnables, scoring links and actual files in the shared task record; retain the native workspace/capability packs as domain records.
