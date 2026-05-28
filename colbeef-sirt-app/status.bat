@echo off
setlocal
title Colbeef SIRT API - Estado
cd /d "%~dp0"
call "%~dp0scripts\read-env-port.bat"

echo ============================================================
echo   Colbeef SIRT API - Estado del servidor
echo ============================================================
echo.
echo Puerto configurado: %SERVER_PORT%
echo.

netstat -ano | findstr ":%SERVER_PORT% " | findstr "LISTENING" >nul 2>&1
if %errorlevel% EQU 0 (
    echo [ACTIVO] El servidor esta corriendo en el puerto %SERVER_PORT%.
    echo.
    echo Gestor:    http://localhost:%SERVER_PORT%/gestor.html
    echo Health:    http://localhost:%SERVER_PORT%/api/health
    echo.
    echo Proceso:
    netstat -ano | findstr ":%SERVER_PORT% " | findstr "LISTENING"
) else (
    echo [DETENIDO] No hay proceso escuchando en el puerto %SERVER_PORT%.
)

echo.
sc query "Colbeef SIRT API" 2>nul | findstr /R "SERVICE_NAME STATE"

echo.
echo --- Ultimas lineas del log ---
if exist "server\data\server.log" (
    powershell -NoProfile -Command "Get-Content 'server\data\server.log' -Tail 10"
)

echo.
pause
endlocal
