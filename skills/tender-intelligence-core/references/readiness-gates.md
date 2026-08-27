# Tender Readiness Gates

`tender_workspace` validation is deterministic. Treat its audit as a required gate, not as advisory prose.

## Readiness States

- `not_ready`: structural errors, uncovered mandatory requirements, invalid or stale critical references, or blocked critical items remain.
- `needs_review`: the workspace is structurally valid, but evidence, verification, or a non-critical decision remains incomplete.
- `ready`: mandatory requirements and criteria are covered, required deliverables are represented, and verified responses carry evidence.

No readiness state is a bid/no-bid recommendation or legal, contractual, engineering, commercial, or tender-manager approval.

## Required Audit Review

Before completion, review the deterministic audit for:

- schema or reference errors;
- citations to missing or superseded documents;
- uncovered mandatory requirements;
- uncovered pass/fail, threshold, or weighted criteria;
- weighted score coverage;
- deliverables without linked requirements;
- verified responses without evidence;
- blocked requirements or response plans.

## Completion Rule

Run `validate` after the final mutation. A completion report must state the returned readiness, unresolved issues, revision, model path, and audit path. Do not describe the workflow as complete when validation was skipped, failed, or returned issues incompatible with the requested outcome.

When ambiguity affects source scope, precedence, requirement meaning, criterion interpretation, deliverable coverage, or evidence sufficiency, pause for the user's decision. Record the decision or unresolved gap before re-validating.
