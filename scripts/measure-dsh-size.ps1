$ErrorActionPreference = "Stop"
$Root = Split-Path -Parent $PSScriptRoot
$Dsh = Join-Path $Root "vendor\deepseek-harness"
$nm = Join-Path $Dsh "node_modules"

function DirSizeMB([string]$Path) {
  if (-not (Test-Path $Path)) { return 0 }
  $bytes = (Get-ChildItem -LiteralPath $Path -Recurse -Force -ErrorAction SilentlyContinue |
    Measure-Object -Property Length -Sum).Sum
  if (-not $bytes) { return 0 }
  [math]::Round($bytes / 1MB, 1)
}

Write-Host ("dsh checkout: {0} MB" -f (DirSizeMB $Dsh))
Write-Host ("dsh node_modules: {0} MB" -f (DirSizeMB $nm))
Write-Host ("skills: {0} MB" -f (DirSizeMB (Join-Path $Root "skills")))
Write-Host ("knowledge: {0} MB" -f (DirSizeMB (Join-Path $Root "knowledge")))
Write-Host ("business-core: {0} MB" -f (DirSizeMB (Join-Path $Root "packages\business-core")))
Write-Host ("bundles: {0} MB" -f (DirSizeMB (Join-Path $Root "bundles")))
Write-Host ("injector: {0} MB" -f (DirSizeMB (Join-Path $Root "vendor\dsh-super-injector")))
Write-Host ("router-standard: {0} MB" -f (DirSizeMB (Join-Path $Root "vendor\dsh-router-standard")))
Write-Host "Pin: $(Get-Content (Join-Path $Root 'DSH_PIN'))"
Write-Host "Measure before packing. Full dsh node_modules is the dominant closure."
