---
name: tender-document-parsing
description: Parse each registered tender source into a professional, industry-jargon Markdown working memo for estimators. Write MD to Official Outputs and JSON to orchestration; the parent then tender_capability replace. Soft gates — missing MD soft-blocks; human review is advisory.
---

# Tender Document Parsing

Use this skill for stage **招标文件解析** (`tender-document-analysis`). The first-class deliverable is a **professional tender reading note** per registered file — not a file catalog or path dump. After child JSON reports exist, the parent `tender_capability replace`s `document_analysis` / `boq_reconciliation` from those reports. There is no Electron runtime merge.

## Guardrails

- Stay in this conversation across tender stages. Do not assume a new main session per stage.
- Large PDF parse units may be split with **dsh native** `subagent` / `workflow`. Do not call `spawn_session`, `tender_stage` `dispatch`, or invent a concurrency cap — dsh owns fan-out.
- Analyze only registered Tender Workspace sources. Do not scan the working directory as a corpus.
- `tender_stage` only prepares briefs and the file checklist; workbench 「下一阶段」 fills the composer. The parent must not re-parse unfinished batches or rewrite child Markdown.
- Nested children must **not** spawn further children.
- Each child writes **both** the structured JSON handoff (`reportPath`) and the customer-facing Markdown (`markdownPath`). Readable MD is the first-class deliverable — **never** ask the parent to author per-document MD.
- Honor `brief.projectIndustry` and `brief.documentRole` (and the professional `objective`) — write in sector jargon for that role.
- Extract bid-binding **project characteristics** into the matching section kinds. After packs exist, write Official Outputs `Agent Pi Outputs/<projectId>/项目特征.md` from merged sections — there is no runtime compiler: contract form and particular conditions; governing specs and clause amendments; duration, site, geology, climate; working hours and holidays; subcontracting and localisation; employer-imposed construction sequence.
- If the assigned file does not state a characteristic, record it as a **gap**. Do **not** fill geology, spec clauses, working hours, or contract form from model memory or uncited web pages.
- `tender_workspace` document registration is owned by the stage source-boundary sync; do not re-`upsert_documents` unless the user is still in project-setup.
- If a dsh subagent is still running when the parent advances, let it finish its Markdown/JSON pair — that is expected.
- Write **one Markdown file per registered document** at `brief.markdownPath` (Official Outputs: `Agent Pi Outputs/<projectId>/document-analysis/`). Structured JSON goes to `brief.reportPath` under orchestration. There is no Electron runtime dispatcher — dsh subagent/workflow is the fan-out, and the files rail only harvests already-written Markdown.
- Soft gate: missing or empty MD keeps the batch incomplete. Human accept/reject of MD is **advisory** and must not block stage completion.
- `evaluation_strategy` is **optional** and must not block this stage.
- Do **not** write `project_boundary`, `boq_five_step_pricing`, `construction_resource_schedule`, planning, or submission capability packs in this stage (stage tool whitelist will reject skip-ahead writes).
- **Writing:** Follow tender-intelligence-core `references/writing-contract.md`. Every customer-facing Markdown and stage summary in this stage must be tender-grounded professional bid writing with AI filler stripped.

## Professional Markdown (required body)

Write like an estimator / technical / commercial tender memo:

1. **One-line header** — source filename only (at most once). Do not center the report on `documentId`, absolute paths, `Agent Pi Outputs`, Working Folder, or “analysis scope” boilerplate.
2. **Bid-relevant summary** — what this document decides for price, method, programme, or compliance.
3. **Hard constraints** — mandatory requirements that bind the bid (use industry jargon from `projectIndustry` / `documentRole`). Call out contract form / particular conditions, spec amendments, duration, site/geology/climate, working hours/holidays, subcontracting/localisation, and employer-imposed sequence when this file states them.
4. **Implications for pricing / method / programme** — what BOQ pricing must carry forward from this file's project characteristics.
5. **Risks, gaps, clarifications needed** — open questions for the employer or internal assumptions.
6. **Useful locators only** — page / clause / sheet when they help a human verify; empty sourceRefs are accepted in JSON.

**Voice:** write as this tender's estimator using the source's own terms. Strip AI filler (Furthermore, 综上所述, 值得注意的是, leverage, robust, key takeaways).

**Anti-patterns (reject in your own draft):** long lists of paths; repeating `documentId`/`batchId`/`reportPath`; tutorial prose about packs or knowledge folders; generic “this file contains…” catalogs without bid consequences; chatbot recaps or textbook method essays that this document does not support.

## Workflow

1. Confirm registered sources via `tender_workspace` status and `tender_stage` briefs. When a brief has `restoredManuscript` / `packPath`, read that Markdown (first-stage 对齐原稿) instead of re-extracting the original PDF / Word / Excel. The user may have edited it; treat the manuscript as authoritative.
2. For each assigned document (parent or dsh subagent), write:
   - Structured sections JSON → `brief.reportPath`
   - Professional MD → `brief.markdownPath` (body per section above)
3. Both artifacts are required; missing MD keeps the document incomplete. Parent must not regenerate child MD.
4. When every JSON report is complete, the parent `tender_capability replace`s from those reports (pass the merged structured data — empty payloads are not auto-merged). Write `项目特征.md` to Official Outputs from merged sections. Never wait for an Electron stage runner.

## Analysis base (hard gate)

After the per-source memos exist, write one authoritative, traceable `投标分析底稿.md` in `Agent Pi Outputs/<projectId>/document-analysis/`. Structure it so a bid team can verify and reuse the analysis without rereading every source:

- source index and volume/file relationships;
- project boundary and bid-binding characteristics;
- qualification, evaluation, key dates, and returnables;
- contract, bonds, insurance, payment, and material commercial risk;
- scope, specification system, and particular amendments;
- BOQ book/chapter/line coverage and mapping gaps;
- submission checklist, risks, gaps, clarifications, and source locators.

Keep conclusions linked to page/clause/sheet/cell or other usable source locators. The base must be substantive enough to support pricing, planning, and submission work, but there is no fixed quota of five long reports. `招标文件总结.md`, `工程量清单分析.md`, `工程范围与技术规范总结.md`, `合同特殊条款与规范修订总结.md`, `技术标文件要求汇总.md`, and similar topic reports are **views derived on demand** when the user or tender requires them; they are not stage-completion gates by default.

**BOQ inventory hard gate (not waivable):** `complete_stage` also fails unless `packs/boq-reconciliation.json` has at least three real payment rows (code + unit + quantity + sheet/cell) sourced from a registered BOQ / Bill of Quantities / Pricing Schedule file, and the BOQ section of `投标分析底稿.md` names representative actual item codes. A project with no bill of quantities cannot leave document analysis. Feature-gate waive and `force_pass` do not clear this. Do not invent demo rows or lift a bill from another tender.

**Do not** copy numbers, chainages, penalties, or place names from another bid or from a user template. Templates may donate headings only. If the current tender is silent, write a gap.

When the analysis base is the only remaining work: do **not** re-parse completed source files and do **not** re-dispatch those workers. Fill only the missing source index, topic, citation, or BOQ coverage in `投标分析底稿.md`; derive a topic view only when it is actually requested.

## Completion

Report: documents covered, MD paths written, whether `document_analysis` / `boq_reconciliation` packs exist, how many real BOQ rows were extracted, whether Official Outputs `项目特征.md` was written, whether `投标分析底稿.md` is traceable and structurally complete, which optional topic views were requested/generated, and any optional `evaluation_strategy` notes. Do not claim the stage is complete until the per-file MD, structured handoffs, the BOQ pack with real line items, and the authoritative analysis base exist.
