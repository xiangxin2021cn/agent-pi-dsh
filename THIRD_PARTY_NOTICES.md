# Third-party notices

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

Agent Pi DSH distributes `@dsh-external/dsh-super-injector` 0.3.3 from the
upstream `v0.3.3` release, pinned locally by `vendor/dsh-super-injector.pin`.
The tag resolves to commit `f4ef59fb31439225abefe45d6e793235a2a9d5e0`,
and the release archive is identified by
`sha256:355238fa8e51bc45c0801066af51e0e122f3b21411b193f601ee54e534391f48`.

Source: https://github.com/yjh051108/dsh-super-injector/tree/v0.3.3

The upstream package manifest declares `BSD-3-Clause`. The tagged source tree
and the published release archive contain no `LICENSE` or `NOTICE` file. To
make the declared terms available in every Agent Pi source and binary
distribution, the standard BSD 3-Clause text is carried as
`vendor/dsh-super-injector/LICENSE`; its 2026 `yjh051108` attribution follows
the author identity on the tagged commit. No upstream `NOTICE` is claimed or
synthesized.

## dsh-univer-office integration

Agent Pi DSH distributes the complete official `dsh-univer-office` 0.3.0
package, pinned by `vendor/dsh-univer-office.pin`, with native support for
DSH 0.1.6-alpha.1. The upstream package declares Apache-2.0;
its original LICENSE, bundled Gateway, Viewer, workers, converters and license
materials are retained in the verified package inventory. Platform runtime
dependencies are installed from the tracked production lock and retain their
own upstream terms. The package license does not relicense separately licensed
dependencies; upstream authorization checks and license files are unchanged.

The 0.3.0 workers also require native packages omitted from its published
dependency manifest. The production lock supplies the exact dependencies of
the bundled 1.0.0-rc.0 SDK: `@univerjs-pro/exchange-node-binding` 0.1.2 and
`@univerjs-pro/engine-formula-rust-binding` 1.0.0-insiders.20260910-22fe9c7,
including the matching platform binaries and their original licenses.
The recorded compatibility patch preserves the Viewer WebSocket session ticket
and text/binary message framing. Official browser authentication and workspace
scope checks remain intact; the native DSH client integration is unchanged.

Source: https://github.com/dream-num/dsh-univer-office

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
