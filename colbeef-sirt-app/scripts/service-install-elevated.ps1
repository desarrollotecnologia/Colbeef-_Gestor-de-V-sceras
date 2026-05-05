$ErrorActionPreference = "Continue"
$projectDir = Split-Path -Parent $PSScriptRoot
$logPath = Join-Path $projectDir "service-install.log"

function Log($msg) {
  $line = "[$(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')] $msg"
  Write-Host $line
  $line | Out-File $logPath -Encoding utf8 -Append
}

"" | Out-File $logPath -Encoding utf8
Log "=== Inicio instalacion Colbeef SIRT API ==="
Log "Whoami: $((whoami))"
$isAdmin = ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
Log "Admin?: $isAdmin"

if (-not $isAdmin) {
  Log "ERROR: esta sesion NO es administrador. Abortando."
  Write-Host ""
  Write-Host "ERROR: no se obtuvieron privilegios de Administrador." -ForegroundColor Red
  Start-Sleep -Seconds 30
  exit 1
}

Set-Location $projectDir
Log "CWD: $(Get-Location)"

Write-Host ""
Write-Host "=== Paso 1/2: Registrando servicio de Windows ===" -ForegroundColor Cyan
try {
  $out = & node "scripts/service-install.cjs" 2>&1
  $out | ForEach-Object { Write-Host $_; $_ | Out-File $logPath -Encoding utf8 -Append }
  Log "service-install.cjs ExitCode: $LASTEXITCODE"
} catch {
  Log "ERROR servicio: $($_.Exception.Message)"
  Write-Host "ERROR servicio: $($_.Exception.Message)" -ForegroundColor Red
}

Write-Host ""
Write-Host "=== Paso 2/2: Abriendo puerto 8013 en Firewall de Windows ===" -ForegroundColor Cyan
try {
  $existing = Get-NetFirewallRule -DisplayName "Colbeef SIRT API 8013" -ErrorAction SilentlyContinue
  if ($existing) {
    Log "Regla de firewall ya existe, se sobrescribe."
    Remove-NetFirewallRule -DisplayName "Colbeef SIRT API 8013" -ErrorAction SilentlyContinue
  }
  New-NetFirewallRule -DisplayName "Colbeef SIRT API 8013" `
    -Description "Permite trafico entrante TCP al servicio Colbeef SIRT API en el puerto 8013." `
    -Direction Inbound `
    -Action Allow `
    -Protocol TCP `
    -LocalPort 8013 `
    -Profile Any `
    -Enabled True | Out-Null
  Log "Regla de firewall 'Colbeef SIRT API 8013' creada (TCP/8013, Inbound, Allow, Any profile)."
  Write-Host "[OK] Firewall: puerto 8013 abierto." -ForegroundColor Green
} catch {
  Log "ERROR firewall: $($_.Exception.Message)"
  Write-Host "ERROR firewall: $($_.Exception.Message)" -ForegroundColor Red
}

Write-Host ""
Write-Host "=== Resumen ===" -ForegroundColor Cyan
$svc = Get-Service "Colbeef SIRT API" -ErrorAction SilentlyContinue
if ($svc) {
  Write-Host ("Servicio: {0} | Estado: {1} | Inicio: {2}" -f $svc.Name, $svc.Status, $svc.StartType) -ForegroundColor Green
  Log "Servicio final: $($svc.Name) Estado=$($svc.Status) Inicio=$($svc.StartType)"
} else {
  Write-Host "Servicio NO instalado." -ForegroundColor Red
  Log "Servicio NO instalado."
}

Write-Host ""
Write-Host "Esta ventana se cerrara en 30 segundos..." -ForegroundColor Gray
Start-Sleep -Seconds 30
