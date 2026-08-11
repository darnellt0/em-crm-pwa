param(
  [Parameter(Mandatory = $true)]
  [string]$BackupPath,
  [switch]$Force
)

# EM CRM — Windows-native live database restore.
# Restores a .sql or .sql.gz backup into the em_crm database inside the
# em_postgres container. The restore runs with ON_ERROR_STOP inside a single
# transaction, so a failed restore rolls back and leaves the database
# unchanged. Stop the CRM app (pnpm restart:production or Ctrl+C) first.
#
# Usage: pnpm restore:db:win .\backups\em-crm-20260811-190000.sql.gz

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

if (-not (Test-Path -LiteralPath $BackupPath)) {
  throw "Backup file not found: $BackupPath"
}
$resolvedBackup = (Resolve-Path -LiteralPath $BackupPath).Path

if (-not $Force) {
  Write-Host ""
  Write-Host "WARNING: this OVERWRITES the live 'em_crm' database." -ForegroundColor Yellow
  Write-Host "Backup file: $resolvedBackup"
  $confirmation = Read-Host "Type 'yes' to continue"
  if ($confirmation -ne "yes") {
    Write-Host "Restore cancelled."
    exit 0
  }
}

$restoreId = "em_crm_restore_$PID"
$tempSql = Join-Path ([System.IO.Path]::GetTempPath()) "$restoreId.sql"
$containerSql = "/tmp/$restoreId.sql"

try {
  if ($resolvedBackup.EndsWith(".gz")) {
    $source = [System.IO.File]::OpenRead($resolvedBackup)
    $gzip = [System.IO.Compression.GZipStream]::new(
      $source,
      [System.IO.Compression.CompressionMode]::Decompress
    )
    $target = [System.IO.File]::Create($tempSql)
    try {
      $gzip.CopyTo($target)
    } finally {
      $target.Dispose()
      $gzip.Dispose()
      $source.Dispose()
    }
  } else {
    Copy-Item -LiteralPath $resolvedBackup -Destination $tempSql -Force
  }

  Invoke-Docker -Arguments @("cp", $tempSql, "em_postgres:$containerSql") -Quiet

  # Close lingering app connections so DROP/CREATE statements don't block.
  Invoke-Docker -Arguments @(
    "exec", "em_postgres", "psql", "-U", "em_app", "-d", "em_crm", "-q", "-c",
    "SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = 'em_crm' AND pid <> pg_backend_pid();"
  ) -Quiet

  Invoke-Docker -Arguments @(
    "exec", "em_postgres", "psql", "-v", "ON_ERROR_STOP=1", "--single-transaction",
    "-U", "em_app", "-d", "em_crm", "-q", "-f", $containerSql
  ) -Quiet

  Write-Host "Restore complete. Database 'em_crm' now matches: $resolvedBackup" -ForegroundColor Green
  Write-Host "Restart the CRM: pnpm restart:production (or pnpm dev)"
} catch {
  Write-Host "Restore FAILED and was rolled back - the database is unchanged." -ForegroundColor Red
  throw
} finally {
  Invoke-Docker -Arguments @("exec", "em_postgres", "rm", "-f", $containerSql) -Quiet -IgnoreFailure
  if (Test-Path -LiteralPath $tempSql) {
    Remove-Item -LiteralPath $tempSql -Force
  }
}
