# CAD source and license inventory

The distributed DWG parser path includes `@mlightcad/libredwg-converter` and
`@mlightcad/libredwg-web`; both package manifests declare GPL-3.0. The source
archive therefore includes the full pinned source exports for both projects,
the exact jsmn submodule, the Agent Pi integration and packaging source needed
for this CAD payload, the build recipe, a file inventory and the complete GNU
GPL version 3 text. It also includes full tagged exports for `cad-viewer`,
`mtext-renderer`, `mtext-parser` and `shx-parser`; together with the RealDWG
monorepo, those exports cover every MLightCAD package consumed by the final
Vite bundle. The manifest maps each package to its preferred-form source.

Agent Pi DSH 3.6.0 is distributed under GPL-3.0-only and its release-root
`LICENSE` is included with the integration source. This does not relicense
third-party components: their original copyright notices and MIT, zlib,
Emscripten or OFL terms remain attached to those components.

The RealDWG monorepo root and the `LICENSE` file automatically placed in the
published converter package say MIT, while the converter package manifest and
README say GPL-3.0. This process preserves both notices and applies the safer
GPL-3.0 treatment; it does not assert that the conflicting metadata relicenses
the converter. Worker isolation is an architectural boundary, not by itself a
legal conclusion about the surrounding application.

The native link also uses:

- zlib through Emscripten's `-sUSE_ZLIB=1` port, under the zlib license;
- mimalloc through `-s MALLOC=mimalloc`, under the MIT license; and
- Emscripten's emmalloc/system runtime code under Emscripten's license terms.

The exact zlib port source material fetched by Emscripten, the mimalloc source,
`emmalloc.c`, and the Emscripten license are copied into `toolchain-sources/`.
The fixed Emscripten source revision is
`209b886304498eff50dd835850dc5715803401ed`, selected by emsdk 4.0.12 at emsdk
commit `f39e849effe1bd679aa9ef3cd1798d327c9619db`.

The remaining Vite production dependencies are separately licensed MIT, ISC or
0BSD works. Their exact versions, registry tarball URLs, integrity hashes and
upstream repository metadata are retained in the archived
`tools/mlightcad-poc/package-lock.json` and package manifests; those original
terms remain in force and are not relicensed as Agent Pi code.

For online binary distribution, keep the corresponding-source archive and its
checksum available at the same release download location as the installers,
preserve copyright/license notices, identify Agent Pi modifications and build
instructions, and license covered modifications consistently with GPLv3. The
repository owner selected this conservative GPL-3.0-only technical compliance
route. The publisher fails closed on the exact tag, clean checkout, GPL
metadata, corresponding source and clean runtime; this notice is not legal
advice.
