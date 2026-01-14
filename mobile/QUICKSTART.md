# EM CRM Mobile App - Quick Start Guide

Get the Elevated Movements CRM mobile app running in 5 minutes.

## Prerequisites

- **Node.js** 18+ and npm
- **For Android**: Android Studio + Android SDK
- **For iOS**: macOS with Xcode 15+

## Installation Steps

### 1. Install Dependencies

```bash
cd mobile
npm install
```

Expected output: All Capacitor packages installed (~2-3 minutes)

### 2. Build Web Assets

```bash
npm run build
```

Expected output: `www/` directory created with app files

### 3. Add Platform(s)

#### Android:
```bash
npm run add:android
```

Expected output: `android/` directory created

#### iOS (macOS only):
```bash
npm run add:ios
```

Expected output: `ios/` directory created

### 4. Configure Platform

#### Android Configuration:

Edit `android/app/src/main/AndroidManifest.xml`:

Add before `</manifest>`:
```xml
<uses-permission android:name="android.permission.CAMERA" />
<uses-permission android:name="android.permission.RECORD_AUDIO" />
```

Add inside `<activity>` (after existing intent-filter):
```xml
<intent-filter>
    <action android:name="android.intent.action.VIEW" />
    <category android:name="android.intent.category.DEFAULT" />
    <category android:name="android.intent.category.BROWSABLE" />
    <data android:scheme="emcrm" />
</intent-filter>
```

See [ANDROID_CONFIG.md](./ANDROID_CONFIG.md) for complete details.

#### iOS Configuration:

Edit `ios/App/App/Info.plist`:

Add before `</dict>`:
```xml
<key>NSCameraUsageDescription</key>
<string>EM CRM needs camera access to scan QR codes and take photos.</string>

<key>NSMicrophoneUsageDescription</key>
<string>EM CRM needs microphone access for voice features.</string>

<key>CFBundleURLTypes</key>
<array>
    <dict>
        <key>CFBundleURLName</key>
        <string>com.elevatedmovements.crm</string>
        <key>CFBundleURLSchemes</key>
        <array>
            <string>emcrm</string>
        </array>
    </dict>
</array>
```

See [IOS_CONFIG.md](./IOS_CONFIG.md) for complete details.

### 5. Open in IDE

#### Android Studio:
```bash
npm run open:android
```

Then:
1. Wait for Gradle sync
2. Select a device/emulator
3. Click Run button (green play icon)

#### Xcode:
```bash
npm run open:ios
```

Then:
1. Select a simulator or device
2. Click Run button (⌘R)

## Test Deep Links

### Android (via ADB):
```bash
adb shell am start -W -a android.intent.action.VIEW -d "emcrm://open?contact=Angela%20Davis" com.elevatedmovements.crm
```

### iOS (Simulator):
```bash
xcrun simctl openurl booted "emcrm://open?contact=Angela%20Davis"
```

### iOS (Device):
Open Safari and type: `emcrm://open?contact=Test`

## Common Commands

```bash
npm run build           # Rebuild web assets
npm run sync            # Sync changes to native projects
npm run sync:android    # Sync Android only
npm run sync:ios        # Sync iOS only
npm run open:android    # Open Android Studio
npm run open:ios        # Open Xcode
```

## Troubleshooting

### "Cannot find module @capacitor/cli"
```bash
npm install
```

### "www directory not found"
```bash
npm run build
```

### Changes not appearing
```bash
npm run build && npm run sync
```

### Deep links not working
- Android: Check `AndroidManifest.xml` has intent-filter
- iOS: Check `Info.plist` has CFBundleURLTypes

### Camera/Mic not working
- Android: Check permissions in `AndroidManifest.xml`
- iOS: Check usage descriptions in `Info.plist`

## Next Steps

1. **Customize branding**: Update icons and splash screens
2. **Test on real devices**: Install on physical devices
3. **Configure signing**: Set up code signing for production
4. **Prepare for stores**: Create store listings and screenshots

## Full Documentation

- [README.md](./README.md) - Complete documentation
- [ANDROID_CONFIG.md](./ANDROID_CONFIG.md) - Android details
- [IOS_CONFIG.md](./IOS_CONFIG.md) - iOS details

## Support

Issues? Check:
1. This QUICKSTART guide
2. [README.md](./README.md) troubleshooting section
3. [Capacitor docs](https://capacitorjs.com/docs)
