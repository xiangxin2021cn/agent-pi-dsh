param(
  [string]$InjectorVersion = "0.3.1",
  [string]$RouterCommit = "b39112dce54b90e67b50b166c2773861d7945d1f"
)

$ErrorActionPreference = "Stop"
$Root = Split-Path -Parent $PSScriptRoot
$Vendor = Join-Path $Root "vendor"
$Tmp = Join-Path $env:TEMP "agent-pi-dsh-vendor"
New-Item -ItemType Directory -Force -Path $Vendor, $Tmp | Out-Null

$injectorUrl = "https://github.com/yjh051108/dsh-super-injector/releases/download/v$InjectorVersion/dsh-external-dsh-super-injector-$InjectorVersion.tgz"
$injectorTgz = Join-Path $Tmp "dsh-super-injector.tgz"
$injectorDest = Join-Path $Vendor "dsh-super-injector"

Write-Host "Downloading injector $InjectorVersion ..."
Invoke-WebRequest -Uri $injectorUrl -OutFile $injectorTgz
if (Test-Path $injectorDest) { Remove-Item -Recurse -Force $injectorDest }
New-Item -ItemType Directory -Force -Path $injectorDest | Out-Null
tar -xf $injectorTgz -C $injectorDest --strip-components=1
if (-not (Test-Path (Join-Path $injectorDest "lib\index.js"))) {
  throw "injector tarball missing lib/index.js"
}

$routerBase = "https://raw.githubusercontent.com/yjh051108/dsh-router-standard/$RouterCommit"
$routerDest = Join-Path $Vendor "dsh-router-standard"
$presetDest = Join-Path $routerDest "preset"
New-Item -ItemType Directory -Force -Path $presetDest | Out-Null

$routerFiles = @{
  "LICENSE" = (Join-Path $routerDest "LICENSE")
  "NOTICE" = (Join-Path $routerDest "NOTICE")
  "package.json" = (Join-Path $routerDest "package.json")
  "README.md" = (Join-Path $routerDest "README.md")
  "preset/agent.cordis.yml" = (Join-Path $presetDest "agent.cordis.yml")
  "preset/preset.yml" = (Join-Path $presetDest "preset.yml")
  "preset/router-bootstrap.mjs" = (Join-Path $presetDest "router-bootstrap.mjs")
  "preset/router-core.mjs" = (Join-Path $presetDest "router-core.mjs")
}
foreach ($rel in $routerFiles.Keys) {
  Write-Host "Fetching router $rel ..."
  Invoke-WebRequest -Uri "$routerBase/$rel" -OutFile $routerFiles[$rel]
}
if (-not (Test-Path (Join-Path $presetDest "agent.cordis.yml"))) {
  throw "router-standard preset missing agent.cordis.yml"
}
node (Join-Path $Root "scripts\patch-router-standard-rc1.mjs") $routerDest
if ($LASTEXITCODE -ne 0) { throw "Router Standard DSH rc.1 compatibility patch failed" }
node --test (Join-Path $Root "scripts\router-standard-rc1.test.mjs")
if ($LASTEXITCODE -ne 0) { throw "Router Standard DSH rc.1 compatibility tests failed" }

Set-Content -Path (Join-Path $Vendor "dsh-super-injector.pin") -Value "v$InjectorVersion`n$injectorUrl`n"
Set-Content -Path (Join-Path $Vendor "dsh-router-standard.pin") -Value "$RouterCommit`nhttps://github.com/yjh051108/dsh-router-standard/commit/$RouterCommit`nAgent Pi DSH rc.1 compatibility patch applied after vendoring`n"
Write-Host "Vendored injector + router-standard under $Vendor"

node (Join-Path $Root "scripts\materialize-dsh-univer-office.mjs")
if ($LASTEXITCODE -ne 0) { throw "Pinned dsh-univer-office materialization failed" }
