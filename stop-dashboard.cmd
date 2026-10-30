@echo off
rem Stops the background dashboard server started by start-dashboard.cmd.
powershell -NoProfile -Command "$c = Get-NetTCPConnection -LocalPort 8000 -State Listen -ErrorAction SilentlyContinue; if ($c) { $c | ForEach-Object { Stop-Process -Id $_.OwningProcess -Force }; 'Dashboard server stopped.' } else { 'Dashboard server is not running.' }"
timeout /t 3 >nul
