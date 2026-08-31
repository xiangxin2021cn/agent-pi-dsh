$ErrorActionPreference = "Stop"
$Root = Split-Path -Parent $PSScriptRoot
$Dsh = Join-Path $Root "vendor\deepseek-harness"
node (Join-Path $Root "scripts\apply-dsh-patches.mjs") $Dsh
if ($LASTEXITCODE -ne 0) { throw "Agent Pi DSH clean-kernel guard failed" }
node (Join-Path $Root "scripts\build-tender-client.mjs")
if ($LASTEXITCODE -ne 0) { throw "tender-web client build failed" }
$Cli = Join-Path $Root "vendor\deepseek-harness\node_modules\tsx\dist\cli.mjs"
if (-not (Test-Path $Cli)) {
  throw "tsx not found under vendor/deepseek-harness. Run scripts/dev.ps1 once so dsh node_modules exists."
}
$env:DSH_CHECKOUT = Join-Path $Root "vendor\deepseek-harness"
Set-Location $Root
node $Cli (Join-Path $Root "scripts\smoke.mts")
