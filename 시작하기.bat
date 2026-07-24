@echo off
chcp 65001 >nul
cd /d "%~dp0"
title DB Dashboard Server
set "NODE_EXE=node"
where node >nul 2>nul || set "NODE_EXE=%ProgramFiles%\nodejs\node.exe"
if not exist "dist\index.html" call "%ProgramFiles%\nodejs\npm.cmd" run build
"%NODE_EXE%" server\server.mjs
pause
