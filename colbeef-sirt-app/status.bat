@echo off
setlocal
title Colbeef SIRT API - Estado
cd /d "%~dp0"

echo ============================================================
echo   Colbeef SIRT API - Estado del servidor
echo ============================================================
echo.

netstat -ano | findstr ":3001 " | findstr "LISTENING" >nul 2>&1
if %errorlevel% EQU 0 (
    echo [ACTIVO] El servidor esta corriendo en el puerto 3001.
    echo.
    echo Gestor:    http://localhost:3001/gestor.html
    echo Health:    http://localhost:3001/api/health
    echo.
    echo Proceso:
    netstat -ano | findstr ":3001 " | findstr "LISTENING"
) else (
    echo [DETENIDO] No hay proceso escuchando en el puerto 3001.
)

echo.
echo --- Ultimas lineas del log ---
if exist "server\data\server.log" (
    powershell -NoProfile -Command "Get-Content 'server\data\server.log' -Tail 10"
)

echo.
pause
endlocal
