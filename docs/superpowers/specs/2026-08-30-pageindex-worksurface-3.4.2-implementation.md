# Agent Pi DSH 3.4.2 PageIndex / WorkSurface implementation record

## Runtime decision

3.4.2 does not bundle PageIndex's Python, LiteLLM or OpenAI SDK runtime. It
adapts only the MIT-licensed Markdown hierarchy algorithm and compatible tree
fields from VectifyAI/PageIndex commit
`9fee239b174fcc205fec28df105e519ac7171522` into the existing TypeScript host.
This avoids a second credential manager, Python packaging, duplicate parsing
and Electron cold-start work. MinerU, setup manuscripts and KB pack units stay
authoritative. OpenKB is not imported.

The development-only `scripts/pageindex-shadow-worker.mts` invokes the same
builder outside the desktop runtime. Production indexing runs only when a KB
or setup manuscript is added, changed, saved or explicitly reindexed; it never
runs during Electron first paint.

## Preserved authority

- DSH main agent, permissions, session loop and native subagent/workflow.
- `tender-host` project state, stages, tasks and three user approval gates.
- MinerU/OCR, page images, pack units, exact clause lookup and MiniSearch.
- BOQ reconciliation, full-row coverage, sheet/cell provenance and hard gate.
- Pricing freeze, detailed pricing, planning, compliance and final freeze.
- Official Outputs and deterministic citation audit.

PageIndex is navigation metadata. A node title or preview cannot become an
evidence quote. Table questions cannot fall back to a document summary.

## Implemented surfaces

1. `document`: PageIndex shadow trees for eligible long narrative setup/KB
   manuscripts, with source/pack/parser hashes and automatic invalidation.
2. `table`: existing BOQ and Office table paths; no PageIndex calculation.
3. `graph`: a derived view of document supersession and capability dependency
   state; the authoritative workspace/capability files are not duplicated.
4. Structured evidence packages freeze claim, exact quote, human locator,
   internal locator and SHA-256. `[ev:claimId]` joins existing `[kb:…]` and
   `[src:…]` deterministic audit.
5. Five analysis-domain coverage ledgers record read/unread nodes, evidence,
   conclusions and human-confirmation requirements.

## Evaluation and cutover

The committed development set has 96 atomic document/table/graph tasks. It is
explicitly marked `development-fixture`, so it cannot enable default
navigation. `worksurface-release-gate.json` fails closed unless an
`audited-real-project`, human-reviewed 80+ task artifact satisfies every gate:

- Route F1 >= 0.95.
- Locator validity = 100%.
- Unsupported critical claims <= 1%.
- Document evidence recall gain >= 10 percentage points.
- Cross-project leakage = 0.
- BOQ coverage at least the 3.4.1 baseline.
- Missing/corrupt/disabled shadow fallback verified.

Until then the workbench displays “影子评测”, and existing MiniSearch,
`kb_find_clause`, MinerU manuscripts, BOQ tools and hard gates remain the
operational fallback.
