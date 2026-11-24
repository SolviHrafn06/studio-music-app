Unicode true
!include "MUI2.nsh"
Name "Studio"
OutFile "Studio-Setup.exe"
InstallDir "$LOCALAPPDATA\Programs\Studio"
InstallDirRegKey HKCU "Software\Studio" "InstallDir"
RequestExecutionLevel user
SetCompressor /SOLID lzma
!define MUI_ICON "icon.ico"
!define MUI_UNICON "icon.ico"
!define MUI_WELCOMEPAGE_TITLE "Welcome to Studio"
!define MUI_WELCOMEPAGE_TEXT "Studio is a free music maker: beats, real instruments, synths, mixing, vocals and built-in Auto-Tune.$\r$\n$\r$\nNo admin rights needed. Click Next to continue."
!define MUI_FINISHPAGE_RUN "$INSTDIR\Studio.exe"
!define MUI_FINISHPAGE_RUN_TEXT "Open Studio now"
!insertmacro MUI_PAGE_WELCOME
!insertmacro MUI_PAGE_DIRECTORY
!insertmacro MUI_PAGE_INSTFILES
!insertmacro MUI_PAGE_FINISH
!insertmacro MUI_UNPAGE_CONFIRM
!insertmacro MUI_UNPAGE_INSTFILES
!insertmacro MUI_LANGUAGE "English"
VIProductVersion "3.1.0.0"
VIAddVersionKey "ProductName" "Studio"
VIAddVersionKey "FileDescription" "Studio installer"
VIAddVersionKey "FileVersion" "3.1.0"
VIAddVersionKey "LegalCopyright" "Free software"

Section "Install"
  SetOutPath "$INSTDIR"
  File "Studio.exe"
  File "resources.neu"
  File "icon.ico"
  File "README.txt"
  WriteUninstaller "$INSTDIR\Uninstall.exe"
  CreateDirectory "$SMPROGRAMS\Studio"
  CreateShortcut "$SMPROGRAMS\Studio\Studio.lnk" "$INSTDIR\Studio.exe" "" "$INSTDIR\icon.ico" 0
  CreateShortcut "$SMPROGRAMS\Studio\Uninstall Studio.lnk" "$INSTDIR\Uninstall.exe"
  CreateShortcut "$DESKTOP\Studio.lnk" "$INSTDIR\Studio.exe" "" "$INSTDIR\icon.ico" 0
  ; .studio project files open in Studio
  WriteRegStr HKCU "Software\Classes\.studio" "" "Studio.Project"
  WriteRegStr HKCU "Software\Classes\Studio.Project" "" "Studio Project"
  WriteRegStr HKCU "Software\Classes\Studio.Project\DefaultIcon" "" "$INSTDIR\icon.ico"
  WriteRegStr HKCU "Software\Classes\Studio.Project\shell\open\command" "" '"$INSTDIR\Studio.exe" --path="$INSTDIR" "%1"'
  WriteRegStr HKCU "Software\Studio" "InstallDir" "$INSTDIR"
  WriteRegStr HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\Studio" "DisplayName" "Studio"
  WriteRegStr HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\Studio" "DisplayIcon" "$INSTDIR\icon.ico"
  WriteRegStr HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\Studio" "DisplayVersion" "3.1.0"
  WriteRegStr HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\Studio" "Publisher" "Studio"
  WriteRegStr HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\Studio" "UninstallString" '"$INSTDIR\Uninstall.exe"'
  WriteRegDWORD HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\Studio" "NoModify" 1
  WriteRegDWORD HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\Studio" "NoRepair" 1
  System::Call 'shell32::SHChangeNotify(i 0x08000000, i 0, p 0, p 0)'
SectionEnd

Section "Uninstall"
  Delete "$INSTDIR\Studio.exe"
  Delete "$INSTDIR\resources.neu"
  Delete "$INSTDIR\icon.ico"
  Delete "$INSTDIR\README.txt"
  Delete "$INSTDIR\Uninstall.exe"
  RMDir /r "$INSTDIR\.tmp"
  RMDir "$INSTDIR"
  Delete "$SMPROGRAMS\Studio\Studio.lnk"
  Delete "$SMPROGRAMS\Studio\Uninstall Studio.lnk"
  RMDir "$SMPROGRAMS\Studio"
  Delete "$DESKTOP\Studio.lnk"
  DeleteRegKey HKCU "Software\Classes\.studio"
  DeleteRegKey HKCU "Software\Classes\Studio.Project"
  DeleteRegKey HKCU "Software\Studio"
  DeleteRegKey HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\Studio"
  System::Call 'shell32::SHChangeNotify(i 0x08000000, i 0, p 0, p 0)'
SectionEnd
