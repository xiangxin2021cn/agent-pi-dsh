---
name: project-delivery-controls-core
description: Establish and audit an independent Delivery Workspace from explicit implementation-stage inputs. Use for project execution control, approved baselines, progress, resources, procurement, cost, cash flow, risk, change, and reporting; tender data is optional evidence only.
---

# Project Delivery Controls Core

Use `delivery_workspace` as the system of record. Initialize from user-selected, user-owned project inputs. A Tender Workspace is not required.

## Guardrails

- Use only files and knowledge items explicitly selected by the user.
- Do not scan the working directory.
- Register direct project sources before approving any local baseline.
- Treat tender and enterprise-knowledge imports as a frozen evidence snapshot with an immutable
  hash, producer revision, and explicit user confirmation.
- A snapshot may corroborate a delivery record but cannot approve a contract, scope, programme,
  budget, organization, or progress baseline by itself.
- Do not read or write Tender Workspace or Investment Workspace private files.
- Do not silently refresh a snapshot after its producer changes.
- Publish approved delivery artifacts for cross-plugin use only through `business_knowledge_publish`.
- Keep conflicting and stale knowledge evidence visible until resolved.
- Do not spawn nested agents.

## Workflow

1. Confirm the delivery project ID, data date, currency, and selected direct source files.
2. Pause for user confirmation when the approved contract, scope, programme, budget, organization,
   progress cut-off, or governing revision is ambiguous.
3. Call `delivery_workspace` with `init`.
4. Register user-owned inputs with `upsert_sources`; retain hashes and source revisions.
5. If requested, import a user-approved tender or knowledge artifact as a frozen snapshot. Never
   make another plugin's live directory a delivery dependency.
6. Register local baselines with exact source or verified snapshot references.
7. Record knowledge uses as corroborating, contradicting, derived, or superseding local evidence.
8. Call `validate`. Correct broken evidence and unresolved conflicts before any approved-baseline
   or period-close claim.
9. When explicitly approved for reuse, publish the exact controlled artifact to the enterprise
   knowledge base; other plugins must import the returned immutable snapshot and corroborate it.

Core readiness means the delivery project has active direct inputs and internally valid evidence.
It does not approve later programme, cost, cash-flow, change, or reporting capability packs.
