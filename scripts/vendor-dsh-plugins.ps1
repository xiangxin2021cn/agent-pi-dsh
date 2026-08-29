param(
  [string]$InjectorVersion = "0.3.1"
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

$routerBase = "https://raw.githubusercontent.com/yjh051108/dsh-router-standard/main"
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

Set-Content -Path (Join-Path $Vendor "dsh-super-injector.pin") -Value "v$InjectorVersion`n$injectorUrl`n"
Write-Host "Vendored injector + router-standard under $Vendor"

$univerVersion = "0.2.9"
$univerUrl = "https://registry.npmjs.org/dsh-univer-office/-/dsh-univer-office-$univerVersion.tgz"
$univerTgz = Join-Path $Tmp "dsh-univer-office.tgz"
$univerDest = Join-Path $Vendor "dsh-univer-office"
Write-Host "Downloading dsh-univer-office $univerVersion ..."
Invoke-WebRequest -Uri $univerUrl -OutFile $univerTgz
if (Test-Path $univerDest) { Remove-Item -Recurse -Force $univerDest }
New-Item -ItemType Directory -Force -Path $univerDest | Out-Null
tar -xf $univerTgz -C $univerDest --strip-components=1
if (-not (Test-Path (Join-Path $univerDest "lib\index.js"))) {
  throw "dsh-univer-office tarball missing lib/index.js"
}
node (Join-Path $Root "scripts\patch-univer-alpha1.mjs") $univerDest
if ($LASTEXITCODE -ne 0) { throw "Univer DSH alpha.1 compatibility patch failed" }
Set-Content -Path (Join-Path $Vendor "dsh-univer-office.pin") -Value "$univerVersion`n$univerUrl`nhttps://github.com/dream-num/dsh-univer-office`nnpm tarball; do not commit the unpacked tree or node_modules`n"
Write-Host "Vendored dsh-univer-office under $Vendor"
