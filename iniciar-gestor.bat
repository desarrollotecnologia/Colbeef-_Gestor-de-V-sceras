@echo off
REM ============================================================================
REM Arranque del gestor: espera a MySQL y deja el servicio arriba.
REM
REM Si la base de datos no esta iniciada, no levanta nada y lo deja anotado en
REM colbeef-sirt-app\server\data\arranque-gestor.log
REM
REM Al encender el equipo lo ejecuta la tarea programada
REM "Colbeef Gestor Visceras - Arranque" (silenciosa, como SYSTEM).
REM Este .bat es para lanzarlo a mano cuando haga falta.
REM ============================================================================
setlocal
set "PS=%~dp0colbeef-sirt-app\scripts\esperar-mysql-y-levantar-gestor.ps1"

if not exist "%PS%" (
    echo No se encontro "%PS%"
    pause
    exit /b 1
)

REM Arrancar un servicio exige permisos de administrador.
net session >nul 2>&1
if errorlevel 1 (
    echo Elevando permisos para poder arrancar el servicio...
    powershell -NoProfile -ExecutionPolicy Bypass -Command "Start-Process powershell -Verb RunAs -ArgumentList '-NoProfile','-ExecutionPolicy','Bypass','-File','%PS%'"
    exit /b 0
)

powershell -NoProfile -ExecutionPolicy Bypass -File "%PS%"
echo.
pause
endlocal
