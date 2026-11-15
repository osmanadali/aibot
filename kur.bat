@echo off
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 (
  echo Node.js bulunamadi. https://nodejs.org adresinden LTS surumunu kur, sonra bu dosyayi tekrar calistir.
  pause
  exit /b 1
)
call npm install --no-audit --no-fund
if errorlevel 1 (
  echo Kurulum basarisiz oldu.
  pause
  exit /b 1
)
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0kisayol.ps1"
echo.
echo Kurulum tamam. Masaustundeki Robot simgesine cift tiklayarak ac.
pause
