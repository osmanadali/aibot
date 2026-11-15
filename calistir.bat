@echo off
rem Cift tiklaninca "oyun-gorselleri" akisini calistirir.
rem Komut satirindan baska bir gorev de verilebilir:  calistir.bat gorsel-uret
cd /d "%~dp0"
if not exist node_modules call npm install --no-audit --no-fund
if "%~1"=="" (
  node robot.js oyun-gorselleri
) else (
  node robot.js %*
)
echo.
pause
