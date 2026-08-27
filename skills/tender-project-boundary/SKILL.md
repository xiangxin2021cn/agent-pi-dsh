---
name: tender-project-boundary
description: Legacy helper for leftover project_boundary packs. The tender workbench no longer has a dedicated 项目边界条件 stage; project characteristics are compiled after document analysis into 项目特征.md.
---

# Tender Project Boundary Conditions (legacy)

The workbench **does not show** a「项目边界条件」column. Bid-binding limits (contract form, particular conditions, specs and amendments, duration, site/geology/climate, working hours/holidays, subcontracting/localisation, employer-imposed sequence) are extracted during **招标文件解析** and compiled into Official Outputs `项目特征.md` for BOQ pricing.

Use this skill only if a leftover session still has `stageId: project-boundary-conditions` or a `project_boundary` pack to maintain. Do **not** start item pricing here, and do **not** tell the user they must complete a boundary desk before BOQ.

## Guardrails

- Parent session stays continuous.
- Do not write `boq_five_step_pricing` or planning packs (stage allowlist will reject).
- Prefer letting document-analysis merge produce `项目特征.md` rather than inventing a parallel fence pack.
- **Writing:** Follow tender-intelligence-core `references/writing-contract.md`. Notes must use this tender's terms with AI filler stripped.

## Completion

If a leftover pack exists, report whether Official Outputs `项目特征.md` is already the BOQ brief. Do not block pricing on `humanConfirmedAt`.
