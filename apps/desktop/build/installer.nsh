; KB. electron-builder usually passes this from the archive size. If it
; does not, ${GetSize} follows junctions and the install progress never ends.
!ifndef ESTIMATED_SIZE
  !define ESTIMATED_SIZE 1900000
!endif

!macro customInstall
  DetailPrint "Repairing DeepSeek Harness plugin links..."
  nsExec::ExecToLog '"$INSTDIR\resources\runtime\node\node.exe" "$INSTDIR\resources\runtime\product\scripts\repair-dsh-links.mjs" repair "$INSTDIR\resources\runtime\deepseek-harness"'
!macroend

!macro customUnInstall
  DetailPrint "Removing DeepSeek Harness plugin links..."
  IfFileExists "$INSTDIR\resources\runtime\node\node.exe" 0 skip_strip
  IfFileExists "$INSTDIR\resources\runtime\product\scripts\repair-dsh-links.mjs" 0 skip_strip
  nsExec::ExecToLog '"$INSTDIR\resources\runtime\node\node.exe" "$INSTDIR\resources\runtime\product\scripts\repair-dsh-links.mjs" strip "$INSTDIR"'
  skip_strip:
!macroend

!macro customRemoveFiles
  SetOutPath $TEMP
  nsExec::ExecToLog '"$SYSDIR\cmd.exe" /c rmdir /s /q "$INSTDIR"'
  RMDir /r $INSTDIR
!macroend
