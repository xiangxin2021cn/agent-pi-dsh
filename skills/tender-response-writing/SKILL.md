---
name: tender-response-writing
description: Plan and draft tender responses from actual mandatory requirements and evaluation criteria, using registered company evidence, project engineering results and current artifact checks. Use for technical bids, criterion-to-chapter coverage, addenda and response review in China or other bound tender workflows.
---

# Requirements and evidence driven tender writing

Use the shared `tender_workspace` records. Do not keep a competing scoring spreadsheet or treat a chat outline as the project record. This skill supplies a method, not missing company facts, engineering tools, statutory judgment or an evaluation score.

## Understand the assignment

1. Read `professional_task status`, the explicitly bound workbench and selected project sources. Never create a business project for an ordinary conversation. For an authorized tender assignment, use the existing bound project ID.
2. Call `tender_workspace schema` before writing structured records; then `status`. If the workspace does not exist, initialize it with this project's actual title. Collection upserts replace that collection: preserve unrelated existing IDs.
3. Register original documents and versions. Read qualification, substantive conditions, scoring, formats, returnables, addenda and source precedence. Retain unreadable/missing pages, tables, drawings and attachments in the professional task coverage record.
4. In the China workbench, `engineering_project run` with the China provider's `analyze` and `syncWorkspace=true` registers identical requirement IDs and source versions in the shared response workspace. This requires actual registered source files; it does not derive scores or approve responses. Keep subsequent `criteria.requirementIds` and `responses.requirementIds` linked to these IDs.
   After explicitly marking an engineering source superseded or unreadable, synchronize again even if no new requirements are imported (`requirements: []`). This propagates the source state to old responses. Omitting a source from one batch does not retire it. The bound module and project ID select the ledger; do not use another module's identically named project.

## Plan before drafting

- Preserve the published scoring method. Register rubric original text, subpoints, bands and locators only when present. Internal review suggestions are not published grading rules. Pass/fail requirements do not have target scores.
- Follow the employer's mandatory template, heading order, page and anonymity requirements. Six internal writing patterns (analysis, planning, organization, technical method, management, response comparison) may help check omissions; they do not prescribe the submission TOC.
- For each response register the requirement/criterion IDs, deliverable, chapter and generation mode. One chapter may respond to several criteria; a criterion may need several chapters and annexes.
- `reuse`: select genuine originals and retain proof facts. `adapt`: state the applicability and portions changed. `generate`: use this project's facts and engineering basis. Historical quantities, dates, names, rates and promises never become current facts through reuse.
- Check selected materials' subject, validity, scope, authorization and personnel/resource availability. Unknown remains unknown. Existing knowledge versions supply immutable references; do not copy an entire private material library into every task.
- Record the actual drawing, calculation, BIM, quantity, resource and schedule dependencies. No declared dependency means no assurance that its future changes will be detected.
- Ask only for choices that affect scope, commitments, conflicting instructions or material adequacy. An already clear authorized request proceeds without chapter-by-chapter approval.
- Save response plans with `upsert_responses`; call `capture_response_dependencies` before drafting. After a source changes, review its impact before capturing a replacement baseline; recapture alone must not reinstate an old content review.

## Write from evidence

- Read `tender-formal-writing`. Produce the actual requested files, preserving formal tender language and format.
- Engineering bids connect site constraints and actual objects/quantities to method, sequence, resources, duration and controls. CAD/PDF extraction or a BIM model alone proves neither complete coverage nor constructability.
- Scope matters: an IT/service or technical-only task does not require an invented BOQ/pricing exercise. State why a computation is not applicable; do not satisfy a stage with fabricated zero rows.
- Missing facts remain local gaps. Do not invent certificates, reviewer identities, approvals, scoring weights, sources or performance promises.

## Verify the current file

1. Call `verify_response` with the actual artifact path, exact excerpt and location, plus the real content reviewer and evidence-backed review note. For every `chapter.pointResponses` entry, provide its own `pointReviews` criterion/point ID, actual location/excerpt, verdict and note. A single overall supported verdict cannot establish all rubric points. Identify model review as model review. Machine file/hash/location checks and the supplied content judgment are separate.
2. For Word/PDF, inspect extracted text and rendered pages using available document tools. A binary's hash proves identity, not the claimed paragraph's presence or professional correctness; keep unresolved location checks visible.
3. Call `response_status`: inspect all requirements and rubric subpoints, evidence gaps, changed dependencies, missing/changed files and current review status. A covered response plan is not a completed chapter. Report only coverage of registered items and separately disclose unread source material.
4. Register actual deliverables and quality checks in the existing professional task. A response review is not customer acceptance, signature, final submission, actual award score or winning probability.
5. Explain material gaps and source-change impact in the main chat. The workbench and task panel display the same response projection; do not ask users to maintain a duplicate form.

Keep internal response audit tables outside formal tender narrative unless the employer requires them or the user requests them.
