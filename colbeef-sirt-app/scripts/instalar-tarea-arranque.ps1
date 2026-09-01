<#
  Registra la tarea que levanta el gestor al encender el equipo, pero solo
  cuando MySQL ya acepta consultas.

  Corre como SYSTEM: asi puede arrancar el servicio sin pedir permisos de
  administrador en cada encendido, y sin abrir ninguna ventana.

  Requiere ejecutarse elevado (instalar-tarea-arranque.bat lo hace solo).
  Sin acentos a proposito: PowerShell 5.1 lee los .ps1 sin BOM como ANSI.
#>
param(
  [string]$Nombre = 'Colbeef Gestor Visceras - Arranque',
  [int]$RetardoSeg = 20
)

$ErrorActionPreference = 'Stop'

$esAdmin = ([Security.Principal.WindowsPrincipal] [Security.Principal.WindowsIdentity]::GetCurrent()
).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
if (-not $esAdmin) {
  Write-Host '[ERROR] Ejecute esto como administrador (use instalar-tarea-arranque.bat).' -ForegroundColor Red
  exit 1
}

$script = Join-Path $PSScriptRoot 'esperar-mysql-y-levantar-gestor.ps1'
if (-not (Test-Path $script)) {
  Write-Host "[ERROR] No se encontro $script" -ForegroundColor Red
  exit 1
}

$accion = New-ScheduledTaskAction -Execute 'powershell.exe' -Argument (
  '-NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File "{0}"' -f $script
)

$disparador = New-ScheduledTaskTrigger -AtStartup
$disparador.Delay = "PT${RetardoSeg}S"

$principal = New-ScheduledTaskPrincipal -UserId 'SYSTEM' -LogonType ServiceAccount -RunLevel Highest

$ajustes = New-ScheduledTaskSettingsSet `
  -StartWhenAvailable `
  -MultipleInstances IgnoreNew `
  -ExecutionTimeLimit (New-TimeSpan -Minutes 40) `
  -AllowStartIfOnBatteries `
  -DontStopIfGoingOnBatteries

Register-ScheduledTask `
  -TaskName $Nombre `
  -Action $accion `
  -Trigger $disparador `
  -Principal $principal `
  -Settings $ajustes `
  -Description 'Espera a que MySQL acepte consultas y deja el gestor de visceras arriba. Si la base no responde no levanta nada. Registro: colbeef-sirt-app\server\data\arranque-gestor.log' `
  -Force | Out-Null

$t = Get-ScheduledTask -TaskName $Nombre
Write-Host ''
Write-Host "[OK] Tarea registrada: $Nombre" -ForegroundColor Green
Write-Host ("     estado   : " + $t.State)
Write-Host ("     usuario  : " + $t.Principal.UserId + " (nivel " + $t.Principal.RunLevel + ")")
Write-Host ("     disparo  : al encender, " + $RetardoSeg + "s despues")
Write-Host ("     script   : " + $script)
Write-Host ''
Write-Host 'Probarla sin reiniciar:  Start-ScheduledTask -TaskName "' -NoNewline
Write-Host $Nombre -NoNewline
Write-Host '"'
exit 0
