@echo off
cd /d "%~dp0"
title GitHub Upload
echo =====================================================
echo   Uploading code to GitHub...
echo.
echo   A GitHub login window or browser may open.
echo   Please sign in with your GitHub account (soulmkt1).
echo   You only need to do this once.
echo =====================================================
echo.
git push -u origin main
echo.
if errorlevel 1 (
  echo [FAILED] Please screenshot this window and send it.
) else (
  echo [SUCCESS] Upload complete. You can close this window.
)
echo.
pause
