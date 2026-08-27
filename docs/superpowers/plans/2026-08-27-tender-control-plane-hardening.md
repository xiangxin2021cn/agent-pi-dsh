# Tender Control-Plane Hardening Plan

**Goal:** Prevent the tender workflow from skipping stages or closing incomplete work, make capability freshness authoritative, and carry the user's selected knowledge entries into DSH worker briefs.

**Scope:** Tender orchestration and its HTTP/tool/UI adapters only. Do not refactor the DSH execution kernel, unrelated modules, website, or generated desktop distributions.

**Execution status:** Completed and verified on 2026-08-27.

## Task 1: Lock the stage lifecycle

**Files:**
- Add: `bundles/tender-host/tests/orchestration-lifecycle.test.ts`
- Modify: `bundles/tender-host/src/orchestration.ts`

1. Add failing tests proving that a later stage cannot be prepared or completed while a predecessor is unfinished.
2. Add a failing test proving that a task file appearing on disk does not implicitly complete its stage before `complete_stage`.
3. Implement one predecessor check shared by `prepareStage` and `completeStage`.
4. Change board inspection so task delivery advances the stage to `running`; only an explicit completion timestamp produces `done`.
5. Verify the new lifecycle test file passes.

## Task 2: Connect stage closure to real tender outputs

**Files:**
- Modify: `bundles/tender-host/tests/orchestration-lifecycle.test.ts`
- Modify: `bundles/tender-host/src/orchestration.ts`

1. Add failing tests for an empty planning-stage completion, a missing ready capability pack, and a too-small summary file.
2. Require ready, non-stale capability packs at each tender stage:
   - analysis: `document_analysis`, `boq_reconciliation`
   - pricing: `boq_five_step_pricing`, `construction_resource_schedule`, `bidder_commitments`
   - planning: `execution_plan`, `schedule_resources`, `cost_cashflow`, `submission_documents`
3. Require the planning files declared by the bundled skills: `施工策划报告.md`, both MSP/P6 XML programmes, `S-Curve_Cash_Flow_Chart.html`, `Work_Plan_and_Proposed_Methodology.docx`, and `submission_audit.md`.
4. Use the existing minimum-size readiness check for stage summaries instead of existence alone.
5. Require `submission_documents` readiness and the skill-declared `submission_audit.md` before the combined planning/submission stage can close.
6. Verify the lifecycle tests pass.

## Task 3: Repair knowledge and tool-contract handoff

**Files:**
- Modify: `bundles/tender-host/tests/orchestration-lifecycle.test.ts`
- Modify: `bundles/tender-host/src/orchestration.ts`
- Modify: `bundles/tender-host/src/tools.ts`
- Modify: `bundles/tender-host/src/http.ts`
- Modify: `bundles/tender-web/lib/client.js`

1. Add a failing test proving selected knowledge slugs are absent from generated source briefs.
2. Add an optional selected-slug argument to stage preparation and write those slugs plus retrieval instructions into every source brief.
3. Pass the active session id through the workbench UI and HTTP endpoint; resolve selected slugs server-side. Pass the DSH tool session id through the tool adapter.
4. Support the runtime skills' documented `init` alias for capability replacement and `configure` as an explicit status/configuration acknowledgement; reject unknown actions instead of silently returning status.
5. Remove the organize prompt's nonexistent `tender_stage update_task` instruction.
6. Run the host and web test suites.

## Task 4: Make capability freshness truthful

**Files:**
- Add: `bundles/tender-host/tests/workspace-capability-state.test.ts`
- Modify: `bundles/tender-host/src/workspace.ts`

1. Add failing tests proving a core revision makes existing capability envelopes stale and an audit's `not_ready` state is not rewritten as `needs_review`.
2. Recompute stale flags from persisted envelopes whenever workspace core data or a capability revision changes, and when status is read.
3. Preserve the readiness returned by the business-core audit.
4. Verify the new capability-state tests pass.

## Task 5: Replace sample BOQ gating with source coverage

**Files:**
- Modify: `bundles/tender-host/tests/boq-inventory-gate.test.ts`
- Modify: `bundles/tender-host/src/boq-inventory-gate.ts`
- Modify: `bundles/tender-host/src/orchestration.ts`
- Modify: `bundles/tender-host/src/workflows.ts`

1. Add failing tests proving a three-row sample cannot hide additional coded rows in a restored BOQ source, a missing BOQ restore fails closed, and a genuine one-row BOQ is accepted when fully covered.
2. Extract a conservative lower bound of every restored BOQ Markdown row that carries a unit, including inherited `(a)/(b)` rows, and collect explicit full item codes for identity matching.
3. Require the capability pack to cover both the source row count and every explicit source code; require a readable restore for every active BOQ document.
4. Remove the arbitrary three-item acceptance threshold while retaining up to three representative memo citations.
5. Update stage prompts to require all identifiable rows, including PC Sum, Provisional Sum, and percentage pass-through items.

## Task 6: Full verification

1. Run all `bundles/tender-host` tests.
2. Run all `bundles/tender-web` tests.
3. Run all `packages/business-core/src/tender` tests.
4. Run the relevant build/typecheck command exposed by each changed package.
5. Inspect the exact changed files and report any remaining tender risks that were intentionally not changed.
