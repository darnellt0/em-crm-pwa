param(
  [string]$AppUrl = "http://127.0.0.1:3001"
)

$ErrorActionPreference = "Stop"
$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$checks = [System.Collections.Generic.List[object]]::new()

function Add-Check([string]$Name, [bool]$Healthy, [string]$Detail) {
  $checks.Add([pscustomobject]@{
    Check = $Name
    Healthy = $Healthy
    Detail = $Detail
  })
}

try {
  $health = Invoke-RestMethod -Uri "$($AppUrl.TrimEnd('/'))/api/health" -TimeoutSec 10
  Add-Check "CRM API" ($health.ok -eq $true) $health.timestamp
} catch {
  Add-Check "CRM API" $false $_.Exception.Message
}

foreach ($container in @("em_postgres", "em_mailhog", "em_n8n")) {
  $running = docker inspect -f "{{.State.Running}}" $container 2>$null
  Add-Check $container ($running -eq "true") "running=$running"
}

$backupDir = Join-Path $repoRoot "backups"
$latestBackup = Get-ChildItem -LiteralPath $backupDir -Filter "*.sql.gz" -File -ErrorAction SilentlyContinue |
  Sort-Object LastWriteTime -Descending |
  Select-Object -First 1
if ($latestBackup) {
  $ageHours = [math]::Round(((Get-Date) - $latestBackup.LastWriteTime).TotalHours, 1)
  Add-Check "Latest backup" ($ageHours -le 48) "$($latestBackup.Name), ${ageHours}h old"
} else {
  Add-Check "Latest backup" $false "No backup found"
}

$checks | Format-Table -AutoSize
if ($checks.Where({ -not $_.Healthy }).Count -gt 0) {
  exit 1
}
