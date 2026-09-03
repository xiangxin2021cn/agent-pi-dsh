#!/usr/bin/env bash

set -euo pipefail

readonly ROOT="${CAD_REPOSITORY_ROOT:-/workspace}"
readonly BUILD_ROOT="${CAD_BUILD_ROOT:-${ROOT}/.codex-temp/cad-clean-build}"
readonly OUTPUT_ROOT="${CAD_OUTPUT_ROOT:-${ROOT}/.codex-temp/cad-clean-output}"
readonly PINS_PATH="${ROOT}/scripts/cad-clean-pins.json"
readonly RELEASE_TOOL="${ROOT}/scripts/cad-clean-release.mjs"

if [[ ! -f "${ROOT}/package.json" || ! -f "${PINS_PATH}" ]]; then
  echo "CAD clean build: ${ROOT} is not an Agent Pi DSH checkout" >&2
  exit 1
fi

case "${BUILD_ROOT}" in
  "${ROOT}"/.codex-temp/*) ;;
  *) echo "CAD clean build: build root must be below ${ROOT}/.codex-temp" >&2; exit 1 ;;
esac
case "${OUTPUT_ROOT}" in
  "${ROOT}"/.codex-temp/*) ;;
  *) echo "CAD clean build: output root must be below ${ROOT}/.codex-temp" >&2; exit 1 ;;
esac

if [[ -z "${CAD_BUILDER_IMAGE_ID:-}" ]] || [[ ! "${CAD_BUILDER_IMAGE_ID}" =~ ^sha256:[a-f0-9]{64}$ ]]; then
  echo 'CAD clean build: CAD_BUILDER_IMAGE_ID must be the inspected child builder image ID' >&2
  exit 1
fi

pin() {
  node -e 'const p=require(process.argv[1]); console.log(process.argv.slice(2).reduce((v,k)=>v[k],p))' \
    "${PINS_PATH}" "$@"
}

readonly RELEASE_VERSION="$(pin releaseVersion)"
readonly DSH_TAG="v${RELEASE_VERSION}"
readonly LIBREDWG_REPOSITORY="$(pin sources libredwgWeb repository)"
readonly LIBREDWG_TAG="$(pin sources libredwgWeb tag)"
readonly LIBREDWG_TAG_OBJECT="$(pin sources libredwgWeb tagObject)"
readonly LIBREDWG_COMMIT="$(pin sources libredwgWeb commit)"
readonly LIBREDWG_TREE="$(pin sources libredwgWeb tree)"
readonly LIBREDWG_VERSION="$(pin sources libredwgWeb packageVersion)"
readonly JSMN_REPOSITORY="$(pin sources jsmn repository)"
readonly JSMN_COMMIT="$(pin sources jsmn commit)"
readonly JSMN_TREE="$(pin sources jsmn tree)"
readonly REALDWG_REPOSITORY="$(pin sources realdwgWeb repository)"
readonly REALDWG_TAG="$(pin sources realdwgWeb tag)"
readonly REALDWG_TAG_OBJECT="$(pin sources realdwgWeb tagObject)"
readonly REALDWG_COMMIT="$(pin sources realdwgWeb commit)"
readonly REALDWG_TREE="$(pin sources realdwgWeb tree)"
readonly BASE_IMAGE="$(pin builder baseImage)"
readonly EMSDK_VERSION="$(pin builder emsdkVersion)"
readonly EMSDK_COMMIT="$(pin builder emsdkCommit)"
readonly EMSCRIPTEN_COMMIT="$(pin builder emscriptenCommit)"
readonly NODE_VERSION="$(pin builder nodeVersion)"
readonly PNPM_VERSION="$(pin builder pnpmVersion)"
readonly ARCHIVE_NAME="$(pin sourceArchive)"

dsh_git() {
  git -c "safe.directory=${ROOT}" -C "${ROOT}" "$@"
}

if [[ -n "$(dsh_git status --porcelain=v1 --untracked-files=all)" ]]; then
  echo 'CAD clean build: Agent Pi DSH checkout must be completely clean' >&2
  exit 1
fi
if [[ "$(dsh_git describe --exact-match --tags HEAD 2>/dev/null || true)" != "${DSH_TAG}" ]]; then
  echo "CAD clean build: HEAD must be the exact ${DSH_TAG} release tag" >&2
  exit 1
fi

readonly DSH_COMMIT="$(dsh_git rev-parse HEAD)"
readonly DSH_TREE="$(dsh_git rev-parse 'HEAD^{tree}')"
readonly DSH_REPOSITORY="$(dsh_git remote get-url origin)"
readonly SOURCE_DATE_EPOCH="$(dsh_git show -s --format=%ct HEAD)"

rm -rf -- "${BUILD_ROOT}" "${OUTPUT_ROOT}"
mkdir -p "${BUILD_ROOT}/repos" "${BUILD_ROOT}/work" "${BUILD_ROOT}/source-stage" "${OUTPUT_ROOT}"

readonly REPOS="${BUILD_ROOT}/repos"
readonly WORK="${BUILD_ROOT}/work"
readonly SOURCE_STAGE="${BUILD_ROOT}/source-stage"
readonly RUNTIME_DIR="${OUTPUT_ROOT}/cad-viewer"

assert_repo() {
  local directory="$1"
  local commit="$2"
  local tree="$3"
  local tag="$4"
  local tag_object="$5"

  test "$(git -C "${directory}" rev-parse HEAD)" = "${commit}"
  test "$(git -C "${directory}" rev-parse 'HEAD^{tree}')" = "${tree}"
  test "$(git -C "${directory}" rev-parse "refs/tags/${tag}")" = "${tag_object}"
  test "$(git -C "${directory}" rev-parse "refs/tags/${tag}^{}")" = "${commit}"
  test -z "$(git -C "${directory}" status --porcelain=v1 --untracked-files=all)"
}

write_marker() {
  local output="$1"
  local repository="$2"
  local commit="$3"
  local tree="$4"
  local tag="${5:-}"
  local tag_object="${6:-}"
  node -e '
    const fs = require("node:fs")
    const [output, repository, commit, tree, tag, tagObject] = process.argv.slice(1)
    const marker = { repository }
    if (tag) marker.tag = tag
    if (tagObject) marker.tagObject = tagObject
    marker.commit = commit
    marker.tree = tree
    fs.writeFileSync(output, JSON.stringify(marker, null, 2) + "\n")
  ' "${output}" "${repository}" "${commit}" "${tree}" "${tag}" "${tag_object}"
}

write_git_commit() {
  local repository="$1"
  local commit="$2"
  local output="$3"
  git -C "${repository}" cat-file commit "${commit}" > "${output}/.agent-pi-git-commit.txt"
}

write_git_tag() {
  local repository="$1"
  local tag_object="$2"
  local output="$3"
  git -C "${repository}" cat-file tag "${tag_object}" > "${output}/.agent-pi-git-tag.txt"
}

echo 'Cloning pinned LibreDWG Web source'
git clone --branch "${LIBREDWG_TAG}" --recurse-submodules "${LIBREDWG_REPOSITORY}" "${REPOS}/libredwg-web"
assert_repo "${REPOS}/libredwg-web" "${LIBREDWG_COMMIT}" "${LIBREDWG_TREE}" "${LIBREDWG_TAG}" "${LIBREDWG_TAG_OBJECT}"
test "$(git -C "${REPOS}/libredwg-web/jsmn" rev-parse HEAD)" = "${JSMN_COMMIT}"
test "$(git -C "${REPOS}/libredwg-web/jsmn" rev-parse 'HEAD^{tree}')" = "${JSMN_TREE}"
test "$(git -C "${REPOS}/libredwg-web/jsmn" remote get-url origin)" = "${JSMN_REPOSITORY}"
test -z "$(git -C "${REPOS}/libredwg-web/jsmn" status --porcelain=v1 --untracked-files=all)"
readonly JSMN_STATUS="$(git -C "${REPOS}/libredwg-web" submodule status --recursive)"
[[ "${JSMN_STATUS}" == " ${JSMN_COMMIT} jsmn"* ]]

echo 'Cloning pinned RealDWG Web source'
git clone --branch "${REALDWG_TAG}" "${REALDWG_REPOSITORY}" "${REPOS}/realdwg-web"
assert_repo "${REPOS}/realdwg-web" "${REALDWG_COMMIT}" "${REALDWG_TREE}" "${REALDWG_TAG}" "${REALDWG_TAG_OBJECT}"

mkdir -p \
  "${SOURCE_STAGE}/libredwg-web" \
  "${SOURCE_STAGE}/realdwg-web" \
  "${SOURCE_STAGE}/agent-pi-dsh-cad-integration"
git -C "${REPOS}/libredwg-web" archive --format=tar "${LIBREDWG_COMMIT}" | tar -xf - -C "${SOURCE_STAGE}/libredwg-web"
mkdir -p "${SOURCE_STAGE}/libredwg-web/jsmn"
git -C "${REPOS}/libredwg-web/jsmn" archive --format=tar "${JSMN_COMMIT}" | tar -xf - -C "${SOURCE_STAGE}/libredwg-web/jsmn"
git -C "${REPOS}/realdwg-web" archive --format=tar "${REALDWG_COMMIT}" | tar -xf - -C "${SOURCE_STAGE}/realdwg-web"
printf '%s\n' "${LIBREDWG_VERSION}" > "${SOURCE_STAGE}/libredwg-web/.tarball-version"
write_marker "${SOURCE_STAGE}/libredwg-web/.agent-pi-source.json" "${LIBREDWG_REPOSITORY}" "${LIBREDWG_COMMIT}" "${LIBREDWG_TREE}" "${LIBREDWG_TAG}" "${LIBREDWG_TAG_OBJECT}"
write_marker "${SOURCE_STAGE}/libredwg-web/jsmn/.agent-pi-source.json" "${JSMN_REPOSITORY}" "${JSMN_COMMIT}" "${JSMN_TREE}"
write_marker "${SOURCE_STAGE}/realdwg-web/.agent-pi-source.json" "${REALDWG_REPOSITORY}" "${REALDWG_COMMIT}" "${REALDWG_TREE}" "${REALDWG_TAG}" "${REALDWG_TAG_OBJECT}"
git -C "${REPOS}/libredwg-web" ls-tree -r --full-tree "${LIBREDWG_COMMIT}" > "${SOURCE_STAGE}/libredwg-web/.agent-pi-git-tree.txt"
git -C "${REPOS}/libredwg-web/jsmn" ls-tree -r --full-tree "${JSMN_COMMIT}" > "${SOURCE_STAGE}/libredwg-web/jsmn/.agent-pi-git-tree.txt"
git -C "${REPOS}/realdwg-web" ls-tree -r --full-tree "${REALDWG_COMMIT}" > "${SOURCE_STAGE}/realdwg-web/.agent-pi-git-tree.txt"
write_git_commit "${REPOS}/libredwg-web" "${LIBREDWG_COMMIT}" "${SOURCE_STAGE}/libredwg-web"
write_git_tag "${REPOS}/libredwg-web" "${LIBREDWG_TAG_OBJECT}" "${SOURCE_STAGE}/libredwg-web"
write_git_commit "${REPOS}/libredwg-web/jsmn" "${JSMN_COMMIT}" "${SOURCE_STAGE}/libredwg-web/jsmn"
write_git_commit "${REPOS}/realdwg-web" "${REALDWG_COMMIT}" "${SOURCE_STAGE}/realdwg-web"
write_git_tag "${REPOS}/realdwg-web" "${REALDWG_TAG_OBJECT}" "${SOURCE_STAGE}/realdwg-web"

export_tagged_source() {
  local label="$1"
  local key="$2"
  local directory="$3"
  local repository tag tag_object commit tree
  repository="$(pin sources "${key}" repository)"
  tag="$(pin sources "${key}" tag)"
  tag_object="$(pin sources "${key}" tagObject)"
  commit="$(pin sources "${key}" commit)"
  tree="$(pin sources "${key}" tree)"

  echo "Cloning pinned ${label} source"
  git clone --branch "${tag}" "${repository}" "${REPOS}/${directory}"
  assert_repo "${REPOS}/${directory}" "${commit}" "${tree}" "${tag}" "${tag_object}"
  mkdir -p "${SOURCE_STAGE}/${directory}"
  git -C "${REPOS}/${directory}" archive --format=tar "${commit}" | \
    tar -xf - -C "${SOURCE_STAGE}/${directory}"
  write_marker "${SOURCE_STAGE}/${directory}/.agent-pi-source.json" \
    "${repository}" "${commit}" "${tree}" "${tag}" "${tag_object}"
  git -C "${REPOS}/${directory}" ls-tree -r --full-tree "${commit}" > \
    "${SOURCE_STAGE}/${directory}/.agent-pi-git-tree.txt"
  write_git_commit "${REPOS}/${directory}" "${commit}" "${SOURCE_STAGE}/${directory}"
  write_git_tag "${REPOS}/${directory}" "${tag_object}" "${SOURCE_STAGE}/${directory}"
}

export_tagged_source 'CAD Viewer' cadViewer cad-viewer
export_tagged_source 'MText Renderer' mtextRenderer mtext-renderer
export_tagged_source 'MText Parser' mtextParser mtext-parser
export_tagged_source 'SHX Parser' shxParser shx-parser

readonly DSH_SOURCE_PATHS=(
  LICENSE
  package.json
  THIRD_PARTY_NOTICES.md
  tools/mlightcad-poc
  bundles/tender-host/src/cad-viewer-assets.ts
  bundles/tender-host/src/http.ts
  bundles/tender-web/src/client/file-preview-overlay.js
  bundles/tender-web/src/client/styles.js
  scripts/cad-clean-builder.Dockerfile
  scripts/cad-clean-pins.json
  scripts/cad-clean-release.mjs
  scripts/build-cad-clean-release.sh
  scripts/pack-runtime-payload.mjs
  scripts/pack-win.ps1
  docs/cad-clean-source.md
  docs/cad-clean-third-party.md
  release/RELEASE_POLICY.md
  release/publish-v3.6.0-release.mjs
  .github/workflows/build-cad-clean-source.yml
)
dsh_git archive --format=tar "${DSH_COMMIT}" -- "${DSH_SOURCE_PATHS[@]}" | \
  tar -xf - -C "${SOURCE_STAGE}/agent-pi-dsh-cad-integration"
write_marker "${SOURCE_STAGE}/agent-pi-dsh-cad-integration/.agent-pi-source.json" \
  "${DSH_REPOSITORY}" "${DSH_COMMIT}" "${DSH_TREE}" "${DSH_TAG}"
dsh_git ls-tree -r --full-tree "${DSH_COMMIT}" -- "${DSH_SOURCE_PATHS[@]}" > \
  "${SOURCE_STAGE}/agent-pi-dsh-cad-integration/.agent-pi-git-tree.txt"
dsh_git ls-tree -r --full-tree "${DSH_COMMIT}" > \
  "${SOURCE_STAGE}/agent-pi-dsh-cad-integration/.agent-pi-full-git-tree.txt"
dsh_git cat-file commit "${DSH_COMMIT}" > \
  "${SOURCE_STAGE}/agent-pi-dsh-cad-integration/.agent-pi-git-commit.txt"

cp -a "${SOURCE_STAGE}/libredwg-web" "${WORK}/libredwg-web"
pushd "${WORK}/libredwg-web" >/dev/null
autoreconf -f --install --symlink -I m4
pushd bindings/javascript >/dev/null
pnpm install --frozen-lockfile
pnpm run build:prepare
pnpm run build:obj
pnpm run build:wasm
pnpm run copy
pnpm run build
pnpm test
popd >/dev/null
popd >/dev/null

readonly CLEAN_LIBREDWG_PACKAGE="${WORK}/libredwg-web/bindings/javascript"
readonly CLEAN_WASM="${CLEAN_LIBREDWG_PACKAGE}/wasm/libredwg-web.wasm"
node -e '
  const fs = require("node:fs")
  const bytes = fs.readFileSync(process.argv[1])
  if (!WebAssembly.validate(bytes)) throw new Error("rebuilt wasm is invalid")
  const text = bytes.toString("latin1")
  if (text.includes("_dirty")) throw new Error("rebuilt wasm contains _dirty")
  if (!text.includes("LibreDWG ")) throw new Error("rebuilt wasm lacks LibreDWG version marker")
' "${CLEAN_WASM}"

mkdir -p "${SOURCE_STAGE}/toolchain-sources/mimalloc" "${SOURCE_STAGE}/toolchain-sources/zlib" "${SOURCE_STAGE}/LICENSES"
cp -a /emsdk/upstream/emscripten/system/lib/mimalloc/. "${SOURCE_STAGE}/toolchain-sources/mimalloc/"
cp /emsdk/upstream/emscripten/system/lib/emmalloc.c "${SOURCE_STAGE}/toolchain-sources/emmalloc.c"
cp /emsdk/upstream/emscripten/LICENSE "${SOURCE_STAGE}/toolchain-sources/emscripten-LICENSE"
readonly ZLIB_HEADER="$(find /emsdk/upstream/emscripten/cache/ports -type f -name zlib.h -print -quit)"
if [[ -z "${ZLIB_HEADER}" ]]; then
  echo 'CAD clean build: cannot find the zlib source used by Emscripten' >&2
  exit 1
fi
cp -a "$(dirname "${ZLIB_HEADER}")/." "${SOURCE_STAGE}/toolchain-sources/zlib/"
test -f "${SOURCE_STAGE}/toolchain-sources/zlib/LICENSE"
cp "${SOURCE_STAGE}/libredwg-web/COPYING" "${SOURCE_STAGE}/LICENSES/GPL-3.0.txt"
cp "${ROOT}/docs/cad-clean-source.md" "${SOURCE_STAGE}/BUILD-INSTRUCTIONS.md"
cp "${ROOT}/docs/cad-clean-third-party.md" "${SOURCE_STAGE}/THIRD-PARTY-SOURCES.md"

cp -a "${SOURCE_STAGE}/realdwg-web" "${WORK}/realdwg-web"
pushd "${WORK}/realdwg-web" >/dev/null
pnpm install --frozen-lockfile
readonly INSTALLED_LIBREDWG="$(node -e 'console.log(require("node:fs").realpathSync("packages/libredwg-converter/node_modules/@mlightcad/libredwg-web"))')"
rm -rf -- "${INSTALLED_LIBREDWG}/dist" "${INSTALLED_LIBREDWG}/lib" "${INSTALLED_LIBREDWG}/wasm"
cp -a "${CLEAN_LIBREDWG_PACKAGE}/dist" "${CLEAN_LIBREDWG_PACKAGE}/lib" "${CLEAN_LIBREDWG_PACKAGE}/wasm" "${INSTALLED_LIBREDWG}/"
pnpm --filter '@mlightcad/libredwg-converter...' run build
cmp "${CLEAN_WASM}" packages/libredwg-converter/dist/libredwg-web.wasm
popd >/dev/null

readonly CLEAN_CONVERTER_PACKAGE="${WORK}/realdwg-web/packages/libredwg-converter"
mkdir -p "${WORK}/dsh/tools" "${WORK}/dsh/bundles/tender-web/lib"
cp -a "${SOURCE_STAGE}/agent-pi-dsh-cad-integration/tools/mlightcad-poc" "${WORK}/dsh/tools/mlightcad-poc"
pushd "${WORK}/dsh/tools/mlightcad-poc" >/dev/null
npm ci --no-fund --no-audit
readonly INSTALLED_CONVERTER="${WORK}/dsh/tools/mlightcad-poc/node_modules/@mlightcad/libredwg-converter"
readonly INSTALLED_DSH_LIBREDWG="${WORK}/dsh/tools/mlightcad-poc/node_modules/@mlightcad/libredwg-web"
rm -rf -- "${INSTALLED_CONVERTER}/dist" "${INSTALLED_CONVERTER}/lib"
cp -a "${CLEAN_CONVERTER_PACKAGE}/dist" "${CLEAN_CONVERTER_PACKAGE}/lib" "${INSTALLED_CONVERTER}/"
rm -rf -- "${INSTALLED_DSH_LIBREDWG}/dist" "${INSTALLED_DSH_LIBREDWG}/lib" "${INSTALLED_DSH_LIBREDWG}/wasm"
cp -a "${CLEAN_LIBREDWG_PACKAGE}/dist" "${CLEAN_LIBREDWG_PACKAGE}/lib" "${CLEAN_LIBREDWG_PACKAGE}/wasm" "${INSTALLED_DSH_LIBREDWG}/"
npm run check
npm run build
npm test
popd >/dev/null

cp -a "${WORK}/dsh/bundles/tender-web/lib/cad-viewer" "${RUNTIME_DIR}"
cmp "${CLEAN_WASM}" "${RUNTIME_DIR}/workers/libredwg-web.wasm"
cmp "${CLEAN_CONVERTER_PACKAGE}/dist/libredwg-parser-worker.js" "${RUNTIME_DIR}/workers/libredwg-parser-worker.js"

export CAD_TOOLCHAIN_BASE_IMAGE="${BASE_IMAGE}"
export CAD_TOOLCHAIN_EMSDK_VERSION="${EMSDK_VERSION}"
export CAD_TOOLCHAIN_EMSDK_COMMIT="${EMSDK_COMMIT}"
export CAD_TOOLCHAIN_EMSCRIPTEN_COMMIT="${EMSCRIPTEN_COMMIT}"
export CAD_TOOLCHAIN_NODE_VERSION="$(node --version)"
export CAD_TOOLCHAIN_PNPM_VERSION="$(pnpm --version)"
export CAD_TOOLCHAIN_EMCC_VERSION="$(emcc --version | head -n 1)"
export CAD_TOOLCHAIN_AUTOCONF_VERSION="$(autoconf --version | head -n 1)"
export CAD_TOOLCHAIN_AUTOMAKE_VERSION="$(automake --version | head -n 1)"
export CAD_TOOLCHAIN_LIBTOOL_VERSION="$(libtoolize --version | head -n 1)"
export CAD_TOOLCHAIN_MAKE_VERSION="$(make --version | head -n 1)"
export CAD_TOOLCHAIN_APT_PACKAGES="$(dpkg-query -W -f='${Package}=${Version}\n' autoconf automake libtool pkg-config | sort)"
test "${CAD_TOOLCHAIN_NODE_VERSION}" = "${NODE_VERSION}"
test "${CAD_TOOLCHAIN_PNPM_VERSION}" = "${PNPM_VERSION}"

readonly TOOLCHAIN_REPORT="${SOURCE_STAGE}/toolchain.json"
node -e '
  const fs = require("node:fs")
  const aptPackages = Object.fromEntries(
    process.env.CAD_TOOLCHAIN_APT_PACKAGES.trim().split("\n").map((line) => line.split(/=(.*)/s).slice(0, 2)),
  )
  const report = {
    baseImage: process.env.CAD_TOOLCHAIN_BASE_IMAGE,
    builderImageId: process.env.CAD_BUILDER_IMAGE_ID,
    emsdkVersion: process.env.CAD_TOOLCHAIN_EMSDK_VERSION,
    emsdkCommit: process.env.CAD_TOOLCHAIN_EMSDK_COMMIT,
    emscriptenCommit: process.env.CAD_TOOLCHAIN_EMSCRIPTEN_COMMIT,
    nodeVersion: process.env.CAD_TOOLCHAIN_NODE_VERSION,
    pnpmVersion: process.env.CAD_TOOLCHAIN_PNPM_VERSION,
    emccVersion: process.env.CAD_TOOLCHAIN_EMCC_VERSION,
    autoconfVersion: process.env.CAD_TOOLCHAIN_AUTOCONF_VERSION,
    automakeVersion: process.env.CAD_TOOLCHAIN_AUTOMAKE_VERSION,
    libtoolVersion: process.env.CAD_TOOLCHAIN_LIBTOOL_VERSION,
    makeVersion: process.env.CAD_TOOLCHAIN_MAKE_VERSION,
    aptPackages,
  }
  fs.writeFileSync(process.argv[1], JSON.stringify(report, null, 2) + "\n")
' "${TOOLCHAIN_REPORT}"

readonly BUILD_EVIDENCE="${SOURCE_STAGE}/build-evidence.json"
export CAD_EVIDENCE_WASM_SHA256="$(sha256sum "${RUNTIME_DIR}/workers/libredwg-web.wasm" | cut -d ' ' -f 1)"
export CAD_EVIDENCE_WORKER_SHA256="$(sha256sum "${RUNTIME_DIR}/workers/libredwg-parser-worker.js" | cut -d ' ' -f 1)"
export CAD_EVIDENCE_LIBREDWG_COMMIT="${LIBREDWG_COMMIT}"
export CAD_EVIDENCE_REALDWG_COMMIT="${REALDWG_COMMIT}"
node -e '
  const fs = require("node:fs")
  const evidence = {
    schema: "agent-pi-dsh/cad-clean-evidence/v1",
    libredwgSourceCommit: process.env.CAD_EVIDENCE_LIBREDWG_COMMIT,
    realdwgSourceCommit: process.env.CAD_EVIDENCE_REALDWG_COMMIT,
    libredwgWasmSha256: process.env.CAD_EVIDENCE_WASM_SHA256,
    converterWorkerSha256: process.env.CAD_EVIDENCE_WORKER_SHA256,
    checks: [
      { id: "libredwg-node-api", command: "pnpm test", result: "passed" },
      { id: "realdwg-converter-build", command: "pnpm --filter @mlightcad/libredwg-converter... run build", result: "passed" },
      { id: "agent-pi-cad-typecheck", command: "npm run check", result: "passed" },
      { id: "agent-pi-cad-tests", command: "npm test", result: "passed" },
      { id: "agent-pi-cad-build", command: "npm run build", result: "passed" },
    ],
  }
  fs.writeFileSync(process.argv[1], JSON.stringify(evidence, null, 2) + "\n")
' "${BUILD_EVIDENCE}"

node "${RELEASE_TOOL}" create \
  --source-root "${SOURCE_STAGE}" \
  --runtime-dir "${RUNTIME_DIR}" \
  --toolchain "${TOOLCHAIN_REPORT}" \
  --evidence "${BUILD_EVIDENCE}" \
  --archive "${OUTPUT_ROOT}/${ARCHIVE_NAME}" \
  --source-date-epoch "${SOURCE_DATE_EPOCH}" \
  --dsh-repository "${DSH_REPOSITORY}" \
  --dsh-tag "${DSH_TAG}" \
  --dsh-commit "${DSH_COMMIT}" \
  --dsh-tree "${DSH_TREE}"

node "${RELEASE_TOOL}" verify \
  --archive "${OUTPUT_ROOT}/${ARCHIVE_NAME}" \
  --checksum "${OUTPUT_ROOT}/${ARCHIVE_NAME}.sha256" \
  --runtime-dir "${RUNTIME_DIR}"

echo "CAD clean build complete: ${OUTPUT_ROOT}"
