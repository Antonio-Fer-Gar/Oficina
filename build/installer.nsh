!macro customInstall
  nsExec::ExecToLog '"$INSTDIR\resources\bun\bun.exe" "$INSTDIR\resources\app.asar.unpacked\dist\terminal-launcher.js" --install "$INSTDIR\${APP_EXECUTABLE_FILENAME}"'
  Pop $0
  ${If} $0 != 0
    SetErrorLevel 1
    Abort "No se pudo registrar el comando oficina. Consulta el registro de instalacion."
  ${EndIf}
!macroend

!macro customUnInstall
  ${IfNot} ${isUpdated}
    nsExec::ExecToLog '"$INSTDIR\resources\bun\bun.exe" "$INSTDIR\resources\app.asar.unpacked\dist\terminal-launcher.js" --remove "$INSTDIR\${APP_EXECUTABLE_FILENAME}"'
    Pop $0
    ${If} $0 != 0
      DetailPrint "El comando oficina fue modificado o no pudo retirarse; se conserva."
    ${EndIf}
  ${EndIf}
!macroend
