param(
  [Parameter(Mandatory = $true)]
  [string]$Tag,
  [string]$Repo = "xiangxin2021cn/agent-pi-dsh",
  [string]$Installer = "",
  [string]$InstallerChecksum = "",
  [string]$InstallerBuildReceipt = "",
  [string]$Payload = "",
  [string]$CadSource = "",
  [string]$CadCleanOutput = $env:AGENT_PI_CAD_CLEAN_OUTPUT
)

$ErrorActionPreference = "Stop"
$Root = Split-Path -Parent $PSScriptRoot
$Version = $Tag.TrimStart('v')

function Assert-Sha256Pair([string]$Asset, [string]$Checksum, [string]$Label) {
  $line = (Get-Content -LiteralPath $Checksum -Raw).Trim()
  if ($line -notmatch '^([a-fA-F0-9]{64})\s+\*?(.+)$') {
    throw "$Label checksum file is malformed: $Checksum"
  }
  if ((Split-Path -Leaf $Matches[2]) -ne (Split-Path -Leaf $Asset)) {
    throw "$Label checksum names the wrong asset: $($Matches[2])"
  }
  $stream = [System.IO.File]::OpenRead((Resolve-Path -LiteralPath $Asset).Path)
  try {
    $sha256 = [System.Security.Cryptography.SHA256]::Create()
    try {
      $actual = ([System.BitConverter]::ToString($sha256.ComputeHash($stream))).Replace('-', '')
    } finally {
      $sha256.Dispose()
    }
  } finally {
    $stream.Dispose()
  }
  if ($actual -ne $Matches[1]) {
    throw "$Label does not match its SHA256 file: $Asset"
  }
}

if (-not $Installer) {
  $Installer = Join-Path $Root "release\Agent-Pi-DSH-$Version-x64.exe"
}
if (-not (Test-Path $Installer)) {
  throw "Windows installer missing: $Installer"
}
if (-not $InstallerChecksum) {
  $InstallerChecksum = "$Installer.sha256"
}
if (-not (Test-Path $InstallerChecksum)) {
  throw "Windows installer checksum missing: $InstallerChecksum"
}
Assert-Sha256Pair $Installer $InstallerChecksum "Windows installer"

if ($Tag -like "v3.*") {
  if (-not $Payload) {
    $Payload = Join-Path $Root "release\runtime-payload-$Version.tar.gz"
  }
  if (-not (Test-Path $Payload)) {
    throw "Runtime payload missing: $Payload"
  }
  $PayloadChecksum = "$Payload.sha256"
  if (-not (Test-Path $PayloadChecksum)) {
    throw "Runtime payload checksum missing: $PayloadChecksum"
  }
  Assert-Sha256Pair $Payload $PayloadChecksum "Runtime payload"

  $UploadAssets = @($Installer, $InstallerChecksum, $Payload, $PayloadChecksum)
  if ($Tag -eq "v3.6.0") {
    if (-not $CadSource) {
      $CadSource = Join-Path $Root "release\Agent-Pi-DSH-$Version-CAD-corresponding-source.tar.gz"
    }
    $CadSourceChecksum = "$CadSource.sha256"
    if (-not (Test-Path $CadSource)) { throw "CAD corresponding source missing: $CadSource" }
    if (-not (Test-Path $CadSourceChecksum)) { throw "CAD corresponding source checksum missing: $CadSourceChecksum" }
    Assert-Sha256Pair $CadSource $CadSourceChecksum "CAD corresponding source"
    if (-not $CadCleanOutput) { $CadCleanOutput = Join-Path $Root ".codex-temp\cad-clean-output" }
    $CadViewer = Join-Path (Resolve-Path -LiteralPath $CadCleanOutput -ErrorAction Stop).Path "cad-viewer"
    & node (Join-Path $Root "scripts\cad-clean-release.mjs") verify `
      --archive $CadSource `
      --checksum $CadSourceChecksum `
      --runtime-dir $CadViewer
    if ($LASTEXITCODE -ne 0) { throw "clean CAD verification failed: $LASTEXITCODE" }
    if (-not $InstallerBuildReceipt) { $InstallerBuildReceipt = "$Installer.build.json" }
    if (-not (Test-Path $InstallerBuildReceipt)) { throw "Windows build receipt missing: $InstallerBuildReceipt" }
    $InstallerPayload = Join-Path $Root "apps\desktop\dist-nsis\payload.7z"
    $UnpackedRuntime = Join-Path $Root "apps\desktop\dist-unpacked\win-unpacked\resources\runtime"
    $UnpackedCadViewer = Join-Path $UnpackedRuntime "product\bundles\tender-web\lib\cad-viewer"
    $UnpackedDshReceipt = Join-Path $UnpackedRuntime "deepseek-harness\DSH-BUILD-RECEIPT.json"
    & node (Join-Path $Root "scripts\windows-build-receipt.mjs") verify `
      --root $Root `
      --installer $Installer `
      --payload $InstallerPayload `
      --cad-runtime $UnpackedCadViewer `
      --cad-source $CadSource `
      --dsh-receipt $UnpackedDshReceipt `
      --receipt $InstallerBuildReceipt
    if ($LASTEXITCODE -ne 0) { throw "Windows build receipt verification failed: $LASTEXITCODE" }
    $UploadAssets += @($InstallerBuildReceipt, $CadSource, $CadSourceChecksum)
  }

  Write-Host "Uploading verified v3 assets to $Repo $Tag"
  gh release upload $Tag @UploadAssets --repo $Repo
  if ($LASTEXITCODE -ne 0) {
    throw "release upload failed: $LASTEXITCODE"
  }
  Write-Host "Dispatching build-desktop-assets.yml for $Tag"
  gh workflow run build-desktop-assets.yml --repo $Repo --ref $Tag -f "tag=$Tag"
  if ($LASTEXITCODE -ne 0) {
    throw "build-desktop-assets workflow dispatch failed: $LASTEXITCODE"
  }
  Write-Host "Done. Watch: https://github.com/$Repo/actions/workflows/build-desktop-assets.yml"
  return
}

Write-Host "Uploading $Installer and $InstallerChecksum to $Repo $Tag"
gh release upload $Tag $Installer $InstallerChecksum --repo $Repo
if ($LASTEXITCODE -ne 0) {
  throw "release upload failed: $LASTEXITCODE"
}

Write-Host "Dispatching legacy Build Installers for v0/v1/v2 tags"
$tmp = Join-Path $env:TEMP "agent-pi-dispatch.json"
$json = @{
  event_type = "windows-installer-uploaded"
  client_payload = @{ tag = $Tag }
} | ConvertTo-Json -Compress
[System.IO.File]::WriteAllText($tmp, $json)
gh api "repos/$Repo/dispatches" -H "Accept: application/vnd.github+json" --input $tmp
if ($LASTEXITCODE -ne 0) {
  throw "repository_dispatch failed: $LASTEXITCODE"
}

Write-Host "Done. Watch the legacy installer workflow in $Repo Actions"
