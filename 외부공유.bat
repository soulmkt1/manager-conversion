@echo off
chcp 65001 >nul
cd /d "%~dp0"
title DB Dashboard - External Share (Tunnel)
set "NODE_EXE=node"
where node >nul 2>nul || set "NODE_EXE=%ProgramFiles%\nodejs\node.exe"
set "CF=%~dp0server\bin\cloudflared.exe"
if not exist "%CF%" set "CF=%ProgramFiles(x86)%\cloudflared\cloudflared.exe"
if not exist "dist\index.html" call "%ProgramFiles%\nodejs\npm.cmd" run build
netstat -ano | findstr :8787 | findstr LISTENING >nul
if errorlevel 1 (
  echo [server] starting...
  start "DB Dashboard Server" "%NODE_EXE%" server\server.mjs
  timeout /t 3 >nul
)
echo.
echo =====================================================
echo   Share the https://xxxx.trycloudflare.com address
echo   shown below with people in other locations.
echo   Password is set in server\config.json
echo   (Closing this window stops external access.)
echo =====================================================
echo.
"%CF%" tunnel --url http://localhost:8787
pause
