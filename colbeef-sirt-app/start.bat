@echo off
setlocal
title Colbeef SIRT API
cd /d "%~dp0"

echo Iniciando Colbeef SIRT API...
echo Puerto: 3001  ^|  Gestor: http://localhost:3001/gestor.html
echo.
echo Presiona Ctrl+C para detener.
echo.

node server/index.js
endlocal
