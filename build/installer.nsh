!include "LogicLib.nsh"
!include "Sections.nsh"
!include "MUI2.nsh"

!define ADDOM_KEEP_LOCAL_DATA_SECTION_IDX 1

!macro DeleteVaultArtifacts profileRoot
  Delete "${profileRoot}\vault.json"
  Delete "${profileRoot}\vault.json.*.tmp"
!macroend

!macro RemoveProfileRoot profileRoot
  RMDir /r "${profileRoot}"
!macroend

!macro customUnWelcomePage
  !define MUI_WELCOMEPAGE_TITLE "Delete Local ADDOM Data"
  !define MUI_WELCOMEPAGE_TEXT "ADDOM stores local data on this Windows account.$\r$\n$\r$\nThat data can include encrypted API keys, conversation history, memory logs, artifacts, project sessions, settings, and cached attachment contents.$\r$\n$\r$\nFor security, uninstall will delete all local data by default.$\r$\n$\r$\nIf you keep local history and settings, API keys will still be deleted, but anyone with access to this Windows account may still be able to read retained local data."
  !insertmacro MUI_UNPAGE_WELCOME
!macroend

!macro customUnInstallSection
  Section /o "un.Keep local history and settings after uninstall" addomKeepLocalDataSection
  SectionEnd
!macroend

!macro customUnInstall
  Push $R0
  StrCpy $R0 "0"
  ${If} ${SectionIsSelected} ${ADDOM_KEEP_LOCAL_DATA_SECTION_IDX}
    StrCpy $R0 "1"
  ${EndIf}

  ${if} ${isUpdated}
    Goto addom_local_data_cleanup_done
  ${endif}

  RMDir /r "$TEMP\addom-attachments"

  ${if} $installMode == "all"
    SetShellVarContext current
  ${endif}

  ${if} $R0 == "1"
    !insertmacro DeleteVaultArtifacts "$APPDATA\${APP_FILENAME}"
    !ifdef APP_PRODUCT_FILENAME
      !insertmacro DeleteVaultArtifacts "$APPDATA\${APP_PRODUCT_FILENAME}"
    !endif
    !ifdef APP_PACKAGE_NAME
      !insertmacro DeleteVaultArtifacts "$APPDATA\${APP_PACKAGE_NAME}"
    !endif
  ${else}
    !insertmacro RemoveProfileRoot "$APPDATA\${APP_FILENAME}"
    !ifdef APP_PRODUCT_FILENAME
      !insertmacro RemoveProfileRoot "$APPDATA\${APP_PRODUCT_FILENAME}"
    !endif
    !ifdef APP_PACKAGE_NAME
      !insertmacro RemoveProfileRoot "$APPDATA\${APP_PACKAGE_NAME}"
    !endif
  ${endif}

  ${if} $installMode == "all"
    SetShellVarContext all
  ${endif}

  addom_local_data_cleanup_done:
  Pop $R0
!macroend
