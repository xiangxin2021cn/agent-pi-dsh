#!/usr/bin/env bash
set -euo pipefail

# Run inside the pinned CAD builder against the extracted corresponding source.
readonly CAD_ROOT="${CAD_REPOSITORY_ROOT:-/workspace}"
readonly CAD_SOURCE="${CAD_HOST_SOURCE_DIR:-${CAD_ROOT}/libredwg-web}"
readonly CAD_WORK="${CAD_HOST_BUILD_ROOT:-${CAD_ROOT}/.codex-temp/cad-host-clean-build}"
readonly CAD_OUTPUT="${CAD_HOST_OUTPUT_ROOT:-${CAD_ROOT}/.codex-temp/cad-host-clean-output}"
readonly CAD_INPUTS="${CAD_HOST_INPUTS_PATH:-${CAD_ROOT}/build-inputs.json}"
readonly CAD_PATCH="${CAD_ROOT}/scripts/cad-host-bit-position-overflow.patch"
readonly CAD_TEST="${CAD_ROOT}/scripts/cad-host-bit-position.test.c"
readonly CAD_DOCKERFILE="${CAD_ROOT}/scripts/cad-clean-builder.Dockerfile"

case "$CAD_WORK" in "$CAD_ROOT"/.codex-temp/*) ;; *) exit 1 ;; esac
case "$CAD_OUTPUT" in "$CAD_ROOT"/.codex-temp/*) ;; *) exit 1 ;; esac
test -f "$CAD_INPUTS" && test -f "$CAD_SOURCE/src/bits.c"
test ! -e "$CAD_WORK" && test ! -e "$CAD_OUTPUT"
test "$(node --version)" = v22.16.0
test "$(pnpm --version)" = 10.33.4
emcc --version | head -n 1 | grep -F ' 4.0.12'
export COREPACK_ENABLE_AUTO_PIN=0

input() {
  node -e 'const fs=require("node:fs");const p=JSON.parse(fs.readFileSync(process.argv[1]));console.log(process.argv.slice(2).reduce((v,k)=>v[k],p))' "$CAD_INPUTS" "$@"
}
readonly CAD_EPOCH="$(input sourceDateEpoch)"
readonly CAD_BEFORE="$(input source patch originalSourceSha256)"
readonly CAD_AFTER="$(input source patch patchedSourceSha256)"
test "$(sha256sum "$CAD_SOURCE/src/bits.c" | cut -d ' ' -f1)" = "$CAD_BEFORE"
test "$(sha256sum "$CAD_PATCH" | cut -d ' ' -f1)" = "$(input source patch sha256)"
test "$(sha256sum "${BASH_SOURCE[0]}" | cut -d ' ' -f1)" = "$(input source buildScript sha256)"
test "$(sha256sum "$CAD_TEST" | cut -d ' ' -f1)" = "$(input source regressionTest sha256)"
test "$(sha256sum "$CAD_DOCKERFILE" | cut -d ' ' -f1)" = "$(input toolchain dockerfile sha256)"
node -e 'const fs=require("node:fs");const a=JSON.parse(fs.readFileSync(process.argv[1]));const p=JSON.parse(fs.readFileSync(process.argv[2]));for(const k of ["repository","commit","tree"])if(a[k]!==p.source[k])throw Error("Pinned upstream source mismatch: "+k)' "$CAD_SOURCE/.agent-pi-source.json" "$CAD_INPUTS"

mkdir -p "$CAD_WORK" "$CAD_OUTPUT/sources" "$CAD_WORK/source-stage/scripts"
cp -a "$CAD_SOURCE" "$CAD_WORK/libredwg-web"
patch --batch --fuzz=0 -p1 -d "$CAD_WORK/libredwg-web" < "$CAD_PATCH"
test "$(sha256sum "$CAD_WORK/libredwg-web/src/bits.c" | cut -d ' ' -f1)" = "$CAD_AFTER"
cp -a "$CAD_SOURCE" "$CAD_WORK/source-stage/libredwg-web"
cp "$CAD_PATCH" "$CAD_TEST" "$CAD_DOCKERFILE" "${BASH_SOURCE[0]}" "$CAD_WORK/source-stage/scripts/"
cp "$CAD_INPUTS" "$CAD_WORK/source-stage/build-inputs.json"
cat > "$CAD_WORK/source-stage/BUILD.md" <<'BUILD'
# Standalone host DWG decoder

This archive contains the pinned public LibreDWG source, its jsmn submodule,
the bit-cursor patch, the exact build recipe, and linked runtime-library source.
It contains no customer drawings or derived project documents.

Extract into a writable directory. Build the pinned toolchain with:

    docker build -t agent-pi-cad-host-builder -f scripts/cad-clean-builder.Dockerfile .

Run the standalone build with this directory mounted at /workspace:

    docker run --rm --mount type=bind,source=<absolute extracted directory>,target=/workspace agent-pi-cad-host-builder bash scripts/build-cad-host-clean.sh

The JavaScript dependency install uses the upstream frozen pnpm lockfile and
requires registry access unless those locked packages are already cached.
The runtime files, build receipt, and matching source archive appear under
.codex-temp/cad-host-clean-output. Work/output directories must not already
exist; use a fresh extraction for another build.

The build verifies original/patched source hashes, compiles fresh C objects,
runs the upstream Node API tests and 14 regression checks against the actual
compiled C library, then records the resulting runtime and source hashes.
BUILD

# The corresponding source includes the exact zlib input used by this decoder.
if [[ -d "$CAD_ROOT/toolchain-sources/zlib" ]]; then
  mkdir -p /emsdk/upstream/emscripten/cache/ports/zlib
  cp -a "$CAD_ROOT/toolchain-sources/zlib" /emsdk/upstream/emscripten/cache/ports/zlib/zlib-1.3.1
  printf '%s\n' https://github.com/madler/zlib/archive/refs/tags/v1.3.1.tar.gz > /emsdk/upstream/emscripten/cache/ports/zlib/.emscripten_url
fi

cd "$CAD_WORK/libredwg-web"
autoreconf -f --install --symlink -I m4
cd bindings/javascript
pnpm install --frozen-lockfile
host_alias=wasm32-unknown-emscripten pnpm run build:prepare
pnpm run build:obj
pnpm run build:wasm
pnpm run copy
pnpm run build
pnpm test

emcc "$CAD_TEST" -I../../src -I../../include -I../../build-wasm/src ../../build-wasm/src/.libs/libredwg.a -sUSE_ZLIB=1 -sEXIT_RUNTIME=1 -o "$CAD_WORK/bit-position-test.js"
node "$CAD_WORK/bit-position-test.js"

node -e 'const fs=require("node:fs");const s=fs.readFileSync("dist/libredwg-web.js","utf8");if(s.split("../wasm/libredwg-web.js").length!==3)throw Error("Unexpected wrapper imports");fs.writeFileSync(process.argv[1],s.replaceAll("../wasm/libredwg-web.js","./libredwg-wasm-factory.mjs"))' "$CAD_OUTPUT/libredwg-web.mjs"
cp wasm/libredwg-web.js "$CAD_OUTPUT/libredwg-wasm-factory.mjs"
cp wasm/libredwg-web.wasm "$CAD_OUTPUT/libredwg-web.wasm"
cp ../../COPYING "$CAD_OUTPUT/GPL-3.0.txt"
mkdir -p "$CAD_WORK/source-stage/toolchain-sources/mimalloc"
cp -a /emsdk/upstream/emscripten/system/lib/mimalloc/. "$CAD_WORK/source-stage/toolchain-sources/mimalloc/"
cp /emsdk/upstream/emscripten/system/lib/emmalloc.c "$CAD_WORK/source-stage/toolchain-sources/"
cp /emsdk/upstream/emscripten/LICENSE "$CAD_WORK/source-stage/toolchain-sources/emscripten-LICENSE"
cp -a /emsdk/upstream/emscripten/cache/ports/zlib/zlib-1.3.1 "$CAD_WORK/source-stage/toolchain-sources/zlib"

tar --sort=name --mtime="@$CAD_EPOCH" --owner=0 --group=0 --numeric-owner --format=posix --pax-option=delete=atime,delete=ctime -C "$CAD_WORK/source-stage" -cf - . | gzip -n > "$CAD_OUTPUT/sources/Agent-Pi-DSH-3.8.2-CAD-host-corresponding-source.tar.gz"
CAD_EMCC_VERSION="$(emcc --version | head -n 1)" CAD_NODE_VERSION="$(node --version)" CAD_PNPM_VERSION="$(pnpm --version)" node --input-type=module - "$CAD_INPUTS" "$CAD_OUTPUT" <<'NODE'
import { readFileSync, writeFileSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { resolve } from 'node:path'
const inputs = JSON.parse(readFileSync(process.argv[2], 'utf8'))
const root = process.argv[3]
const metadata = path => {
  const bytes = readFileSync(resolve(root, path))
  return { path, bytes: bytes.length, sha256: createHash('sha256').update(bytes).digest('hex') }
}
const manifest = {
  ...inputs,
  schema: 'agent-pi-dsh/cad-host-clean-build/v1',
  artifacts: ['libredwg-web.mjs', 'libredwg-wasm-factory.mjs', 'libredwg-web.wasm', 'GPL-3.0.txt'].map(metadata),
  sourceArchive: metadata('sources/Agent-Pi-DSH-3.8.2-CAD-host-corresponding-source.tar.gz'),
  evidence: {
    freshCObjects: true,
    nodeApiTests: { total: 2, passed: 2 },
    bitPositionTests: { total: 14, passed: 14, linkedActualLibrary: true },
    emccVersion: process.env.CAD_EMCC_VERSION,
    nodeVersion: process.env.CAD_NODE_VERSION,
    pnpmVersion: process.env.CAD_PNPM_VERSION,
  },
}
writeFileSync(resolve(root, 'CAD-HOST-CLEAN-BUILD.json'), `${JSON.stringify(manifest, null, 2)}\n`)
NODE
