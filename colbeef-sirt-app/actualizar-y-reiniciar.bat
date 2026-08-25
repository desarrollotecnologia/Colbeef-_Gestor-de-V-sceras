@echo off
setlocal EnableExtensions
title Colbeef - Actualizar y reiniciar servicio
cd /d "%~dp0"

echo ============================================================
echo   Colbeef Gestor de Visceras
echo   Actualizar codigo + reiniciar servicio
echo ============================================================
echo.
echo Carpeta: %CD%
echo.

REM --- Privilegio admin (necesario para reiniciar el servicio) ---
net session >nul 2>&1
if %errorlevel% NEQ 0 (
    echo [AVISO] Se pedira permiso de Administrador para reiniciar el servicio.
    echo.
)

call "%~dp0scripts\read-env-port.bat"
if not defined SERVER_PORT set SERVER_PORT=3001

echo [1/5] Traer cambios de Git...
set "GIT_ROOT=%CD%"
if exist "%CD%\..\.git" set "GIT_ROOT=%CD%\.."
if exist "%GIT_ROOT%\.git" (
    pushd "%GIT_ROOT%"
    git status -sb
    echo.
    git pull
    if errorlevel 1 (
        echo.
        echo [ERROR] git pull fallo. Resuelva conflictos o conectividad y vuelva a intentar.
        popd
        pause
        exit /b 1
    )
    popd
    echo [OK] Codigo actualizado.
) else (
    echo [INFO] No hay repositorio Git aqui. Se omite git pull.
    echo        Copie los archivos nuevos manualmente y ejecute de nuevo este .bat
)
echo.

echo [2/5] npm install (dependencias)...
call npm install
if errorlevel 1 (
    echo [ERROR] npm install fallo.
    pause
    exit /b 1
)
echo [OK] Dependencias listas.
echo.

echo [3/5] Build frontend (Vite)...
call npm run build
if errorlevel 1 (
    echo [AVISO] Build fallo. Se reinicia igual ^(gestor.html se sirve desde client/^).
) else (
    echo [OK] Build listo.
)
echo.

echo [4/5] Reiniciando servicio "Colbeef SIRT API"...
REM "sc query" busca por NOMBRE de servicio: el real es colbeefsirtapi.exe.
REM "Colbeef SIRT API" es solo el nombre visible y no sirve para consultarlo.
set "SVC_NAME="
sc query "colbeefsirtapi.exe" >nul 2>&1
if not errorlevel 1 set "SVC_NAME=colbeefsirtapi.exe"
if not defined SVC_NAME (
    sc query "Colbeef SIRT API" >nul 2>&1
    if not errorlevel 1 set "SVC_NAME=Colbeef SIRT API"
)
if defined SVC_NAME (
    echo Servicio detectado: %SVC_NAME%
    powershell -NoProfile -Command "Start-Process powershell -Verb RunAs -ArgumentList '-NoProfile -ExecutionPolicy Bypass -File \"%~dp0scripts\deploy-restart-elevated.ps1\"' -Wait"
) else (
    echo [AVISO] No se encontro el servicio instalado.
    echo         El modo alternativo MATA el proceso que ocupe el puerto %SERVER_PORT% y arranca
    echo         un Node en una ventana suelta, sin arranque automatico. No usar en produccion.
    choice /C SN /N /M "Continuar de todas formas? [S=si / N=no] "
    if errorlevel 2 (
        echo Cancelado. Instale el servicio con install-service.bat
        pause
        exit /b 1
    )
    for /f "tokens=5" %%a in ('netstat -ano ^| findstr ":%SERVER_PORT% " ^| findstr "LISTENING"') do (
        echo Deteniendo PID %%a...
        taskkill /PID %%a /F >nul 2>&1
    )
    timeout /t 2 >nul
    start "Colbeef SIRT API" cmd /k "cd /d "%~dp0" && set NODE_ENV=production&& node server/index.js"
)
echo.

echo [5/5] Verificando...
timeout /t 3 >nul
if defined SVC_NAME (
    sc query "%SVC_NAME%" 2>nul | findstr /R "STATE ESTADO"
)
REM El puerto en escucha no prueba que el reinicio ocurriera: se consulta la API.
powershell -NoProfile -Command "try { $h = Invoke-RestMethod -Uri 'http://127.0.0.1:%SERVER_PORT%/api/health' -TimeoutSec 25; Write-Host ('[OK] API responde. db=' + $h.db + ' sirt=' + $h.sirt + ' mysql=' + $h.gestorMysql.ready) } catch { Write-Host ('[AVISO] La API no responde: ' + $_.Exception.Message) }"

echo.
echo ============================================================
echo   Despliegue terminado. Pruebe:
echo     http://localhost:%SERVER_PORT%/portal.html
echo     http://192.168.20.205:%SERVER_PORT%/portal.html
echo   Ctrl+F5 en el navegador para ver cambios.
echo ============================================================
echo.
pause
endlocal
