param(
  [string[]]$InstallDir = @(
    "$env:LOCALAPPDATA\Programs\Agent Pi 3.0",
    "$env:LOCALAPPDATA\Programs\Agent Pi DSH"
  )
)

$ErrorActionPreference = "Stop"

function Get-ReparsePoints([string]$root) {
  $found = New-Object System.Collections.Generic.List[string]
  if (-not (Test-Path -LiteralPath $root)) { return $found }
  $stack = New-Object System.Collections.Generic.Stack[string]
  $stack.Push($root)
  while ($stack.Count -gt 0) {
    $dir = $stack.Pop()
    try {
      $entries = [System.IO.Directory]::EnumerateFileSystemEntries($dir)
    } catch {
      continue
    }
    foreach ($full in $entries) {
      try {
        $attr = [System.IO.File]::GetAttributes($full)
      } catch {
        continue
      }
      if ($attr -band [IO.FileAttributes]::ReparsePoint) {
        $found.Add($full)
        continue
      }
      if ($attr -band [IO.FileAttributes]::Directory) {
        $stack.Push($full)
      }
    }
  }
  return $found
}

function Remove-InstallTree([string]$root) {
  if (-not (Test-Path -LiteralPath $root)) {
    Write-Host "skip missing $root"
    return
  }
  Write-Host "Stripping reparse points under $root"
  $links = Get-ReparsePoints $root
  $removed = 0
  foreach ($link in $links) {
    try {
      $attr = [System.IO.File]::GetAttributes($link)
      if ($attr -band [IO.FileAttributes]::Directory) {
        [System.IO.Directory]::Delete($link)
      } else {
        [System.IO.File]::Delete($link)
      }
      $removed += 1
    } catch {
      cmd /c "rmdir `"$link`"" | Out-Null
      if (-not (Test-Path -LiteralPath $link)) { $removed += 1 }
    }
  }
  Write-Host "stripped $removed / $($links.Count); deleting tree"
  cmd /c "rmdir /s /q `"$root`"" | Out-Null
  if (Test-Path -LiteralPath $root) {
    throw "failed to remove $root"
  }
  Write-Host "removed $root"
}

Get-Process -Name "agent-pi-DSH","Agent Pi DSH","agent-pi" -ErrorAction SilentlyContinue |
  Stop-Process -Force -ErrorAction SilentlyContinue

foreach ($dir in $InstallDir) {
  Remove-InstallTree $dir
}

$shortcuts = @(
  "$env:USERPROFILE\Desktop\Agent Pi DSH.lnk",
  "$env:USERPROFILE\Desktop\Agent Pi 3.0.lnk",
  "$env:APPDATA\Microsoft\Windows\Start Menu\Programs\Agent Pi DSH",
  "$env:APPDATA\Microsoft\Windows\Start Menu\Programs\Agent Pi 3.0"
)
foreach ($item in $shortcuts) {
  if (Test-Path -LiteralPath $item) {
    Remove-Item -LiteralPath $item -Recurse -Force -ErrorAction SilentlyContinue
  }
}

foreach ($key in @(
  "HKCU:\Software\Microsoft\Windows\CurrentVersion\Uninstall\AgentPiDSH",
  "HKCU:\Software\Microsoft\Windows\CurrentVersion\Uninstall\AgentPi30"
)) {
  if (Test-Path $key) { Remove-Item -Recurse -Force $key }
}

Get-ChildItem "HKCU:\Software\Microsoft\Windows\CurrentVersion\Uninstall" -ErrorAction SilentlyContinue |
  ForEach-Object {
    $p = Get-ItemProperty $_.PSPath -ErrorAction SilentlyContinue
    if ($p.DisplayName -match 'Agent Pi (DSH|3\.0)') {
      Remove-Item -Recurse -Force $_.PSPath
    }
  }

Write-Host "Fast uninstall finished."
