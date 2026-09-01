@echo off
REM ============================================================================
REM Registra la tarea que levanta el gestor al encender el equipo, esperando
REM antes a que MySQL acepte consultas. Se ejecuta una sola vez por maquina.
REM
REM La tarea corre como SYSTEM: no pide permisos en cada encendido ni abre
REM ventanas. Registro en colbeef-sirt-app\server\data\arranque-gestor.log
REM ============================================================================
setlocal
set "PS=%~dp0colbeef-sirt-app\scripts\instalar-tarea-arranque.ps1"

if not exist "%PS%" (
    echo No se encontro "%PS%"
    pause
    exit /b 1
)

net session >nul 2>&1
if errorlevel 1 (
    echo Elevando permisos para registrar la tarea...
    powershell -NoProfile -ExecutionPolicy Bypass -Command "Start-Process powershell -Verb RunAs -ArgumentList '-NoProfile','-ExecutionPolicy','Bypass','-File','%PS%'"
    exit /b 0
)

powershell -NoProfile -ExecutionPolicy Bypass -File "%PS%"
echo.
pause
endlocal
