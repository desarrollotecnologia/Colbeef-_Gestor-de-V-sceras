param(
  [string]$ProjectDir = (Split-Path -Parent $PSScriptRoot),
  [int]$DefaultPort = 3001
)

function Get-ServerPort {
  param([string]$Root, [int]$Fallback)
  $envFile = Join-Path $Root ".env"
  if (-not (Test-Path $envFile)) { return $Fallback }
  foreach ($line in Get-Content $envFile) {
    if ($line -match '^\s*SERVER_PORT\s*=\s*(\d+)') { return [int]$matches[1] }
  }
  return $Fallback
}

function Get-LanShareIp {
  param([string]$Root)
  $envFile = Join-Path $Root ".env"
  if (-not (Test-Path $envFile)) { return $null }
  foreach ($line in Get-Content $envFile) {
    if ($line -match '^\s*LAN_SHARE_IP\s*=\s*(\S+)') { return $matches[1] }
  }
  return $null
}

function Update-ColbeefFirewall {
  param([int]$Port)

  @('Colbeef SIRT API 3001', 'Colbeef SIRT API 8013') | ForEach-Object {
    Remove-NetFirewallRule -DisplayName $_ -ErrorAction SilentlyContinue | Out-Null
  }

  $ruleName = "Colbeef SIRT API $Port"
  Remove-NetFirewallRule -DisplayName $ruleName -ErrorAction SilentlyContinue | Out-Null
  New-NetFirewallRule -DisplayName $ruleName `
    -Description "Permite trafico entrante TCP al servicio Colbeef SIRT API en el puerto $Port." `
    -Direction Inbound `
    -Action Allow `
    -Protocol TCP `
    -LocalPort $Port `
    -Profile Any `
    -Enabled True | Out-Null

  return $ruleName
}

Export-ModuleMember -Function Get-ServerPort, Get-LanShareIp, Update-ColbeefFirewall
