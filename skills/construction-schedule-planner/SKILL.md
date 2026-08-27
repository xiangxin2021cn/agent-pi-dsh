---
name: construction-schedule-planner
description: Use this skill whenever the user asks to turn construction method statements, tender documents, BOQ sections, project narratives, master programme text, or planning notes into Primavera P6 XML, Microsoft Project XML, or Candy-importable programme artifacts. This includes Chinese requests such as 施工方案生成总进度计划, P6导入文件, Project导入文件, Candy计划, or 施工总进度计划.
globs:
  - "*.xml"
  - "*.ccs"
  - "*.ccs_tmp"
  - "*.xer"
  - "*.mpp"
  - "*.md"
  - "*.pdf"
---

# Construction Schedule Planner

Use this skill to create construction programme artifacts from source documents. Treat the planning file as an engineered deliverable: the schedule must be traceable to source text, importable by the target tool, and easy for a planner to audit.

## Load The Right Reference

Read only the reference files needed for the requested target:

- `references/p6-xml.md` for Primavera P6 XML.
- `references/ms-project-xml.md` for Microsoft Project XML.
- `references/candy-ccs.md` for Candy planning, Candy backup files, or Candy-compatible import.

If the user asks for more than one target, build one neutral schedule model first, then export each format from that same model.

## Neutral Schedule Model

Before writing XML, create a compact planning model with these fields:

- Project: name, contract start, required finish, data date, calendar assumptions.
- Calendars: work days, working hours, holidays if known.
- WBS: code, name, parent code, source basis.
- Activities: ID, name, WBS code, type, duration, start/finish if constrained, notes/source basis.
- Logic: predecessor ID, successor ID, relationship type, lag.
- Resources: optional; include only when the source provides crews/plant or the user asks for resource loading.
- Validation notes: assumptions, missing inputs, risks, and items requiring planner review.

Use deterministic IDs. Keep WBS codes stable and readable. Prefer short activity IDs that planners can compare across outputs.

## Construction Planning Heuristics

Derive WBS from the contract and method statement rather than inventing a generic software structure.

**Writing:** Follow tender-intelligence-core `references/writing-contract.md`. Activity names, WBS titles, and planner notes must use this tender's terms with AI filler stripped.

Typical road/civil WBS:

- Mobilisation and approvals.
- Site establishment, survey, traffic accommodation, permits.
- Earthworks and layerworks.
- Drainage, culverts, services, utilities.
- Structures and concrete works.
- Pavement, surfacing, road furniture, signage.
- M&E or specialist systems where relevant.
- Testing, commissioning, as-builts, handover, demobilisation.

Typical EPC/plant WBS:

- Key milestones.
- Engineering by discipline.
- Procurement by critical packages.
- Civil and structural construction.
- Mechanical, piping, electrical, instrumentation.
- Pre-commissioning, commissioning, performance testing, handover.

Logic defaults:

- Use Finish-to-Start for normal handoff logic.
- Use Start-to-Start with lag only for deliberate overlap, such as parallel zones, rolling pipe laying, or staged earthworks.
- Avoid logic on summary tasks.
- Milestones should have zero duration and should only constrain key contractual events.
- Put source reasoning in notes, not in artificial activity names.

## Output Rules

### Primavera P6 XML

Follow `references/p6-xml.md`.

Generate Primavera API BusinessObjects XML with:

- Root `APIBusinessObjects` and namespace `http://xmlns.oracle.com/Primavera/P6/V8/API/BusinessObjects`.
- At least one `Calendar`, one `Project`, hierarchical `WBS`, `Activity`, and `Relationship` records.
- Stable numeric `ObjectId` values.
- Activity `Id` values that remain readable and unique.
- `Task Dependent` for normal work, `Start Milestone` or `Finish Milestone` for milestones.
- `Notebook` or notes fields for source basis when useful.

### Microsoft Project XML

Follow `references/ms-project-xml.md`.

Generate Microsoft Project XML with:

- Root `Project` and namespace `http://schemas.microsoft.com/project`.
- Project start/finish defaults, calendar, tasks, and predecessor links.
- Summary tasks for WBS headings and leaf tasks for work activities.
- `Notes` for source basis and quantity references.
- Resources only when useful. Do not add assignments unless a resource-loaded programme is requested.

### Candy Planning

Follow `references/candy-ccs.md`.

For V1.2-quality output, prefer Candy's documented XML General Importer path:

- Generate P6 XML for Candy when the user is coming from Primavera/P6 planning.
- Generate Microsoft Project XML for Candy when the user wants a simpler planning exchange file.

Do not claim to generate a native Candy `.ccs`, `.ccs_tmp`, or SitePlan backup unless the output has been round-trip imported and opened in Candy. The observed Candy backup is a proprietary CAB-wrapped binary container, not a stable public text format.

## Verification

Every generated schedule deliverable should include a validation report next to the output file:

- XML parses successfully.
- Counts: calendars, WBS or summary tasks, activities/tasks, relationships/predecessor links, resources if any.
- All activity IDs are unique.
- All predecessor/successor references resolve.
- No relationship points to a summary activity unless the target tool explicitly allows it.
- Milestones have zero duration.
- Required contract start and finish assumptions are stated.
- Candy outputs state whether they are native Candy backups or Candy-compatible XML importer files.

When the target application is installed, ask the user before doing interactive import checks. Without the target application, validate structure and state that actual import remains unverified.

## Expected Deliverables

For a normal request, produce:

- A neutral schedule model in Markdown or JSON.
- One or more import files: `.xml` for P6/MS Project/Candy General Importer.
- A validation report.
- A short user-facing summary of assumptions and planner review points.

## Tender workbench (Agent Pi stage 4-B)

When producing the tender programme under `Agent Pi Outputs/<projectId>/planning/` (Official Outputs), **always emit both**:

- `tender-programme.msp.xml` — Microsoft Project XML (`Project` root / MSP namespace)
- `tender-programme.p6.xml` — Primavera P6 BusinessObjects XML (`APIBusinessObjects` root)

Stage completion probes require both files. Do not ship only one format.

