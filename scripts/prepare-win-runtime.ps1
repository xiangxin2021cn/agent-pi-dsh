param(
  [switch]$FullCopy,
  [switch]$Measure,
  [string]$DshBuildReceipt
)

$ErrorActionPreference = "Stop"
$Root = Split-Path -Parent $PSScriptRoot
$Desktop = Join-Path $Root "apps\desktop"
$Runtime = Join-Path $Desktop "runtime"
$Dsh = Join-Path $Root "vendor\deepseek-harness"
$DshReceiptName = "DSH-BUILD-RECEIPT.json"
$DshRuntimeFilePolicy = Get-Content (Join-Path $Root "scripts\dsh-runtime-file-policy.json") -Raw | ConvertFrom-Json
# Windows bundles the platform-specific pnpm closure. It remains outside the
# cross-platform receipt, while portable CI installs its own closure later.
$WindowsDshCopyExcludedDirectoryNames = @(
  $DshRuntimeFilePolicy.excludedDirectoryNames | Where-Object { $_ -ne "node_modules" }
)
if (-not $DshBuildReceipt) {
  $DshBuildReceipt = Join-Path $Root ".codex-temp\dsh-build\$DshReceiptName"
}
$NodeDir = Join-Path $Runtime "node"
$Product = Join-Path $Runtime "product"
$IconSrc = Join-Path $Desktop "brand\app-logo.png"
if (-not (Test-Path $IconSrc)) { $IconSrc = Join-Path $Root "AgentPI-logo-2.png" }
$IconDest = Join-Path $Desktop "build\icon.png"

node (Join-Path $Root "scripts\apply-dsh-patches.mjs") $Dsh
if ($LASTEXITCODE -ne 0) { throw "Agent Pi DSH clean-kernel guard failed" }

New-Item -ItemType Directory -Force -Path $NodeDir, $Product, (Split-Path $IconDest) | Out-Null
$iconIco = Join-Path $Desktop "build\icon.ico"
if (Test-Path $iconIco) {
  Write-Host "Using existing $iconIco"
} else {
  $py = @(
    (Join-Path $env:LOCALAPPDATA "Programs\Python\Python313\python.exe"),
    (Join-Path $env:LOCALAPPDATA "Programs\Python\Python312\python.exe")
  ) | Where-Object { Test-Path $_ } | Select-Object -First 1
  if (-not $py) { throw "Python not found and $iconIco is missing" }
  & $py (Join-Path $Root "scripts\make-brand-icons.py")
}
if (-not (Test-Path $iconIco) -and (Test-Path $IconSrc)) {
  Copy-Item -Force $IconSrc $IconDest
}

$node = (Get-Command node).Source
$nodeSrc = Split-Path $node
$nodeDest = Join-Path $NodeDir "node.exe"
$copied = $false
foreach ($attempt in 1..5) {
  try {
    Copy-Item -Force $node $nodeDest
    $copied = $true
    break
  } catch {
    Start-Sleep -Milliseconds (300 * $attempt)
  }
}
if (-not $copied) { throw "failed to copy node.exe into $nodeDest" }
Get-ChildItem -LiteralPath $nodeSrc -Filter "*.dll" -ErrorAction SilentlyContinue |
  Copy-Item -Force -Destination $NodeDir

foreach ($name in @("corepack", "corepack.cmd", "pnpm", "pnpm.CMD", "pnpm.ps1", "npm", "npm.cmd", "npx", "npx.cmd")) {
  $shim = Join-Path $nodeSrc $name
  if (Test-Path $shim) { Copy-Item -Force $shim $NodeDir }
}
$corepack = Join-Path $nodeSrc "node_modules\corepack"
if (Test-Path $corepack) {
  $corepackDest = Join-Path $NodeDir "node_modules\corepack"
  New-Item -ItemType Directory -Force -Path (Split-Path $corepackDest) | Out-Null
  if (Test-Path $corepackDest) { Remove-Item -Recurse -Force $corepackDest }
  Copy-Item -Recurse -Force $corepack $corepackDest
}

$productItems = @(
  "skills",
  "knowledge",
  "bundles",
  "packages",
  "scripts",
  "package.json",
  "LICENSE",
  "README.md",
  "THIRD_PARTY_NOTICES.md",
  "DSH_PIN",
  ".gitmodules",
  "vendor\dsh-super-injector",
  "vendor\dsh-router-standard",
  "vendor\dshmarket",
  "vendor\anysearch-dsh",
  "vendor\dsh-univer-office",
  "vendor\README.md",
  "vendor\dsh-super-injector.pin",
  "vendor\dsh-router-standard.pin",
  "vendor\anysearch-dsh.pin",
  "vendor\dsh-univer-office.pin"
)
foreach ($item in $productItems) {
  $src = Join-Path $Root $item
  if (-not (Test-Path $src)) { continue }
  $dest = Join-Path $Product $item
  $parent = Split-Path $dest
  New-Item -ItemType Directory -Force -Path $parent | Out-Null
  if (Test-Path $dest) { Remove-Item -Recurse -Force $dest }
  if ((Get-Item $src) -is [System.IO.DirectoryInfo]) {
    # /XJ: node_modules junctions (injector / AnySearch peers) point
    # into this machine's DSH checkout; init-tender-profile rebuilds them on
    # the install machine, and following them here explodes the pnpm chain.
    robocopy $src $dest /E /XJ /NFL /NDL /NJH /NJS /NP | Out-Null
    if ($LASTEXITCODE -ge 8) { throw "robocopy $item failed: $LASTEXITCODE" }
  } else {
    Copy-Item -Force $src $dest
  }
}

function Stage-ProjectNodeModules([string]$projectRelative, [string]$requiredPackage) {
  $sourceModules = Join-Path $Root "$projectRelative\node_modules"
  $sourceMarker = Join-Path $sourceModules "$requiredPackage\package.json"
  if (-not (Test-Path -LiteralPath $sourceMarker)) {
    throw "$projectRelative dependencies are not installed; missing $sourceMarker"
  }

  $sourceItem = Get-Item -LiteralPath $sourceModules
  if ($sourceItem.LinkType) {
    $sourceModules = @($sourceItem.Target)[0]
    Write-Host "Resolved $([System.IO.Path]::GetFileName($projectRelative)) node_modules $($sourceItem.LinkType) -> $sourceModules"
  }

  $stageModules = Join-Path $Product "$projectRelative\node_modules"
  New-Item -ItemType Directory -Force -Path $stageModules | Out-Null
  robocopy $sourceModules $stageModules /E /XJ /NFL /NDL /NJH /NJS /NP | Out-Null
  if ($LASTEXITCODE -ge 8) { throw "staging $projectRelative node_modules failed: $LASTEXITCODE" }
  if (-not (Test-Path -LiteralPath (Join-Path $stageModules "$requiredPackage\package.json"))) {
    throw "staged $projectRelative is missing $requiredPackage"
  }
}

# The broad product copy intentionally excludes Junctions. These two projects
# own runtime imports, so copy their already lock-installed dependency trees
# explicitly and verify the first package Node must resolve during cold start.
Stage-ProjectNodeModules "packages\business-core" "zod"
Stage-ProjectNodeModules "bundles\tender-host" "pdf-lib"

# Keep first launch offline and deterministic. The source-vendored Univer
# plugin intentionally excludes node_modules, so stage its production closure
# into the packaged product while build-time npm access is available.
$univerStage = Join-Path $Product "vendor\dsh-univer-office"
if (Test-Path (Join-Path $univerStage "package.json")) {
  & $node (Join-Path $Root "scripts\install-univer-runtime-deps.mjs") $univerStage
  if ($LASTEXITCODE -ne 0) { throw "failed to stage Univer production dependencies" }
}

$dshLink = Get-Item -LiteralPath $Dsh
if ($dshLink.LinkType) {
  $Dsh = @($dshLink.Target)[0]
  Write-Host "Resolved vendor/deepseek-harness $($dshLink.LinkType) -> $Dsh"
}
node (Join-Path $Root "scripts\dsh-build-receipt.mjs") verify `
  --dsh $Dsh --product $Root --receipt $DshBuildReceipt --source
if ($LASTEXITCODE -ne 0) { throw "DSH source build receipt verification failed" }

$dshTarget = Join-Path $Runtime "deepseek-harness"
if (Test-Path $dshTarget) {
  $existing = Get-Item -LiteralPath $dshTarget
  if ($existing.LinkType) {
    $existing.Delete()
  } else {
    cmd /c "rmdir /s /q `"$dshTarget`"" | Out-Null
  }
}
if ($FullCopy) {
  Write-Host "Copying DeepSeek Harness closure from $Dsh (preserving internal symlinks)..."
  # Keep pnpm's relative symlinks. Following them explodes node_modules into a
  # multi-hour full-tree duplicate and breaks workspace links.
  $roboArgs = @(
    $Dsh, $dshTarget, "/E", "/SL", "/SJ", "/MT:16", "/R:1", "/W:1",
    "/XD"
  )
  $roboArgs += $WindowsDshCopyExcludedDirectoryNames
  $roboArgs += "/XF"
  $roboArgs += @($DshRuntimeFilePolicy.excludedFileNames)
  $roboArgs += @($DshRuntimeFilePolicy.excludedFileGlobs)
  $roboArgs += @("/NFL", "/NDL", "/NJH", "/NJS", "/nc", "/ns", "/np")
  robocopy @roboArgs | Out-Null
  if ($LASTEXITCODE -ge 8) {
    Write-Host "robocopy first pass exited $LASTEXITCODE, retrying once..."
    robocopy @roboArgs | Out-Null
  }
  if ($LASTEXITCODE -ge 8) { throw "robocopy failed: $LASTEXITCODE" }
  $copied = Get-Item -LiteralPath $dshTarget
  if ($copied.LinkType) {
    throw "FullCopy produced a $($copied.LinkType) at $dshTarget; installer would not be portable"
  }
  foreach ($need in @("package.json", "apps\web\dist\index.html", "apps\cli\lib\bin.js")) {
    if (-not (Test-Path (Join-Path $dshTarget $need))) {
      throw "FullCopy missing $need"
    }
  }
  Write-Host "Writing dsh symlink manifest and repairing junctions..."
  node (Join-Path $Root "scripts\repair-dsh-links.mjs") write $Dsh $dshTarget
  if ($LASTEXITCODE -ne 0) { throw "write dsh link manifest failed" }
  node (Join-Path $Root "scripts\repair-dsh-links.mjs") repair $dshTarget
  if ($LASTEXITCODE -ne 0) { throw "repair dsh links failed" }
  Copy-Item -LiteralPath $DshBuildReceipt -Destination (Join-Path $dshTarget $DshReceiptName) -Force
} else {
  cmd /c "mklink /J `"$dshTarget`" `"$Dsh`"" | Out-Null
}

if ($Measure) {
  & (Join-Path $Root "scripts\measure-dsh-size.ps1")
}
node (Join-Path $Root "scripts\apply-runtime-overlays.mjs") $dshTarget $Product
if ($LASTEXITCODE -ne 0) { throw "apply desktop runtime overlays failed" }
$stagedDshReceipt = if ($FullCopy) { Join-Path $dshTarget $DshReceiptName } else { $DshBuildReceipt }
node (Join-Path $Root "scripts\dsh-build-receipt.mjs") verify `
  --dsh $dshTarget --product $Product --receipt $stagedDshReceipt
if ($LASTEXITCODE -ne 0) { throw "staged DSH build receipt verification failed" }
node (Join-Path $Root "scripts\verify-dsh-runtime.mjs") $dshTarget $Product
if ($LASTEXITCODE -ne 0) { throw "staged DSH rc.1 runtime verification failed" }

Write-Host "Runtime staged at $Runtime"
Write-Host "pack:win uses extraResources/runtime. Full installer: prepare-win-runtime.ps1 -FullCopy"
