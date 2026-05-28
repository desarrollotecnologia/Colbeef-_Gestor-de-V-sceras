@echo off
setlocal
title Colbeef SIRT API - Instalacion de servicio

cd /d "%~dp0"
call "%~dp0scripts\read-env-port.bat"

echo ============================================================
echo   Colbeef SIRT API - Instalacion como Servicio de Windows
echo ============================================================
echo.

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
echo Puerto (.env): %SERVER_PORT%
echo.

echo --- Paso 1/2: Registrando servicio "Colbeef SIRT API" ---
node "scripts\service-install.cjs"
if %errorlevel% NEQ 0 (
    echo.
    echo [ERROR] node devolvio codigo %errorlevel%.
)

echo.
echo --- Paso 2/2: Abriendo puerto %SERVER_PORT% en Firewall de Windows ---
powershell -NoProfile -ExecutionPolicy Bypass -File "scripts\update-service-port-elevated.ps1"

echo.
echo --- Resumen ---
sc query "Colbeef SIRT API" 2>nul | findstr /R "SERVICE_NAME STATE"

echo.
echo ============================================================
echo Instalacion completa. Verifica con:
echo    http://localhost:%SERVER_PORT%/gestor.html
echo    http://192.168.20.205:%SERVER_PORT%/gestor.html
echo ============================================================
echo.
pause
endlocal
