@echo off
setlocal
title Colbeef SIRT API - Reiniciar
cd /d "%~dp0"

echo Reiniciando Colbeef SIRT API...

for /f "tokens=5" %%a in ('netstat -ano ^| findstr ":3001 " ^| findstr "LISTENING"') do (
    echo Deteniendo PID %%a...
    taskkill /PID %%a /F >nul 2>&1
)

timeout /t 2 >nul

echo Iniciando...
start "Colbeef SIRT API" cmd /k "cd /d "%~dp0" && node server/index.js"

echo Servidor reiniciado. Puerto 3001.
timeout /t 3 >nul
endlocal
