$ErrorActionPreference = "Stop"

$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$powershell = (Get-Command powershell.exe -ErrorAction Stop).Source
$identity = "$env:USERDOMAIN\$env:USERNAME"
$principal = New-ScheduledTaskPrincipal -UserId $identity -LogonType Interactive -RunLevel Limited
$settingsParams = @{
  AllowStartIfOnBatteries = $true
  DontStopIfGoingOnBatteries = $true
  StartWhenAvailable = $true
  MultipleInstances = "IgnoreNew"
  RestartCount = 3
  RestartInterval = New-TimeSpan -Minutes 1
  ExecutionTimeLimit = New-TimeSpan -Days 3650
}
$settings = New-ScheduledTaskSettingsSet @settingsParams

function New-ScriptAction([string]$ScriptName) {
  $scriptPath = Join-Path $PSScriptRoot $ScriptName
  $arguments = "-NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File `"$scriptPath`""
  return New-ScheduledTaskAction -Execute $powershell -Argument $arguments -WorkingDirectory $repoRoot
}

$startupTrigger = New-ScheduledTaskTrigger -AtLogOn -User $identity
$startupTrigger.Delay = "PT45S"
$startupTask = @{
  TaskName = "ElevatedMovementsCRM"
  Description = "Start the Elevated Movements CRM and required containers at sign-in."
  Action = New-ScriptAction "start-production.ps1"
  Trigger = $startupTrigger
  Principal = $principal
  Settings = $settings
  Force = $true
}
Register-ScheduledTask @startupTask | Out-Null

$backupTask = @{
  TaskName = "ElevatedMovementsCRMBackup"
  Description = "Create a daily local CRM database backup."
  Action = New-ScriptAction "backup-db.ps1"
  Trigger = New-ScheduledTaskTrigger -Daily -At "7:00 PM"
  Principal = $principal
  Settings = $settings
  Force = $true
}
Register-ScheduledTask @backupTask | Out-Null

$verifyTask = @{
  TaskName = "ElevatedMovementsCRMBackupVerify"
  Description = "Restore the latest CRM backup into a temporary database and verify it."
  Action = New-ScriptAction "verify-backup.ps1"
  Trigger = New-ScheduledTaskTrigger -Weekly -DaysOfWeek Sunday -At "7:30 PM"
  Principal = $principal
  Settings = $settings
  Force = $true
}
Register-ScheduledTask @verifyTask | Out-Null

Get-ScheduledTask -TaskName "ElevatedMovementsCRM*" |
  Select-Object TaskName, State |
  Format-Table -AutoSize
