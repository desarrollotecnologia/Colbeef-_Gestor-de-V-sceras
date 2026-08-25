@echo off
REM Acceso rapido desde la raiz del repo: actualiza y reinicia el gestor.
cd /d "%~dp0colbeef-sirt-app"
if not exist "actualizar-y-reiniciar.bat" (
    echo No se encontro colbeef-sirt-app\actualizar-y-reiniciar.bat
    pause
    exit /b 1
)
call "actualizar-y-reiniciar.bat"
