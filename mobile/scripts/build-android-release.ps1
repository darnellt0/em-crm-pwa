[CmdletBinding()]
param(
  [string]$CredentialPath,
  [string]$KeystorePath
)

$ErrorActionPreference = "Stop"
$mobileRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$androidRoot = Join-Path $mobileRoot "android"
$signingRoot = Join-Path $env:LOCALAPPDATA "ElevatedMovements\Signing"

if (-not $CredentialPath) {
  $credentialFile = Get-ChildItem -LiteralPath $signingRoot -Filter "em-crm-upload-*.credential.xml" -File |
    Sort-Object LastWriteTime -Descending |
    Select-Object -First 1
  if (-not $credentialFile) {
    throw "No encrypted EM CRM Android credential was found under $signingRoot."
  }
  $CredentialPath = $credentialFile.FullName
}

$CredentialPath = (Resolve-Path -LiteralPath $CredentialPath).Path
if (-not $KeystorePath) {
  $KeystorePath = $CredentialPath -replace '\.credential\.xml$', '.jks'
}
$KeystorePath = (Resolve-Path -LiteralPath $KeystorePath).Path

$credential = Import-Clixml -LiteralPath $CredentialPath
if ($credential -isnot [System.Management.Automation.PSCredential]) {
  throw "The signing credential file does not contain a Windows-protected PSCredential."
}

$bundledJdk = Join-Path $env:ProgramFiles "Android\Android Studio\jbr"
if (-not (Test-Path -LiteralPath (Join-Path $bundledJdk "bin\java.exe"))) {
  throw "Android Studio's bundled JDK was not found at $bundledJdk."
}

$savedJavaHome = $env:JAVA_HOME
$savedPath = $env:Path
$savedSigningValues = @{
  EM_CRM_ANDROID_KEYSTORE = $env:EM_CRM_ANDROID_KEYSTORE
  EM_CRM_ANDROID_KEYSTORE_PASSWORD = $env:EM_CRM_ANDROID_KEYSTORE_PASSWORD
  EM_CRM_ANDROID_KEY_ALIAS = $env:EM_CRM_ANDROID_KEY_ALIAS
  EM_CRM_ANDROID_KEY_PASSWORD = $env:EM_CRM_ANDROID_KEY_PASSWORD
}

try {
  $password = $credential.GetNetworkCredential().Password
  $env:JAVA_HOME = $bundledJdk
  $env:Path = "$(Join-Path $bundledJdk 'bin');$savedPath"
  $env:EM_CRM_ANDROID_KEYSTORE = $KeystorePath
  $env:EM_CRM_ANDROID_KEYSTORE_PASSWORD = $password
  $env:EM_CRM_ANDROID_KEY_ALIAS = $credential.UserName
  $env:EM_CRM_ANDROID_KEY_PASSWORD = $password

  Push-Location $androidRoot
  try {
    & .\gradlew.bat --no-daemon bundleRelease assembleRelease
    if ($LASTEXITCODE -ne 0) {
      throw "Gradle release build failed with exit code $LASTEXITCODE."
    }
  } finally {
    Pop-Location
  }

  $bundlePath = Join-Path $androidRoot "app\build\outputs\bundle\release\app-release.aab"
  $apkPath = Join-Path $androidRoot "app\build\outputs\apk\release\app-release.apk"
  if (-not (Test-Path -LiteralPath $bundlePath)) {
    throw "Gradle succeeded but no release bundle was found at $bundlePath."
  }
  if (-not (Test-Path -LiteralPath $apkPath)) {
    throw "Gradle succeeded but no installable release APK was found at $apkPath."
  }

  $keytool = Join-Path $bundledJdk "bin\keytool.exe"
  $certificate = & $keytool -list -v -keystore $KeystorePath -alias $credential.UserName -storepass:env EM_CRM_ANDROID_KEYSTORE_PASSWORD
  if ($LASTEXITCODE -ne 0) {
    throw "The release bundle was built, but its signing certificate could not be verified."
  }
  $sha256 = ($certificate | Select-String -Pattern '^\s*SHA256:\s*(.+)$').Matches.Groups[1].Value.Trim()

  Write-Output "Signed Android App Bundle: $bundlePath"
  Write-Output "Signed installable Android APK: $apkPath"
  Write-Output "Signing certificate SHA-256: $sha256"
} finally {
  $env:JAVA_HOME = $savedJavaHome
  $env:Path = $savedPath
  foreach ($name in $savedSigningValues.Keys) {
    $value = $savedSigningValues[$name]
    if ($null -eq $value) {
      Remove-Item "Env:\$name" -ErrorAction SilentlyContinue
    } else {
      Set-Item "Env:\$name" $value
    }
  }
  Remove-Variable password -ErrorAction SilentlyContinue
  Remove-Variable credential -ErrorAction SilentlyContinue
}
