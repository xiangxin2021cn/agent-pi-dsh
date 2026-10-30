# Third-party notices

## 3.8.7 component update

The official DSH master snapshot is fixed at
`ce7073d51254c26cd63b22a60835b8f948deb447` (package version
`0.2.2-alpha.2`). This is a source snapshot, not a newly named upstream release.
The original upstream source remains unmodified.

The product upgrades Electron to 45.2.0, Node.js LTS to 24.22.2, Codex CLI
to 0.166.0, Canvas to 1.1.0, marked to 18.1.2, DSH Market to 1.73.6 and
the complete official Univer Office distribution to 0.3.9. Their original
licenses and immutable package/source provenance remain included. Univer
retains exchange binding 1.0.4 and formula binding 1.0.3 in the exact
production dependency lock. Earlier version sections below are historical.

Sources: https://github.com/deepseek-ai/deepseek-harness/commit/ce7073d51254c26cd63b22a60835b8f948deb447,
https://github.com/electron/electron/releases/tag/v45.2.0,
https://nodejs.org/dist/v24.22.2/SHASUMS256.txt,
https://github.com/dream-num/dsh-univer-office/tree/v0.3.9,
https://github.com/openai/codex/tree/rust-v0.166.0,
https://registry.npmjs.org/dshmarket/1.73.6.

## huashu-report

Source: https://github.com/alchaincyf/huashu-report
Pinned commit: `bdc08bee5077462e1300431408c5237438a22d00`.
Copyright (c) 2026 alchaincyf. MIT License; the full notice is retained in
`skills/huashu-report/LICENSE` with the upstream references, assets and corpus.
Agent Pi adds `AGENT-PI-ADAPTATION.md`, a pointer in `SKILL.md`, and
`assets/check_runtime.py`; `assets/render.py` is modified for Windows file URLs,
explicit UTF-8 and subprocess failure reporting. `assets/chart.py` handles
all-zero and all-negative paired bar data. These additions do not change
the upstream MIT terms or the application's GPL-3.0-only distribution license.

## Agent Pi business core package

`@agent-pi/business-core` 2.2.4 is a locally developed Agent Pi component in
`packages/business-core`. Its package manifest declares `Apache-2.0`, and the
complete Apache License 2.0 text is distributed beside it as
`packages/business-core/LICENSE`.

This component first entered this repository at commit
`699c05a88723b14e785c0eb75ce041d05a99e0e8`; it is not imported from a
separate upstream project. Neither the component's current source nor its
repository history contains a package-level `NOTICE`, so this distribution
does not claim or synthesize one.

## dsh-super-injector

Agent Pi DSH distributes `@dsh-external/dsh-super-injector` 0.3.5 from the
upstream `v0.3.5` release, pinned locally by `vendor/dsh-super-injector.pin`.
The tag resolves to commit `735c212b136e3fb3f9769e1f07266cd091570a55`,
and the release archive is identified by
`sha256:49dc9c868704da0e73658976b37b55050bfefa8c22be5606dc290cdb77906f41`.

Source: https://github.com/yjh051108/dsh-super-injector/tree/v0.3.5

The upstream package manifest declares `BSD-3-Clause`. The tagged source tree
and the published release archive contain no `LICENSE` or `NOTICE` file. To
make the declared terms available in every Agent Pi source and binary
distribution, the standard BSD 3-Clause text is carried as
`vendor/dsh-super-injector/LICENSE`; its 2026 `yjh051108` attribution follows
the author identity on the tagged commit. No upstream `NOTICE` is claimed or
synthesized.

## dsh-univer-office integration

Agent Pi DSH distributes the complete official `dsh-univer-office` 0.3.7
package, pinned by `vendor/dsh-univer-office.pin`. Agent Pi integrates it with
DSH 0.2.1-alpha.5 through the product's compatibility adapter. The upstream package declares Apache-2.0;
its original LICENSE, bundled Gateway, Viewer, workers, converters and license
materials are retained in the verified package inventory. Platform runtime
dependencies are installed from the tracked production lock and retain their
own upstream terms. The package license does not relicense separately licensed
dependencies; upstream authorization checks and license files are unchanged.

The 0.3.7 official manifest declares both native worker packages:
`@univerjs-pro/exchange-node-binding` 1.0.1 and
`@univerjs-pro/engine-formula-rust-binding` 1.0.1.
The production lock includes matching platform binaries and original licenses.
Upstream also includes the Viewer WebSocket session-ticket and text/binary
framing fixes. The product retains the original official host bytes, authorization and
workspace scope checks. Upstream natively supports the current list-slot and
entry-backed settings contracts; no product host or client patch is applied.

Source: https://github.com/dream-num/dsh-univer-office

## 3.8.5 bundled host dependency pins

The DSH source is pinned by `DSH_PIN` to official commit
`22ddee3792402c3e70ec5f86a63c3e3e895a2f60` (0.2.1-rc.3 source snapshot).
The product host separately pins Codex CLI 0.164.0, Canvas 1.0.13 and undici
7.30.1 in its production package lock; upstream DSH keeps its own locked
Codex provider dependency. Electron is pinned to 45.0.0 for the standard
desktop distribution. The Windows bundled Node runtime is the official
24.22.1 LTS x64 distribution (https://nodejs.org/dist/v24.22.1/).
The Intel Monterey compatibility build retains its
separate Electron 43 pin and source-built native dependency checks.

AnySearch 0.1.8 and DSH Market 1.70.0 retain their MIT licenses. Their official
npm archive integrity, source commits and product adaptations are recorded in
`vendor/core-plugins.pin.json` and each plugin's `AGENT-PI-ADAPTATION.json`.
Product compatibility gates do not replace the original licenses.

Sources: https://github.com/openai/codex/tree/rust-v0.164.0,
https://github.com/Brooooooklyn/canvas/tree/v1.0.13,
https://github.com/nodejs/undici/tree/v7.30.1,
https://github.com/electron/electron/tree/v45.0.0,
https://github.com/anysearch-team/anysearch-dsh/tree/v0.1.8,
https://github.com/dsh-market/dsh-market/tree/b27986ab35d5834a54e0fe5113adc1e1ff11a95c.

## VectifyAI/PageIndex

Agent Pi DSH includes a small TypeScript adaptation of the Markdown heading
hierarchy algorithm and compatible tree-field semantics from PageIndex,
pinned for review at commit `9fee239b174fcc205fec28df105e519ac7171522`.
The PageIndex Python runtime, LiteLLM integration, OpenAI SDK integration and
OpenKB are not bundled.

Source: https://github.com/VectifyAI/PageIndex

MIT License

Copyright (c) 2025 Vectify AI

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.

## MLightCAD DWG viewer (3.6.0)

The 3.6.0 CAD integration bundles these packages into the isolated CAD
viewer under `bundles/tender-web/lib/cad-viewer`:

- `@mlightcad/cad-simple-ui-plugin` 1.6.3 — MIT
- `@mlightcad/cad-simple-viewer` 1.6.3 — MIT
- `@mlightcad/data-model` 1.14.3 — MIT
- `@mlightcad/libredwg-converter` 3.14.3 — its package manifest declares GPL-3.0
- `@mlightcad/libredwg-web` 0.7.10 — its package manifest declares GPL-3.0
- Source Han Sans CN 2.005 — SIL Open Font License 1.1

Sources:

- https://github.com/mlightcad/cad-viewer
- https://github.com/mlightcad/realdwg-web
- https://github.com/mlightcad/libredwg-web
- https://github.com/mlightcad/mtext-renderer
- https://github.com/mlightcad/mtext-parser
- https://github.com/mlightcad/shx-parser
- https://github.com/adobe-fonts/source-han-sans

The emitted viewer includes its dependency inventory in
`cad-viewer/THIRD_PARTY_NOTICES.md` and license copies in
`cad-viewer/licenses/`. In particular, `GPL-3.0.txt` accompanies the
worker/WASM conversion runtime. The inventory preserves the upstream
`@mlightcad/libredwg-converter` LICENSE text verbatim and explicitly records
that its MIT text conflicts with the package manifest's GPL-3.0 declaration.
The release corresponding-source archive contains the exact tagged source
exports for all MLightCAD packages listed here; other permissive production
dependencies retain exact source-acquisition metadata in the archived lockfile.

The MLightCAD MIT packages carry this notice:

MIT License

Copyright (c) 2026 mlightcad

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.

This 3.6.0 integration follows the conservative GPL-3.0-only distribution
route. Release packaging accepts only the clean rebuilt worker/WASM and its
matching receipt, corresponding-source archive and checksum. A package
`LICENSE` file that conflicts with its manifest is not used to relax the
manifest's GPL-3.0 declaration; third-party MIT components retain their own
terms.

The unmodified `SourceHanSansCN-Regular.otf` Simplified Chinese subset is used
as the offline CAD text fallback. Copyright 2014-2025 Adobe, with Reserved Font
Name `Source`. Its complete SIL Open Font License 1.1 text is included as
`cad-viewer/licenses/SourceHanSansCN-OFL-1.1.txt` and beside the font payload.

## Patched CAD host decoder

The agent's DWG-to-DXF conversion uses a separately rebuilt LibreDWG Web
0.7.10 host decoder with a minimal bit-position arithmetic patch. It is
distributed under GPL-3.0-only, with its license, exact build receipt and
matching corresponding source under `bundles/tender-host/lib/cad-decoder`.
The original clean-built CAD viewer files and their source identity are retained.
The default `cad-viewer/host-decoder/` HTTP namespace reuses those front-end
files and serves only its fixed WASM request from this patched host decoder;
`scripts/cad-browser-decoder-release.json` binds both builds and sources.
The original viewer receipt does not authorize the patched binary, which retains
its independent host receipt, GPL license and corresponding source. See `docs/cad-dwg-conversion.md` and
`scripts/build-cad-host-clean.sh` for the patch and rebuild instructions.

## Local project plan engine (MPXJ)

MPP, Project XML and Primavera P6 previews use MPXJ 16.10.0 (LGPL-2.1-or-later)
with a local Java 17 runtime. The unmodified MPXJ jar, dependency source archives,
upstream license files and rebuild instructions are distributed in
`bundles/project-plan`. See `bundles/project-plan/THIRD_PARTY_NOTICES.md` for
component licenses, corresponding-source locations and replacement instructions.

## Official DSH Office runtime

DSH 0.1.7-rc.2 includes `@deepseek-ai/libreoffice-kit` 0.1.1 (MPL-2.0),
from https://github.com/deepseek-harness/libreoffice-kit. Its matching platform
engine is distributed with the upstream integrity manifest, `sources/` recipes
and patches, and `licenses/` notices intact. Windows/macOS use native engines;
Linux uses the upstream WASM engine. These terms do not change Univer licensing.
