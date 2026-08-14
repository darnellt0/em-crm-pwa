param(
  [switch]$Build
)

$ErrorActionPreference = "Stop"
$PSNativeCommandUseErrorActionPreference = $true

$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$runtimeDir = Join-Path $repoRoot ".runtime"
$logFile = Join-Path $runtimeDir "crm-production.log"
$backupScript = Join-Path $PSScriptRoot "backup-db.ps1"
$pnpm = (Get-Command pnpm.cmd -ErrorAction Stop).Source

New-Item -ItemType Directory -Force -Path $runtimeDir | Out-Null
Set-Location $repoRoot

function Test-DockerReady {
  try {
    docker info *> $null
    return $LASTEXITCODE -eq 0
  } catch {
    return $false
  }
}

function Test-DatabaseReady {
  try {
    docker exec em_postgres pg_isready -U em_app -d em_crm *> $null
    return $LASTEXITCODE -eq 0
  } catch {
    return $false
  }
}

function Invoke-Pnpm([string[]]$Arguments) {
  $previousPreference = $ErrorActionPreference
  $ErrorActionPreference = "Continue"
  try {
    & $pnpm @Arguments *>> $logFile
    $exitCode = $LASTEXITCODE
  } finally {
    $ErrorActionPreference = $previousPreference
  }
  if ($exitCode -ne 0) {
    throw "pnpm $($Arguments -join ' ') exited with code $exitCode."
  }
}

if (-not (Test-DockerReady)) {
  $dockerDesktop = Join-Path $env:ProgramFiles "Docker\Docker\Docker Desktop.exe"
  if (Test-Path -LiteralPath $dockerDesktop) {
    Start-Process -FilePath $dockerDesktop -WindowStyle Hidden
  }

  $deadline = (Get-Date).AddMinutes(3)
  while ((Get-Date) -lt $deadline -and -not (Test-DockerReady)) {
    Start-Sleep -Seconds 5
  }
  if (-not (Test-DockerReady)) {
    throw "Docker Desktop did not become ready within three minutes."
  }
}

docker compose up -d postgres n8n | Out-File -FilePath $logFile -Append

$databaseReady = $false
for ($attempt = 0; $attempt -lt 30; $attempt++) {
  if (Test-DatabaseReady) {
    $databaseReady = $true
    break
  }
  Start-Sleep -Seconds 2
}
if (-not $databaseReady) {
  throw "PostgreSQL did not become ready within one minute."
}

Invoke-Pnpm @("exec", "prisma", "migrate", "deploy")

$buildId = Join-Path $repoRoot ".next\BUILD_ID"
if ($Build -or -not (Test-Path -LiteralPath $buildId)) {
  Invoke-Pnpm @("build")
}

$latestBackup = Get-ChildItem -LiteralPath (Join-Path $repoRoot "backups") -Filter "*.sql.gz" -File -ErrorAction SilentlyContinue |
  Sort-Object LastWriteTime -Descending |
  Select-Object -First 1
if (-not $latestBackup -or $latestBackup.LastWriteTime -lt (Get-Date).AddHours(-24)) {
  & $backupScript *>> $logFile
}

$listener = Get-NetTCPConnection -LocalPort 3001 -State Listen -ErrorAction SilentlyContinue
if ($listener) {
  $health = Invoke-RestMethod -Uri "http://127.0.0.1:3001/api/health" -TimeoutSec 10
  if ($health.ok) {
    "$(Get-Date -Format o) CRM is already healthy on port 3001." | Out-File $logFile -Append
    exit 0
  }
  throw "Port 3001 is occupied, but the CRM health check failed."
}

"$(Get-Date -Format o) Starting EM CRM production server." | Out-File $logFile -Append
Invoke-Pnpm @("start")
