@echo off
setlocal
title Colbeef SIRT API - Reiniciar
cd /d "%~dp0"
call "%~dp0scripts\read-env-port.bat"

echo Reiniciando Colbeef SIRT API (puerto %SERVER_PORT%)...

sc query "Colbeef SIRT API" >nul 2>&1
if %errorlevel% EQU 0 (
    echo Reiniciando servicio de Windows...
    powershell -NoProfile -Command "Start-Process powershell -Verb RunAs -ArgumentList '-NoProfile -ExecutionPolicy Bypass -File \"%~dp0scripts\update-service-port-elevated.ps1\"' -Wait"
    goto :done
)

for /f "tokens=5" %%a in ('netstat -ano ^| findstr ":%SERVER_PORT% " ^| findstr "LISTENING"') do (
    echo Deteniendo PID %%a...
    taskkill /PID %%a /F >nul 2>&1
)

timeout /t 2 >nul

echo Iniciando...
start "Colbeef SIRT API" cmd /k "cd /d "%~dp0" && set NODE_ENV=production&& node server/index.js"

:done
echo Servidor reiniciado. Puerto %SERVER_PORT%.
timeout /t 3 >nul
endlocal
