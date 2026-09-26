@echo off
REM Genera Excel de usabilidad (ejecutar EN el servidor 205, con el servicio/MySQL local).
cd /d "%~dp0"
set FROM=%~1
set TO=%~2
if "%FROM%"=="" set FROM=2026-09-15
if "%TO%"=="" set TO=2026-09-26
echo Generando usabilidad %FROM% a %TO% ...
node scripts\usabilidad-export-excel.mjs --from=%FROM% --to=%TO% --out=%USERPROFILE%\Desktop\usabilidad_%FROM%_%TO%.xlsx
if errorlevel 1 (
  echo.
  echo Si fallo el API, el script usara MySQL local del gestor.
  echo Asegurese de correr este .bat en la PC 205.
  pause
  exit /b 1
)
echo.
echo Listo en el Escritorio: usabilidad_%FROM%_%TO%.xlsx
explorer "%USERPROFILE%\Desktop"
pause
