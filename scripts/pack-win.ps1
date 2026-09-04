param(
  [switch]$SkipPrepare,
  [switch]$DirOnly,
  [switch]$ReuseUnpacked,
  [switch]$ToolchainOnly,
  [string]$CadCleanOutput = $env:AGENT_PI_CAD_CLEAN_OUTPUT
)

$ErrorActionPreference = "Stop"
$Root = Split-Path -Parent $PSScriptRoot
$Desktop = Join-Path $Root "apps\desktop"
$AppVersion = (Get-Content (Join-Path $Desktop "package.json") -Raw | ConvertFrom-Json).version
if ($AppVersion -eq "3.6.0" -and ($SkipPrepare -or $ReuseUnpacked)) {
  throw "Agent Pi DSH 3.6.0 packaging forbids -SkipPrepare and -ReuseUnpacked"
}
$InstallerName = "Agent-Pi-DSH-$AppVersion-x64.exe"
$Dsh = Join-Path $Root "vendor\deepseek-harness"
$WebDist = Join-Path $Dsh "apps\web\dist\index.html"
$Biz = Join-Path $Root "packages\business-core"
$TenderHost = Join-Path $Root "bundles\tender-host"
$NsisScript = Join-Path $Root "scripts\nsis\setup.nsi"
$IconSrc = Join-Path $Desktop "brand\app-logo.png"
if (-not (Test-Path $IconSrc)) { $IconSrc = Join-Path $Root "AgentPI-logo-2.png" }
$IconDir = Join-Path $Desktop "build"
$IconDest = Join-Path $IconDir "icon.png"
$InstallerIcon = Join-Path $IconDir "icon.ico"
$InstallerHeader = Join-Path $IconDir "installer-header.bmp"
$DshReceiptName = "DSH-BUILD-RECEIPT.json"
$DshBuildReceipt = Join-Path $Root ".codex-temp\dsh-build\$DshReceiptName"

function Get-NodeNpmCli {
  $node = (Get-Command node -CommandType Application -ErrorAction Stop | Select-Object -First 1).Source
  $candidates = @(
    (Join-Path (Split-Path -Parent $node) "node_modules\npm\bin\npm-cli.js"),
    (Join-Path $env:ProgramFiles "nodejs\node_modules\npm\bin\npm-cli.js")
  ) | Where-Object { $_ -and (Test-Path $_) } | Select-Object -Unique
  $npmCli = $candidates | Select-Object -First 1
  if (-not $npmCli) {
    throw "npm-cli.js missing for resolved node executable: $node"
  }
  return @{ Node = $node; NpmCli = $npmCli }
}

function Invoke-NpmCommand([string]$dir, [string]$label, [string[]]$npmArgs) {
  $tool = Get-NodeNpmCli
  $npmExit = 1
  Push-Location $dir
  try {
    & $tool.Node $tool.NpmCli @npmArgs
    $npmExit = $LASTEXITCODE
  } finally {
    Pop-Location
  }
  if ($npmExit -ne 0) { throw "$label npm $($npmArgs -join ' ') failed: $npmExit" }
}

function Invoke-NpmInstall([string]$dir, [string]$label) {
  Invoke-NpmCommand $dir $label @("install", "--no-fund", "--no-audit")
}

function Invoke-NpmCi([string]$dir, [string]$label) {
  Invoke-NpmCommand $dir $label @("ci", "--no-fund", "--no-audit")
}

function Invoke-DesktopToolchain {
  if (-not (Test-Path (Join-Path $Desktop "node_modules\electron-builder"))) {
    Write-Host "Installing desktop pack dependencies..."
    Invoke-NpmInstall $Desktop "desktop"
  }

  $electronVer = Join-Path $Desktop "node_modules\electron\dist\version"
  if (-not (Test-Path $electronVer)) {
    $installElectron = Join-Path $Desktop "node_modules\.bin\install-electron.cmd"
    if (-not (Test-Path $installElectron)) { throw "local install-electron.cmd missing: $installElectron" }
    Write-Host "electron binary missing; running local install-electron.cmd --no"
    $electronExit = 1
    Push-Location $Desktop
    try {
      & $installElectron --no
      $electronExit = $LASTEXITCODE
    } finally {
      Pop-Location
    }
    if ($electronExit -ne 0) { throw "local install-electron.cmd --no failed: $electronExit" }
  } else {
    Write-Host "electron binary $((Get-Content $electronVer -Raw).Trim())"
  }
}

function Invoke-DesktopElectronBuilder {
  $electronBuilder = Join-Path $Desktop "node_modules\.bin\electron-builder.cmd"
  if (-not (Test-Path $electronBuilder)) { throw "local electron-builder.cmd missing: $electronBuilder" }
  $builderExit = 1
  Push-Location $Desktop
  try {
    & $electronBuilder --win --dir | Out-Host
    $builderExit = $LASTEXITCODE
  } finally {
    Pop-Location
  }
  return $builderExit
}

function Find-7zaDir {
  $cached = Get-ChildItem "$env:LOCALAPPDATA\electron-builder\Cache" -Recurse -Filter "7za.exe" -ErrorAction SilentlyContinue |
    Where-Object { $_.DirectoryName -notmatch 'dist-nsis' } |
    Select-Object -First 1
  if ($cached) { return $cached.DirectoryName }
  throw "7za.exe not found. Install electron-builder once so it caches 7-Zip."
}

function Install-7zaSnlWrapper {
  $dir = Find-7zaDir
  $sevenZip = Join-Path $dir "7za.exe"
  $orig = Join-Path $dir "7za-orig.exe"
  $wrapCs = Join-Path $Root "scripts\7za-snl-wrapper.cs"
  $wrapExe = Join-Path $dir "7za-wrap.exe"
  $csc = Join-Path $env:WINDIR "Microsoft.NET\Framework64\v4.0.30319\csc.exe"
  if (-not (Test-Path $orig)) {
    Copy-Item -Force $sevenZip $orig
  }
  if (Test-Path $csc) {
    & $csc /nologo /out:$wrapExe $wrapCs
    if ($LASTEXITCODE -eq 0) {
      Copy-Item -Force $wrapExe $sevenZip
      Write-Host "Installed 7za -snl wrapper so electron-builder does not follow junctions"
    }
  }
  return $orig
}

function Find-PayloadSevenZip {
  # Prefer the proven copy shipped with earlier installers: Defender tends to
  # block freshly (re)named executables inside the electron-builder cache.
  $candidates = @(Join-Path $Desktop "dist-nsis\7za.exe")
  $dir = $null
  try { $dir = Find-7zaDir } catch {}
  if ($dir) {
    $candidates += (Join-Path $dir "7za-orig.exe")
    $candidates += (Join-Path $dir "7za.exe")
  }
  foreach ($p in $candidates) {
    # >100KB filters out the tiny -snl wrapper that replaces the cached 7za.
    if ((Test-Path $p) -and (Get-Item $p).Length -gt 100KB) { return $p }
  }
  throw "no usable 7za.exe found; install 7-Zip or restore electron-builder cache"
}

function Find-Makensis {
  foreach ($path in @(
    "${env:ProgramFiles(x86)}\NSIS\makensis.exe",
    "$env:ProgramFiles\NSIS\makensis.exe"
  )) {
    if (Test-Path $path) { return $path }
  }
  throw "makensis.exe not found. Install NSIS (https://nsis.sourceforge.io/)."
}

function Test-CadViewerAssets([string]$dir) {
  if (-not (Test-Path (Join-Path $dir "index.html"))) { return $false }
  $files = @(Get-ChildItem -LiteralPath $dir -Recurse -File -ErrorAction SilentlyContinue)
  $names = @($files | ForEach-Object { $_.Name })
  $mainJs = @($files | Where-Object {
    $_.Extension -eq ".js" -and $_.Name -notin @("libredwg-parser-worker.js", "mtext-renderer-worker.js")
  })
  $fallbackFont = Join-Path $dir "resources\fonts\SourceHanSansCN-Regular.otf"
  return (
    $mainJs.Count -gt 0 -and
    @($files | Where-Object { $_.Extension -eq ".css" }).Count -gt 0 -and
    $names -contains "libredwg-parser-worker.js" -and
    $names -contains "libredwg-web.wasm" -and
    $names -contains "mtext-renderer-worker.js" -and
    (Test-Path (Join-Path $dir "CAD-CLEAN-BUILD.json")) -and
    (Test-Path (Join-Path $dir "LICENSE-BOUNDARY.md")) -and
    (Test-Path (Join-Path $dir "THIRD_PARTY_NOTICES.md")) -and
    (Test-Path (Join-Path $dir "licenses\mlightcad-cad-simple-viewer-LICENSE")) -and
    (Test-Path (Join-Path $dir "licenses\mlightcad-libredwg-converter-LICENSE")) -and
    (Test-Path (Join-Path $dir "licenses\GPL-3.0.txt")) -and
    (Select-String -LiteralPath (Join-Path $dir "licenses\GPL-3.0.txt") -SimpleMatch "GNU GENERAL PUBLIC LICENSE" -Quiet) -and
    (Test-Path (Join-Path $dir "resources\fonts\fonts.json")) -and
    (Test-Path $fallbackFont) -and
    ((Get-FileHash -LiteralPath $fallbackFont -Algorithm SHA256).Hash -eq "E2BC8A2E7F37474B774FFF8DB758681ECE40BB6947A90D571BCE9DD60671A8E4") -and
    (Test-Path (Join-Path $dir "resources\fonts\OFL-1.1.txt")) -and
    (Test-Path (Join-Path $dir "licenses\SourceHanSansCN-OFL-1.1.txt"))
  )
}

function Assert-CadViewerAssets([string]$dir, [string]$label) {
  if (-not (Test-CadViewerAssets $dir)) {
    throw "$label CAD viewer assets incomplete: $dir"
  }
}

function Assert-CadCleanRelease([string]$dir, [string]$label) {
  & node (Join-Path $Root "scripts\cad-clean-release.mjs") verify `
    --archive $CadSourceArchive `
    --checksum $CadSourceChecksum `
    --runtime-dir $dir
  if ($LASTEXITCODE -ne 0) { throw "$label clean CAD verification failed: $LASTEXITCODE" }
  Assert-CadViewerAssets $dir $label
}

function Install-CadCleanRuntime([string]$destination, [string]$label) {
  $rootFull = [System.IO.Path]::GetFullPath($Root).TrimEnd('\') + '\'
  $destinationFull = [System.IO.Path]::GetFullPath($destination)
  if (-not $destinationFull.StartsWith($rootFull, [System.StringComparison]::OrdinalIgnoreCase)) {
    throw "refusing to replace CAD runtime outside repository: $destinationFull"
  }
  if (Test-Path -LiteralPath $destinationFull) {
    Remove-Item -LiteralPath $destinationFull -Recurse -Force
  }
  New-Item -ItemType Directory -Force -Path (Split-Path -Parent $destinationFull) | Out-Null
  Copy-Item -LiteralPath $CadViewer -Destination $destinationFull -Recurse
  Assert-CadCleanRelease $destinationFull $label
}

function Test-UnpackedApp([string]$dir) {
  $need = @(
    (Join-Path $dir "agent-pi-DSH.exe"),
    (Join-Path $dir "resources\runtime\node\node.exe"),
    (Join-Path $dir "resources\runtime\deepseek-harness\package.json"),
    (Join-Path $dir "resources\runtime\deepseek-harness\$DshReceiptName"),
    (Join-Path $dir "resources\runtime\deepseek-harness\apps\web\dist\index.html"),
    (Join-Path $dir "resources\runtime\product\scripts\repair-dsh-links.mjs"),
    (Join-Path $dir "resources\runtime\product\LICENSE"),
    (Join-Path $dir "resources\runtime\product\bundles\agent-pi-compaction\lib\index.js"),
    (Join-Path $dir "resources\runtime\product\bundles\tender-host\node_modules\pdf-lib\package.json"),
    (Join-Path $dir "resources\runtime\product\packages\business-core\node_modules\zod\package.json")
    (Join-Path $dir "resources\runtime\product\vendor\dsh-univer-office\LICENSE")
    (Join-Path $dir "resources\runtime\product\vendor\dsh-univer-office\AGENT-PI-VENDOR-RECEIPT.json")
    (Join-Path $dir "resources\runtime\product\vendor\dsh-univer-office\node_modules\@univerjs-pro\cli-assets\package.json")
  )
  $cadViewer = Join-Path $dir "resources\runtime\product\bundles\tender-web\lib\cad-viewer"
  return (
    ($need | Where-Object { -not (Test-Path $_) }).Count -eq 0 -and
    (Test-CadViewerAssets $cadViewer)
  )
}

if ($ToolchainOnly) {
  Invoke-DesktopToolchain
  $toolchainBuilderExit = Invoke-DesktopElectronBuilder
  if ($toolchainBuilderExit -ne 0) { throw "local electron-builder.cmd failed: $toolchainBuilderExit" }
  return
}

& node (Join-Path $Root "scripts\materialize-dsh-univer-office.mjs")
if ($LASTEXITCODE -ne 0) { throw "failed to materialize pinned dsh-univer-office" }

if (-not $CadCleanOutput) { $CadCleanOutput = Join-Path $Root ".codex-temp\cad-clean-output" }
$CadCleanOutput = (Resolve-Path -LiteralPath $CadCleanOutput -ErrorAction Stop).Path
$CadViewer = Join-Path $CadCleanOutput "cad-viewer"
$CadSourceName = "Agent-Pi-DSH-$AppVersion-CAD-corresponding-source.tar.gz"
$CadSourceArchive = Join-Path $CadCleanOutput $CadSourceName
$CadSourceChecksum = "$CadSourceArchive.sha256"
Assert-CadCleanRelease $CadViewer "clean build input"
$ReleaseDir = Join-Path $Root "release"
New-Item -ItemType Directory -Force -Path $ReleaseDir | Out-Null
foreach ($sourcePath in @($CadSourceArchive, $CadSourceChecksum)) {
  $target = Join-Path $ReleaseDir (Split-Path -Leaf $sourcePath)
  if ([System.IO.Path]::GetFullPath($sourcePath) -ne [System.IO.Path]::GetFullPath($target)) {
    Copy-Item -LiteralPath $sourcePath -Destination $target -Force
  }
}

& node (Join-Path $Root "scripts\kernel-version-policy.mjs") --history
if ($LASTEXITCODE -ne 0) { throw "kernel version policy failed: $LASTEXITCODE" }
& node (Join-Path $Root "scripts\apply-dsh-patches.mjs") $Dsh
if ($LASTEXITCODE -ne 0) { throw "Agent Pi DSH clean-kernel guard failed" }
& node (Join-Path $Root "scripts\dsh-build-receipt.mjs") build `
  --dsh $Dsh --product $Root --receipt $DshBuildReceipt
if ($LASTEXITCODE -ne 0) { throw "official DSH build and receipt generation failed: $LASTEXITCODE" }
& node (Join-Path $Root "scripts\dsh-build-receipt.mjs") verify `
  --dsh $Dsh --product $Root --receipt $DshBuildReceipt --source
if ($LASTEXITCODE -ne 0) { throw "DSH source build receipt verification failed: $LASTEXITCODE" }

if (-not (Test-Path (Join-Path $Dsh "package.json"))) {
  throw "vendor/deepseek-harness missing"
}
if (-not (Test-Path $WebDist)) {
  throw "dsh web dist missing. In vendor/deepseek-harness run: pnpm run build:web"
}
if (-not (Test-Path (Join-Path $Root "vendor\dsh-super-injector\lib\index.js"))) {
  throw "vendor/dsh-super-injector incomplete. Run scripts/vendor-dsh-plugins.ps1"
}
if (-not (Test-Path (Join-Path $Root "vendor\dsh-router-standard\preset\agent.cordis.yml"))) {
  throw "vendor/dsh-router-standard incomplete. Run scripts/vendor-dsh-plugins.ps1"
}
if (-not (Test-Path (Join-Path $Root "bundles\agent-pi-compaction\lib\index.js"))) {
  throw "bundles/agent-pi-compaction incomplete"
}
if (-not (Test-Path (Join-Path $Root "vendor\anysearch-dsh\lib\index.js"))) {
  throw "vendor/anysearch-dsh incomplete. Copy anysearch-dsh 0.1.1 with built lib/"
}
if (-not (Test-Path (Join-Path $Root "vendor\dsh-univer-office\lib\index.js"))) {
  throw "vendor/dsh-univer-office materialization is incomplete"
}

function Find-BrandPython {
  $resolved = Get-Command python -CommandType Application -ErrorAction SilentlyContinue | Select-Object -First 1
  $candidates = @(
    (Join-Path $env:LOCALAPPDATA "Programs\Python\Python313\python.exe"),
    (Join-Path $env:LOCALAPPDATA "Programs\Python\Python312\python.exe"),
    (Join-Path $env:ProgramFiles "Python313\python.exe"),
    (Join-Path $env:ProgramFiles "Python312\python.exe"),
    (Join-Path $env:ProgramFiles "Python310\python.exe"),
    $(if ($resolved) { $resolved.Source })
  ) | Where-Object { $_ -and (Test-Path $_) } | Select-Object -Unique
  $python = $candidates | Select-Object -First 1
  if (-not $python) { throw "Python with Pillow is required to build the installer brand assets" }
  return $python
}
if (-not (Test-Path $NsisScript)) {
  throw "NSIS script missing: $NsisScript"
}

if (-not (Test-Path (Join-Path $Biz "node_modules\zod"))) {
  Write-Host "Installing business-core dependencies..."
  Invoke-NpmInstall $Biz "business-core"
}
if (-not (Test-Path (Join-Path $TenderHost "node_modules\pdf-lib"))) {
  Write-Host "Installing tender-host locked dependencies..."
  Invoke-NpmCi $TenderHost "tender-host"
}

Write-Host "Using verified clean MLightCAD viewer from $CadCleanOutput"

Write-Host "Building tender-web client from source modules..."
node (Join-Path $Root "scripts\build-tender-client.mjs")
if ($LASTEXITCODE -ne 0) { throw "tender-web client build failed" }

New-Item -ItemType Directory -Force -Path $IconDir | Out-Null
if (Test-Path $IconSrc) { Copy-Item -Force $IconSrc $IconDest }
$brandPython = Find-BrandPython
& $brandPython (Join-Path $Root "scripts\make-installer-brand.py") $IconSrc $InstallerIcon $InstallerHeader
if ($LASTEXITCODE -ne 0) { throw "installer brand generation failed: $LASTEXITCODE" }

if (-not $SkipPrepare) {
  & (Join-Path $Root "scripts\prepare-win-runtime.ps1") -FullCopy -DshBuildReceipt $DshBuildReceipt
}
$runtimeCadViewer = Join-Path $Desktop "runtime\product\bundles\tender-web\lib\cad-viewer"
Install-CadCleanRuntime $runtimeCadViewer "staged Windows runtime"

Invoke-DesktopToolchain

$runtime = Join-Path $Desktop "runtime"
Get-ChildItem -LiteralPath $runtime -Force -ErrorAction SilentlyContinue |
  Where-Object { $_.Name -like "*.trash" } |
  ForEach-Object {
    Write-Host "Removing $($_.FullName) from runtime before pack"
    cmd /c "rmdir /s /q `"$($_.FullName)`"" | Out-Null
  }

$unpackedRoot = Join-Path $Desktop "dist-unpacked"
$nsisRoot = Join-Path $Desktop "dist-nsis"
$unpacked = Join-Path $unpackedRoot "win-unpacked"
$reuseCandidates = @(
  $unpacked,
  (Join-Path $Desktop "dist-fresh\win-unpacked"),
  (Join-Path $Desktop "dist-release\win-unpacked")
)
$existing = $reuseCandidates | Where-Object { Test-UnpackedApp $_ } | Select-Object -First 1

if ($ReuseUnpacked -and $existing) {
  $unpacked = $existing
  Write-Host "Reusing unpacked app at $unpacked"
} else {
  New-Item -ItemType Directory -Force -Path $unpackedRoot | Out-Null
  $env:CSC_IDENTITY_AUTO_DISCOVERY = "false"
  $exit = 1
  foreach ($attempt in 1..3) {
    Write-Host "electron-builder attempt $attempt --win --dir (no NSIS 7z)"
    $exit = Invoke-DesktopElectronBuilder
    if ($exit -eq 0 -and (Test-UnpackedApp $unpacked)) { break }
    Write-Host "electron-builder exited $exit; retrying after brief wait..."
    Start-Sleep -Seconds (3 * $attempt)
  }
  if ($exit -ne 0 -or -not (Test-UnpackedApp $unpacked)) {
    throw "electron-builder --dir failed to produce a complete win-unpacked app"
  }
}

$repairSrc = Join-Path $Root "scripts\repair-dsh-links.mjs"
$repairDests = @(
  (Join-Path $Desktop "runtime\product\scripts\repair-dsh-links.mjs"),
  (Join-Path $unpacked "resources\runtime\product\scripts\repair-dsh-links.mjs")
)
foreach ($dest in $repairDests) {
  $dir = Split-Path -Parent $dest
  if (Test-Path $dir) {
    Copy-Item -Force $repairSrc $dest
    Write-Host "Synced repair-dsh-links.mjs -> $dest"
  }
}

# ReuseUnpacked does not restage runtime. Copy the product tree that this
# build actually changed, then flip shipped presets to web_fetch.
$unpackedProduct = Join-Path $unpacked "resources\runtime\product"
if (Test-Path $unpackedProduct) {
  foreach ($item in @(
    "scripts",
    "bundles",
    "skills",
    "knowledge",
    "LICENSE",
    "README.md",
    "THIRD_PARTY_NOTICES.md",
    "vendor\dshmarket",
    "vendor\anysearch-dsh",
    "vendor\dsh-univer-office",
    "vendor\dsh-router-standard",
    "vendor\README.md",
    "vendor\dsh-router-standard.pin",
    "vendor\anysearch-dsh.pin",
    "vendor\dsh-univer-office.pin"
  )) {
    $src = Join-Path $Root $item
    $dest = Join-Path $unpackedProduct $item
    if (-not (Test-Path $src)) { continue }
    $parent = Split-Path $dest
    New-Item -ItemType Directory -Force -Path $parent | Out-Null
    if ((Get-Item $src) -is [System.IO.DirectoryInfo]) {
      robocopy $src $dest /E /XJ /NFL /NDL /NJH /NJS /NP | Out-Null
      if ($LASTEXITCODE -ge 8) { throw "robocopy product $item failed: $LASTEXITCODE" }
    } else {
      Copy-Item -Force $src $dest
    }
  }
  $retiredSkill = Join-Path $unpackedProduct "skills\j-space"
  if (Test-Path $retiredSkill) {
    Remove-Item -Recurse -Force $retiredSkill
    Write-Host "Removed retired skill $retiredSkill"
  }
  foreach ($retired in @(
    (Join-Path $unpackedProduct "vendor\dsh-genui"),
    (Join-Path $unpackedProduct "vendor\dsh-genui.pin")
  )) {
    if (Test-Path $retired) {
      Remove-Item -Recurse -Force $retired
      Write-Host "Removed retired $retired"
    }
  }
}
$unpackedCadViewer = Join-Path $unpackedProduct "bundles\tender-web\lib\cad-viewer"
Install-CadCleanRuntime $unpackedCadViewer "unpacked runtime"
# ReuseUnpacked keeps the previous electron-builder asar. The NSIS filename
# and DisplayVersion come from this tree's package.json; app.getVersion()
# reads the asar. If those diverge, startup update check prompts for the
# same installer again.
node (Join-Path $Root "scripts\stamp-electron-asar-version.mjs") $unpacked $AppVersion
if ($LASTEXITCODE -ne 0) { throw "stamp electron asar version failed" }

$unpackedDsh = Join-Path $unpacked "resources\runtime\deepseek-harness"
node (Join-Path $Root "scripts\apply-runtime-overlays.mjs") $unpackedDsh $unpackedProduct
if ($LASTEXITCODE -ne 0) { throw "apply desktop runtime overlays on unpacked app failed" }
node (Join-Path $Root "scripts\verify-dsh-runtime.mjs") $unpackedDsh $unpackedProduct
if ($LASTEXITCODE -ne 0) { throw "verify staged DSH runtime failed" }
node (Join-Path $Root "scripts\dsh-build-receipt.mjs") verify `
  --dsh $unpackedDsh --product $unpackedProduct --receipt (Join-Path $unpackedDsh $DshReceiptName)
if ($LASTEXITCODE -ne 0) { throw "verify unpacked DSH build receipt failed" }

if ($DirOnly) {
  Write-Host "Unpacked app written under $unpacked"
  Get-Item (Join-Path $unpacked "agent-pi-DSH.exe") | Format-Table Name, Length, LastWriteTime
  return
}

# The 7z-payload installer is the only production line. electron-builder's NSIS
# unpacks ~60k files one by one through its LZMA stream (10+ minutes on real
# machines, 3.1.0 user report); the local setup.nsi ships one low-compression
# non-solid payload.7z that 7za extracts in bulk, then repairs dsh junctions.
Install-7zaSnlWrapper | Out-Null
$sevenZip = Find-PayloadSevenZip
Write-Host "payload 7za: $sevenZip"
$makensis = Find-Makensis
New-Item -ItemType Directory -Force -Path $nsisRoot | Out-Null
$bundled7za = Join-Path $nsisRoot "7za.exe"
if ((Resolve-Path $sevenZip).Path -ne (Resolve-Path -ErrorAction SilentlyContinue $bundled7za).Path) {
  Copy-Item -Force $sevenZip $bundled7za
}
Copy-Item -Force $NsisScript (Join-Path $nsisRoot "setup.nsi")
Copy-Item -Force $InstallerIcon (Join-Path $nsisRoot "app-icon.ico")
Copy-Item -Force $InstallerHeader (Join-Path $nsisRoot "installer-header.bmp")
$payload = Join-Path $nsisRoot "payload.7z"
if (Test-Path $payload) {
  try {
    Remove-Item -Force $payload
  } catch {
    $stale = Join-Path $nsisRoot ("payload.old-{0}.7z" -f (Get-Date -Format "yyyyMMdd-HHmmss"))
    Rename-Item -Force $payload $stale
    Write-Host "payload.7z in use; moved aside to $stale"
  }
}
Write-Host "Archiving payload.7z (excluding type declarations and sourcemaps)..."
Push-Location $unpacked
# -snl keeps junctions as links (repair re-points them after install).
# Excluded suffixes are compile-time artifacts no runtime path reads.
& $sevenZip a -t7z -mx=1 -md=1m -snl -snh -mtc=off -ms=off -bd `
  "-xr!*.d.ts" "-xr!*.d.mts" "-xr!*.d.cts" "-xr!*.tsbuildinfo" "-xr!*.js.map" "-xr!*.mjs.map" "-xr!*.cjs.map" `
  $payload .
$archiveExit = $LASTEXITCODE
Pop-Location
if ($archiveExit -ne 0) { throw "7za archive failed: $archiveExit" }
Push-Location $nsisRoot
& $makensis /V2 "/DAPP_VERSION=$AppVersion" "/DAPP_ICON=app-icon.ico" "/DINSTALLER_HEADER=installer-header.bmp" "setup.nsi"
$nsisExit = $LASTEXITCODE
Pop-Location
if ($nsisExit -ne 0) { throw "makensis failed: $nsisExit" }
$installer = Join-Path $nsisRoot $InstallerName

if (-not (Test-Path $installer)) {
  throw "installer missing: $installer"
}

$releaseDir = Join-Path $Root "release"
New-Item -ItemType Directory -Force -Path $releaseDir | Out-Null
$published = Join-Path $releaseDir $InstallerName
try {
  Copy-Item -Force $installer $published
} catch {
  # A concurrent reader (uploader, antivirus) can hold the target; the
  # canonical artifact under dist-nsis is already complete either way.
  Write-Warning "publish copy failed ($($_.Exception.Message)); use $installer"
  $published = $installer
}

$checksumPath = Join-Path $releaseDir "$InstallerName.sha256"
$installerHash = (Get-FileHash -Algorithm SHA256 -LiteralPath $published).Hash
[IO.File]::WriteAllText(
  $checksumPath,
  "$installerHash  $InstallerName`n",
  [Text.Encoding]::ASCII
)

$windowsBuildReceipt = Join-Path $releaseDir "$InstallerName.build.json"
& node (Join-Path $Root "scripts\windows-build-receipt.mjs") create `
  --root $Root `
  --installer $published `
  --payload $payload `
  --cad-runtime $unpackedCadViewer `
  --cad-source $CadSourceArchive `
  --dsh-receipt (Join-Path $unpackedDsh $DshReceiptName) `
  --receipt $windowsBuildReceipt
if ($LASTEXITCODE -ne 0) { throw "Windows build receipt generation failed: $LASTEXITCODE" }
& node (Join-Path $Root "scripts\windows-build-receipt.mjs") verify `
  --root $Root `
  --installer $published `
  --payload $payload `
  --cad-runtime $unpackedCadViewer `
  --cad-source $CadSourceArchive `
  --dsh-receipt (Join-Path $unpackedDsh $DshReceiptName) `
  --receipt $windowsBuildReceipt
if ($LASTEXITCODE -ne 0) { throw "Windows build receipt verification failed: $LASTEXITCODE" }

Write-Host "Installer written:"
Get-Item $published | Format-Table FullName, @{ N = "MB"; E = { [math]::Round($_.Length / 1MB, 1) } }, LastWriteTime
Write-Host "SHA256 written: $checksumPath"
Write-Host "Build receipt written: $windowsBuildReceipt"
