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

Write-Host "Dispatching Build Installers (Classic linux/mac only run for v0/v1/v2 tags)"
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

Write-Host "Done. Watch: https://github.com/$Repo/actions/workflows/build-installers.yml"
if ($Tag -like "v3.*") {
  Write-Host "Note: $Tag is 3.x. CI will not attach Classic 2.x dmg/AppImage to this release."
}
