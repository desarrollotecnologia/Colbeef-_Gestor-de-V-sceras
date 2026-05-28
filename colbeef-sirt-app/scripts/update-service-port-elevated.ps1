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
  exit 1
}

Set-Location $projectDir
$port = Get-ServerPort -Root $projectDir
$lanIp = Get-LanShareIp -Root $projectDir

Log "=== Actualizacion de puerto Colbeef SIRT API -> $port ==="

Write-Host ""
Write-Host "=== Paso 1/2: Firewall puerto $port ===" -ForegroundColor Cyan
try {
  $ruleName = Update-ColbeefFirewall -Port $port
  Log "Firewall actualizado: $ruleName"
  Write-Host "[OK] Firewall: puerto $port abierto." -ForegroundColor Green
} catch {
  Log "ERROR firewall: $($_.Exception.Message)"
  Write-Host "ERROR firewall: $($_.Exception.Message)" -ForegroundColor Red
}

Write-Host ""
Write-Host "=== Paso 2/2: Reiniciando servicio ===" -ForegroundColor Cyan
$svc = Get-Service "Colbeef SIRT API" -ErrorAction SilentlyContinue
if ($svc) {
  Restart-Service "Colbeef SIRT API" -Force
  Start-Sleep -Seconds 4
  $svc = Get-Service "Colbeef SIRT API"
  Log "Servicio reiniciado: Estado=$($svc.Status) Inicio=$($svc.StartType)"
  Write-Host ("[OK] Servicio: {0} | Estado: {1}" -f $svc.DisplayName, $svc.Status) -ForegroundColor Green
} else {
  Log "Servicio no instalado; solo firewall actualizado."
  Write-Host "[INFO] Servicio no instalado." -ForegroundColor Yellow
}

Write-Host ""
Write-Host "Enlaces:" -ForegroundColor Cyan
Write-Host "  http://localhost:$port/gestor.html"
if ($lanIp) {
  Write-Host "  http://${lanIp}:$port/gestor.html"
}

$listening = netstat -ano | Select-String ":$port " | Select-String "LISTENING"
if ($listening) {
  Write-Host "[OK] Puerto $port en escucha." -ForegroundColor Green
  Log "Puerto $port en escucha."
} else {
  Write-Host "[AVISO] Puerto $port aun no responde; revisa server\data\server.log" -ForegroundColor Yellow
  Log "Puerto $port no en escucha tras reinicio."
}

Write-Host ""
Start-Sleep -Seconds 15
