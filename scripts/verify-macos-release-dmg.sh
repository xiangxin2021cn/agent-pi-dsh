#!/usr/bin/env bash
set -euo pipefail

dmg="$1"
version="$2"
arch="$3"
audit_dir=$(mktemp -d "${RUNNER_TEMP:?}/agent-pi-dmg.XXXXXX")
mount_dir="$audit_dir/volume"
mkdir "$mount_dir"

sw_vers
test "$(uname -m)" = "$arch"
xcrun stapler validate "$dmg"
spctl --assess --type open --context context:primary-signature --verbose=2 "$dmg"
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
codesign --verify --deep --strict --verbose=2 "$app"
codesign --verify --strict --verbose=2 \
  -R='anchor apple generic and certificate leaf[field.1.2.840.113635.100.6.1.13] exists' "$app"
xcrun stapler validate "$app"
syspolicy_check distribution "$app"
hdiutil detach "$device"
trap - EXIT
