<#
  Arranque del gestor atado a MySQL.

  El servicio ya depende de MySQL80 y espera 90 segundos a la base, pero si
  MySQL tarda mas de lo que aguantan sus reintentos se queda abajo y hay que
  arrancarlo a mano. Este script espera a que la base acepte consultas de
  verdad y solo entonces deja el gestor arriba.

  Si la base nunca responde no levanta nada: es preferible que el programa no
  este a que la gente trabaje sobre un gestor sin base de datos.

  No abre ventanas ni navegador. Lo ejecuta la tarea programada
  "Colbeef Gestor Visceras - Arranque" al encender el equipo, y tambien sirve a
  mano desde iniciar-gestor.bat.

  Sin acentos a proposito: PowerShell 5.1 lee los .ps1 sin BOM como ANSI y los
  dejaria ilegibles en el registro.
#>
param(
  [int]$MinutosMaximo = 20,
  [int]$IntervaloSeg = 10
)

$ErrorActionPreference = 'Continue'

$app = Split-Path -Parent $PSScriptRoot
$log = Join-Path $app 'server\data\arranque-gestor.log'
$sonda = Join-Path $PSScriptRoot 'mysql-listo.mjs'
$svcName = 'colbeefsirtapi.exe'

function Escribir($mensaje) {
  $linea = '[{0}] {1}' -f (Get-Date -Format 'yyyy-MM-dd HH:mm:ss'), $mensaje
  Write-Host $linea
  try {
    $dir = Split-Path -Parent $log
    if (-not (Test-Path $dir)) { New-Item -ItemType Directory -Path $dir -Force | Out-Null }
    Add-Content -Path $log -Value $linea -Encoding UTF8
  } catch { }
}

function BuscarNode {
  foreach ($ruta in @(
      (Join-Path $env:ProgramFiles 'nodejs\node.exe'),
      (Join-Path ${env:ProgramFiles(x86)} 'nodejs\node.exe')
    )) {
    if ($ruta -and (Test-Path $ruta)) { return $ruta }
  }
  $cmd = Get-Command node -ErrorAction SilentlyContinue
  if ($cmd) { return $cmd.Source }
  return $null
}

function PuertoDelEnv {
  $envFile = Join-Path $app '.env'
  if (Test-Path $envFile) {
    foreach ($linea in Get-Content $envFile) {
      if ($linea -match '^\s*SERVER_PORT\s*=\s*(\d+)') { return [int]$Matches[1] }
    }
  }
  return 3001
}

Escribir "--- arranque: esperando MySQL (maximo $MinutosMaximo min) ---"

$node = BuscarNode
if (-not $node) {
  Escribir '[ERROR] No se encontro node.exe. Instale Node o revise el PATH de la maquina.'
  exit 1
}
if (-not (Test-Path $sonda)) {
  Escribir "[ERROR] Falta la sonda $sonda"
  exit 1
}
$puerto = PuertoDelEnv

$limite = (Get-Date).AddMinutes($MinutosMaximo)
$listo = $false
$intento = 0
while ((Get-Date) -lt $limite) {
  $intento++
  $salida = & $node $sonda 2>&1
  if ($LASTEXITCODE -eq 0) {
    $listo = $true
    Escribir "MySQL responde (intento $intento)."
    break
  }
  # Ni un log por cada sondeo ni silencio total: el primero y luego cada minuto.
  if ($intento -eq 1 -or ($intento * $IntervaloSeg) % 60 -eq 0) {
    Escribir "MySQL aun no responde (intento $intento): $salida"
  }
  Start-Sleep -Seconds $IntervaloSeg
}

if (-not $listo) {
  Escribir "[ERROR] MySQL no respondio en $MinutosMaximo min. El gestor no se levanta a proposito."
  Escribir '        Revise el servicio MySQL80 y vuelva a ejecutar iniciar-gestor.bat.'
  exit 1
}

$svc = Get-Service -Name $svcName -ErrorAction SilentlyContinue
if (-not $svc) {
  Escribir "[ERROR] El servicio $svcName no esta instalado. Use install-service.bat."
  exit 1
}

if ($svc.Status -ne 'Running') {
  Escribir "Servicio en estado $($svc.Status): arrancando..."
  try {
    Start-Service -Name $svcName -ErrorAction Stop
  } catch {
    Escribir "[ERROR] No se pudo arrancar el servicio: $($_.Exception.Message)"
    exit 1
  }
} else {
  Escribir 'El servicio ya estaba en marcha.'
}

$salud = $null
for ($i = 1; $i -le 12; $i++) {
  try {
    $salud = Invoke-RestMethod -Uri "http://127.0.0.1:$puerto/api/health" -TimeoutSec 10
    break
  } catch {
    Start-Sleep -Seconds 5
  }
}

if (-not $salud) {
  Escribir "[ERROR] El servicio arranco pero la API no responde en el puerto $puerto."
  Escribir '        Revise server\data\server.log'
  exit 1
}

Escribir ('[OK] Gestor arriba. build={0} db={1} sirt={2} mysql={3}' -f
  $salud.gestorBuild, $salud.db, $salud.sirt, $salud.gestorMysql.ready)
exit 0
