$ErrorActionPreference = "Stop"

$repoRoot = Resolve-Path (Join-Path $PSScriptRoot "..")
$backupDir = Join-Path $repoRoot "backups"
$container = "em_postgres"
$database = "em_crm"
$user = "em_app"
$timestamp = Get-Date -Format "yyyyMMdd-HHmmss"
$backupPath = Join-Path $backupDir "em-crm-$timestamp.sql.gz"
$tempSqlPath = Join-Path $backupDir "em-crm-$timestamp.sql"

New-Item -ItemType Directory -Force -Path $backupDir | Out-Null

docker info | Out-Null
$running = docker inspect -f "{{.State.Running}}" $container 2>$null
if ($running -ne "true") {
  throw "Postgres container '$container' is not running."
}

docker exec $container pg_dump -U $user -d $database > $tempSqlPath

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
  Remove-Item -LiteralPath $tempSqlPath -Force
}

Write-Output "CRM backup created: $backupPath"
