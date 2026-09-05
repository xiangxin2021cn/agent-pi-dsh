# Third-party notices

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

Agent Pi DSH distributes `@dsh-external/dsh-super-injector` 0.3.1 from the
upstream `v0.3.1` release, pinned locally by `vendor/dsh-super-injector.pin`.
The tag resolves to commit `8b4099535976d1af85137ef9e93815cf14c3f094`,
and the release archive is identified by
`sha256:1dfa8623b09684343843150600c4a9c58f2da1d9d0edfff7134a24091c99db4e`.

Source: https://github.com/yjh051108/dsh-super-injector/tree/v0.3.1

The upstream package manifest declares `BSD-3-Clause`. The tagged source tree
and the published release archive contain no `LICENSE` or `NOTICE` file. To
make the declared terms available in every Agent Pi source and binary
distribution, the standard BSD 3-Clause text is carried as
`vendor/dsh-super-injector/LICENSE`; its 2026 `yjh051108` attribution follows
the author identity on the tagged commit. No upstream `NOTICE` is claimed or
synthesized.

## Optional dsh-univer-office integration

Agent Pi DSH public builds do **not** distribute `dsh-univer-office` or its
Univer Pro runtime. The plugin remains discoverable in the in-app market. Its
Apache-2.0 wrapper and its separate commercial runtime have different license
boundaries; users must obtain and comply with the applicable Univer commercial
license before installing or using it. The 3.6.1 compatibility work targets
wrapper 0.2.13 with DSH 0.1.3-alpha.1; technical validation does not establish
redistribution rights. Explicit private/OEM builds may preinstall the runtime
only under the applicable authorization; they are not public release assets.

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
