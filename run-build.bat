@echo off
setlocal

rem Always run from this script's own folder, no matter where it's launched from.
cd /d "%~dp0"

if not exist node_modules (
    echo Installing dependencies...
    call npm install
    if errorlevel 1 goto :error
)

echo Building production bundle...
call npm run build
if errorlevel 1 goto :error

echo.
echo Build succeeded. Starting preview server...
echo Use Chrome or Edge - the workspace picker needs the File System Access API.
echo Press Ctrl+C to stop.
echo.
call npm run preview

goto :eof

:error
echo.
echo Build failed - see the output above.
pause
exit /b 1
