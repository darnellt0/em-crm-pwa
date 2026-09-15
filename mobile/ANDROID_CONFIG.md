# Android Configuration

The generated Android project is configured for:

- package `com.elevatedmovements.crm`
- display name `EM CRM`
- custom scheme `emcrm://`
- HTTPS App Links on `crm.elevatedmovements.com`
- camera, microphone, internet, and network-state permissions
- no cleartext traffic

After changing web code or Capacitor dependencies:

```powershell
cd mobile
npm run sync:android
npm run assets
npm run open:android
```

The relevant native files are:

```text
android/app/src/main/AndroidManifest.xml
android/app/src/main/res/values/strings.xml
```

Do not manually lower Capacitor 8's generated minimum SDK. Use Android Studio's
bundled JDK for Gradle.

## Debug build

From PowerShell:

```powershell
cd mobile\android
.\gradlew.bat assembleDebug
```

APK output:

```text
mobile/android/app/build/outputs/apk/debug/app-debug.apk
```

## Release build

The release signing key and its Windows-protected credential stay outside the
repository under `%LOCALAPPDATA%\ElevatedMovements\Signing`. Build a signed
Android App Bundle without exposing the password on the command line:

```powershell
cd mobile
npm run release:android
```

The Play-ready bundle is written to
`android/app/build/outputs/bundle/release/app-release.aab`, and the directly
installable signed APK is written to
`android/app/build/outputs/apk/release/app-release.apk`. The script prints the
upload certificate SHA-256 fingerprint; configure that fingerprint for direct
or internal distribution. If Google Play App Signing is enabled, also add the
Play App Signing certificate fingerprint to
`ANDROID_APP_LINKS_SHA256_CERT_FINGERPRINTS` as described in
[ASSOCIATED_LINKS.md](ASSOCIATED_LINKS.md).

Install the signed APK on a connected test device with:

```powershell
adb install -r android/app/build/outputs/apk/release/app-release.apk
```

## Test links

```powershell
adb shell am start -W -a android.intent.action.VIEW -d "emcrm://open?contact=Angela%20Davis" com.elevatedmovements.crm
adb shell am start -W -a android.intent.action.VIEW -d "https://crm.elevatedmovements.com/contacts?q=Angela%20Davis" com.elevatedmovements.crm
```
