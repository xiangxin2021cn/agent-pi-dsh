---
name: file-delivery
description: Create, inspect and deliver actual user-requested documents, spreadsheets, presentations, reports or drawings. Use for file creation or revision; not for ordinary questions or merely reading a file.
---

# File delivery

Continue the current DSH task. This is a delivery checklist, not a new project or approval workflow.

1. Read existing requirements before asking. Identify the requested format, editability, intended use and acceptance criteria. Explicit user requirements and tender documents override generic templates. For a clear small change, edit and check only affected content.
2. Separate **source facts**, **user decisions**, **calculated results**, **proposals** and **assumptions/gaps**. Keep locators for material figures and claims (file/page/sheet/cell, clause or source URL/date). Record units, scope and calculation inputs. User-selected templates supply structure, never this project's amounts, quantities, dates or conclusions. If evidence conflicts, identify the conflict; do not silently choose a convenient value.
3. Use the native skill catalog to choose only relevant capabilities: report creation → huashu-report plus its Agent Pi adaptation; tender writing → tender-formal-writing; Office/drawings → the installed matching tools. Do not invent tools, install arbitrary skills or load all reference files. Use only selected KB entries and task-relevant files. Never save or select reusable templates automatically.
4. Create the actual requested file in the current workspace. A renamed HTML/CSV is not DOCX/XLSX/PDF. If editable Word/Excel/CAD is requested, a screenshot or PDF alone is insufficient. Preserve formulas, structure and native drawing objects where required; deliver a view copy only as an additional file.
5. Inspect the final saved file, not an earlier in-memory version. Check existence, nonzero size, actual format and required content. Reopen with the available native viewer/parser; for editable artifacts, verify edit/save/reopen on a temporary copy when appropriate. For spreadsheets check formulas and recalculation, for drawings check units/coordinates/layers, for reports check tables, references and required sections. Render and inspect pages or drawing views when layout matters. Report a missing renderer or unsupported format as unverified, not passed. Never change the requested format just to pass a check.
6. File validation does not prove the professional conclusion or source accuracy. Describe what was actually checked and the remaining material gaps. With professional depth already enabled and applicable criteria present, use professional_depth(check) to record byte evidence and specific review notes; do not enable the mode yourself. Recheck after subsequent changes.
7. Use native DSH present with the actual final path so the user can open it from the conversation/file rail. Give a concise result and relevant limitations in the user's language. An output path in a tool log alone is not delivery. Do not claim present/opening/editability succeeded without the corresponding result.

For example, a measurement-table-to-drawing task checks coordinate system and units, reads the selected measurements, marks and reconciles point counts/labels, inspects the saved drawing and explanation, and presents both. Ask about missing coordinate conventions only when they change the output; do not invent them from a template.
