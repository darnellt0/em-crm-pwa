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

Create and protect a release keystore outside the repository, configure Android
Studio signing, and build an Android App Bundle. Use the final release/Play App
Signing SHA-256 fingerprint in `ANDROID_APP_LINKS_SHA256_CERT_FINGERPRINTS` as
described in [ASSOCIATED_LINKS.md](ASSOCIATED_LINKS.md).

## Test links

```powershell
adb shell am start -W -a android.intent.action.VIEW -d "emcrm://open?contact=Angela%20Davis" com.elevatedmovements.crm
adb shell am start -W -a android.intent.action.VIEW -d "https://crm.elevatedmovements.com/contacts?q=Angela%20Davis" com.elevatedmovements.crm
```
