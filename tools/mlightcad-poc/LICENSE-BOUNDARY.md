# MLightCAD license boundary

This folder builds the isolated, read-only CAD viewer connected to the Agent Pi
DSH resource preview path.

## Runtime license split

- `@mlightcad/cad-simple-viewer`, `@mlightcad/cad-simple-ui-plugin`, and
  `@mlightcad/data-model` are declared MIT.
- `@mlightcad/libredwg-converter` and `@mlightcad/libredwg-web`, including the
  shipped DWG worker and WebAssembly payload, are declared GPL-3.0.

The published npm artifacts are internally inconsistent: both relevant package
manifests declare GPL-3.0, while `@mlightcad/libredwg-converter` ships a
verbatim `LICENSE` whose contents say MIT, and `@mlightcad/libredwg-web` ships
no license file. The build preserves that upstream file, records the conflict
in `THIRD_PARTY_NOTICES.md`, and separately includes the canonical GNU
GPL-3.0 text as `licenses/GPL-3.0.txt`. This does not resolve which license
grant the upstream author legally intended. Agent Pi 3.6.0 therefore follows
the conservative GPL-3.0-only technical compliance route selected by the
repository owner. This notice is not legal advice.

Keeping the DWG parser in a Worker is useful for responsiveness and isolation,
but it does not remove GPL distribution obligations. Release packaging accepts
only a clean rebuilt parser with its matching receipt, corresponding source,
checksum and license notices; it fails closed if any of those are absent or
changed.

## Fonts

No CAD font payload from `mlightcad/cad-data` is bundled. The viewer instead
ships the unmodified Source Han Sans CN 2.005 Simplified Chinese subset OTF as
one local fallback under SIL Open Font License 1.1. Its copyright and complete
license text are copied beside the font and in the generated `licenses/`
directory. Missing proprietary SHX/TTF fonts, big-font encodings and
CAD-specific symbols can still be substituted and are not guaranteed to match
the authoring system.

See the generated `THIRD_PARTY_NOTICES.md` and `licenses/` directory for the
runtime dependency inventory and bundled license copies.
