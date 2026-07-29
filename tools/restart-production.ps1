param(
  [switch]$Build
)

$ErrorActionPreference = "Stop"
$PSNativeCommandUseErrorActionPreference = $true

$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$pnpm = (Get-Command pnpm.cmd -ErrorAction Stop).Source
$taskName = "ElevatedMovementsCRM"
$healthUrl = "http://127.0.0.1:3001/api/health"

function Invoke-Pnpm([string[]]$Arguments) {
  $previousPreference = $ErrorActionPreference
  $ErrorActionPreference = "Continue"
  try {
    & $pnpm @Arguments
    $exitCode = $LASTEXITCODE
  } finally {
    $ErrorActionPreference = $previousPreference
  }
  if ($exitCode -ne 0) {
    throw "pnpm $($Arguments -join ' ') exited with code $exitCode."
  }
}

function Get-CrmListenerProcess {
  $listener = Get-NetTCPConnection -LocalPort 3001 -State Listen -ErrorAction SilentlyContinue |
    Select-Object -First 1
  if (-not $listener) {
    return $null
  }

  $process = Get-CimInstance Win32_Process -Filter "ProcessId = $($listener.OwningProcess)"
  $normalizedRoot = [regex]::Escape($repoRoot)
  $isExpected =
    $process.Name -match '^node(\.exe)?$' -and
    $process.CommandLine -match $normalizedRoot -and
    $process.CommandLine -match '(?i)next' -and
    $process.CommandLine -match '(?i)(start|server)' -and
    $process.CommandLine -match '3001'

  if (-not $isExpected) {
    throw "Port 3001 belongs to an unexpected process (PID $($process.ProcessId), $($process.Name)). It was not stopped."
  }
  return $process
}

Set-Location $repoRoot

if ($Build) {
  Invoke-Pnpm @("build")
}

$task = Get-ScheduledTask -TaskName $taskName -ErrorAction SilentlyContinue
if (-not $task) {
  throw "Scheduled task '$taskName' is not installed. Run pnpm ops:install first."
}

$process = Get-CrmListenerProcess
Stop-ScheduledTask -TaskName $taskName -ErrorAction SilentlyContinue
$process = Get-CrmListenerProcess
if ($process -and (Get-Process -Id $process.ProcessId -ErrorAction SilentlyContinue)) {
  Stop-Process -Id $process.ProcessId -Force -ErrorAction SilentlyContinue
  try {
    Wait-Process -Id $process.ProcessId -Timeout 15 -ErrorAction Stop
  } catch {
    if (Get-Process -Id $process.ProcessId -ErrorAction SilentlyContinue) {
      throw "CRM process $($process.ProcessId) did not stop within 15 seconds."
    }
  }
}

$stopDeadline = (Get-Date).AddSeconds(15)
while ((Get-ScheduledTask -TaskName $taskName).State -ne "Ready" -and (Get-Date) -lt $stopDeadline) {
  Start-Sleep -Milliseconds 500
}
if ((Get-ScheduledTask -TaskName $taskName).State -ne "Ready") {
  throw "Scheduled task '$taskName' did not stop within 15 seconds."
}

Start-ScheduledTask -TaskName $taskName
$deadline = (Get-Date).AddMinutes(2)
do {
  Start-Sleep -Seconds 2
  try {
    $health = Invoke-RestMethod -Uri $healthUrl -TimeoutSec 5
    if ($health.ok -eq $true) {
      Write-Host "CRM restarted and healthy at http://127.0.0.1:3001." -ForegroundColor Green
      exit 0
    }
  } catch {
    # The server may still be starting.
  }
} while ((Get-Date) -lt $deadline)

throw "CRM did not become healthy within two minutes. Check .runtime\crm-production.log."
