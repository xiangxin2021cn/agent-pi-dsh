# DWG to DXF for agent drawing analysis

Agent Pi DSH uses the pinned MLightCAD data model for DWG-to-DXF export. The host runs a separate Node process with a separately clean-built LibreDWG Web 0.7.10 decoder and Node factory. Its minimal C bit-cursor patch fixes a 32-bit signed conversion that treated valid offsets beyond 256 MiB of decompressed section data as underflow. The CAD preview's original runtime and clean-build receipt remain unchanged. No installed CAD application is required for the host conversion.

The Windows build removes published npm WASM copies before staging. The host explicitly loads `bundles/tender-host/lib/cad-decoder/`, checks the matched wrapper, factory and WASM hashes, and verifies decoded block/layer relationships before export. DXF group output is streamed rather than assembled into one JavaScript string. The patched host has its own `CAD-HOST-CLEAN-BUILD.json`, GPL text and matching corresponding-source archive; packaging verifies these independently of the viewer.

Opening a workspace DWG in the right-side preview starts host conversion without delaying the viewer. The default viewer URL uses `/api/agent-pi/cad-viewer/host-decoder/`: original clean-built front-end assets are reused, while its fixed `workers/libredwg-web.wasm` request is served from the verified patched host. `scripts/cad-browser-decoder-release.json` binds the original viewer/worker and the patched host receipt, WASM and corresponding source; no original viewer file is overwritten. Legacy viewer URLs retain their original binary. The new worker/WASM namespace is not cached. `cad_prepare` and `cad_read` use the same host conversion. The ASCII DXF is stored under `<workspace>/.agent-pi/cad-converted/`, keyed by the DWG SHA-256. A `cad-dxf-verified/v2` receipt binds the original DWG path/hash, decoder/code signature, complete DXF hash, model relationship check and parser warnings. Legacy receipts and altered DXF files are regenerated. Reading a derived DXF in this reserved directory resolves the original DWG through that receipt and retains the conversion warnings. The original drawing is unchanged.

Large UTF-8 ASCII DXF files use a disk index and bounded geometry projection. All original groups remain available through `source_records` and paged `raw_pairs`; binary payloads are preserved rather than silently dropped. An instance-expansion limit, missing external reference or unknown object is still a coverage gap.

## Embedded content

1. Call `cad_read inventory` on the original DWG (or its verified derived path).
2. Query `records` or `source_records` with `types:["OLE2FRAME","OLEFRAME"]`, following `nextOffset`.
3. Query `collection:"embedded"` with each `recordId`. The tool streams the full original OLE payload to disk and returns its SHA-256; supported embedded bitmaps also return a full-resolution PNG `imagePath`.
4. Use `read_image` to classify the actual image as a diagram, schedule, logo or other material. Trace each placement and register the finding with the engineering project. Equal preview hashes allow shared visual interpretation while retaining all source records and placement instances.

Only one object is decoded at a time. The PNG decode budget is 64 MiB of payload and 32 million pixels; an unsupported or over-budget object keeps its full raw payload and an explicit review gap. Extracted content is source material: macros, scripts and links are never executed. Extraction or preview is not automatic reinforcement identification or quantity acceptance.

Users can request this in the main conversation:

> 请读取这张 DWG，核对块和图层关系；检查所有内嵌对象，提取图像并区分图示、料表和标识。按实际放置位置关联来源，工程内容再进入构件识别和算量；未加载外参、未知实体和未复核项保留缺口。

## Rebuild and limits

`scripts/build-cad-host-clean.sh` describes the independently pinned source/patch/toolchain build; `scripts/cad-host-clean-release.mjs` verifies the exact runtime receipt, files, license and corresponding source before packaging. The original viewer rebuild remains governed by its existing pins. `scripts/cad-browser-decoder-release.mjs` separately verifies the fixed browser/host composition. Actual compiled-worker tests on the unchanged project DWG recover all 8,414 valid INSERT references and 97 complete OLE payloads. This is parser compatibility evidence, not a WebGL visual or quantity review: current two-dimensional rendering does not display 3DSOLID and may omit unsupported splines or embedded formats.

DWG input remains limited to 64 MiB. A small compressed DWG can contain a much larger decompressed section; the tested bit-cursor repair covers this drawing's 349,670,400-byte section. It does not establish support for arbitrary section sizes, formats or proprietary objects. Parser warnings remain visible even when block/layer checks pass. Units, dimensions, instance coverage, external references, 3D/proxy objects and engineering semantics still require review; a valid DXF never certifies comprehensive quantities.
