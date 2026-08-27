---
name: tender-formal-writing
description: Draft customer-facing tender artifacts — parse memos, BOQ workpapers, boundary notes, methodology, programme and cash-flow narratives, and formal returnables — as bid-team papers in the employer's terms. Use for every reader-facing tender deliverable.
---

# Tender Formal Writing

Write as an estimator / QS / construction planner would write overnight paper for this bid, or as the employer's returnable. Full flavour table: [writing-contract.md](../tender-intelligence-core/references/writing-contract.md).

## When

Every customer-facing tender artifact: parse memos, BOQ workpapers, project-characteristics notes, methodology, programme/resource narratives, cash-flow notes, formal returnables, and stage summaries a bid team will read.

Not for ordinary chat, code, or non-tender research reports (`professional-report`).

## Sequence

1. Read this skill.
2. Read the bound template / TOC if any; formal chapters follow the employer's tree.
3. Write as estimator / QS / planner overnight paper — employer's terms, item codes, clause locators, measurement language.
4. Self-check before handing off.

## Stage recipe

| Stage | Customer-facing artifact |
|---|---|
| Document parse | Per-file tender reading note: hard constraints → pricing/method/programme implications → risks/gaps. One filename header at most. |
| Project boundary | Confirmed fence for this tender: registered KB/spec/bidder files, extracted plant/labour, measurement, currency, organisation. Not a jurisdiction essay. |
| BOQ pricing | Item workpaper in this BOQ's codes and the governing spec/measurement clauses. No textbook method paragraphs that do not price the row. |
| Bidder commitments | Decision record in the user's terms, reconciled to calculated demand. Not a motivational summary. |
| Execution / programme / cost | This job's method, logic, and numbers from ready packs. Sequence and resources must be constructible from the BOQ and commitments. |
| Formal submission | Employer's returnable: template headings, evaluation language, no internal audit matrices unless requested. |

## Forbidden

Do not use chatbot scaffolding, marketing diction, or method-theatre from unrelated sample projects.

- English filler: Furthermore; Moreover; It is important to note; In conclusion; leverage; robust; seamless; cutting-edge; key takeaways
- Chinese filler: 综上所述；值得注意的是；赋能；全方位；一站式；确保万无一失；全面覆盖；助力；深度剖析
- Catalog / pack-path tours: `documentId`; Working Folder; Agent Pi Outputs; orchestration/briefs
- Synonym-swapping employer terms (COTO, COLTO, FIDIC, chainage, P&G, returnable IDs, BOQ codes stay as written)

**Do not install marketplace skills, run `npx skills`, or fetch skills.sh.** Missing skill falls back to `professional-report` or the short writing ban only.

## Good vs bad

**Good**:

> COTO 1200 item C1.2.3 is measured as m² of temporary diversion under Particular Conditions 8.3. Night closures are not priced until Addendum 2 confirms whether they are compensable. Do not treat “ensure the programme is robust” as a substitute for that rate.

**Bad**:

> 综上所述，本方案将全方位覆盖施工组织。Furthermore, it is important to note a seamless, cutting-edge method that leverages best practice.

## Self-check

- Zero filler hits; at least one judgment verb (因此 / 应 / 不得 / 须 / 缺口 / must / shall not / gap)
- Employer term preserved — do not paraphrase COTO/COLTO/FIDIC names
- No `documentId` / Working Folder / pack-path tour in the reader-facing body
- Gaps left as gaps
- Citation tokens only — no pasted source excerpts or evidence dumps; the chip shows file / page / heading
