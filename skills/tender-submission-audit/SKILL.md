---
name: tender-submission-audit
description: Assemble and red-team a formal tender submission against registered deliverables, required capability packs, formats, templates, signatures, hashes, source evidence, and contradiction gates. Use immediately before claiming a bid is submission-ready.
---

# Tender Submission Audit

Use `tender_capability` as the submission-audit system of record. This skill validates the formal
package; it does not author new scope or silently repair commercial decisions.

## Guardrails

- Use only user-selected sources and registered Tender Workspace records.
- Do not scan the working directory.
- Require the Tender Workspace and all required capability packs are ready and non-stale.
- Require exactly one current submission item for every registered deliverable.
- Verify required format, template, file presence, rendered output, signature status, and SHA-256.
- Resolve cross-deliverable dependencies and contradictions before acceptance.
- Do not insert red-team findings into the formal bid narrative.
- Do not claim submission-ready until the submission audit returns `ready` and Goal Audit passes.
- Keep red-team findings in the audit record, with evidence and resolution status.
- Do not spawn nested agents.
- **Writing:** Follow tender-intelligence-core `references/writing-contract.md`. Audit notes stay internal; any user-facing finding must cite the returnable in the employer's terms, with AI filler stripped.

## Workflow

1. Read Tender Workspace status and each required capability status through the registered tools.
2. Pause for user confirmation when a required deliverable, signature rule, template, output
   format, or accepted exception is ambiguous.
3. Call `tender_capability` with `configure` for `submission_audit`.
4. Register one current item for each deliverable, including dependencies, evidence, hash, and
   validation checks.
5. Render and inspect each office/PDF artifact using the existing preview pipeline. Do not infer a
   successful render from source-file existence.
6. Record cross-deliverable contradictions and red-team findings as structured audit records.
7. Call `tender_capability` with `init`, or `replace` with the current `expectedRevision`.
8. Call `validate`; resolve all errors and revalidate. Warnings require explicit disposition.
9. Report readiness, missing or duplicate items, open contradictions, unresolved findings, and
   the model/audit paths. The final completion claim remains subject to Goal Audit.
