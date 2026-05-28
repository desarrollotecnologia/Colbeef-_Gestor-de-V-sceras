@echo off
setlocal
title Colbeef SIRT API - Detener
cd /d "%~dp0"

echo Deteniendo Colbeef SIRT API (puerto 3001)...

for /f "tokens=5" %%a in ('netstat -ano ^| findstr ":3001 " ^| findstr "LISTENING"') do (
    echo Matando proceso PID %%a
    taskkill /PID %%a /F >nul 2>&1
)

echo Listo.
timeout /t 2 >nul
endlocal
