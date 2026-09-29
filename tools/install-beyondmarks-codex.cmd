@echo off
setlocal
title BeyondMarks Codex Setup
powershell.exe -NoLogo -NoProfile -ExecutionPolicy Bypass -File "%~dp0configure-codex-apim.ps1"
echo.
if errorlevel 1 (
  echo Setup failed. Read the message above, then run this installer again.
) else (
  echo Setup finished. You may now close this window and reopen Codex.
)
pause
endlocal
