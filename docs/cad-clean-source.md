# Clean LibreDWG rebuild and corresponding source

This release process deliberately does not reuse the WebAssembly file published
in `@mlightcad/libredwg-web@0.7.10`. That file contains the version marker
`0c9ab_dirty`, while its npm provenance points at the later `v0.7.10` tag. The
two source lines diverge and contain material C and Embind differences, so the
published binary is rejected rather than described as an exact reproduction.

The clean build starts from these immutable Git objects:

- `mlightcad/libredwg-web` tag `v0.7.10`, commit
  `5909bd2bb87fa1168838e1295188f3ee603618eb`;
- its `zserge/jsmn` submodule at
  `85695f3d5903b1cd5b4030efe50db3b4f5f3c928`;
- `mlightcad/realdwg-web` tag `v1.14.3`, commit
  `30b1f38280daf4a5305e0c85175b4e601f5bd200`.
- `mlightcad/cad-viewer` tag `v1.6.3`, plus the release tags for
  `mtext-renderer` 0.12.4, `mtext-parser` 1.5.0 and `shx-parser` 1.4.5.

The latter four full exports are the preferred-form sources for the MLightCAD
MIT packages included in the final Vite bundle. `SOURCE-MANIFEST.json` maps
each shipped MLightCAD package and version to its source-tree package manifest.
The locked non-MLightCAD production dependencies retain their upstream
repository and exact registry tarball URL/integrity in the archived PoC
`package-lock.json`; their permissive MIT, ISC or 0BSD terms are preserved and
are not replaced by Agent Pi's GPL license.

The builder is derived from the official Emscripten 4.0.12 x64 image at the
digest recorded in `scripts/cad-clean-pins.json`. The child Dockerfile pins the
Autoconf, Automake, Libtool and pkg-config packages and activates pnpm 10.33.4.
The source manifest records the resulting child image ID and all observed tool
versions. This makes the build inputs traceable; it is not a promise that a
future build will be byte-for-byte identical.

## Release sequence

The workflow has no source/artifact bootstrap cycle:

1. Review and merge the clean-build scripts and CAD integration source, then
   create the immutable `v3.6.0` source tag.
2. Run `.github/workflows/build-cad-clean-source.yml` at that exact tag. It
   builds only into `.codex-temp`, never back into the tagged Git tree.
3. Download the workflow artifact. Use its `cad-viewer/` directory as the CAD
   runtime input and put the two corresponding-source files beside the release
   assets.
4. Rebuild every installer and runtime payload from that explicit clean
   runtime. The packagers verify the receipt, source archive and checksum before
   packaging and do not run the npm CAD build again.
5. Create the draft, attach exactly the fifteen required release assets, then
   make it public. The publisher repeats the exact-tag, clean-checkout, GPL
   metadata, corresponding-source and clean-runtime checks before either
   network action. Every Windows, runtime-payload, macOS and Linux binary has
   its own SHA256 sidecar, and Windows also publishes the build receipt that
   binds its installer and payload to the clean CAD and DSH receipts.

The two public corresponding-source assets are:

```text
Agent-Pi-DSH-3.6.0-CAD-corresponding-source.tar.gz
Agent-Pi-DSH-3.6.0-CAD-corresponding-source.tar.gz.sha256
```

The CAD runtime directory is a build input, not a separate public release
asset. It contains `CAD-CLEAN-BUILD.json`; deleting or editing that receipt, or
changing any runtime file, makes packaging fail.

## Exact commands

GitHub Actions executes the equivalent of:

```sh
docker build --pull=false \
  --file scripts/cad-clean-builder.Dockerfile \
  --tag agent-pi-cad-builder:3.6.0 scripts

image_id="$(docker image inspect --format '{{.Id}}' agent-pi-cad-builder:3.6.0)"

docker run --rm \
  --volume "$PWD:/workspace" \
  --env "CAD_BUILDER_IMAGE_ID=$image_id" \
  --env "COREPACK_ENABLE_PROJECT_SPEC=0" \
  agent-pi-cad-builder:3.6.0 \
  bash -lc 'git config --global url."https://github.com/zserge/jsmn.git".insteadOf https://github.com/zserge/jsmn && exec bash /workspace/scripts/build-cad-clean-release.sh'
```

The inner script verifies each annotated tag object, commit, tree and submodule;
exports pristine source trees; and rebuilds LibreDWG with the upstream flags:

```sh
autoreconf -f --install --symlink -I m4
cd bindings/javascript
pnpm install --frozen-lockfile
host_alias=wasm32-unknown-emscripten pnpm run build:prepare
pnpm run build:obj
pnpm run build:wasm
pnpm run copy
pnpm run build
pnpm test
```

It then installs the just-built `dist`, `lib` and `wasm` directories over the
temporary pnpm dependency used by the pinned RealDWG checkout and runs:

```sh
pnpm install --frozen-lockfile
pnpm --filter '@mlightcad/libredwg-converter...' run build
```

Finally, it installs the Agent Pi CAD PoC dependency lock, including the exact
Node 22 type declarations used to check `vite.config.ts`, in a temporary copy,
overlays the rebuilt packages, runs `npm run check`, tests and the viewer build,
then generates and verifies the source manifest and archive.

## What verification proves

`node scripts/cad-clean-release.mjs verify ...` fails unless all of the
following are true:

- the archive and external SHA256 file match exactly;
- the archive has safe paths, a complete per-file SHA256 inventory and no
  symbolic links;
- exported Git blobs recompute to every pinned upstream tree, raw commit and
  annotated-tag objects bind those trees and commits, and LibreDWG's jsmn
  gitlink binds the separately archived jsmn source;
- the selected Agent Pi integration blobs are a verified subset of the full
  release tree, and source versions and license declarations match the pins;
- the builder image, Emscripten, Node, pnpm and Autotools evidence is complete;
- the build evidence records successful Node API, converter, typecheck, viewer
  test and viewer build commands;
- the runtime receipt is byte-for-byte equivalent to the archived manifest;
- every runtime file matches its manifest hash;
- the WASM validates, contains a LibreDWG version marker, contains no `_dirty`
  marker and is not the known rejected upstream binary; and
- the worker preserves the existing message/WASM-loading markers and keeps the
  WASM as a sibling file instead of a data URI.

This verifies a new clean, API-tested build from the pinned source. It does not
retroactively establish the unknown dirty inputs used for the upstream npm
WASM, and it does not claim bit-for-bit reproducibility with that binary.
The repository owner selected this conservative GPL-3.0-only technical
compliance route; this document is not legal advice.
