---
name: project-delivery-contract-scope
description: Build and validate the implementation-stage contract obligations, approved scope, WBS, acceptance criteria, responsibilities, and interfaces for a Delivery Workspace. Use after direct project sources and local contract/scope baselines are registered.
---

# Project Delivery Contract and Scope

Use `delivery_capability` as the contract-scope system of record.

## Guardrails

- Use only user-selected sources and registered Delivery Workspace records.
- Do not scan the working directory.
- Require approved local contract and scope baselines.
- A tender or knowledge snapshot may corroborate scope but cannot be its sole evidence.
- Every reviewed scope item needs an active direct implementation source.
- Record contract obligations, owners, evidence, and compliance status explicitly.
- Define a stable WBS, inclusion status, acceptance criteria, and owner for every scope item.
- Give every scope item one reviewed RACI assignment with responsible, accountable, interfaces,
  consulted, and informed parties.
- Keep clarifications, noncompliance, and blocked records visible.
- Do not read or write Tender Workspace or Investment Workspace private files.
- Do not spawn nested agents.

## Workflow

1. Read `delivery_workspace` status and confirm direct contract and scope sources are active.
2. Pause for user confirmation when contract revision, approved scope, exclusions, WBS boundary,
   acceptance criteria, accountability, or interface ownership is ambiguous.
3. Call `delivery_capability` with `configure` for `contract_scope`.
4. Register obligations with exact direct evidence and an accountable owner.
5. Register scope items with stable WBS codes, inclusion state, direct evidence, acceptance criteria,
   owner, and review status.
6. Register reviewed RACI assignments and project interfaces.
7. Call `init`, or `replace` with `expectedRevision`, then call `validate`.
8. Resolve missing direct evidence, unapproved baselines, duplicate WBS codes, uncovered scope,
   missing acceptance criteria, and duplicate accountability before claiming readiness.

Report revision, readiness, obligation compliance, scope coverage, direct-source coverage, open
clarifications, and audit path. Contract-scope readiness does not approve programme, cost, cash
flow, change, or period-close records.
