---
name: workbench-domain-builder
description: Turn finished work or a user's described workflow into a professional workbench module (like the built-in tender/delivery/investment ones), with its method skill and knowledge-base exemplars. Use when the user says things like 把这次的成果整理成模块 / 沉淀成标准范式 / 以后同类的照这个做 / 新增专业领域 / 创建工作台模块 — in ANY phrasing that means "make this repeatable".
---

# Workbench Domain Builder

The workbench renders whatever the module registry returns. A saved module is a **complete
workbench package**, at the same grade as built-in 投标全流程: top-bar tab, stage monitor,
setup/registration in the UI, later-stage process gates, method skill, optional knowledge
pack. Saving (`workbench_module_save` / `_copy`) makes it live immediately — no rebuild.

This conversation runs through DSH native Agent-preset「创造模式」 as the authoring cockpit.
Use its runtime inspection when useful, but keep the two output planes separate:

- Agent preset authoring changes one agent's Cordis composition.
- Workbench module authoring records a reusable business process in the workbench registry.

This skill handles the second plane. Do not edit a shipped preset or write `agent.cordis.yml`
unless the user separately asks for an Agent preset. Do not invent a new Electron window,
custom React page, or dashboard. The existing workbench draws the UI from the registry.

For a module distilled from a tender project, start with `workbench_module_copy` on the
built-in `tender` workflow. Preserve its canonical stage ids and `controlProfile: tender`:
that profile carries the deterministic evidence, BOQ, capability, pricing-workbook, local-
intel, planning-output, citation, and final-freeze controls after the module is renamed.
Merely recreating seven similar-looking stages is not equivalent and is forbidden.

Do not ask the user to paste JSON, ids, slugs, or schema fields. Derive them. Call the
tools yourself. Ask at most one plain-language confirmation (Chinese name, and phase split
only if genuinely ambiguous).

## Complete package (must match this app)

Like 投标全流程, every new module must include:

1. `labelZh` — becomes the top-bar tab.
2. First stage is setup/registration (`setupStageId`). The user registers materials in the
   workbench UI; the model does not draft here.
3. 3–6 later stages. Each prompt names the deliverables and the Official Outputs folder
   for that stage. Do not restate citation rules (the platform injects them).
4. Process control on writing stages: `reviewSkillSlugs` (usually `deliverable-reviewer`),
   `reviewPolicy: "risk-based"`, `summaryDeliverable` when the stage has a synthesis report,
   and `listsSources: true` when the stage fans out per registered document. Add an
   `approvalGate` only where the user's real process includes an irreversible decision,
   frozen baseline, external issue, or final release.
5. `bindingAreaByStage` mapping each stage to `analysis` | `pricing` | `planning`.
6. A method skill via `workbench_skill_save` (`<module-id>-method`), attached on writing
   stages as `skillSlugs`.
7. Optional `kbPack` slugs when the user has norms/templates. Empty pack is fine; the
   module can grow later.

Never overwrite `tender` / `delivery` / `investment`.

There are two entry paths. **Path A (distill) is the default**: the user just finished a
piece of work in this conversation and wants it to become a repeatable standard. Path B
(interview) is only for cold starts where no work exists yet.

## Path A — Distill a module from this conversation's work

Trigger: the user, after producing and refining a deliverable here (e.g. a South-Africa-
standard method statement improved over several rounds), says anything like "把我们最后的
成果和过程整理一下，生成该领域的专业工作台模块" / "以后做同类的直接用这个流程".

The user is NOT a technical person. Do not ask them about schemas, ids, slugs, stages, or
skills. Everything below is derived by you from the conversation. Ask at most ONE short
confirmation question (the module's Chinese name and, if genuinely ambiguous, the phase
split) — and offer your proposed answer in the same message so they can just say 好.

Work through these four steps in order, reporting progress in plain language:

### A1. Reconstruct what actually happened

Re-read this conversation and list, for yourself:

- The final accepted deliverable file(s) — the LAST approved version, not drafts.
- The real working steps that produced it (gather inputs → analyze → draft → revise → final).
- Every correction and preference the user expressed during revisions. These are the
  domain's hard rules — they are the most valuable thing being distilled. Capture them
  verbatim-ish: structure demands, tone, standards/norms invoked, things the user rejected.
- When the source was a professional-workbench project, read its accepted Official Outputs
  and `.agent-pi` user-requirement ledger. Do not infer acceptance from “file exists”; use the
  user's accepted requirements, explicit approvals, and final revision evidence.

### A2. Preserve the evidence (knowledge base)

- If the user wants later jobs to **clone this deliverable's format, heading tree, and depth**,
  `kb_add` the final Markdown as **用户模板** (not 范文). Name it clearly, e.g.
  "施工组织设计用户模板（XX项目定稿）". Read skill kb-user-template.
- If it is only a style/craft sample, `kb_add` it as **范文**. Do not mix the two.
  If the final file is not Markdown, produce the Markdown version first, then add it.
- `kb_add` reusable norms/standards the work relied on (范围内已解析成 Markdown 的规范文件)
  as **规范**. Skip project-specific bid documents.
- Note the returned slugs — stage prompts will name them.

### A3. Distill the method (skill)

Call `workbench_skill_save` with slug `<module-id>-method` and a SKILL.md that contains:

- What this domain's deliverable is and who consumes it.
- The step-by-step method actually used (not a textbook version).
- The user's revision rules from A1 as hard requirements ("必须…/禁止…").
- The final deliverable's structure (TOC) as the default template, with the KB exemplar
  slug referenced for `kb_search` lookup.

Frontmatter `name` must equal the slug; `description` says when to use it.

### A4. Save the module and hand it back

对非投标领域，call `workbench_module_save` and derive 3–5 stages from A1's real steps — typically:
资料登记 → 分析/起草 → 评审定稿. Rules:

If the source project/module is `tender`, call `workbench_module_copy` first and then
re-save that copy with the accepted method skill and KB slugs attached. Keep the built-in
stage ids, `controlProfile: "tender"`, risk review, and all three approval gates. Do not
collapse a proven tender into a generic 3–5-stage module.

- Stage 1 is always setup/registration (register inputs, scan sources, no drafting).
- Each drafting stage's `prompt` names the deliverables, their required structure, and
  tells the model to `kb_search` the exemplar/norm slugs from A2 before writing.
- Every stage that writes client-facing output gets `skillSlugs: ["<module-id>-method"]`
  and `reviewSkillSlugs: ["deliverable-reviewer"]`, with `reviewPolicy: "risk-based"`.
- Reproduce the user's real human decision points with `approvalGate`; never add approval
  buttons merely because a stage exists.
- Citation discipline and the writing contract are injected by the platform — do not
  restate them in `prompt`.

Then tell the user, in one short plain-language message: 模块已上线（工作台左侧栏可见）；
范文与规范已入知识库；方法已沉淀。下次做同类工作，两种用法：在工作台点这个模块新建项目，
或者直接在对话里说「用XX模块帮我做一份…」。

## Path B — Interview (cold start, no finished work)

Ask the user, in ONE message, in plain language: 这个领域叫什么？实际工作分哪几步（3–6 步）？
开工时手里有什么资料？最后要交出什么成果？有没有规范/范文可以上传？Do not invent a textbook
process; mirror how they actually work. Then run A2–A4 with whatever they provide (skip A2
if they have nothing to upload yet — the module can grow its KB later).

## Path C — Copy an existing module

Trigger: the user wants to start from 投标全流程 / another live module and tweak it
later. Call `workbench_module_copy` with the source id. Do not overwrite built-ins.
Confirm only the Chinese name if they did not give one; default id is `<source>-copy`.
The copy is live in the workbench bar immediately. The module manager can then add,
remove, reorder, and edit stages, and attach a 规范包 (knowledge-base slugs per
analysis/pricing/planning). Do not overwrite built-ins.

## Module definition schema

```json
{
  "schemaVersion": 1,
  "id": "method-statement-za",     // ^[a-z][a-z0-9-]{1,31}$, not tender/delivery/investment
  "label": "Method Statement (ZA)", // optional English
  "labelZh": "南非施工方案",
  "icon": "🛠️",                    // optional, single emoji
  "setupStageId": "ms-setup",      // optional; defaults to first stage
  "stages": [
    {
      "id": "ms-setup",            // ^[a-z][a-z0-9-]{1,63}$, unique in module
      "labelZh": "项目建立与资料登记",
      "hintZh": "登记原始资料，明确范围",
      "prompt": "…what the model must do in this stage…",
      "skillSlugs": ["method-statement-za-method"],
      "reviewSkillSlugs": [],
      "reviewPolicy": "risk-based",
      "approvalGate": {
        "promptZh": "请确认是否采用本阶段结论并进入下一步。",
        "approveLabelZh": "确认并继续",
        "rejectLabelZh": "退回修改"
      },
      "listsSources": false
    }
  ]
}
```

Validator rules: lowercase-hyphen ids, unique stage ids, non-empty labelZh and prompt per
stage, `setupStageId` must exist, built-in ids rejected. `listsSources: true` fans the
stage out into one task per registered source document; leave false for single-deliverable
stages.

## Managing modules

- `workbench_module_list` — inventory incl. disabled and files that failed validation.
- `workbench_module_save` — create/replace (same id overwrites the user file).
- `workbench_module_copy` — clone a built-in or user module into a new user file.
- `workbench_module_set_enabled` — hide/show a module (works on built-ins too).
- `workbench_module_remove` — delete a user module file; warn that existing projects of
  that module lose workflow resolution until an equally-named module is saved again.
- `workbench_skill_save` — write/update the domain method skill (hot-loads immediately).

Updating an existing user module later (user says 调整XX模块的流程/规则): edit and re-save
the same id; refresh the method skill with `workbench_skill_save` when the rules changed.
