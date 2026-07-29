param(
  [int]$RetentionDays = 30
)

$ErrorActionPreference = "Stop"

function Invoke-Docker {
  param(
    [Parameter(Mandatory = $true)]
    [string[]]$Arguments,
    [switch]$Quiet,
    [switch]$IgnoreFailure
  )

  $previousPreference = $ErrorActionPreference
  $ErrorActionPreference = "Continue"
  try {
    if ($Quiet) {
      & docker @Arguments 2>&1 | Out-Null
      $output = $null
    } else {
      $output = & docker @Arguments 2>&1
    }
    $exitCode = $LASTEXITCODE
  } finally {
    $ErrorActionPreference = $previousPreference
  }

  if ($exitCode -ne 0 -and -not $IgnoreFailure) {
    throw "docker $($Arguments -join ' ') failed with exit code $exitCode."
  }
  return $output
}

$repoRoot = Resolve-Path (Join-Path $PSScriptRoot "..")
$backupDir = Join-Path $repoRoot "backups"
$container = "em_postgres"
$database = "em_crm"
$user = "em_app"
$timestamp = Get-Date -Format "yyyyMMdd-HHmmss"
$backupPath = Join-Path $backupDir "em-crm-$timestamp.sql.gz"
$tempSqlPath = Join-Path $backupDir "em-crm-$timestamp.sql"
$containerSqlPath = "/tmp/em-crm-backup-$timestamp.sql"
$backupCompleted = $false

New-Item -ItemType Directory -Force -Path $backupDir | Out-Null

Invoke-Docker -Arguments @("info") -Quiet
$running = Invoke-Docker -Arguments @("inspect", "-f", "{{.State.Running}}", $container)
if ($running -ne "true") {
  throw "Postgres container '$container' is not running."
}

try {
  Invoke-Docker -Arguments @(
    "exec", $container, "pg_dump", "-U", $user, "-d", $database,
    "--clean", "--if-exists", "--no-owner", "--no-acl", "--file=$containerSqlPath"
  ) -Quiet
  Invoke-Docker -Arguments @("cp", "${container}:$containerSqlPath", $tempSqlPath) -Quiet

  $source = [System.IO.File]::OpenRead($tempSqlPath)
  $target = [System.IO.File]::Create($backupPath)
  try {
    $gzip = [System.IO.Compression.GZipStream]::new(
      $target,
      [System.IO.Compression.CompressionLevel]::Optimal
    )
    try {
      $source.CopyTo($gzip)
    } finally {
      $gzip.Dispose()
    }
  } finally {
    $source.Dispose()
    $target.Dispose()
  }
  $backupCompleted = $true
} finally {
  Invoke-Docker -Arguments @("exec", $container, "rm", "-f", $containerSqlPath) -Quiet -IgnoreFailure
  if (Test-Path -LiteralPath $tempSqlPath) {
    Remove-Item -LiteralPath $tempSqlPath -Force
  }
  if (-not $backupCompleted -and (Test-Path -LiteralPath $backupPath)) {
    Remove-Item -LiteralPath $backupPath -Force
  }
}

Write-Output "CRM backup created: $backupPath"

$retentionCutoff = (Get-Date).AddDays(-$RetentionDays)
Get-ChildItem -LiteralPath $backupDir -Filter "*.sql.gz" -File |
  Where-Object { $_.LastWriteTime -lt $retentionCutoff } |
  ForEach-Object {
    if ($_.DirectoryName -ne $backupDir) {
      throw "Refusing to remove a backup outside $backupDir"
    }
    Remove-Item -LiteralPath $_.FullName -Force
    Write-Output "Removed expired backup: $($_.Name)"
  }
