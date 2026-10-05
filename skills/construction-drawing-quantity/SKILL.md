---
name: construction-drawing-quantity
description: Read construction drawings and calculate traceable quantities using actual drawing versions, dimensions, units and project-applicable measurement rules.
---

# Drawing interpretation and quantity calculation

Use the current brief. Establish professional scope, drawings/revisions, scale and units, quantity purpose and measurement basis. Check selected sheets and missing referenced details. Assess actual CAD, vision, PDF and Office tools; unsupported geometry or unreadable scans remain gaps.

Record each result with sheet/detail/view, component, dimension source, unit, formula and exclusions/deductions. Distinguish visible dimensions from reconstruction assumptions. Do not derive dimensions from screen pixels without verified scale. Reconcile duplicate views, schedules, details and revisions before summing. Keep gross/net and payable/design quantities separate under the project's rules.

Use native calculations and retain spreadsheet formulas. Check units, repeated components, boundary overlaps, openings and rounding. Report actual coverage and unresolved dimensions. Link changes to resource/cost and method planning. Produce the requested scope and files with the professional writing preset and actual file checks.

## Engineering plugins

When `engineering_project` is installed, read `status` first. Discover the available providers and their `inputDescription`; do not assume every plugin is enabled. Use the actual session/project ledger, merge existing collections before `update`, and run calculations with explicit source, parameter and adopted-rule dependencies. Source references retain the exact inspected file hash and sheet/detail/entity locator. Reading and `current` input status do not constitute professional review.

1. Establish an independent expected drawing/component inventory from the drawing index, schedules and project scope. Do not derive completeness from only the objects successfully recognized. Keep missing details, unreadable pages, external references and unsupported entities visible.
2. For CAD, use available `cad_read` inventory and paginated queries. Check layouts, layer/block definitions, nested instance transforms, units, unresolved XREFs and expansion limits. A block definition is not another physical occurrence. Distinguish dimension text overrides from geometry and reconcile instances across views.
3. For PDF, use available `engineering_pdf` page inventory, coordinate-bearing text and direct high-resolution ROI/tile rendering. Inspect the actual image where text is absent or ambiguous; a tile plan or rendered page is not a reviewed page. For measurements, use a verified dimension and same-page/version/viewport calibration; screen pixels or DPI alone are insufficient.
4. Identify physical objects, reconcile views and attach supported dimensions to evidence before calculating. Retain unknown values and partial contiguous geometry without bridging gaps. A model-inferred parameter stays provisional until substantiated.
5. Choose the applicable provider below; report what was found, its source, effect on the user's objective and the next action. Ask only for missing conditions that affect the chosen calculation or deliverable; continue independently supported scopes.

### Steel quantities

Use a complete, evidenced BBS directly when available, checking whether counts are per host or already expanded totals. Preserve authored length, geometric length, fabrication length and procurement quantity separately. Do not count both a BBS group and its drawing representation.

For China Pingfa, `rebar` can parse supported notation, inspect a structured rule pack and expand supported roles. Preserve the original annotation, glyph mappings, central/local scope and component identity. Inspect the rule content fingerprint, adopt its exact version in the project, and include that rule plus every source in calculation dependencies. A notation parser is not a complete G101 construction engine. Do not invent anchorage, lap, hook, cover, seismic, connection or fabrication conventions; unknown nodes and unsupported notation remain explicit uncalculated groups. Calculations never grant fabrication approval.

### Roads, municipal works and BIM

Use the road provider for evidenced chainages and section areas within an independent declared range; keep cut/fill, method and missing midpoint requirements separate. `civil-quantities` supports documented 2D/3D polylines, limited planar layers, explicit rectangular solids and counts. Separate complete and partial subtotals, plan and spatial lengths, holes and actual contract deductions. Curves, slopes or geometry outside the provider's supported input remain gaps.

If `bim-ifc` is available, preserve source file hashes and GlobalIds; distinguish authored IFC quantities from measured geometry, gross/net and opening effects. A preview shows only returned meshes. Generate a new IFC only from explicit supported component dimensions and placements, then register the generated file as a new source; this does not prove automatic CAD-to-BIM reconstruction or design approval.

### Review and delivery

Reconcile results with the independent inventory and original BOQ without changing the tender baseline. Use available `engineering_export` for the current ledger's actual calculation book and workbook; open the files through the existing Office/preview path. Keep drafts, professional review, customer acceptance and fabrication approval distinct. After drawing, parameter or rule changes, inspect invalidated dependencies, recalculate affected scopes and export a new revision while preserving old evidence.
