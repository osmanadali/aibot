@echo off
rem Robotun yeni surumu varsa indirip kurar ve ne oldugunu gosterir.
cd /d "%~dp0"
if not exist node_modules call npm install --no-audit --no-fund
node robot.js guncelle
echo.
pause
