@echo off
rem Robotu sahte bir ChatGPT sayfasiyla dener; gercek hesaba dokunmaz.
cd /d "%~dp0"
if not exist node_modules call npm install --no-audit --no-fund
node test\deneme.js
echo.
pause
