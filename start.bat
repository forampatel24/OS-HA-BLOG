@echo off
title Foram's OS Journal
cd /d "%~dp0"

where node >nul 2>nul
if errorlevel 1 (
  echo.
  echo Node.js is required to run this blog.
  echo Install it from https://nodejs.org and then run this file again.
  echo.
  pause
  exit /b 1
)

echo.
echo Starting Foram's OS Journal...
echo The site will open at http://localhost:3000
echo Keep this window open while you use the blog. Press Ctrl+C to stop it.
echo.

start "" cmd /c "timeout /t 2 >nul & start http://localhost:3000"
node server.js

echo.
echo The server has stopped.
pause
