@echo off
echo Installing DeadStock Shortcut...

set "SCRIPT_DIR=%~dp0"
set "EXE_PATH=%SCRIPT_DIR%DeadStock.exe"
set "SHORTCUT_PATH=%USERPROFILE%\Desktop\DeadStock.lnk"

if not exist "%EXE_PATH%" (
    echo Error: DeadStock.exe not found in current folder!
    pause
    exit /b
)

powershell "$s=(New-Object -COM WScript.Shell).CreateShortcut('%SHORTCUT_PATH%');$s.TargetPath='%EXE_PATH%';$s.WorkingDirectory='%SCRIPT_DIR%';$s.Save()"

echo Shortcut created on Desktop!
echo You can now launch DeadStock from your desktop.
timeout /t 3 >nul
