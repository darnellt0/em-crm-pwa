param(
  [string]$User,
  [string]$Recipient
)

$ErrorActionPreference = "Stop"
$PSNativeCommandUseErrorActionPreference = $true

$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$envLocalPath = Join-Path $repoRoot ".env.local"
$envPath = Join-Path $repoRoot ".env"
$pnpm = (Get-Command pnpm.cmd -ErrorAction Stop).Source
$utf8 = New-Object System.Text.UTF8Encoding($false)
$originalExists = Test-Path -LiteralPath $envLocalPath
$originalContent = if ($originalExists) {
  [System.IO.File]::ReadAllText($envLocalPath)
} else {
  ""
}

function Get-DotEnvValue([string]$Path, [string]$Name) {
  if (-not (Test-Path -LiteralPath $Path)) {
    return $null
  }
  foreach ($line in [System.IO.File]::ReadAllLines($Path)) {
    if ($line -match "^\s*$([regex]::Escape($Name))\s*=\s*(.*)\s*$") {
      $value = $Matches[1].Trim()
      if (
        ($value.StartsWith('"') -and $value.EndsWith('"')) -or
        ($value.StartsWith("'") -and $value.EndsWith("'"))
      ) {
        return $value.Substring(1, $value.Length - 2)
      }
      return $value
    }
  }
  return $null
}

function ConvertTo-DotEnvValue([string]$Value) {
  return '"' + $Value.Replace('\', '\\').Replace('"', '\"') + '"'
}

function Update-DotEnvContent([string]$Content, [System.Collections.IDictionary]$Updates) {
  $lines = if ($Content) { $Content -split "`r?`n" } else { @() }
  $written = @{}
  $result = [System.Collections.Generic.List[string]]::new()

  foreach ($line in $lines) {
    if ($line -match '^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=') {
      $name = $Matches[1]
      if ($Updates.Contains($name)) {
        if (-not $written.ContainsKey($name)) {
          $result.Add("$name=$(ConvertTo-DotEnvValue ([string]$Updates[$name]))") | Out-Null
          $written[$name] = $true
        }
        continue
      }
    }
    $result.Add($line) | Out-Null
  }

  foreach ($name in $Updates.Keys) {
    if (-not $written.ContainsKey($name)) {
      $result.Add("$name=$(ConvertTo-DotEnvValue ([string]$Updates[$name]))") | Out-Null
    }
  }
  return ($result -join "`r`n").TrimEnd() + "`r`n"
}

function Write-Atomic([string]$Path, [string]$Content) {
  $tempPath = "$Path.gmail-$PID.tmp"
  try {
    [System.IO.File]::WriteAllText($tempPath, $Content, $utf8)
    Move-Item -LiteralPath $tempPath -Destination $Path -Force
  } finally {
    Remove-Item -LiteralPath $tempPath -Force -ErrorAction SilentlyContinue
  }
}

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

if (-not $User) {
  $User = Get-DotEnvValue $envLocalPath "SMTP_USER"
}
if (-not $User) {
  $User = Get-DotEnvValue $envPath "SMTP_USER"
}
if (-not $User) {
  $User = Get-DotEnvValue $envLocalPath "SEED_SHRIA_EMAIL"
}
if (-not $User) {
  $User = Get-DotEnvValue $envPath "SEED_SHRIA_EMAIL"
}
if (-not $User) {
  $User = Read-Host "Google Workspace sender email"
}
$User = $User.Trim().ToLowerInvariant()
try {
  $mailAddress = [System.Net.Mail.MailAddress]::new($User)
  if ($mailAddress.Address -ne $User) {
    throw "invalid"
  }
} catch {
  throw "'$User' is not a valid sender email address."
}

if (-not $Recipient) {
  $Recipient = $User
}

Write-Host "Configuring Gmail SMTP for $User." -ForegroundColor Cyan
Write-Host "Use a 16-character Google app password, not the normal account password."
$securePassword = Read-Host "Google app password" -AsSecureString
$passwordPointer = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($securePassword)
try {
  $password = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($passwordPointer)
} finally {
  [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($passwordPointer)
}
$password = $password -replace '\s', ''
if ($password -notmatch '^[A-Za-z0-9]{16}$') {
  $password = $null
  throw "Google app passwords contain exactly 16 letters or digits. No configuration was changed."
}

$updates = [ordered]@{
  SMTP_HOST = "smtp.gmail.com"
  SMTP_PORT = "465"
  SMTP_SECURE = "true"
  SMTP_USER = $User
  SMTP_PASSWORD = $password
  EMAIL_FROM = "Elevated Movements CRM <$User>"
  NEXT_PUBLIC_MAIL_PREVIEW_URL = ""
}
$newContent = Update-DotEnvContent $originalContent $updates
$restartAttempted = $false

$managedNames = @($updates.Keys)
$previousProcessValues = @{}
foreach ($name in $managedNames) {
  $previousProcessValues[$name] = [Environment]::GetEnvironmentVariable($name, "Process")
}

try {
  Write-Atomic $envLocalPath $newContent
  foreach ($name in $managedNames) {
    [Environment]::SetEnvironmentVariable($name, [string]$updates[$name], "Process")
  }

  Set-Location $repoRoot
  Invoke-Pnpm @("email:verify", "--", "--send", "--to", $Recipient)
  $restartAttempted = $true
  & (Join-Path $PSScriptRoot "restart-production.ps1") -Build
  Write-Host "Gmail delivery is verified and active. MailHog remains available only as local infrastructure." -ForegroundColor Green
} catch {
  $failure = $_
  Write-Warning "Gmail activation failed. Restoring the previous email configuration."
  if ($originalExists) {
    Write-Atomic $envLocalPath $originalContent
  } else {
    Remove-Item -LiteralPath $envLocalPath -Force -ErrorAction SilentlyContinue
  }

  foreach ($name in $managedNames) {
    [Environment]::SetEnvironmentVariable($name, $previousProcessValues[$name], "Process")
  }
  if ($restartAttempted) {
    try {
      & (Join-Path $PSScriptRoot "restart-production.ps1") -Build
      Write-Warning "The previous configuration is active again."
    } catch {
      Write-Warning "Automatic rollback restart failed: $($_.Exception.Message)"
    }
  }
  throw $failure
} finally {
  $password = $null
  $securePassword.Dispose()
  foreach ($name in $managedNames) {
    [Environment]::SetEnvironmentVariable($name, $previousProcessValues[$name], "Process")
  }
}
