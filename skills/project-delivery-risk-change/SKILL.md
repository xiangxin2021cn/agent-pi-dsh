---
name: project-delivery-risk-change
description: Build and validate implementation risks, issues, contractual notices, changes, claims, and decisions for a Delivery Workspace.
---

# Project Delivery Risk, Change, and Decision

Use `delivery_capability` as the risk, change, and decision system of record.

## Guardrails

- Use only user-selected sources and registered Delivery Workspace records.
- Do not scan the working directory.
- Require a ready contract-scope capability and explicit project data date.
- Require active direct implementation evidence for confirmed risks, resolved issues, issued notices,
  approved or implemented changes, submitted or agreed claims, and resolved decisions.
- A tender risk, investment assumption, or knowledge snapshot may corroborate a record but cannot become an implementation fact or approved change without local verification and user approval.
- Link risks, issues, and changes to reviewed implementation scope where applicable.
- Link contractual notices to contract obligations, changes to notices, claims to changes and notices,
  and decisions to existing controlled records.
- Calculate risk rating as probability times impact and keep scenario confidence explicit.
- Keep overdue, pending, unverified, rejected, and blocked records visible.
- Do not read or write Tender Workspace or Investment Workspace private files.
- Do not spawn nested agents.

## Workflow

1. Read `delivery_workspace` and ready `contract_scope` status.
2. Confirm currency, data date, risk register, issue log, notice register, change register, claim
   register, and decision log.
3. Pause for user confirmation when contractual deadline, notice status, entitlement, approval,
   cost or time impact, claim status, decision authority, or record linkage is ambiguous.
4. Call `delivery_capability` with `configure` for `risk_change`.
5. Register risks and opportunities with cause, effect, rating, owner, response, evidence, and confidence.
6. Register issues and resolutions, contractual notices, changes, claims, and decisions with exact links.
7. Call `init`, or `replace` with `expectedRevision`, then call `validate`.
8. Resolve broken links, unsupported approvals, risk-rating differences, overdue notices, overdue
   issues or decisions, and blocked controls before claiming readiness.

Report revision, data date, readiness, open risks and issues, overdue notices, approved and pending
changes, agreed claims, pending decisions, exceptions, and audit path. This pack does not approve
budget posting, programme updates, cash flow, investment assumptions, or period-close records.
