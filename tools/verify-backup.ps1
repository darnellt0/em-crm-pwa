param(
  [string]$BackupPath
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

$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$backupDir = Join-Path $repoRoot "backups"
if (-not $BackupPath) {
  $BackupPath = (Get-ChildItem -LiteralPath $backupDir -Filter "*.sql.gz" -File |
    Sort-Object LastWriteTime -Descending |
    Select-Object -First 1).FullName
}
if (-not $BackupPath -or -not (Test-Path -LiteralPath $BackupPath)) {
  throw "No backup file was found to verify."
}

$resolvedBackup = (Resolve-Path -LiteralPath $BackupPath).Path
$verifyDatabase = "em_crm_restore_verify_$PID"
$tempSql = Join-Path ([System.IO.Path]::GetTempPath()) "$verifyDatabase.sql"
$tempQuery = Join-Path ([System.IO.Path]::GetTempPath()) "$verifyDatabase-counts.sql"
$containerSql = "/tmp/$verifyDatabase.sql"
$containerQuery = "/tmp/$verifyDatabase-counts.sql"

try {
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

  Invoke-Docker -Arguments @("exec", "em_postgres", "createdb", "-U", "em_app", $verifyDatabase) -Quiet
  Invoke-Docker -Arguments @("cp", $tempSql, "em_postgres:$containerSql") -Quiet
  Invoke-Docker -Arguments @(
    "exec", "em_postgres", "psql", "-v", "ON_ERROR_STOP=1", "-U", "em_app",
    "-d", $verifyDatabase, "-f", $containerSql
  ) -Quiet

  $countQuery = 'SELECT (SELECT count(*) FROM "Contact"), (SELECT count(*) FROM "User"), (SELECT count(*) FROM "_prisma_migrations");'
  [System.IO.File]::WriteAllText($tempQuery, $countQuery, [System.Text.UTF8Encoding]::new($false))
  Invoke-Docker -Arguments @("cp", $tempQuery, "em_postgres:$containerQuery") -Quiet
  $counts = Invoke-Docker -Arguments @(
    "exec", "em_postgres", "psql", "-U", "em_app", "-d", $verifyDatabase,
    "-At", "-F", ",", "-f", $containerQuery
  )
  $parts = $counts.Trim().Split(",")
  if ($parts.Count -ne 3 -or [int]$parts[0] -lt 1 -or [int]$parts[1] -lt 1 -or [int]$parts[2] -lt 1) {
    throw "Restored database failed record-count verification."
  }

  [pscustomobject]@{
    Backup = $resolvedBackup
    Contacts = [int]$parts[0]
    Users = [int]$parts[1]
    Migrations = [int]$parts[2]
    VerifiedAt = Get-Date
  } | Format-List
} finally {
  Invoke-Docker -Arguments @("exec", "em_postgres", "dropdb", "--if-exists", "-U", "em_app", $verifyDatabase) -Quiet -IgnoreFailure
  Invoke-Docker -Arguments @("exec", "em_postgres", "rm", "-f", $containerSql) -Quiet -IgnoreFailure
  Invoke-Docker -Arguments @("exec", "em_postgres", "rm", "-f", $containerQuery) -Quiet -IgnoreFailure
  if (Test-Path -LiteralPath $tempSql) {
    Remove-Item -LiteralPath $tempSql -Force
  }
  if (Test-Path -LiteralPath $tempQuery) {
    Remove-Item -LiteralPath $tempQuery -Force
  }
}
