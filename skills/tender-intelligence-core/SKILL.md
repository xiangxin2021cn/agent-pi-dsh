---
name: tender-intelligence-core
description: "Build and validate a source-controlled Tender Workspace from explicitly selected tender documents."
---

# Tender Intelligence Core

Use this skill for bounded tender intake, compliance mapping, evaluation-criteria capture, deliverable planning, and readiness review. Use `tender_workspace` as the system of record; chat is only the command and explanation surface.

## Guardrails

- Use only user-selected sources, attached files, and explicitly registered files.
- Register every source document and revision before analyzing it.
- Preserve an exact source locator for every requirement and evaluation criterion.
- Do not use hard-coded rates or productivity benchmarks.
- Do not scan the working directory for source documents.
- Pause for human confirmation when source scope, precedence, or interpretation is ambiguous.
- Run deterministic validation before declaring the tender workflow complete.
- Do not copy full licensed standards into the workspace or skill output.
- Do not spawn nested sub-agents.
- Record unresolved assumptions as gaps; never promote them to unconditional conclusions.
- Share an approved tender artifact with other plugins only through `business_knowledge_publish`; never expose the live Tender Workspace store.
- Follow [references/writing-contract.md](references/writing-contract.md) for every customer-facing parse memo, workpaper, methodology, programme narrative, formal returnable, and stage summary: tender-grounded professional bid writing with AI filler stripped.
- Also follow skill tender-formal-writing for every customer-facing artifact.

## Tool Contract

Use the `tender_workspace` tool only through its registered schema. Its actions are:

- `init`
- `upsert_documents`
- `upsert_requirements`
- `upsert_criteria`
- `upsert_deliverables`
- `upsert_responses`
- `status`
- `validate`

Register entities in dependency order. Reject and correct invalid references instead of working around validation failures or maintaining a parallel tender model in prose.

## Operating Sequence

1. Follow [references/workflow.md](references/workflow.md) for intake and registration order.
2. Follow [references/data-model.md](references/data-model.md) for entity links and source locators.
3. Follow [references/writing-contract.md](references/writing-contract.md) whenever writing a human-readable artifact or stage summary.
4. Follow [references/readiness-gates.md](references/readiness-gates.md) before reporting completion or handing work downstream.

Hand off to BOQ, methodology, schedule, resource, cost, or cash-flow capabilities only after the source boundary is confirmed, ambiguity is resolved or explicitly recorded, and deterministic validation has run. Readiness is not legal, engineering, commercial, or tender-manager approval.

When the user approves cross-plugin reuse, publish the exact approved artifact to the enterprise knowledge base. The returned immutable knowledge snapshot may then be explicitly imported and corroborated by Delivery or Investment without creating a live dependency.
