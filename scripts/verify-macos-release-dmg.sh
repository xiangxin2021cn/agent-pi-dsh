#!/usr/bin/env bash
set -euo pipefail

dmg="$1"
version="$2"
arch="$3"
node_version="$4"
electron_version="$5"
mode="$6"
zip_app="${7:-}"
[[ "$mode" == signed || "$mode" == preview ]]
audit_dir=$(mktemp -d "${RUNNER_TEMP:?}/agent-pi-dmg.XXXXXX")
mount_dir="$audit_dir/volume"
mkdir "$mount_dir"

verify_app() {
  codesign --verify --deep --strict --verbose=2 "$1"
  if [[ "$mode" == signed ]]; then
    codesign --verify --strict --verbose=2 \
      -R='anchor apple generic and certificate leaf[field.1.2.840.113635.100.6.1.13] exists' "$1"
    xcrun stapler validate "$1"
    syspolicy_check distribution "$1"
  fi
}

sw_vers
test "$(uname -m)" = "$arch"
if [[ "$mode" == signed ]]; then
  xcrun stapler validate "$dmg"
  spctl --assess --type open --context context:primary-signature --verbose=2 "$dmg"
fi
hdiutil verify "$dmg"
hdiutil attach -readonly -nobrowse -noautoopen -mountpoint "$mount_dir" -plist "$dmg" > "$audit_dir/attach.plist"
trap 'hdiutil detach "$mount_dir"' EXIT
device=$(plutil -extract system-entities.0.dev-entry raw -o - "$audit_dir/attach.plist")
trap 'hdiutil detach "$device"' EXIT
diskutil info -plist "$mount_dir" > "$audit_dir/volume.plist"
test "$(plutil -extract FilesystemType raw -o - "$audit_dir/volume.plist")" = apfs

app="$mount_dir/Agent Pi DSH.app"
plist="$app/Contents/Info.plist"
test "$(plutil -extract CFBundleShortVersionString raw -o - "$plist")" = "$version"
executable=$(plutil -extract CFBundleExecutable raw -o - "$plist")
test "$(lipo -archs "$app/Contents/MacOS/$executable")" = "$arch"
verify_app "$app"
if [[ -n "$zip_app" ]]; then
  signature=$(codesign -d --verbose=4 "$app" 2>&1)
  zip_signature=$(codesign -d --verbose=4 "$zip_app" 2>&1)
  cdhash=$(sed -n 's/^CDHash=//p' <<< "$signature")
  test -n "$cdhash"
  test "$cdhash" = "$(sed -n 's/^CDHash=//p' <<< "$zip_signature")"
fi

# Reproduce dragging the app out of the mounted image, then launch those bytes.
installed="$audit_dir/installed/Agent Pi DSH.app"
mkdir "$audit_dir/installed"
ditto "$app" "$installed"
hdiutil detach "$device"
trap - EXIT
verify_app "$installed"
node_arch="$arch"
if [[ "$arch" == x86_64 ]]; then node_arch=x64; fi
runtime="$installed/Contents/Resources/runtime"
"$runtime/node/node" "$runtime/product/scripts/verify-dsh-runtime.mjs" \
  "$runtime/deepseek-harness" "$runtime/product" --native
"$runtime/node/node" "$runtime/product/scripts/install-univer-runtime-deps.mjs" \
  "$runtime/product/vendor/dsh-univer-office" --verify-only
node "$(dirname "$0")/smoke-macos-intel.mjs" "$installed" "$node_arch" "$node_version" "$electron_version"
verify_app "$installed"
