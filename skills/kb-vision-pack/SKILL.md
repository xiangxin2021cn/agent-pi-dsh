---
name: kb-vision-pack
description: Build a precisely indexable and readable local knowledge pack from a specification, standard, contract, user template, or uploaded PDF. Use when the user says 知识库, 入库, 知识包, 规范索引, 识图建库, 扫描件建库, PDF出图建库, 精确索引, 准确整理, 整理完整内容, 完整内容, 全文转录, 按源文件排版, 排版可读, 解析稿太难看, 把这个PDF整理出来, 上传的pdf — or asks to transcribe / index a PDF so clauses can be looked up later.
---

# Knowledge-pack builder (you call the PDF tool → see pages → write pack)

Default-on bundled skill. Trigger on 知识库 / 入库 / 知识包 / 准确整理 / 完整内容 / 全文转录, including when the user only uploaded a PDF and asked to organize it.

Official `read` and `read_image` **cannot open PDF**. DeepSeek-V4-Flash-Vision-Exp sees **images**, not PDF bytes. The host does **not** convert the PDF first. You must call the tool.

## You must call this first

Call `kb_prepare_document` on the uploaded PDF path before any transcription. Do not wait for a hidden preprocessor. Do not ask the user to export pages.

- Default: it writes a **draft** `<stem>-知识包/manuscript.md` when a text layer exists, **and** `pages/page-0001.png` … (max 20 pages per call). The wall is not the library.
- Then **you** call `read_image` on each PNG (Flash Vision Exp) and write readable Markdown that mirrors the printed page.
- Pass `images: false` only when you will reconstruct from the text-layer draft alone.
- Later pages: you call again with `startPage` / `endPage`.

Never call `vision_*`. Do not use bun. Do not start a Python PDF stack.

## Hard rules

- Use **DeepSeek-V4-Flash-Vision-Exp**. Flash / Pro cannot see pixels — say so and ask to switch.
- Native pasted images are already on the user message. Look at them.
- Disk PNG/JPEG/WebP/GIF: official `read_image` only.
- Never paste the full document into chat. Write files under `<stem>-知识包/`.

## Readable manuscript (source documents and 用户模板)

The Knowledge Base preview opens `manuscript.md`. Users will not read a wall of extract.

Write Markdown a person can scan like the printed source:

- ATX headings for `CHAPTER` / `PART` / `CONTENTS` / clause ids (`A2.1.1`, `第1.1.1条`)
- Table of contents as a real list, not scattered leaders
- Tables as Markdown tables
- Restore mid-word spaces (`amende d` → `amended`)
- Keep `<!-- page N -->` before each page's content
- Same standard for 规范/合同 **and** 用户模板 packs

Do not invent clauses. Default is page images. Rewrite from `read_image`, not from guessing the extract.

## When to skip images

Pass `images: false` only when `route: "text"` and you can reconstruct headings, lists, and tables from the extract. If the extract is a wall or tables/layout are lost, you **must** use the page PNGs. Knowledge Base page MinerU remains valid when the user imports without chat; that path converts MinerU HTML tables to Markdown tables on ingest.

## Pack layout

```text
<short-title>-知识包/
  pack.json
  manuscript.md
  pages/page-0001.png
```

`manuscript.md` is the only long text. `units` point into it with JS string offsets (`slice`). If offsets cannot be verified, omit `units` — import will cut by headings.

`kind` is `chapter` | `section` | `part` | `clause` | `table` | `prose`. `id` is the document's own number (`A1.2.3`, `8.4`, `1.1.1`, `第1.1.1条` → `1.1.1`). Do not invent COTO letters on a Chinese GB.

## After the pack exists

Tell the user, in Chinese:

- 右侧「资源文件」对该文件夹或 `pack.json` 右键 **一键导入知识包**
- 或左侧 **知识库** 把文件夹路径贴进「落入存储区」

Then they check「本次任务选用」。Next send: `kb_find_clause` / `kb_search` / `kb_read_chunk`, cite `[kb:slug:id]`.
