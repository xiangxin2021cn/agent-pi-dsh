Unicode true
!ifndef APP_VERSION
  !define APP_VERSION "3.1.0"
!endif
!ifndef APP_ICON
  !define APP_ICON "${NSISDIR}\Contrib\Graphics\Icons\modern-install.ico"
!endif
!ifndef INSTALLER_HEADER
  !define INSTALLER_HEADER "${NSISDIR}\Contrib\Graphics\Header\nsis3-grey.bmp"
!endif
Name "Agent Pi DSH"
OutFile "Agent-Pi-DSH-${APP_VERSION}-x64.exe"
InstallDir "$LOCALAPPDATA\Programs\Agent Pi DSH"
RequestExecutionLevel user
SetCompress off
Icon "${APP_ICON}"
UninstallIcon "${APP_ICON}"
!include "MUI2.nsh"
!include "LogicLib.nsh"

!define MUI_ABORTWARNING
!define MUI_ICON "${APP_ICON}"
!define MUI_UNICON "${APP_ICON}"
!define MUI_HEADERIMAGE
!define MUI_HEADERIMAGE_RIGHT
!define MUI_HEADERIMAGE_BITMAP "${INSTALLER_HEADER}"
!define MUI_HEADERIMAGE_UNBITMAP "${INSTALLER_HEADER}"
!define MUI_FINISHPAGE_RUN "$INSTDIR\agent-pi-DSH.exe"
!define PRODUCT_NAME "Agent Pi DSH"
!define UNINST_KEY "Software\Microsoft\Windows\CurrentVersion\Uninstall\AgentPiDSH"

!insertmacro MUI_PAGE_DIRECTORY
!insertmacro MUI_PAGE_INSTFILES
!insertmacro MUI_PAGE_FINISH
!insertmacro MUI_UNPAGE_CONFIRM
!insertmacro MUI_UNPAGE_INSTFILES
!insertmacro MUI_LANGUAGE "SimpChinese"
!insertmacro MUI_LANGUAGE "English"

; Close the packaged app so 7za can replace resources\app.asar. Do not
; taskkill editors (Cursor can also lock that file); the asar fallback
; below still finishes the payload if only the asar is busy.
Function CloseRunningApp
  nsExec::ExecToStack '"$SYSDIR\cmd.exe" /c tasklist /FI "IMAGENAME eq agent-pi-DSH.exe" /NH | find /I "agent-pi-DSH.exe"'
  Pop $0
  Pop $1
  ${If} $0 == 0
    MessageBox MB_OKCANCEL|MB_ICONEXCLAMATION "检测到 Agent Pi DSH 仍在运行（含托盘）。点「确定」将退出后继续安装。$\r$\n$\r$\nAgent Pi DSH is still running (including the tray). OK will close it and continue." IDOK do_kill
    Abort
    do_kill:
      DetailPrint "Closing Agent Pi DSH..."
      nsExec::ExecToLog '"$SYSDIR\taskkill.exe" /F /IM agent-pi-DSH.exe /T'
      Pop $0
      Sleep 1500
  ${EndIf}
FunctionEnd

Section "Install"
  Call CloseRunningApp
  InitPluginsDir
  SetOutPath "$PLUGINSDIR"
  File "7za.exe"
  File "payload.7z"
  SetOutPath "$INSTDIR"
  IfFileExists "$INSTDIR\resources\app.asar" 0 skip_asar_rename
    Delete "$INSTDIR\resources\app.asar.old"
    Rename "$INSTDIR\resources\app.asar" "$INSTDIR\resources\app.asar.old"
  skip_asar_rename:
  DetailPrint "Extracting Agent Pi DSH..."
  nsExec::ExecToLog '"$PLUGINSDIR\7za.exe" x -y -aoa -bd "$PLUGINSDIR\payload.7z" "-o$INSTDIR"'
  Pop $0
  ${If} $0 != 0
    DetailPrint "Retrying extract..."
    Sleep 1000
    nsExec::ExecToLog '"$PLUGINSDIR\7za.exe" x -y -aoa -bd "$PLUGINSDIR\payload.7z" "-o$INSTDIR"'
    Pop $0
  ${EndIf}

  ; Always commit app.asar separately. A bulk 7za extraction can report
  ; success while antivirus or a stale Electron handle skips this one file.
  DetailPrint "Installing app.asar transactionally..."
  Delete "$PLUGINSDIR\app.asar"
  nsExec::ExecToLog '"$PLUGINSDIR\7za.exe" e -y -aoa -bd "$PLUGINSDIR\payload.7z" "-o$PLUGINSDIR" "resources\app.asar"'
  Pop $1
  ClearErrors
  Delete "$INSTDIR\resources\app.asar"
  IfFileExists "$PLUGINSDIR\app.asar" 0 asar_restore
    Rename "$PLUGINSDIR\app.asar" "$INSTDIR\resources\app.asar"
  IfFileExists "$INSTDIR\resources\app.asar" asar_ok asar_restore

  asar_restore:
    Delete "$INSTDIR\resources\app.asar"
    IfFileExists "$INSTDIR\resources\app.asar.old" 0 asar_fail
      Rename "$INSTDIR\resources\app.asar.old" "$INSTDIR\resources\app.asar"
  asar_fail:
    SetErrorLevel 2
    MessageBox MB_OK|MB_ICONSTOP "resources\app.asar 安装失败；已尽可能恢复原版本。请完全退出 Agent Pi DSH，并暂时关闭占用安装目录的编辑器后重试。$\r$\n$\r$\nFailed to install resources\app.asar; the previous archive was restored where possible. Quit Agent Pi DSH fully and close any editor locking the install folder, then retry."
    Abort

  asar_ok:
  IfFileExists "$INSTDIR\agent-pi-DSH.exe" 0 extract_fail
  IfFileExists "$INSTDIR\resources\runtime\node\node.exe" 0 extract_fail
  IfFileExists "$INSTDIR\resources\runtime\deepseek-harness\apps\cli\lib\bin.js" 0 extract_fail
  IfFileExists "$INSTDIR\resources\runtime\product\scripts\repair-dsh-links.mjs" 0 extract_fail
  Delete "$INSTDIR\resources\app.asar.old"
  Goto extract_ok

  extract_fail:
    SetErrorLevel 3
    MessageBox MB_OK|MB_ICONSTOP "解压失败 ($0)。请完全退出 Agent Pi DSH（含托盘）后重试。$\r$\n$\r$\nFailed to extract the application ($0). Quit Agent Pi DSH fully and retry."
    Abort

  extract_ok:
  DetailPrint "Repairing DeepSeek Harness plugin links..."
  nsExec::ExecToLog '"$INSTDIR\resources\runtime\node\node.exe" "$INSTDIR\resources\runtime\product\scripts\repair-dsh-links.mjs" repair "$INSTDIR\resources\runtime\deepseek-harness"'
  Pop $0
  IntCmp $0 0 repair_ok
    MessageBox MB_OK|MB_ICONSTOP "Failed to repair plugin links ($0)."
    Abort
  repair_ok:
  CreateShortCut "$DESKTOP\Agent Pi DSH.lnk" "$INSTDIR\agent-pi-DSH.exe"
  CreateDirectory "$SMPROGRAMS\Agent Pi DSH"
  CreateShortCut "$SMPROGRAMS\Agent Pi DSH\Agent Pi DSH.lnk" "$INSTDIR\agent-pi-DSH.exe"
  CreateShortCut "$SMPROGRAMS\Agent Pi DSH\Uninstall.lnk" "$INSTDIR\Uninstall.exe"
  WriteUninstaller "$INSTDIR\Uninstall.exe"
  WriteRegStr HKCU "${UNINST_KEY}" "DisplayName" "${PRODUCT_NAME}"
  WriteRegStr HKCU "${UNINST_KEY}" "UninstallString" "$INSTDIR\Uninstall.exe"
  WriteRegStr HKCU "${UNINST_KEY}" "DisplayIcon" "$INSTDIR\agent-pi-DSH.exe"
  WriteRegStr HKCU "${UNINST_KEY}" "Publisher" "Agent Pi DSH"
  WriteRegStr HKCU "${UNINST_KEY}" "DisplayVersion" "${APP_VERSION}"
  WriteRegDWORD HKCU "${UNINST_KEY}" "EstimatedSize" 1900000
SectionEnd

Section "Uninstall"
  DetailPrint "Removing DeepSeek Harness plugin links..."
  IfFileExists "$INSTDIR\resources\runtime\node\node.exe" 0 skip_strip
  IfFileExists "$INSTDIR\resources\runtime\product\scripts\repair-dsh-links.mjs" 0 skip_strip
  nsExec::ExecToLog '"$INSTDIR\resources\runtime\node\node.exe" "$INSTDIR\resources\runtime\product\scripts\repair-dsh-links.mjs" strip "$INSTDIR"'
  skip_strip:
  SetOutPath $TEMP
  nsExec::ExecToLog '"$SYSDIR\cmd.exe" /c rmdir /s /q "$INSTDIR"'
  RMDir /r "$INSTDIR"
  Delete "$DESKTOP\Agent Pi DSH.lnk"
  Delete "$DESKTOP\Agent Pi 3.0.lnk"
  RMDir /r "$SMPROGRAMS\Agent Pi DSH"
  DeleteRegKey HKCU "${UNINST_KEY}"
  DeleteRegKey HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\AgentPi30"
SectionEnd
