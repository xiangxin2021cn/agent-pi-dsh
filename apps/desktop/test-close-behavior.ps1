# One-shot smoke for the close-to-tray behavior. Boots the Electron shell
# against a stub backend URL (no DSH), sends WM_CLOSE twice:
#   pass 1 (prefs=tray): process must survive with the window hidden
#   pass 2 (prefs=quit): process must exit
# -Exe: test a packed executable instead of dev electron.
param([string]$Exe = '')
$ErrorActionPreference = 'Stop'
$desktop = Split-Path -Parent $MyInvocation.MyCommand.Path

Add-Type @"
using System;
using System.Runtime.InteropServices;
using System.Collections.Generic;
public static class WinApi {
  [DllImport("user32.dll")] public static extern bool EnumWindows(EnumWindowsProc cb, IntPtr lp);
  public delegate bool EnumWindowsProc(IntPtr hWnd, IntPtr lp);
  [DllImport("user32.dll")] public static extern uint GetWindowThreadProcessId(IntPtr hWnd, out uint pid);
  [DllImport("user32.dll")] public static extern bool IsWindowVisible(IntPtr hWnd);
  [DllImport("user32.dll")] public static extern bool PostMessage(IntPtr hWnd, uint msg, IntPtr wp, IntPtr lp);
  [DllImport("user32.dll", CharSet = CharSet.Unicode)] public static extern int GetWindowText(IntPtr hWnd, System.Text.StringBuilder sb, int max);
  public static List<IntPtr> WindowsOf(uint pid) {
    var found = new List<IntPtr>();
    EnumWindows((h, l) => { uint p; GetWindowThreadProcessId(h, out p); if (p == pid) found.Add(h); return true; }, IntPtr.Zero);
    return found;
  }
}
"@

function Get-MainWindow([uint32]$targetPid) {
  foreach ($h in [WinApi]::WindowsOf($targetPid)) {
    $sb = New-Object System.Text.StringBuilder 256
    [void][WinApi]::GetWindowText($h, $sb, 256)
    if ($sb.ToString().Length -gt 0 -and [WinApi]::IsWindowVisible($h)) { return $h }
  }
  return [IntPtr]::Zero
}

function Get-WindowTitle([IntPtr]$hwnd) {
  $sb = New-Object System.Text.StringBuilder 256
  [void][WinApi]::GetWindowText($hwnd, $sb, 256)
  return $sb.ToString()
}

$prefsDir = Join-Path $env:APPDATA 'agent-pi-DSH'
New-Item -ItemType Directory -Force -Path $prefsDir | Out-Null
$prefs = Join-Path $prefsDir 'window-prefs.json'
'{"closeAction":"tray"}' | Set-Content -Encoding ascii $prefs

# Stub backend so the shell skips DSH boot and loads instantly.
$stub = Start-Process -PassThru -WindowStyle Hidden node -ArgumentList @('-e', "require('http').createServer((q,s)=>{s.setHeader('content-type','text/html');s.end('<title>stub</title>ok')}).listen(18901)")
Start-Sleep -Milliseconds 600

$env:AGENT_PI_DSH_URL = 'http://127.0.0.1:18901'
if ($Exe) {
  $appProc = Start-Process -PassThru $Exe -WorkingDirectory (Split-Path -Parent $Exe)
} else {
  $electron = Join-Path $desktop 'node_modules\electron\dist\electron.exe'
  $appProc = Start-Process -PassThru $electron -ArgumentList '.' -WorkingDirectory $desktop
}
Write-Host "electron pid=$($appProc.Id)"

try {
  # Wait for the main window, then for the stub page title: the packaged shell
  # blocks the main process in spawnSync (repair links, init profile) before
  # loadURL, so WM_CLOSE queues until the title flips to 'stub'.
  $hwnd = [IntPtr]::Zero
  foreach ($i in 1..60) {
    Start-Sleep -Milliseconds 500
    $hwnd = Get-MainWindow $appProc.Id
    if ($hwnd -ne [IntPtr]::Zero) { break }
  }
  if ($hwnd -eq [IntPtr]::Zero) { throw 'main window never appeared' }
  Write-Host "window hwnd=$hwnd"
  foreach ($i in 1..240) {
    if ((Get-WindowTitle $hwnd) -eq 'stub') { break }
    Start-Sleep -Milliseconds 500
  }
  if ((Get-WindowTitle $hwnd) -ne 'stub') { throw 'stub page never loaded (startup did not finish)' }
  Write-Host 'stub page loaded, startup complete'

  # Pass 1: prefs=tray -> WM_CLOSE hides the window, process survives
  [void][WinApi]::PostMessage($hwnd, 0x0010, [IntPtr]::Zero, [IntPtr]::Zero)
  $hidden = $false
  foreach ($i in 1..30) {
    Start-Sleep -Milliseconds 500
    if ($appProc.HasExited) { throw 'FAIL: process exited despite closeAction=tray' }
    if (-not [WinApi]::IsWindowVisible($hwnd)) { $hidden = $true; break }
  }
  if (-not $hidden) { throw 'FAIL: window still visible after close-to-tray' }
  Start-Sleep -Seconds 2
  if ($appProc.HasExited) { throw 'FAIL: process exited despite closeAction=tray' }
  Write-Host 'PASS 1: tray mode keeps the app alive with a hidden window'

  # Pass 2: prefs=quit -> WM_CLOSE exits the process (prefs re-read per close)
  '{"closeAction":"quit"}' | Set-Content -Encoding ascii $prefs
  [void][WinApi]::PostMessage($hwnd, 0x0010, [IntPtr]::Zero, [IntPtr]::Zero)
  foreach ($i in 1..20) {
    Start-Sleep -Milliseconds 500
    if ($appProc.HasExited) { break }
  }
  if (-not $appProc.HasExited) { throw 'FAIL: process still running despite closeAction=quit' }
  Write-Host 'PASS 2: quit mode exits the process'
  Write-Host 'ALL PASS'
} finally {
  if (-not $appProc.HasExited) { Stop-Process -Id $appProc.Id -Force -ErrorAction SilentlyContinue }
  Stop-Process -Id $stub.Id -Force -ErrorAction SilentlyContinue
  Remove-Item -Force $prefs -ErrorAction SilentlyContinue
}
