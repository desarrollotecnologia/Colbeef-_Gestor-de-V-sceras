$ErrorActionPreference = "Continue"
$projectDir = Split-Path -Parent $PSScriptRoot
$logPath = Join-Path $projectDir "service-install.log"
. (Join-Path $PSScriptRoot "firewall-port.ps1")

function Log($msg) {
  $line = "[$(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')] $msg"
  Write-Host $line
  $line | Out-File $logPath -Encoding utf8 -Append
}

$isAdmin = ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
if (-not $isAdmin) {
  Write-Host "ERROR: se requieren privilegios de Administrador." -ForegroundColor Red
  Start-Sleep -Seconds 8
  exit 1
}

Set-Location $projectDir
$port = Get-ServerPort -Root $projectDir
$lanIp = Get-LanShareIp -Root $projectDir

Log "=== Deploy: reinicio Colbeef SIRT API (puerto $port) ==="

# Get-Service posicional busca por Name, no por DisplayName: el servicio se
# instala como "colbeefsirtapi.exe" y "Colbeef SIRT API" es solo el visible.
$svc = Get-Service -Name 'colbeefsirtapi.exe' -ErrorAction SilentlyContinue
if (-not $svc) { $svc = Get-Service -DisplayName 'Colbeef SIRT API' -ErrorAction SilentlyContinue }
if (-not $svc) {
  $svc = Get-Service -ErrorAction SilentlyContinue |
    Where-Object { $_.Name -like 'colbeefsirtapi*' -or $_.DisplayName -like '*Colbeef*SIRT*' } |
    Select-Object -First 1
}
if (-not $svc) {
  Write-Host "[ERROR] Servicio 'Colbeef SIRT API' no instalado. Use install-service.bat" -ForegroundColor Red
  Log "Servicio no instalado"
  Start-Sleep -Seconds 10
  exit 1
}

$svcName = $svc.Name
Log "Servicio localizado: $svcName (visible: $($svc.DisplayName))"

Write-Host "Deteniendo servicio..." -ForegroundColor Cyan
Stop-Service -Name $svcName -Force -ErrorAction SilentlyContinue
Start-Sleep -Seconds 2

Write-Host "Iniciando servicio..." -ForegroundColor Cyan
Start-Service -Name $svcName
Start-Sleep -Seconds 4

$svc = Get-Service -Name $svcName
Log "Servicio: Estado=$($svc.Status)"
if ($svc.Status -eq "Running") {
  Write-Host ("[OK] Servicio en ejecucion: {0}" -f $svc.DisplayName) -ForegroundColor Green
} else {
  Write-Host ("[ERROR] Estado del servicio: {0}" -f $svc.Status) -ForegroundColor Red
}

$listening = netstat -ano | Select-String ":$port " | Select-String "LISTENING"
if ($listening) {
  Write-Host "[OK] Puerto $port en escucha." -ForegroundColor Green
  Log "Puerto $port OK"
} else {
  Write-Host "[AVISO] Puerto $port aun no responde." -ForegroundColor Yellow
  Log "Puerto $port sin LISTENING"
}

# El puerto puede seguir ocupado por el proceso anterior: se consulta la API.
$health = $null
for ($i = 1; $i -le 6; $i++) {
  try {
    $health = Invoke-RestMethod -Uri "http://127.0.0.1:$port/api/health" -TimeoutSec 10
    break
  } catch {
    Start-Sleep -Seconds 4
  }
}
if ($health) {
  Write-Host ("[OK] API responde. db={0} sirt={1} mysql={2}" -f $health.db, $health.sirt, $health.gestorMysql.ready) -ForegroundColor Green
  Log "API OK db=$($health.db) mysql=$($health.gestorMysql.ready)"
} else {
  Write-Host "[ERROR] La API no responde en /api/health." -ForegroundColor Red
  Log "API sin respuesta"
}

Write-Host ""
Write-Host "Enlaces:" -ForegroundColor Cyan
Write-Host "  http://localhost:$port/portal.html"
Write-Host "  http://localhost:$port/gestor.html"
if ($lanIp) {
  Write-Host "  http://${lanIp}:$port/portal.html"
}

Write-Host ""
Write-Host "Cierre esta ventana o espere..." -ForegroundColor Gray
Start-Sleep -Seconds 6
