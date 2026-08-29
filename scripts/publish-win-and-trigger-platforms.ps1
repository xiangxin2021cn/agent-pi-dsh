param(
  [string]$Tag = "v3.1.0",
  [string]$Repo = "xiangxin2021cn/agent-pi-dsh",
  [string]$Installer = ""
)

$ErrorActionPreference = "Stop"
$Root = Split-Path -Parent $PSScriptRoot
if (-not $Installer) {
  $Version = $Tag.TrimStart('v')
  $Installer = Join-Path $Root "release\Agent-Pi-DSH-$Version-x64.exe"
}
if (-not (Test-Path $Installer)) {
  throw "Windows installer missing: $Installer"
}

Write-Host "Uploading $Installer to $Repo $Tag"
gh release upload $Tag $Installer --repo $Repo --clobber

if ($Tag -like "v3.*") {
  Write-Host "Dispatching build-desktop-assets.yml for $Tag"
  gh workflow run build-desktop-assets.yml --repo $Repo -f "tag=$Tag"
  if ($LASTEXITCODE -ne 0) {
    throw "build-desktop-assets workflow dispatch failed: $LASTEXITCODE"
  }
  Write-Host "Done. Watch: https://github.com/$Repo/actions/workflows/build-desktop-assets.yml"
  return
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
