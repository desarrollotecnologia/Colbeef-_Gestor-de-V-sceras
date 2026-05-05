@echo off
setlocal
title Colbeef SIRT API - Desinstalacion de servicio

cd /d "%~dp0"

echo ============================================================
echo   Colbeef SIRT API - Desinstalacion del Servicio de Windows
echo ============================================================
echo.

net session >nul 2>&1
if %errorlevel% NEQ 0 (
    echo [ERROR] Esta ventana NO esta corriendo como Administrador.
    echo Cierra y abre con CLIC DERECHO ^> "Ejecutar como administrador".
    pause
    exit /b 1
)

echo --- Paso 1/2: Desinstalando servicio "Colbeef SIRT API" ---
node "scripts\service-uninstall.cjs"

echo.
echo --- Paso 2/2: Eliminando regla de firewall ---
powershell -NoProfile -Command "Get-NetFirewallRule -DisplayName 'Colbeef SIRT API 8013' -ErrorAction SilentlyContinue | Remove-NetFirewallRule -ErrorAction SilentlyContinue; Write-Host '[OK] Regla de firewall eliminada (si existia).'"

echo.
pause
endlocal
