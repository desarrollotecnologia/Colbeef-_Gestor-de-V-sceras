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

$svc = Get-Service "Colbeef SIRT API" -ErrorAction SilentlyContinue
if (-not $svc) {
  Write-Host "[ERROR] Servicio 'Colbeef SIRT API' no instalado. Use install-service.bat" -ForegroundColor Red
  Log "Servicio no instalado"
  Start-Sleep -Seconds 10
  exit 1
}

Write-Host "Deteniendo servicio..." -ForegroundColor Cyan
Stop-Service "Colbeef SIRT API" -Force -ErrorAction SilentlyContinue
Start-Sleep -Seconds 2

Write-Host "Iniciando servicio..." -ForegroundColor Cyan
Start-Service "Colbeef SIRT API"
Start-Sleep -Seconds 4

$svc = Get-Service "Colbeef SIRT API"
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
