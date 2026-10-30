@echo off
rem Starts the dashboard server in the background (if not already running)
rem and opens the dashboard in its own Edge window.
rem   start-dashboard.cmd kiosk   -> full screen, no bars (see start-dashboard-fullscreen.cmd)
setlocal
set PORT=8000
set URL=http://localhost:%PORT%
cd /d "%~dp0"

rem pythonw runs without a console window; pyw is the same via the Python launcher,
rem for installs where Python itself isn't on PATH.
set PYW=pythonw
where pythonw >nul 2>nul || set PYW=pyw

call :ping
if errorlevel 1 (
  start "" %PYW% server.py %PORT%
  rem Wait up to ~10 seconds for the server to answer.
  for /l %%i in (1,1,20) do (
    call :ping && goto open
    powershell -NoProfile -Command "Start-Sleep -Milliseconds 500"
  )
  echo The dashboard server did not start.
  echo If this PC is new, run install-dashboard.cmd first. Otherwise try:  python server.py
  pause
  exit /b 1
)

:open
if /i "%~1"=="kiosk" (
  rem Not --kiosk: Edge's full-screen kiosk is always InPrivate and would forget the picked city.
  rem A separate profile makes Edge start a new process, so --start-fullscreen applies even when
  rem Edge is already open. ?kiosk makes the page show its own Close button.
  start "" msedge --app="%URL%/?kiosk" --start-fullscreen --no-first-run --user-data-dir="%LOCALAPPDATA%\HomeDashboardKiosk"
) else (
  start "" msedge --app=%URL%
)
exit /b 0

:ping
rem 127.0.0.1, not localhost: the server listens on IPv4 only, and the IPv6 attempt for "localhost" is slow.
powershell -NoProfile -Command "try { Invoke-WebRequest http://127.0.0.1:%PORT%/api/calendars -UseBasicParsing -TimeoutSec 3 | Out-Null; exit 0 } catch { exit 1 }"
exit /b %errorlevel%
