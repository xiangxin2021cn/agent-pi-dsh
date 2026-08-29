# Agent Pi WorkSurface benchmark v1

`development-fixture.json` contains 96 deterministic atomic tasks: 32 document,
32 table and 32 dependency-graph tasks. Every task uses the production schema:
`id`, `question`, `requiredSurfaces`, `goldEvidence`, `dependencyPath`,
`answerRubric`, and `forbiddenClaims`.

This fixture verifies scoring, routing isolation, locators, fallback and cost
telemetry. It is deliberately marked `development-fixture` and
`goldReviewedByHumans: false`; therefore it can never enable PageIndex as the
default navigator. Production cutover additionally requires an 80–120 task,
human-reviewed, `audited-real-project` manifest with actual tender pages, BOQ
cells and dependency paths. The release gate in `worksurface-benchmark.ts`
enforces that distinction.

Regenerate the fixture with:

```powershell
node scripts/generate-worksurface-development-fixture.mjs
```
