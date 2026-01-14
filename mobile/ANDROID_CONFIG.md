# Android Configuration Guide

After running `npm run add:android`, you'll need to make the following manual changes to the Android project.

## 1. AndroidManifest.xml

Location: `android/app/src/main/AndroidManifest.xml`

### Add Permissions

Add these permissions inside the `<manifest>` tag (before `<application>`):

```xml
<!-- Camera and Microphone permissions -->
<uses-permission android:name="android.permission.CAMERA" />
<uses-permission android:name="android.permission.RECORD_AUDIO" />

<!-- Internet permission (should already exist) -->
<uses-permission android:name="android.permission.INTERNET" />

<!-- Network state -->
<uses-permission android:name="android.permission.ACCESS_NETWORK_STATE" />
```

### Add Deep Link Intent Filter

Inside the `<activity>` tag (after the existing intent filters), add:

```xml
<!-- Deep link handler for emcrm:// -->
<intent-filter>
    <action android:name="android.intent.action.VIEW" />
    <category android:name="android.intent.category.DEFAULT" />
    <category android:name="android.intent.category.BROWSABLE" />

    <data android:scheme="emcrm" />
</intent-filter>

<!-- Universal Links placeholder (update with actual domain) -->
<intent-filter android:autoVerify="true">
    <action android:name="android.intent.action.VIEW" />
    <category android:name="android.intent.category.DEFAULT" />
    <category android:name="android.intent.category.BROWSABLE" />

    <data android:scheme="https" />
    <data android:host="elevatedmovements.com" />
    <data android:pathPrefix="/app" />
</intent-filter>
```

### Configure Application

Ensure `android:usesCleartextTraffic="false"` (should be default):

```xml
<application
    android:usesCleartextTraffic="false"
    ...>
```

## 2. build.gradle (Module: app)

Location: `android/app/build.gradle`

Ensure minimum SDK version is set correctly:

```gradle
android {
    defaultConfig {
        minSdkVersion 22
        targetSdkVersion 34
        ...
    }
}
```

## 3. strings.xml

Location: `android/app/src/main/res/values/strings.xml`

Update app name:

```xml
<resources>
    <string name="app_name">EM CRM</string>
    <string name="title_activity_main">Elevated Movements CRM</string>
    <string name="package_name">com.elevatedmovements.crm</string>
    <string name="custom_url_scheme">emcrm</string>
</resources>
```

## 4. Test Deep Links

### Via ADB:

```bash
# Test deep link
adb shell am start -W -a android.intent.action.VIEW -d "emcrm://open?contact=Angela%20Davis" com.elevatedmovements.crm

# Test universal link (when configured)
adb shell am start -W -a android.intent.action.VIEW -d "https://elevatedmovements.com/app/open?contact=Angela%20Davis" com.elevatedmovements.crm
```

## 5. Build & Run

```bash
# Open Android Studio
npm run open:android

# Or build APK via command line
cd android
./gradlew assembleDebug

# Output: android/app/build/outputs/apk/debug/app-debug.apk
```

## 6. Permissions Handling

The app will automatically request camera and microphone permissions when needed. No additional code is required in Capacitor 6.

## 7. Splash Screen & Icons

### Splash Screen
- Location: `android/app/src/main/res/drawable/splash.png`
- Recommended size: 2732x2732 (for xxxhdpi)
- Background color is set in capacitor.config.ts

### App Icons
Use Android Studio's Image Asset tool:
1. Right-click `res` folder → New → Image Asset
2. Choose "Launcher Icons (Adaptive and Legacy)"
3. Upload your icon image
4. Generate icons for all densities

Or manually place icons in:
- `mipmap-mdpi` (48x48)
- `mipmap-hdpi` (72x72)
- `mipmap-xhdpi` (96x96)
- `mipmap-xxhdpi` (144x144)
- `mipmap-xxxhdpi` (192x192)

## Troubleshooting

### Camera/Microphone not working
- Check permissions in AndroidManifest.xml
- Verify permissions are granted in device Settings → Apps → EM CRM

### Deep links not working
- Verify intent filter in AndroidManifest.xml
- Test with ADB command above
- Check logcat for errors: `adb logcat | grep emcrm`

### App not loading CRM
- Check network connectivity
- Verify allowNavigation in capacitor.config.ts
- Check browser console in Android Studio's logcat
