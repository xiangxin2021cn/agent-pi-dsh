---
name: tender-schedule-resource-planning
description: Build and validate a tender-stage CPM activity network, calendars, contractual milestones, resource assignments, capacity checks, and professional Gantt-ready data from a ready execution-plan pack. Use for tender programmes and resource plans, not post-award progress control.
---

# Tender Schedule and Resource Planning

Create the structured tender programme before rendering P6, Microsoft Project, Candy, Gantt, resource histogram, or cash-flow artifacts. Use `tender_capability` as the schedule-resource system of record.

## Guardrails

- Use only user-selected sources and registered Tender Workspace records.
- Do not scan the working directory.
- Require a ready, non-stale `execution_plan` and user-accepted 4-A `施工策划报告.md`.
- For Agent Pi stage 4-B, write both `tender-programme.msp.xml` and `tender-programme.p6.xml`
  under `Agent Pi Outputs/<projectId>/planning/` (Official Outputs; plus plant/labour histogram HTML). Dual XML is a hard gate.
- Record a programme start date, calendars, positive durations, duration bases, and predecessor logic.
- Preserve FS, SS, FF, SF, and lag semantics; do not replace missing logic with narrative order.
- Link contractual milestones to registered requirements.
- Record resource capacity, units, assignments, and demand separately.
- Label duration and resource assumptions `scenario` or `unverified` until confirmed.
- Do not invent productivity, calendars, lags, resource capacity, or contractual milestones.
- Render Gantt outputs only from the validated structured schedule.
- Do not create or overwrite a Project Delivery Controls baseline.
- A stale capability pack is not ready.
- If you need to split calendars or histograms, use dsh native subagent / workflow. Do not wait for a workbench runner.
- **Writing:** Follow tender-intelligence-core `references/writing-contract.md`. Programme narratives and histogram notes must use this tender's WBS/activity language, with AI filler stripped.

## Workflow

1. Call `tender_workspace` with `status`, then call `tender_capability` with `status` for
   `execution_plan`.
2. Confirm the execution pack is ready and the user-selected tender scope is complete. Pause for user confirmation when the start date, tender calendar, contractual dates, productivity basis, logic, lags, or resource capacity is ambiguous.
3. Call `tender_capability` with `configure` for `schedule_resources`.
4. Define the programme start date and one or more explicit calendars.
5. Convert work packages into activities with stable IDs, positive durations, duration bases,
   calendars, predecessor relationships, requirement links, source locators, and confidence states.
6. Register resources and assignments. Use capacity only when its unit and basis are known.
7. Register contractual and internal milestones without turning ordinary activities into false
   contractual obligations.
8. Call `tender_capability` with `init`, or `replace` with the current `expectedRevision`.
9. Call `validate`. Correct cycles, missing predecessors, missing calendars, unlinked milestones,
   unassigned activities, and resource over-allocation instead of hiding them in a chart.
10. If status reports stale, revise only affected activities or assignments, replace the pack, and
    validate again.

## Outputs

After validation, render professional construction outputs from the structured data:

- WBS-grouped programme;
- critical path and total-float view;
- milestone schedule;
- resource histogram and capacity exceptions;
- A4 or A3 landscape Gantt export when requested;
- P6, Microsoft Project, or Candy artifacts through the dedicated construction-schedule skill.

The renderer is not the system of record. Report the pack revision, readiness, programme duration,
critical activities, resource conflicts, unverified assumptions, and audit path. Tender programme
readiness is not an approved post-award baseline or progress update.
