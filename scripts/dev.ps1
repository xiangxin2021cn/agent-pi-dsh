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
node (Join-Path $Root "scripts\apply-dsh-patches.mjs") $Dsh
if ($LASTEXITCODE -ne 0) { throw "Agent Pi DSH kernel patch failed" }

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

Set-Location $Dsh
if (-not (Test-Path (Join-Path $Dsh "node_modules"))) {
  Write-Host "Installing DeepSeek Harness dependencies (first run)..."
  corepack enable
  pnpm install
}

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
