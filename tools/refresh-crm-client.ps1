$ErrorActionPreference = "Stop"
$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
Set-Location $repoRoot
$taskName = "ElevatedMovementsCRM"

function Wait-CrmTaskReady([int]$TimeoutSeconds = 30) {
  $deadline = (Get-Date).AddSeconds($TimeoutSeconds)
  while ((Get-ScheduledTask -TaskName $taskName -ErrorAction Stop).State -ne "Ready" -and (Get-Date) -lt $deadline) {
    Start-Sleep -Milliseconds 500
  }
  if ((Get-ScheduledTask -TaskName $taskName -ErrorAction Stop).State -ne "Ready") {
    throw "Scheduled task '$taskName' did not stop within $TimeoutSeconds seconds."
  }
}

if (-not (Get-ScheduledTask -TaskName $taskName -ErrorAction SilentlyContinue)) {
  throw "Scheduled task '$taskName' is not installed."
}
$listener = Get-NetTCPConnection -LocalPort 3001 -State Listen -ErrorAction SilentlyContinue | Select-Object -First 1
if ($listener) {
  $crmProcess = Get-CimInstance Win32_Process -Filter "ProcessId = $($listener.OwningProcess)"
  if ($crmProcess.Name -notmatch '^node(\.exe)?$' -or $crmProcess.CommandLine -notmatch [regex]::Escape($repoRoot) -or $crmProcess.CommandLine -notmatch '(?i)next' -or $crmProcess.CommandLine -notmatch '3001') {
    throw "Port 3001 is not the expected CRM process; nothing was stopped."
  }
}
Stop-ScheduledTask -TaskName $taskName
$taskReadyToRestart = $false
try {
  if ($listener -and (Get-Process -Id $listener.OwningProcess -ErrorAction SilentlyContinue)) {
    Stop-Process -Id $listener.OwningProcess -Force
    Wait-Process -Id $listener.OwningProcess -Timeout 20 -ErrorAction SilentlyContinue
    if (Get-Process -Id $listener.OwningProcess -ErrorAction SilentlyContinue) {
      throw "CRM process $($listener.OwningProcess) did not stop within 20 seconds."
    }
  }
  Wait-CrmTaskReady
  $taskReadyToRestart = $true
  & node node_modules/prisma/build/index.js generate
  if ($LASTEXITCODE -ne 0) { throw "Client generation failed" }
} finally {
  if ($taskReadyToRestart) {
    Start-ScheduledTask -TaskName $taskName
  }
}
