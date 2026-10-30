@echo off
rem Prepares this PC to run the dashboard (installs Python if needed). Safe to run again.
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0install-dashboard.ps1"
echo.
pause
