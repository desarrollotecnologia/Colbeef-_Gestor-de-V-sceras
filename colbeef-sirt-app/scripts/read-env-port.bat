@echo off
set "SERVER_PORT=3001"
if exist "%~dp0..\.env" (
  for /f "usebackq tokens=2 delims==" %%p in (`findstr /r /c:"^SERVER_PORT=" "%~dp0..\.env" 2^>nul`) do set "SERVER_PORT=%%p"
)
