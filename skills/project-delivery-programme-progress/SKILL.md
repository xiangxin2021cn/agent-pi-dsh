---
name: project-delivery-programme-progress
description: Build and validate the approved implementation programme, calendars, data date, actual progress, forecasts, milestones, logic, and bounded recovery scenarios for a Delivery Workspace.
---

# Project Delivery Programme and Progress

Use `delivery_capability` as the programme and progress system of record.

## Guardrails

- Use only user-selected sources and registered Delivery Workspace records.
- Do not scan the working directory.
- Require an approved local schedule baseline and a ready contract-scope capability.
- Do not use a tender programme as the live implementation baseline.
- A tender or knowledge snapshot may corroborate planning assumptions, but local mapping and user
  approval are required before it affects the implementation programme.
- Keep the project data date explicit and align every progress update to that date.
- Require active direct progress evidence for every started or completed activity.
- Preserve baseline dates; record forecast dates and recovery scenarios separately.
- Detect missing scope coverage, missing calendars, broken predecessor references, logic cycles,
  inconsistent actuals, unsupported completion, blocked work, and unconfirmed assumptions.
- Do not read or write Tender Workspace or Investment Workspace private files.
- Do not spawn nested agents.

## Workflow

1. Read `delivery_workspace` status and the ready `contract_scope` capability.
2. Confirm the approved local schedule baseline, calendars, scope-to-activity mapping, and data date.
3. Pause for user confirmation when the baseline revision, data date, progress cut, activity status,
   milestone date, logic, or recovery assumption is ambiguous.
4. Call `delivery_capability` with `configure` for `programme_progress`.
5. Register activities against reviewed scope items, preserving baseline and forecast fields.
6. Record actuals, percent complete, remaining duration, and exact direct progress evidence.
7. Register milestones and bounded recovery scenarios without overwriting the approved baseline.
8. Call `init`, or `replace` with `expectedRevision`, then call `validate`.
9. Resolve all schedule-baseline, scope-coverage, evidence, status-consistency, calendar, predecessor,
   and cycle findings before claiming readiness.

Report revision, data date, readiness, activity status counts, milestone variance, blocked work,
unconfirmed assumptions, recovery scenarios, and audit path. Programme readiness does not approve
resources, procurement, cost, cash flow, changes, claims, or period-close records.
