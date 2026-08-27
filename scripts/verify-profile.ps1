$ErrorActionPreference = "Stop"
$Root = Split-Path -Parent $PSScriptRoot
$Dsh = Join-Path $Root "vendor\deepseek-harness"
$Dump = Join-Path $env:TEMP "agent-pi-dsh-dump.yml"
$HomeDir = Join-Path $Root ".dsh-home"
$env:DSH_HOME = $HomeDir
$env:DSH_CHECKOUT = $Dsh
$env:DSH_BUNDLED_SKILL_DIR = Join-Path $Root "skills"
$env:AGENT_PI_SKIP_UNIVER_INSTALL = "1"
New-Item -ItemType Directory -Force -Path $env:DSH_HOME | Out-Null

& (Join-Path $Root "scripts\init-tender-profile.ps1")

$preset = Join-Path $HomeDir ".agent-presets\router-standard"
foreach ($name in @("agent.cordis.yml", "preset.yml", "router-bootstrap.mjs", "router-core.mjs")) {
  $path = Join-Path $preset $name
  if (-not (Test-Path $path)) { throw "router-standard preset missing $path" }
}
$presetText = Get-Content -Raw (Join-Path $preset "agent.cordis.yml")
$codexTool = [regex]::Match($presetText, '(?ms)- id: tool-subagent-codex.*?(?=\n\s*- id:|\z)').Value
if (-not $codexTool) { throw "router-standard preset missing tool-subagent-codex" }
if ($codexTool -match 'disabled:\s*true') { throw "router-standard Codex tool is still disabled" }

$injector = Join-Path $Root "vendor\dsh-super-injector\lib\index.js"
if (-not (Test-Path $injector)) { throw "vendored injector missing $injector" }

Push-Location $Dsh
pnpm dsh --profile tender --dump-config | Out-File -FilePath $Dump -Encoding utf8
Pop-Location

$text = Get-Content -Raw $Dump
$needles = @(
  "dsh-tender-host",
  "dsh-tender-web",
  "@deepseek-ai/dsh-web-app",
  "@deepseek-ai/dsh-subagent-codex",
  "@dsh-external/dsh-super-injector",
  "permissionMode: approve-for-me",
  "id: dsh-super-injector",
  "id: tool-goal"
)
foreach ($needle in $needles) {
  if ($text -notmatch [regex]::Escape($needle)) {
    throw "dump-config missing $needle (wrote $Dump)"
  }
}
Write-Host "profile dump ok -> $Dump"
Write-Host "router-standard preset ok -> $preset"
