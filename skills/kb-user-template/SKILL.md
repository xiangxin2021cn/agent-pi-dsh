---
name: kb-user-template
description: Clone the format, outline, and content depth of a user-owned template document when writing this conversation's business output. Use when the user says 用户模板, 用户模版, 按这个模板写, 照这个大纲, 复刻格式, 套这个格式, 深度对齐, 按范文结构写, 完美复刻, or has checked a 用户模板 entry as 本次任务选用.
---

# User output template (clone form, not facts)

Default-on bundled skill. A **用户模板** is a document the user already wrote well. This turn's deliverable must match its **format, heading tree, and depth** — not its project facts.

This is not 规范 (rules), 合同 (conditions), 范文 (style example), or 方法标准 (how to work). Those stay citable facts. A user template is the **form to reproduce**.

## When you must do this

- The user checked a knowledge-base row whose category is **用户模板** (also accept 用户模版).
- The user uploaded or pointed at a file and said 按这个模板 / 照这个大纲 / 复刻格式 / 套这个格式.
- The user asked to register a good document as a writing template — `kb_add` it with `category: 用户模板`, then use it.

## Register

If the file is not yet in the knowledge base:

1. Text / Markdown / a knowledge pack → `kb_add` with `category: 用户模板`.
2. PDF → you call `kb_prepare_document` (host does not convert first). The extract is a draft: rewrite `manuscript.md` into readable Markdown that mirrors the printed template (ATX headings, TOC list, tables), then import the pack as **用户模板**. A wall of extract cannot be cloned later.
3. Tell the user to check **本次任务选用**.

Never invent a template. If none is selected and the user did not point at one, ask once which document to clone.

## Before writing

1. `kb_search({ slugs })` / `kb_read_chunk` the template slugs. Read the heading tree in order.
2. Write down, for yourself: heading sequence, numbering style, table layout, what each section covers, and how deep a section goes (paragraph count, table vs prose, annexes).
3. Open the same outline for THIS job. Keep heading wording unless the employer’s returnable uses different titles — then keep the employer titles but keep the template’s depth and order.
4. Fill each heading from **this project’s** sources. Cite `[kb:slug:id]` / `[src:…]` for facts. The template slug is for form, not for inventing numbers.

## Hard rules

- Clone: page structure, TOC, heading levels, list/table habits, register, how far a section goes.
- Do not copy: project names, quantities, dates, rates, clause answers, site facts, signatures.
- Do not flatten a template into a short memo. If the template has 12 chapters, this output has 12 chapters.
- Do not paste the template body into chat. Write the new file under Official Outputs.
- Missing project facts stay gaps. Do not fill them from the template or from memory.
- Factory 范文 / 方法标准 are not user templates unless the user checked them as 用户模板 or said to clone that file.

## After the file exists

Tell the user, in Chinese, which template slug you cloned and where the new file is. If a heading could not be filled, list it as a gap.
