@echo off
setlocal
title Colbeef SIRT API - Desinstalacion de servicio

cd /d "%~dp0"
call "%~dp0scripts\read-env-port.bat"

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
echo --- Paso 2/2: Eliminando reglas de firewall ---
powershell -NoProfile -Command "@('Colbeef SIRT API 3001','Colbeef SIRT API 8013','Colbeef SIRT API %SERVER_PORT%') | ForEach-Object { Remove-NetFirewallRule -DisplayName $_ -ErrorAction SilentlyContinue }; Write-Host '[OK] Reglas de firewall eliminadas (si existian).'"

echo.
pause
endlocal
