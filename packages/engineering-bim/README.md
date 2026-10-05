# IFC/BIM engine boundary

This first implementation uses a separate Python worker and a Node subprocess
without a shell. It has been exercised against **IfcOpenShell 0.8.5** with Python
3.13. Configure `AGENT_PI_BIM_PYTHON_PATH` (or the bundle `pythonPath`) to an
interpreter that already contains IfcOpenShell and its dependencies. No runtime
package installation or automatic upgrade occurs. Bundle/runtime distribution
must include the Python worker and provide the configured interpreter separately.
Selection order is explicit bundle `pythonPath`, `AGENT_PI_BIM_PYTHON_PATH`,
existing `bundles/engineering-bim/runtime/python/python.exe` relative to the
product root, then `python` on PATH. The bundle candidate uses the same source and
installed product layout and does not require Electron `resourcesPath`. Health
reports the actual Python executable, Python version and IfcOpenShell version.

`runBim(cwd, request, { pythonPath?, timeoutMs?, signal? })` accepts:

- `health`: actual interpreter/module health and supported actions.
- `inventory`: physical element types, spatial hierarchy, declared units,
  contexts, projected CRS and map conversion metadata.
- `query`: paged elements, GlobalId, placements, properties and native IFC QTO.
- `geometry`: triangulated volume/surface/bounds; net and gross/opening quantities
  remain separate. Native QTO is never substituted with computed geometry.
- `preview`: the same checks plus actual triangle meshes, expressed as local
  `vertices` and `triangles` with an engineering-world `originMeters` per element.
- `generate`: new IFC4 files containing explicitly sized and positioned
  rectangular `IfcBeam`, `IfcSlab` or `IfcBuildingElementProxy` objects.

All reading requests require source SHA-256; both runner and worker constrain real
paths to session cwd. Files outside cwd must be brought into the authorized
workspace first. Generation refuses existing files and uses exclusive creation.
New models use metre units, an explicit site/building/storey hierarchy and
placement matrices. Dimensions extend from the supplied minimum local corner;
optional rotation is around its local Z axis. This is not automatic drawing to
BIM, road alignment/terrain authoring, reinforcement detailing, or structural
design. Generated files are artifacts that still need review and source binding.

The `bim-ifc` engineering provider uses trusted host `context.cwd`, cancellation
signal and explicit source dependencies, so runs persist in the existing project
ledger, survive plugin unload, sync to taskGuide, and become stale with source
changes. Import generated path/hash into the source ledger explicitly before
subsequent reading. No model is automatically accepted as original evidence.

Budgets are 256 MiB/input, 1 MiB/request, 8 MiB/response, 100 query elements/page,
20 geometry elements/page, at most 50,000 triangles across the page (including
gross opening checks), and 200 generated elements. Preview defaults to 20,000
triangles. Default subprocess timeout is 30 seconds; the maximum is 120 seconds.
Timeout and cancellation kill the Python process. Triangle limits are checked
after the geometry kernel triangulates each selected element; they do not impose
an operating-system memory limit on the geometry kernel. No raster pixels or GLB
are produced: consumers render the returned bounded mesh data.
An interrupted generation may leave an unregistered new file; reopen and verify
it before use. A retry must choose a new filename and cannot overwrite it.

Geometry is reported in SI engineering coordinates; georeferencing/map conversion
is reported but not applied. Unit ambiguity blocks geometry. Missing geometry,
nonclosed or inconsistent triangle orientation, absent GlobalIds, and failed
openings remain explicit gaps, never zero quantities. Multiple opening checks
only establish aggregate subtraction and retain a review warning for individual
openings/overlap. Properties are bounded and declare truncation limits. Geometry
quantities retain GlobalId, source SHA, algorithm version and formula, with
`needs_review` status. They are not contract measurement, fabrication approval or
proof that all original drawings were covered.

Validation:

```powershell
$env:AGENT_PI_BIM_PYTHON_PATH = '<configured-python.exe>'
node --experimental-strip-types --test packages/engineering-bim/tests/bim.test.ts
& $env:AGENT_PI_BIM_PYTHON_PATH -B -m unittest discover -s packages/engineering-bim/tests -p test_worker.py -v
```

Tests use real IFC files and verify model generation/readback, paging, geometry,
preview meshes, metre/millimetre placement, native QTO independence, real opening
subtraction, failure gaps, source hash changes, process limits, and persistence
through the shared engineering store. No CAD/PDF or untested third-party IFC
geometry coverage is implied by these fixtures.
