$ErrorActionPreference = "Stop"
$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$currentBuild = Join-Path $repoRoot ".next"
$candidateBuild = Join-Path $repoRoot ".next-candidate"
$releaseDir = Join-Path $repoRoot (".runtime\releases\" + (Get-Date -Format "yyyyMMdd-HHmmss"))
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
# Resolve and validate every directory before moving anything. No recursive deletion.
foreach ($buildPath in @($currentBuild, $candidateBuild)) {
  $resolved = (Resolve-Path -LiteralPath $buildPath).Path
  if ((Split-Path $resolved -Parent) -ne $repoRoot) { throw "Build path outside CRM workspace" }
  if (-not (Test-Path -LiteralPath (Join-Path $resolved "BUILD_ID"))) { throw "Missing completed build at $resolved" }
}
$listener = Get-NetTCPConnection -LocalPort 3001 -State Listen -ErrorAction SilentlyContinue | Select-Object -First 1
if ($listener) {
  $crmProcess = Get-CimInstance Win32_Process -Filter "ProcessId = $($listener.OwningProcess)"
  if ($crmProcess.Name -notmatch '^node(\.exe)?$' -or $crmProcess.CommandLine -notmatch [regex]::Escape($repoRoot) -or $crmProcess.CommandLine -notmatch '(?i)next' -or $crmProcess.CommandLine -notmatch '3001') { throw "Unexpected process on port 3001" }
}
New-Item -ItemType Directory -Path $releaseDir -Force | Out-Null
$previousBuild = Join-Path $releaseDir "previous-next"
Stop-ScheduledTask -TaskName $taskName
if ($listener -and (Get-Process -Id $listener.OwningProcess -ErrorAction SilentlyContinue)) {
  Stop-Process -Id $listener.OwningProcess -Force
  Wait-Process -Id $listener.OwningProcess -Timeout 20 -ErrorAction SilentlyContinue
  if (Get-Process -Id $listener.OwningProcess -ErrorAction SilentlyContinue) {
    throw "CRM process $($listener.OwningProcess) did not stop within 20 seconds."
  }
}
Wait-CrmTaskReady
try {
  Move-Item -LiteralPath $currentBuild -Destination $previousBuild
  Move-Item -LiteralPath $candidateBuild -Destination $currentBuild
  Start-ScheduledTask -TaskName $taskName
  $healthy = $false
  for ($attempt = 0; $attempt -lt 24; $attempt++) {
    Start-Sleep -Seconds 2
    try { if ((Invoke-RestMethod http://127.0.0.1:3001/api/health -TimeoutSec 3).ok) { $healthy = $true; break } } catch {}
  }
  if (-not $healthy) { throw "Candidate failed its health check" }
  Write-Output "CRM build promoted. Previous build retained at $previousBuild"
} catch {
  Stop-ScheduledTask -TaskName $taskName -ErrorAction SilentlyContinue
  # Only stop a new listener after verifying it is still this CRM.
  $failedListener = Get-NetTCPConnection -LocalPort 3001 -State Listen -ErrorAction SilentlyContinue | Select-Object -First 1
  if ($failedListener) {
    $failedProcess = Get-CimInstance Win32_Process -Filter "ProcessId = $($failedListener.OwningProcess)"
    if ($failedProcess.Name -match '^node(\.exe)?$' -and $failedProcess.CommandLine -match [regex]::Escape($repoRoot) -and $failedProcess.CommandLine -match '(?i)next') {
      Stop-Process -Id $failedProcess.ProcessId -Force
      Wait-Process -Id $failedProcess.ProcessId -Timeout 20 -ErrorAction SilentlyContinue
      if (Get-Process -Id $failedProcess.ProcessId -ErrorAction SilentlyContinue) {
        throw "Failed candidate process $($failedProcess.ProcessId) did not stop; manual recovery required from $previousBuild"
      }
    }
    else { throw "Unexpected listener during rollback; manual recovery required from $previousBuild" }
  }
  Wait-CrmTaskReady
  if (Test-Path -LiteralPath $previousBuild) {
    if (Test-Path -LiteralPath $currentBuild) { Move-Item -LiteralPath $currentBuild -Destination (Join-Path $releaseDir "failed-next") }
    Move-Item -LiteralPath $previousBuild -Destination $currentBuild
  }
  Start-ScheduledTask -TaskName $taskName
  throw
}
