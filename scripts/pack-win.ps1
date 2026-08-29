param(
  [switch]$SkipPrepare,
  [switch]$DirOnly,
  [switch]$ReuseUnpacked,
  [switch]$ToolchainOnly
)

$ErrorActionPreference = "Stop"
$Root = Split-Path -Parent $PSScriptRoot
$Desktop = Join-Path $Root "apps\desktop"
$AppVersion = (Get-Content (Join-Path $Desktop "package.json") -Raw | ConvertFrom-Json).version
$InstallerName = "Agent-Pi-DSH-$AppVersion-x64.exe"
$Dsh = Join-Path $Root "vendor\deepseek-harness"
$WebDist = Join-Path $Dsh "apps\web\dist\index.html"
$Biz = Join-Path $Root "packages\business-core"
$NsisScript = Join-Path $Root "scripts\nsis\setup.nsi"
$IconSrc = Join-Path $Desktop "brand\app-logo.png"
if (-not (Test-Path $IconSrc)) { $IconSrc = Join-Path $Root "AgentPI-logo-2.png" }
$IconDir = Join-Path $Desktop "build"
$IconDest = Join-Path $IconDir "icon.png"

function Get-NodeAdjacentCommand([string]$name) {
  $node = (Get-Command node -CommandType Application -ErrorAction Stop | Select-Object -First 1).Source
  $command = Join-Path (Split-Path -Parent $node) "$name.cmd"
  if (-not (Test-Path $command)) {
    throw "$name.cmd missing next to resolved node executable: $node"
  }
  return $command
}

function Invoke-NpmInstall([string]$dir, [string]$label) {
  $npm = Get-NodeAdjacentCommand "npm"
  $installExit = 1
  Push-Location $dir
  try {
    & $npm install --no-fund --no-audit
    $installExit = $LASTEXITCODE
  } finally {
    Pop-Location
  }
  if ($installExit -ne 0) { throw "$label npm install failed: $installExit" }
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

function Test-UnpackedApp([string]$dir) {
  $need = @(
    (Join-Path $dir "agent-pi-DSH.exe"),
    (Join-Path $dir "resources\runtime\node\node.exe"),
    (Join-Path $dir "resources\runtime\deepseek-harness\package.json"),
    (Join-Path $dir "resources\runtime\deepseek-harness\apps\web\dist\index.html"),
    (Join-Path $dir "resources\runtime\product\scripts\repair-dsh-links.mjs")
  )
  return ($need | Where-Object { -not (Test-Path $_) }).Count -eq 0
}

if ($ToolchainOnly) {
  Invoke-DesktopToolchain
  $toolchainBuilderExit = Invoke-DesktopElectronBuilder
  if ($toolchainBuilderExit -ne 0) { throw "local electron-builder.cmd failed: $toolchainBuilderExit" }
  return
}

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
if (-not (Test-Path (Join-Path $Root "vendor\anysearch-dsh\lib\index.js"))) {
  throw "vendor/anysearch-dsh incomplete. Copy anysearch-dsh 0.1.1 with built lib/"
}
if (-not (Test-Path (Join-Path $Root "vendor\dsh-univer-office\lib\index.js"))) {
  Write-Host "WARN vendor/dsh-univer-office missing. Run scripts/vendor-dsh-plugins.ps1 to preset Univer."
}
if (-not (Test-Path $NsisScript)) {
  throw "NSIS script missing: $NsisScript"
}

if (-not (Test-Path (Join-Path $Biz "node_modules\zod"))) {
  Write-Host "Installing business-core dependencies..."
  Invoke-NpmInstall $Biz "business-core"
}

New-Item -ItemType Directory -Force -Path $IconDir | Out-Null
if (Test-Path $IconSrc) { Copy-Item -Force $IconSrc $IconDest }

if (-not $SkipPrepare) {
  & (Join-Path $Root "scripts\prepare-win-runtime.ps1") -FullCopy
}

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
    "README.md",
    "vendor\dshmarket",
    "vendor\anysearch-dsh",
    "vendor\dsh-univer-office",
    "vendor\dsh-router-standard",
    "vendor\README.md",
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
# ReuseUnpacked keeps the previous electron-builder asar. The NSIS filename
# and DisplayVersion come from this tree's package.json; app.getVersion()
# reads the asar. If those diverge, startup update check prompts for the
# same installer again.
node (Join-Path $Root "scripts\stamp-electron-asar-version.mjs") $unpacked $AppVersion
if ($LASTEXITCODE -ne 0) { throw "stamp electron asar version failed" }

$unpackedDsh = Join-Path $unpacked "resources\runtime\deepseek-harness"
node (Join-Path $Root "scripts\apply-runtime-overlays.mjs") $unpackedDsh $unpackedProduct
if ($LASTEXITCODE -ne 0) { throw "apply desktop runtime overlays on unpacked app failed" }

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
& $makensis /V2 "/DAPP_VERSION=$AppVersion" "setup.nsi"
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

Write-Host "Installer written:"
Get-Item $published | Format-Table FullName, @{ N = "MB"; E = { [math]::Round($_.Length / 1MB, 1) } }, LastWriteTime
