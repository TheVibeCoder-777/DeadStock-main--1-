; Classic NSIS Script for DeadStock
Name "DeadStock"
OutFile "release\DeadStock_Setup.exe"
InstallDir "$PROGRAMFILES64\DeadStock"
RequestExecutionLevel admin

Page directory
Page instfiles

Section "Main"
  SetOutPath "$INSTDIR"
  File /r "release\DeadStock-win32-x64\*"
  
  WriteUninstaller "$INSTDIR\Uninstall.exe"
  
  CreateDirectory "$SMPROGRAMS\DeadStock"
  CreateShortcut "$SMPROGRAMS\DeadStock\DeadStock.lnk" "$INSTDIR\DeadStock.exe"
  CreateShortcut "$DESKTOP\DeadStock.lnk" "$INSTDIR\DeadStock.exe"
SectionEnd

Section "Uninstall"
  RMDir /r "$INSTDIR"
  RMDir /r "$SMPROGRAMS\DeadStock"
  Delete "$DESKTOP\DeadStock.lnk"
SectionEnd
