---
name: resource-investment-intelligence-core
description: Establish and audit an independent Resource Investment Intelligence workspace from explicit investment inputs, with frozen cross-plugin knowledge snapshots and approved local assumptions.
---

# Resource Investment Intelligence Core

Use `investment_workspace` as the investment system of record.

## Guardrails

- Use only user-selected investment sources and registered Investment Workspace records.
- Do not scan the working directory.
- Do not read Tender Workspace or Delivery Workspace private files.
- Share cross-plugin evidence only through an immutable enterprise knowledge snapshot with producer,
  workspace revision, managed path, content hash, approval state, import time, and user confirmation.
- A tender, delivery, investment, or knowledge snapshot may corroborate local analysis but cannot be the sole basis for an approved assumption or investment decision.
- Require at least one active direct investment source and one approved local assumption set.
- Keep conflicted, stale, unverified, superseded, and withdrawn evidence visible.
- Publish approved investment artifacts for cross-plugin use only through `business_knowledge_publish`.
- Do not spawn nested agents.

## Workflow

1. Confirm working directory, investment project ID, stage, base currency, valuation date, and direct sources.
2. Pause for user confirmation when mandate, stage, currency, valuation date, source revision,
   assumption ownership, or snapshot relevance is ambiguous.
3. Call `investment_workspace` with `init`.
4. Register direct sources with identity, type, revision, hash, and status.
5. Import optional cross-plugin publications only as frozen snapshots; never follow private-store paths.
6. Register approved local assumption sets with active direct evidence.
7. Record explicit knowledge-use relationships and verification state.
8. Call `validate` and resolve direct-input, assumption, snapshot, conflict, and staleness findings.
9. When the user approves reuse, publish the exact controlled artifact to the enterprise knowledge
   base; Tender or Delivery must import and corroborate the returned immutable snapshot.

Report workspace revision, stage, readiness, direct-source count, snapshot count, approved assumption
sets, knowledge conflicts, and audit path. Core readiness does not approve technical, market, legal,
financial, transaction, or investment-committee conclusions.
