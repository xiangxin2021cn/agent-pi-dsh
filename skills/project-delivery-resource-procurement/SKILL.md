---
name: project-delivery-resource-procurement
description: Build and validate implementation labour, plant, material, subcontract, activity allocations, procurement packages, delivery dates, capacity, and constraints for a Delivery Workspace.
---

# Project Delivery Resource and Procurement

Use `delivery_capability` as the resource and procurement system of record.

## Guardrails

- Use only user-selected sources and registered Delivery Workspace records.
- Do not scan the working directory.
- Require ready contract-scope and programme-progress capabilities plus an approved local
  organization baseline.
- Require direct implementation evidence for confirmed resources, reviewed allocations, and
  confirmed procurement packages.
- A tender estimate or knowledge snapshot may corroborate an assumption but cannot become a confirmed resource or commitment without local verification and user approval.
- Map labour, plant, material, and subcontract resources to implementation activities.
- Check required-on-site dates, forecast delivery dates, capacity, supplier status, and open
  constraints without overwriting the approved programme.
- Keep scenarios, unverified suppliers, late deliveries, shortages, and blocked constraints visible.
- Do not read or write Tender Workspace or Investment Workspace private files.
- Do not spawn nested agents.

## Workflow

1. Read `delivery_workspace`, ready `contract_scope`, and ready `programme_progress` status.
2. Confirm the data date, approved organization, resource register, procurement register, and
   activity demand records.
3. Pause for user confirmation when availability, productivity, demand, supplier, delivery date,
   commitment, or constraint ownership is ambiguous.
4. Call `delivery_capability` with `configure` for `resource_procurement`.
5. Register resources with category, unit, availability, capacity, evidence, and confirmation state.
6. Register activity allocations with dates, quantities, demand, evidence, and review state.
7. Register material and subcontract procurement packages with required-on-site date, forecast or
   actual delivery, lead time, supplier, evidence, and confidence.
8. Record resource and procurement constraints with owner, due date, and status.
9. Call `init`, or `replace` with `expectedRevision`, then call `validate`.
10. Resolve missing activity coverage, unsupported records, capacity overloads, missing procurement
    packages, late delivery, and overdue or blocked constraints before claiming readiness.

Report revision, data date, readiness, activity coverage, resource and allocation counts, late
packages, capacity exceptions, open constraints, and audit path. This pack does not approve cost,
cash flow, changes, claims, investment assumptions, or period-close records.
