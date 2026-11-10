!macro customInstall
  InitPluginsDir
  SetOutPath "$PLUGINSDIR"
  File /oname=omp-maintenance.ts "${PROJECT_DIR}\src\omp-maintenance.ts"
  File /oname=omp-install.ts "${PROJECT_DIR}\src\omp-install.ts"
  SetOutPath "$INSTDIR"
  nsExec::ExecToLog '"$INSTDIR\resources\bun\bun.exe" "$PLUGINSDIR\omp-install.ts"'
  Pop $0
  ${If} $0 != 0
    SetErrorLevel 1
    Abort "No se pudo instalar omp. Comprueba la conexion e intenta instalar de nuevo."
  ${EndIf}
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
