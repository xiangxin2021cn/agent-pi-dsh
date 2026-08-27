# SDD ledger — plan: competition/final/IMPLEMENTATION_PLAN.md

## Pre-flight rulings

- Ruling: work in the current workspace — the repository has no commit baseline and all existing materials are untracked; creating a conventional git worktree is not feasible. Cost if wrong: changes cannot be reviewed by commit range, so each task must preserve old drafts and produce independent output paths.
- Ruling: use `competition/final` as an isolated artifact workspace — this keeps existing `competition/out` files untouched. Cost if wrong: duplicated assets consume additional disk space.
- Ruling: use read-only subagents for task review and fresh implementation agents only on isolated final files — all agents share one filesystem, so implementation remains sequential. Cost if wrong: a subagent could still touch unrelated files; briefs explicitly prohibit it.

## Dependency scan

| Tasks sharing an interface | Producer | Consumer | Finding |
|---|---|---|---|
| Boards → PPT | Board visual system and final images | PPT theme and showcase visuals | Must finish and review boards before PPT implementation. |
| Boards/PPT → Recommendation form | Exact title, entrant, track | Basic form fields | Text values are fixed globally; no layout dependency. |
| All tasks → Final QA | Final artifacts | Delivery checklist | QA must inspect current rendered outputs, not source files alone. |

## Task status

- Task 1: completed — three A1 boards; independent review passed.
- Task 2: completed — 10+2 slide PPT and two scripts; independent review passed; PPT media redaction baked into pixels.
- Task 3: completed — official recommendation form base-fill; one-page render verified.
- Task 4: completed — final package independent review passed with no remaining blockers.
