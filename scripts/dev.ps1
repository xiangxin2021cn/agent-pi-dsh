param(
  [switch]$SkipInstall,
  [switch]$DumpOnly,
  [int]$Port = 0
)

$ErrorActionPreference = "Stop"
$Root = Split-Path -Parent $PSScriptRoot
$Dsh = Join-Path $Root "vendor\deepseek-harness"
if (-not (Test-Path (Join-Path $Dsh "package.json"))) {
  throw "vendor/deepseek-harness missing. Junction or clone DeepSeek Harness and pin DSH_PIN."
}
node (Join-Path $Root "scripts\apply-dsh-patches.mjs") $Dsh --development
if ($LASTEXITCODE -ne 0) { throw "Agent Pi DSH clean-kernel guard failed" }

$env:DSH_HOME = Join-Path $Root ".dsh-home"
$env:DSH_CHECKOUT = $Dsh
$env:DSH_BUNDLED_SKILL_DIR = Join-Path $Root "skills"
New-Item -ItemType Directory -Force -Path $env:DSH_HOME | Out-Null

$biz = Join-Path $Root "packages\business-core"
if (-not (Test-Path (Join-Path $biz "node_modules\zod"))) {
  Write-Host "Installing business-core dependencies..."
  Push-Location $biz
  npm install --no-fund --no-audit
  Pop-Location
}

$tenderHost = Join-Path $Root "bundles\tender-host"
if (-not (Test-Path (Join-Path $tenderHost "node_modules\pdf-lib"))) {
  Write-Host "Installing tender-host locked dependencies..."
  Push-Location $tenderHost
  npm ci --no-fund --no-audit
  $tenderInstallExit = $LASTEXITCODE
  Pop-Location
  if ($tenderInstallExit -ne 0) { throw "tender-host npm ci failed: $tenderInstallExit" }
}

Set-Location $Dsh
if (-not (Test-Path (Join-Path $Dsh "node_modules"))) {
  Write-Host "Installing DeepSeek Harness dependencies (first run)..."
  corepack enable
  pnpm install
}

Set-Location $Root
Write-Host "Building tender-web client from source modules..."
node (Join-Path $Root "scripts\build-tender-client.mjs")
if ($LASTEXITCODE -ne 0) { throw "tender-web client build failed" }
Set-Location $Dsh

if (-not $SkipInstall) {
  Write-Host "Initializing tender profile (base + web-app + injector + Agent Pi bundles)..."
  & (Join-Path $Root "scripts\init-tender-profile.ps1")
}

Write-Host "DSH_HOME=$env:DSH_HOME"
if ($DumpOnly) {
  pnpm dsh --profile tender --dump-config
  exit $LASTEXITCODE
}

Write-Host "Starting dsh --profile tender ..."
if ($Port -gt 0) {
  pnpm dsh --profile tender --port $Port
} else {
  pnpm dsh --profile tender
}
