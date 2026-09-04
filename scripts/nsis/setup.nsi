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
!define PRODUCT_NAME "Agent Pi DSH"
!define PRODUCT_ID "do.agentpi.dsh"
!define UNINST_KEY "Software\Microsoft\Windows\CurrentVersion\Uninstall\AgentPiDSH"
!define INSTALL_ROOT_RECEIPT ".agent-pi-install-root.ini"
!define INSTALL_ROOT_RECEIPT_SECTION "AgentPiDSH"
Name "Agent Pi DSH"
OutFile "Agent-Pi-DSH-${APP_VERSION}-x64.exe"
InstallDir "$LOCALAPPDATA\Programs\Agent Pi DSH"
InstallDirRegKey HKCU "${UNINST_KEY}" "InstallLocation"
RequestExecutionLevel user
SetCompress off
Icon "${APP_ICON}"
UninstallIcon "${APP_ICON}"
!include "MUI2.nsh"
!include "LogicLib.nsh"
!include "FileFunc.nsh"

!define MUI_ABORTWARNING
!define MUI_ICON "${APP_ICON}"
!define MUI_UNICON "${APP_ICON}"
!define MUI_HEADERIMAGE
!define MUI_HEADERIMAGE_RIGHT
!define MUI_HEADERIMAGE_BITMAP "${INSTALLER_HEADER}"
!define MUI_HEADERIMAGE_UNBITMAP "${INSTALLER_HEADER}"
!define MUI_FINISHPAGE_RUN "$INSTDIR\agent-pi-DSH.exe"

!insertmacro MUI_PAGE_DIRECTORY
!insertmacro MUI_PAGE_INSTFILES
!insertmacro MUI_PAGE_FINISH
!insertmacro MUI_UNPAGE_CONFIRM
!insertmacro MUI_UNPAGE_INSTFILES
!insertmacro MUI_LANGUAGE "SimpChinese"
!insertmacro MUI_LANGUAGE "English"

; Only a dedicated, ordinary directory may become an install root. A valid
; receipt allows subsequent upgrades; the exact default legacy directory is
; accepted once so existing installations can acquire the receipt.
Function ValidateInstallRoot
  GetFullPathName $INSTDIR "$INSTDIR"
  StrLen $0 "$INSTDIR"
  IntCmp $0 3 install_root_invalid install_root_invalid
  StrCpy $0 "$INSTDIR" 2
  StrCmp $0 "\\" install_root_invalid

  System::Call 'kernel32::GetFileAttributesW(w "$INSTDIR").i .r4'
  StrCpy $1 "$INSTDIR"
  install_root_reparse_loop:
    System::Call 'kernel32::GetFileAttributesW(w r1).i .r2'
    ${If} $2 != -1
      IntOp $3 $2 & 0x400
      ${If} $3 != 0
        Goto install_root_invalid
      ${EndIf}
    ${EndIf}
    ${GetParent} "$1" $0
    StrCmp $0 "" install_root_reparse_done
    StrCmp $0 "$1" install_root_reparse_done
    StrCpy $1 "$0"
    Goto install_root_reparse_loop
  install_root_reparse_done:
  ${If} $4 != -1
    IntOp $3 $4 & 0x10
    ${If} $3 == 0
      Goto install_root_invalid
    ${EndIf}
  ${EndIf}

  IfFileExists "$INSTDIR\${INSTALL_ROOT_RECEIPT}" 0 install_root_unowned
    ReadINIStr $0 "$INSTDIR\${INSTALL_ROOT_RECEIPT}" "${INSTALL_ROOT_RECEIPT_SECTION}" "Schema"
    StrCmp $0 "1" 0 install_root_invalid
    ReadINIStr $0 "$INSTDIR\${INSTALL_ROOT_RECEIPT}" "${INSTALL_ROOT_RECEIPT_SECTION}" "Product"
    StrCmp $0 "${PRODUCT_ID}" 0 install_root_invalid
    ReadINIStr $0 "$INSTDIR\${INSTALL_ROOT_RECEIPT}" "${INSTALL_ROOT_RECEIPT_SECTION}" "InstallLocation"
    StrCmp $0 "$INSTDIR" install_root_ok install_root_invalid

  install_root_unowned:
    StrCpy $0 "$INSTDIR" 13 -13
    StrCmp $0 "\Agent Pi DSH" 0 install_root_invalid
    IntCmp $4 -1 install_root_ok
    IfFileExists "$INSTDIR\*.*" install_root_legacy 0
    Goto install_root_ok
  install_root_legacy:
    IfFileExists "$INSTDIR\agent-pi-DSH.exe" 0 install_root_invalid
    IfFileExists "$INSTDIR\resources\app.asar" install_root_ok install_root_invalid

  install_root_invalid:
    SetErrorLevel 5
    MessageBox MB_OK|MB_ICONSTOP "安装目录必须是名为 Agent Pi DSH 的专属本地文件夹，且不能是磁盘根目录、共享路径或链接目录。为防止卸载误删其他文件，请选择类似 D:\Apps\Agent Pi DSH 的目录。$\r$\n$\r$\nThe install root must be a dedicated local folder named Agent Pi DSH, not a drive root, network share, or reparse-point directory. Choose a path such as D:\Apps\Agent Pi DSH."
    Abort
  install_root_ok:
FunctionEnd

Function EnsureInstallRootReceipt
  IfFileExists "$INSTDIR\${INSTALL_ROOT_RECEIPT}" install_receipt_ok 0
  ClearErrors
  WriteINIStr "$INSTDIR\${INSTALL_ROOT_RECEIPT}" "${INSTALL_ROOT_RECEIPT_SECTION}" "Schema" "1"
  IfErrors install_receipt_failed 0
  WriteINIStr "$INSTDIR\${INSTALL_ROOT_RECEIPT}" "${INSTALL_ROOT_RECEIPT_SECTION}" "Product" "${PRODUCT_ID}"
  IfErrors install_receipt_failed 0
  WriteINIStr "$INSTDIR\${INSTALL_ROOT_RECEIPT}" "${INSTALL_ROOT_RECEIPT_SECTION}" "InstallLocation" "$INSTDIR"
  IfErrors install_receipt_failed 0
  Goto install_receipt_ok
  install_receipt_failed:
    Delete "$INSTDIR\${INSTALL_ROOT_RECEIPT}"
    Call RollbackUniverVendor
    Call RollbackAppAsar
    SetErrorLevel 6
    MessageBox MB_OK|MB_ICONSTOP "无法写入 Agent Pi DSH 安装收据；为保护该目录，安装已中止。 Failed to write the Agent Pi DSH install receipt; setup stopped to protect this directory."
    Abort
  install_receipt_ok:
FunctionEnd

Function un.ValidateInstallRoot
  GetFullPathName $INSTDIR "$INSTDIR"
  StrLen $0 "$INSTDIR"
  IntCmp $0 3 uninstall_root_invalid uninstall_root_invalid
  StrCpy $0 "$INSTDIR" 2
  StrCmp $0 "\\" uninstall_root_invalid
  System::Call 'kernel32::GetFileAttributesW(w "$INSTDIR").i .r4'
  IntCmp $4 -1 uninstall_root_invalid
  StrCpy $1 "$INSTDIR"
  uninstall_root_reparse_loop:
    System::Call 'kernel32::GetFileAttributesW(w r1).i .r2'
    ${If} $2 != -1
      IntOp $3 $2 & 0x400
      ${If} $3 != 0
        Goto uninstall_root_invalid
      ${EndIf}
    ${EndIf}
    ${GetParent} "$1" $0
    StrCmp $0 "" uninstall_root_reparse_done
    StrCmp $0 "$1" uninstall_root_reparse_done
    StrCpy $1 "$0"
    Goto uninstall_root_reparse_loop
  uninstall_root_reparse_done:
  IntOp $3 $4 & 0x10
  IntCmp $3 0 uninstall_root_invalid
  ReadINIStr $0 "$INSTDIR\${INSTALL_ROOT_RECEIPT}" "${INSTALL_ROOT_RECEIPT_SECTION}" "Schema"
  StrCmp $0 "1" 0 uninstall_root_invalid
  ReadINIStr $0 "$INSTDIR\${INSTALL_ROOT_RECEIPT}" "${INSTALL_ROOT_RECEIPT_SECTION}" "Product"
  StrCmp $0 "${PRODUCT_ID}" 0 uninstall_root_invalid
  ReadINIStr $0 "$INSTDIR\${INSTALL_ROOT_RECEIPT}" "${INSTALL_ROOT_RECEIPT_SECTION}" "InstallLocation"
  StrCmp $0 "$INSTDIR" 0 uninstall_root_invalid
  ReadRegStr $0 HKCU "${UNINST_KEY}" "InstallLocation"
  StrCmp $0 "$INSTDIR" 0 uninstall_root_invalid
  IfFileExists "$INSTDIR\agent-pi-DSH.exe" uninstall_root_ok uninstall_root_invalid
  uninstall_root_invalid:
    SetErrorLevel 5
    MessageBox MB_OK|MB_ICONSTOP "无法确认该目录由 Agent Pi DSH 安装程序独占，卸载已停止且没有删除文件。请在同一目录重新安装后再卸载。$\r$\n$\r$\nThe installer cannot prove ownership of this directory. Uninstall stopped without deleting files. Reinstall to the same directory, then retry."
    Abort
  uninstall_root_ok:
FunctionEnd

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

; 7za -aoa replaces files but never deletes files removed by a newer package.
; Move this installer-owned plugin out of the overlay path first so an upgrade
; cannot combine two wrapper versions. The previous directory stays available
; until the new runtime passes its receipt and DSH compatibility checks.
Function StageUniverVendor
  ; If a previous attempt stopped after staging, the backup is the last known
  ; good copy. Discard only the partial current directory and keep the backup.
  IfFileExists "$INSTDIR\resources\runtime\product\vendor\.agent-pi-univer-previous\*.*" stage_univer_has_backup 0
  IfFileExists "$INSTDIR\resources\runtime\product\vendor\dsh-univer-office\*.*" stage_univer_current 0
  Goto stage_univer_done
  stage_univer_has_backup:
  RMDir /r "$INSTDIR\resources\runtime\product\vendor\dsh-univer-office"
  IfFileExists "$INSTDIR\resources\runtime\product\vendor\dsh-univer-office\*.*" stage_univer_delete_failed 0
  Goto stage_univer_done
  stage_univer_delete_failed:
    MessageBox MB_OK|MB_ICONSTOP "无法清理上次安装留下的 dsh-univer-office 临时目录；最后可用备份仍已保留。请完全退出应用后重试。 Failed to clear the partial dsh-univer-office from the previous attempt; the last known-good backup was preserved. Quit the app fully and retry."
    Abort
  stage_univer_current:
  RMDir "$INSTDIR\resources\runtime\product\vendor\.agent-pi-univer-previous"
  ClearErrors
  Rename "$INSTDIR\resources\runtime\product\vendor\dsh-univer-office" "$INSTDIR\resources\runtime\product\vendor\.agent-pi-univer-previous"
  IfErrors 0 stage_univer_done
    MessageBox MB_OK|MB_ICONSTOP "无法暂存旧版 dsh-univer-office。请确认 Agent Pi DSH 已完全退出后重试。 Failed to stage the previous dsh-univer-office. Quit Agent Pi DSH fully and retry."
    Abort
  stage_univer_done:
FunctionEnd

Function RollbackUniverVendor
  RMDir /r "$INSTDIR\resources\runtime\product\vendor\dsh-univer-office"
  IfFileExists "$INSTDIR\resources\runtime\product\vendor\.agent-pi-univer-previous\*.*" 0 rollback_univer_done
  ClearErrors
  Rename "$INSTDIR\resources\runtime\product\vendor\.agent-pi-univer-previous" "$INSTDIR\resources\runtime\product\vendor\dsh-univer-office"
  rollback_univer_done:
FunctionEnd

Function CommitUniverVendor
  RMDir /r "$INSTDIR\resources\runtime\product\vendor\.agent-pi-univer-previous"
FunctionEnd

Function StageAppAsar
  ; A prior interrupted attempt may already have preserved the last known-good
  ; archive. Keep it and discard only the unverified current archive.
  IfFileExists "$INSTDIR\resources\app.asar.old" stage_asar_has_backup 0
  IfFileExists "$INSTDIR\resources\app.asar" stage_asar_current 0
  Goto stage_asar_done
  stage_asar_has_backup:
  ClearErrors
  Delete "$INSTDIR\resources\app.asar"
  IfErrors stage_asar_delete_failed 0
  Goto stage_asar_done
  stage_asar_delete_failed:
    MessageBox MB_OK|MB_ICONSTOP "无法清理上次安装留下的 resources\app.asar；最后可用备份仍已保留。请完全退出应用后重试。 Failed to clear the unverified resources\app.asar from the previous attempt; the last known-good backup was preserved. Quit the app fully and retry."
    Abort
  stage_asar_current:
  ClearErrors
  Rename "$INSTDIR\resources\app.asar" "$INSTDIR\resources\app.asar.old"
  IfErrors 0 stage_asar_done
    MessageBox MB_OK|MB_ICONSTOP "无法暂存旧版 resources\app.asar。请确认 Agent Pi DSH 已完全退出后重试。 Failed to stage the previous resources\app.asar. Quit Agent Pi DSH fully and retry."
    Abort
  stage_asar_done:
FunctionEnd

Function RollbackAppAsar
  IfFileExists "$INSTDIR\resources\app.asar.old" rollback_asar_previous 0
  Delete "$INSTDIR\resources\app.asar"
  Goto rollback_asar_done
  rollback_asar_previous:
  Delete "$INSTDIR\resources\app.asar"
  Rename "$INSTDIR\resources\app.asar.old" "$INSTDIR\resources\app.asar"
  rollback_asar_done:
FunctionEnd

Function un.CloseRunningApp
  nsExec::ExecToStack '"$SYSDIR\cmd.exe" /c tasklist /FI "IMAGENAME eq agent-pi-DSH.exe" /NH | find /I "agent-pi-DSH.exe"'
  Pop $0
  Pop $1
  ${If} $0 == 0
    MessageBox MB_OKCANCEL|MB_ICONEXCLAMATION "检测到 Agent Pi DSH 仍在运行（含托盘）。点「确定」将退出后继续卸载。 Agent Pi DSH is still running (including the tray). OK will close it and continue uninstalling." IDOK un_do_kill
    Abort
    un_do_kill:
      DetailPrint "Closing Agent Pi DSH..."
      nsExec::ExecToLog '"$SYSDIR\taskkill.exe" /F /IM agent-pi-DSH.exe /T'
      Pop $0
      Sleep 1500
  ${EndIf}
FunctionEnd

Section "Install"
  Call ValidateInstallRoot
  Call CloseRunningApp
  Call StageAppAsar
  Call StageUniverVendor
  InitPluginsDir
  SetOutPath "$PLUGINSDIR"
  File "7za.exe"
  File "payload.7z"
  SetOutPath "$INSTDIR"
  DetailPrint "Extracting Agent Pi DSH..."
  nsExec::ExecToLog '"$PLUGINSDIR\7za.exe" x -y -aoa -bd "$PLUGINSDIR\payload.7z" "-o$INSTDIR"'
  Pop $0
  ${If} $0 != 0
    DetailPrint "Retrying extract..."
    Sleep 1000
    nsExec::ExecToLog '"$PLUGINSDIR\7za.exe" x -y -aoa -bd "$PLUGINSDIR\payload.7z" "-o$INSTDIR"'
    Pop $0
  ${EndIf}
  ${If} $0 != 0
    Goto extract_fail
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
    Call RollbackUniverVendor
    Call RollbackAppAsar
  asar_fail:
    SetErrorLevel 2
    MessageBox MB_OK|MB_ICONSTOP "resources\app.asar 安装失败；已尽可能恢复原版本。请完全退出 Agent Pi DSH，并暂时关闭占用安装目录的编辑器后重试。$\r$\n$\r$\nFailed to install resources\app.asar; the previous archive was restored where possible. Quit Agent Pi DSH fully and close any editor locking the install folder, then retry."
    Abort

  asar_ok:
  IfFileExists "$INSTDIR\agent-pi-DSH.exe" 0 extract_fail
  IfFileExists "$INSTDIR\resources\runtime\node\node.exe" 0 extract_fail
  IfFileExists "$INSTDIR\resources\runtime\deepseek-harness\apps\cli\lib\bin.js" 0 extract_fail
  IfFileExists "$INSTDIR\resources\runtime\product\scripts\repair-dsh-links.mjs" 0 extract_fail
  IfFileExists "$INSTDIR\resources\runtime\product\scripts\installer-univer-lifecycle.mjs" 0 extract_fail
  Goto extract_ok

  extract_fail:
    Call RollbackUniverVendor
    Call RollbackAppAsar
    SetErrorLevel 3
    MessageBox MB_OK|MB_ICONSTOP "解压失败 ($0)。请完全退出 Agent Pi DSH（含托盘）后重试。$\r$\n$\r$\nFailed to extract the application ($0). Quit Agent Pi DSH fully and retry."
    Abort

  extract_ok:
  DetailPrint "Repairing DeepSeek Harness plugin links..."
  nsExec::ExecToLog '"$INSTDIR\resources\runtime\node\node.exe" "$INSTDIR\resources\runtime\product\scripts\repair-dsh-links.mjs" repair "$INSTDIR\resources\runtime\deepseek-harness"'
  Pop $0
  IntCmp $0 0 repair_ok
    Call RollbackUniverVendor
    Call RollbackAppAsar
    MessageBox MB_OK|MB_ICONSTOP "Failed to repair plugin links ($0)."
    Abort
  repair_ok:
  DetailPrint "Verifying dsh-univer-office install boundary..."
  !ifdef INCLUDE_LICENSED_UNIVER
  nsExec::ExecToLog '"$INSTDIR\resources\runtime\node\node.exe" "$INSTDIR\resources\runtime\product\scripts\installer-univer-lifecycle.mjs" verify-product "$INSTDIR\resources\runtime\product" --required'
  !else
  nsExec::ExecToLog '"$INSTDIR\resources\runtime\node\node.exe" "$INSTDIR\resources\runtime\product\scripts\installer-univer-lifecycle.mjs" verify-product "$INSTDIR\resources\runtime\product"'
  !endif
  Pop $0
  IntCmp $0 0 univer_verify_ok
    Call RollbackUniverVendor
    Call RollbackAppAsar
    MessageBox MB_OK|MB_ICONSTOP "dsh-univer-office 完整性或 DSH 兼容检查失败；已恢复旧插件目录。 dsh-univer-office failed its integrity or DSH compatibility check; the previous plugin directory was restored."
    Abort
  univer_verify_ok:
  Call EnsureInstallRootReceipt
  Call CommitUniverVendor
  Delete "$INSTDIR\resources\app.asar.old"
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
  WriteRegStr HKCU "${UNINST_KEY}" "InstallLocation" "$INSTDIR"
  WriteRegDWORD HKCU "${UNINST_KEY}" "EstimatedSize" 1900000
SectionEnd

Section "Uninstall"
  Call un.ValidateInstallRoot
  Call un.CloseRunningApp
  DetailPrint "Detaching installer-owned dsh-univer-office profile link..."
  IfFileExists "$INSTDIR\resources\runtime\node\node.exe" 0 uninstall_helper_missing
  IfFileExists "$INSTDIR\resources\runtime\product\scripts\installer-univer-lifecycle.mjs" 0 uninstall_helper_missing
  nsExec::ExecToLog '"$INSTDIR\resources\runtime\node\node.exe" "$INSTDIR\resources\runtime\product\scripts\installer-univer-lifecycle.mjs" detach-profile "$APPDATA\agent-pi-dsh-desktop\dsh-home\profiles\tender" "$INSTDIR\resources\runtime\product"'
  Pop $0
  IntCmp $0 0 uninstall_detach_ok
  Goto uninstall_detach_failed
  uninstall_detach_ok:
  DetailPrint "Removing DeepSeek Harness plugin links..."
  IfFileExists "$INSTDIR\resources\runtime\product\scripts\repair-dsh-links.mjs" 0 uninstall_helper_missing
  nsExec::ExecToLog '"$INSTDIR\resources\runtime\node\node.exe" "$INSTDIR\resources\runtime\product\scripts\repair-dsh-links.mjs" strip "$INSTDIR"'
  Pop $0
  IntCmp $0 0 uninstall_strip_ok
  Goto uninstall_strip_failed
  uninstall_strip_ok:
  Goto uninstall_helpers_ok
  uninstall_helper_missing:
    SetErrorLevel 6
    MessageBox MB_OK|MB_ICONSTOP "卸载所需的 Agent Pi DSH 运行时或清理程序缺失。为避免留下损坏配置或误删文件，卸载已停止；请先在同一目录重新安装。 The required runtime or cleanup helper is missing. Uninstall stopped to avoid corrupting configuration or deleting unrelated files; reinstall to the same directory first."
    Abort
  uninstall_detach_failed:
    SetErrorLevel 7
    MessageBox MB_OK|MB_ICONSTOP "无法安全解除 dsh-univer-office 配置 ($0)。程序和卸载记录均已保留；请修复配置或在同一目录重新安装后重试。 Failed to detach dsh-univer-office safely ($0). The program and uninstall entry were preserved; repair the configuration or reinstall to the same directory, then retry."
    Abort
  uninstall_strip_failed:
    SetErrorLevel 8
    MessageBox MB_OK|MB_ICONSTOP "无法安全清理 DeepSeek Harness 插件链接 ($0)。程序和卸载记录均已保留；请在同一目录重新安装后重试。 Failed to clean DeepSeek Harness plugin links safely ($0). The program and uninstall entry were preserved; reinstall to the same directory, then retry."
    Abort
  uninstall_helpers_ok:
  SetOutPath $TEMP
  RMDir /r "$INSTDIR"
  IfFileExists "$INSTDIR\*.*" 0 uninstall_delete_ok
    Sleep 1000
    RMDir /r "$INSTDIR"
  IfFileExists "$INSTDIR\*.*" uninstall_delete_fail uninstall_delete_ok
  uninstall_delete_fail:
    SetErrorLevel 4
    MessageBox MB_OK|MB_ICONSTOP "未能完全删除 Agent Pi DSH 安装目录。卸载记录已保留；部分安装收据或程序文件可能已经删除，请先在原目录重新安装，再重试卸载。 The install directory could not be removed completely. The uninstall entry was kept, but receipt or program files may already be gone; reinstall to the same directory before retrying uninstall."
    Abort
  uninstall_delete_ok:
  Delete "$DESKTOP\Agent Pi DSH.lnk"
  Delete "$DESKTOP\Agent Pi 3.0.lnk"
  RMDir /r "$SMPROGRAMS\Agent Pi DSH"
  DeleteRegKey HKCU "${UNINST_KEY}"
  DeleteRegKey HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\AgentPi30"
SectionEnd
