# Task 1 — Three A1 final competition boards

## Scope

Create the final source and rendered files only under `competition/final/`. Do not modify or delete existing drafts in `competition/board*.html`, `competition/board.css`, `competition/render.py`, or `competition/out/`.

Read first:

- `competition/final/IMPLEMENTATION_PLAN.md`
- `competition/final/DESIGN_PHILOSOPHY.md`
- `website/index.html`
- `website/assets/css/main.css`
- Existing drafts `competition/board1.html`, `board2.html`, `board3.html`, `board.css`

## Required outputs

- `competition/final/board.css`
- `competition/final/board1.html`
- `competition/final/board2.html`
- `competition/final/board3.html`
- `competition/final/render_boards.py`
- `competition/final/out/01-海外工程投标及商业调研全流程AI智能Agent作业系统-总览.jpg`
- `competition/final/out/02-海外工程投标及商业调研全流程AI智能Agent作业系统-全流程.jpg`
- `competition/final/out/03-海外工程投标及商业调研全流程AI智能Agent作业系统-真实成果.jpg`
- Matching high-resolution PNG files for internal/master use.

## Fixed technical requirements

- Each rendered board: exactly 7016 × 9933 px, RGB, 300 dpi.
- A1 portrait, three boards maximum.
- Preserve the competition header system and fields:
  - 参赛人员：向鑫
  - 申报类型：海外业务赛道
  - 作品名称：海外工程投标及商业调研全流程AI智能 Agent 作业系统
- Use the supplied Source Han Sans bold font already in `competition/fonts/`.
- Use light website palette and imagery: engineering paper white, navy text, electric blue→cyan gradient, blueprint bridge/crane/excavator, translucent process lanes.
- The main visual motif is two task streams converging into Official Outputs. It must read at thumbnail scale.
- Use genuine screenshots and charts from `competition/img/` and `website/showcase/`; hide local personal paths in any screenshot by cropping, overlay, or masking.
- No product version numbers.
- Do not use or imply these claims: `100+` workers, `1M≈800 pages`, quantified superiority over Claude, unverified hardware costs, all-open-source, zero-license fees.

## Board narratives

### Board 1 — 总览：两条长程作业流，一次汇聚成正式成果

- Website-derived hero keyframe, but not a simple screenshot.
- One large promise: `海外投标与商业调研，两条长程作业流一次跑完`.
- Central dual-lane convergence diagram:
  - commercial lane: opportunity → country/market → client/partner → risk/decision
  - tender lane: documents → clauses → BOQ/pricing → planning/bid
  - convergence: evidence gate → Official Outputs
- Small supporting proof: `3 业务域`, `34 领域技能`, `6 步投标流程`, `5 步 BOQ 推导`.
- Only three short design principles: 长程不断档 / 证据可追溯 / 成果可递交.
- Include concise role line for 向鑫: system architecture, workflow design, domain skills/knowledge base, real-project validation.

### Board 2 — 全流程：商业调研轨 + 投标作业轨

- Make the dual track the visual center; use line/route/timeline composition instead of text card grid.
- Commercial research track: 项目机会识别 → 国别与市场 → 业主/合作方 → 股权与风险 → 投标决策.
- Tender track: 招标全量解析 → 条款知识库 → BOQ范围界定 → 五步组价 → 施工推演 → 企业模板标稿.
- Show the BOQ five-step method visually: scope / method / productivity / resource price / unit rate.
- Show evidence gates and clickable source-chip concept using clear visual tokens.
- Include one real pricing workpaper excerpt or anonymized evidence fragment from the repository; avoid invented values.

### Board 3 — 真实成果：从证据到交付

- Use a large visual evidence wall with hierarchy, not four equal screenshots.
- Primary: knowledge-base workbench and bid/tender evidence chain.
- Secondary: commercial research outputs (equity structure, project stages, transport corridor).
- Supporting: EB Cloete construction simulation as proof of downstream reuse; label it as project-specific simulation output and keep validation caveats modest.
- Final value path: 调研支撑决策 → 投标形成标稿 → 中标后复用至实施.
- Add a compact boundary note: AI produces traceable drafts; professional decisions and final quantities/prices require human review.

## Quality bar

- At least 65% visual area; avoid dense paragraph boxes.
- Titles and the principal flow must be readable when each board is shown at approximately 1333 × 1888.
- No clipped text, overlapping objects, raw local paths, placeholder text, or weak low-contrast gray.
- Maintain consistent page rhythm across all three boards while giving each board a distinct dominant composition.

## Verification

- Run the renderer with the bundled workspace Python.
- Programmatically verify pixel dimensions, RGB mode and 300 dpi metadata.
- Create contact-sheet thumbnails for review.
- Visually inspect all three boards yourself and perform at least one refinement pass before reporting.
- Write the full implementation/test report to `.superpowers/sdd/competition-final/task-1-report.md`.
- Do not commit; this repository has no usable commit baseline.
