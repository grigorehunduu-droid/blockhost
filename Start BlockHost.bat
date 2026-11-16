@echo off
setlocal EnableExtensions
cd /d "%~dp0"
title BlockHost

rem --- 1. Already running? Just open the window. ---
set "PORT="
for /f "tokens=1,2 delims=|" %%p in ('powershell -NoProfile -ExecutionPolicy Bypass -File "app\ping.ps1"') do (set "PORT=%%p" & set "BOOT=%%q")
if defined PORT goto :open

rem --- 2. Find Node 18+ (bundled first, then PATH). ---
set "NODE="
if exist "runtime\node\node.exe" set "NODE=%~dp0runtime\node\node.exe"
if not defined NODE for /f "delims=" %%n in ('where node 2^>nul') do if not defined NODE call :check "%%n"
if defined NODE goto :run

rem --- 3. Download portable Node LTS (one time). ---
echo Setting up BlockHost for the first time (downloading Node.js, about 30 MB)...
powershell -NoProfile -ExecutionPolicy Bypass -File "app\get-node.ps1"
if not exist "runtime\node\node.exe" (
  echo.
  echo Could not download Node.js. Check your internet connection and try again.
  pause
  exit /b 1
)
set "NODE=%~dp0runtime\node\node.exe"

:run
rem --- 4. Start the backend hidden and wait for it to answer. ---
powershell -NoProfile -ExecutionPolicy Bypass -File "app\start-backend.ps1" "%NODE%"
set "TRIES=0"
:wait
set "PORT="
for /f "tokens=1,2 delims=|" %%p in ('powershell -NoProfile -ExecutionPolicy Bypass -File "app\ping.ps1"') do (set "PORT=%%p" & set "BOOT=%%q")
if defined PORT goto :open
set /a TRIES+=1
if %TRIES% GEQ 20 (
  echo The app did not start. See data\logs\node.err
  pause
  exit /b 1
)
timeout /t 1 /nobreak >nul
goto :wait

:open
set "URL=http://127.0.0.1:%PORT%/?boot=%BOOT%"
set "BROWSER="
for %%b in ("%ProgramFiles(x86)%\Microsoft\Edge\Application\msedge.exe" "%ProgramFiles%\Microsoft\Edge\Application\msedge.exe" "%ProgramFiles%\Google\Chrome\Application\chrome.exe" "%ProgramFiles(x86)%\Google\Chrome\Application\chrome.exe" "%LocalAppData%\Google\Chrome\Application\chrome.exe") do if not defined BROWSER if exist %%b set "BROWSER=%%~b"
if defined BROWSER (
  start "" "%BROWSER%" --app=%URL%
) else (
  start "" "%URL%"
)
exit /b 0

:check
"%~1" "%~dp0app\nodever.js" && set "NODE=%~1"
exit /b 0
