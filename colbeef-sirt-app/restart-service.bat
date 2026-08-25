@echo off
setlocal EnableExtensions
title Colbeef SIRT API - Reinicio del servicio
cd /d "%~dp0"

echo ============================================================
echo   Reiniciando servicio "Colbeef SIRT API"
echo ============================================================
echo.
echo Solo reinicia el servicio: no trae cambios de Git ni recompila.
echo Para desplegar codigo nuevo use actualizar-y-reiniciar.bat
echo.
echo Acepte el aviso de Administrador que va a aparecer.
echo.

REM Reutiliza el mismo reinicio elevado del despliegue, en vez de repetir
REM aqui la logica de detencion, arranque y verificacion del servicio.
powershell -NoProfile -Command "Start-Process powershell -Verb RunAs -ArgumentList '-NoProfile -ExecutionPolicy Bypass -File \"%~dp0scripts\deploy-restart-elevated.ps1\"' -Wait"
if errorlevel 1 (
    echo.
    echo [ERROR] No se pudo elevar. El servicio NO se reinicio.
)

echo.
pause
endlocal
