@echo off
setlocal
title Colbeef SIRT API - Instalacion de servicio

REM Cambiar al directorio del proyecto (donde esta este .bat)
cd /d "%~dp0"

echo ============================================================
echo   Colbeef SIRT API - Instalacion como Servicio de Windows
echo ============================================================
echo.

REM Verificar privilegios de administrador
net session >nul 2>&1
if %errorlevel% NEQ 0 (
    echo [ERROR] Esta ventana NO esta corriendo como Administrador.
    echo.
    echo Cierra esta ventana y vuelve a abrir el archivo:
    echo    install-service.bat
    echo con CLIC DERECHO ^> "Ejecutar como administrador".
    echo.
    pause
    exit /b 1
)

echo [OK] Privilegios de Administrador detectados.
echo.
echo Usuario: %USERNAME%
echo Carpeta: %CD%
echo.

echo --- Paso 1/2: Registrando servicio "Colbeef SIRT API" ---
node "scripts\service-install.cjs"
if %errorlevel% NEQ 0 (
    echo.
    echo [ERROR] node devolvio codigo %errorlevel%.
)

echo.
echo --- Paso 2/2: Abriendo puerto 8013 en Firewall de Windows ---
powershell -NoProfile -Command "Get-NetFirewallRule -DisplayName 'Colbeef SIRT API 8013' -ErrorAction SilentlyContinue | Remove-NetFirewallRule -ErrorAction SilentlyContinue; New-NetFirewallRule -DisplayName 'Colbeef SIRT API 8013' -Description 'Permite trafico TCP entrante al servicio Colbeef SIRT API en el puerto 8013.' -Direction Inbound -Action Allow -Protocol TCP -LocalPort 8013 -Profile Any -Enabled True | Out-Null; Write-Host '[OK] Regla de firewall creada (TCP/8013 Inbound Allow).'"

echo.
echo --- Resumen ---
sc query "Colbeef SIRT API" 2>nul | findstr /R "SERVICE_NAME STATE"
powershell -NoProfile -Command "Get-NetFirewallRule -DisplayName 'Colbeef SIRT API 8013' -ErrorAction SilentlyContinue | Format-Table DisplayName, Enabled, Direction, Action -AutoSize"

echo.
echo ============================================================
echo Instalacion completa. Verifica con:
echo    http://localhost:8013/api/health
echo    http://192.168.20.205:8013/api/health
echo ============================================================
echo.
pause
endlocal
