param(
  [string]$Tag = "v3.1.0",
  [string]$Repo = "xiangxin2021cn/agent-pi-dsh",
  [string]$Installer = "",
  [string]$Payload = ""
)

$ErrorActionPreference = "Stop"
$Root = Split-Path -Parent $PSScriptRoot
$Version = $Tag.TrimStart('v')
if (-not $Installer) {
  $Installer = Join-Path $Root "release\Agent-Pi-DSH-$Version-x64.exe"
}
if (-not (Test-Path $Installer)) {
  throw "Windows installer missing: $Installer"
}

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

  Write-Host "Uploading $Installer, $Payload, and $PayloadChecksum to $Repo $Tag"
  gh release upload $Tag $Installer $Payload $PayloadChecksum --repo $Repo --clobber
  if ($LASTEXITCODE -ne 0) {
    throw "release upload failed: $LASTEXITCODE"
  }
  Write-Host "Dispatching build-desktop-assets.yml for $Tag"
  gh workflow run build-desktop-assets.yml --repo $Repo -f "tag=$Tag"
  if ($LASTEXITCODE -ne 0) {
    throw "build-desktop-assets workflow dispatch failed: $LASTEXITCODE"
  }
  Write-Host "Done. Watch: https://github.com/$Repo/actions/workflows/build-desktop-assets.yml"
  return
}

Write-Host "Uploading $Installer to $Repo $Tag"
gh release upload $Tag $Installer --repo $Repo --clobber
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
