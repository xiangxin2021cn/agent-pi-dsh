$ErrorActionPreference = "Stop"
$Root = Split-Path -Parent $PSScriptRoot
$Dsh = Join-Path $Root "vendor\deepseek-harness"
node (Join-Path $Root "scripts\apply-dsh-patches.mjs") $Dsh --development
if ($LASTEXITCODE -ne 0) { throw "Agent Pi DSH kernel patch failed" }
$Cli = Join-Path $Root "vendor\deepseek-harness\node_modules\tsx\dist\cli.mjs"
$env:DSH_HOME = Join-Path $Root ".dsh-home"
$env:DSH_CHECKOUT = Join-Path $Root "vendor\deepseek-harness"
$env:DSH_BUNDLED_SKILL_DIR = Join-Path $Root "skills"
New-Item -ItemType Directory -Force -Path $env:DSH_HOME | Out-Null
node $Cli (Join-Path $Root "scripts\init-tender-profile.mjs")
