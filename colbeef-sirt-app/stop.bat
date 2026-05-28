@echo off
setlocal
title Colbeef SIRT API - Detener
cd /d "%~dp0"
call "%~dp0scripts\read-env-port.bat"

echo Deteniendo Colbeef SIRT API (puerto %SERVER_PORT%)...

for /f "tokens=5" %%a in ('netstat -ano ^| findstr ":%SERVER_PORT% " ^| findstr "LISTENING"') do (
    echo Matando proceso PID %%a
    taskkill /PID %%a /F >nul 2>&1
)

echo Listo.
timeout /t 2 >nul
endlocal
