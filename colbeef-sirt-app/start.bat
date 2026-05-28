@echo off
setlocal
title Colbeef SIRT API
cd /d "%~dp0"
call "%~dp0scripts\read-env-port.bat"

echo Iniciando Colbeef SIRT API...
echo Puerto: %SERVER_PORT%  ^|  Gestor: http://localhost:%SERVER_PORT%/gestor.html
echo.
echo Presiona Ctrl+C para detener.
echo.

set NODE_ENV=production
node server/index.js
endlocal
