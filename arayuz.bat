@echo off
rem Robotun arayuzunu tarayicida acar. Kapatmak icin bu pencereyi kapat.
cd /d "%~dp0"
if not exist node_modules call npm install --no-audit --no-fund
node robot.js arayuz
echo.
pause
