!include "FileFunc.nsh"

Function un.AuditNoReparsePoints
  Exch $0
  Push $1
  Push $2
  Push $3
  Push $4
  Push $5
  Push $6
  StrCpy $6 "1"

  ClearErrors
  System::Call 'kernel32::GetFileAttributesW(w r0) i .r1'
  StrCmp "$1" "-1" audit_missing_or_error

  IntOp $2 $1 & 0x400
  StrCmp "$2" "0" audit_check_directory audit_unsafe

audit_check_directory:
  IntOp $2 $1 & 0x10
  StrCmp "$2" "0" audit_done

  ClearErrors
  FindFirst $3 $4 "$0\*"
  IfErrors audit_find_error

audit_next_entry:
  StrCmp "$4" "" audit_close
  StrCmp "$4" "." audit_advance
  StrCmp "$4" ".." audit_advance

  Push "$0\$4"
  Call un.AuditNoReparsePoints
  Pop $5
  StrCmp "$5" "1" audit_advance audit_close_unsafe

audit_advance:
  ClearErrors
  FindNext $3 $4
  IfErrors audit_find_next_error
  Goto audit_next_entry

audit_find_next_error:
  System::Call 'kernel32::GetLastError() i .r2'
  StrCmp "$2" "18" audit_close audit_close_unsafe

audit_close_unsafe:
  FindClose $3
  Goto audit_unsafe

audit_close:
  FindClose $3
  Goto audit_done

audit_find_error:
  System::Call 'kernel32::GetLastError() i .r2'
  StrCmp "$2" "2" audit_done
  Goto audit_unsafe

audit_missing_or_error:
  System::Call 'kernel32::GetLastError() i .r2'
  StrCmp "$2" "2" audit_done
  StrCmp "$2" "3" audit_done
  Goto audit_unsafe

audit_unsafe:
  StrCpy $6 "0"

audit_done:
  StrCpy $0 "$6"
  Pop $6
  Pop $5
  Pop $4
  Pop $3
  Pop $2
  Pop $1
  Exch $0
FunctionEnd

!macro customInstall
  nsExec::ExecToStack '"$SYSDIR\cmd.exe" /D /S /C "set ELECTRON_RUN_AS_NODE=1&& $\"$INSTDIR\AgenteCPI.exe$\" $\"$INSTDIR\resources\app.asar\out\main\install-playwright-chromium.js$\""'
  Pop $0
  Pop $2

  ${If} $0 != 0
    ClearErrors
    ExecWait '"$INSTDIR\${UNINSTALL_FILENAME}" /S' $1
    IfErrors rollback_failed
    StrCmp "$1" "0" rollback_complete rollback_failed

  rollback_failed:
    DetailPrint "A reversão da instalação não foi concluída corretamente."

  rollback_complete:
    Abort "Não foi possível preparar o Chromium necessário. Tente instalar novamente."
  ${EndIf}
!macroend

!macro customUnInstallSection
  Section /o "Remover dados locais do Agente CPI" SEC_REMOVE_APP_DATA
    StrCmp "$APPDATA" "" cleanup_refused

    ClearErrors
    GetFullPathName $0 "$APPDATA"
    IfErrors cleanup_refused
    StrCmp "$0" "$APPDATA" 0 cleanup_refused

    ${GetRoot} "$0" $1
    StrCmp "$1" "" cleanup_refused
    StrCmp "$0" "$1" cleanup_refused
    StrCmp "$0" "$1\" cleanup_refused

    ClearErrors
    GetFullPathName $2 "$0\agente-cpi"
    IfErrors cleanup_refused
    StrCmp "$2" "$0\agente-cpi" 0 cleanup_refused
    ${GetParent} "$2" $4
    StrCmp "$4" "$0" 0 cleanup_refused

    ClearErrors
    GetFullPathName $3 "$0\AgenteCPI"
    IfErrors cleanup_refused
    StrCmp "$3" "$0\AgenteCPI" 0 cleanup_refused
    ${GetParent} "$3" $4
    StrCmp "$4" "$0" 0 cleanup_refused

    Push "$2"
    Call un.AuditNoReparsePoints
    Pop $5
    Push "$3"
    Call un.AuditNoReparsePoints
    Pop $6
    StrCmp "$5" "1" 0 cleanup_refused
    StrCmp "$6" "1" 0 cleanup_refused

    RMDir /r "$APPDATA\agente-cpi"
    RMDir /r "$APPDATA\AgenteCPI"
    Goto cleanup_done

  cleanup_refused:
    DetailPrint "Limpeza de dados locais recusada por caminho inválido."

  cleanup_done:
  SectionEnd
!macroend
