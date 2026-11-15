@echo off
rem Masaustune "Robot" kisayolunu ekler.
cd /d "%~dp0"
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0kisayol.ps1"
echo.
pause
