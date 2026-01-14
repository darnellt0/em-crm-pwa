# Elevated Movements CRM - Native Mobile App

This directory contains the Capacitor-based native mobile app that wraps the Google Apps Script web app in a native Android and iOS shell.

## Overview

The mobile app provides:
- **Native Android & iOS apps** that remove the Google Apps Script banner
- **Deep link support** for direct navigation (e.g., `emcrm://open?contact=Angela Davis`)
- **Native WebView** with full Google authentication support
- **Camera & Microphone** permissions for scanning and voice features
- **Safe-area support** for iPhone notch and home indicator
- **Splash screen** with brand colors
- **Offline-ready** architecture (via service worker caching)

## Architecture

```
mobile/
├── src/
│   ├── index.html          # Entry point with iframe container
│   ├── app.js              # Deep link handling & navigation logic
│   └── styles.css          # Styles with safe-area support
├── www/                    # Build output (generated)
├── android/                # Android native project (generated)
├── ios/                    # iOS native project (generated)
├── capacitor.config.ts     # Capacitor configuration
├── package.json            # Dependencies
├── build.js                # Build script
├── ANDROID_CONFIG.md       # Android setup guide
├── IOS_CONFIG.md           # iOS setup guide
└── README.md               # This file
```

## Quick Start

### 1. Install Dependencies

```bash
cd mobile
npm install
```

### 2. Build Web Assets

```bash
npm run build
```

This copies files from `src/` to `www/` for Capacitor to consume.

### 3. Add Platforms

#### Android:
```bash
npm run add:android
```

#### iOS (macOS only):
```bash
npm run add:ios
```

### 4. Configure Native Projects

After adding platforms, follow the configuration guides:

- **Android**: See [ANDROID_CONFIG.md](./ANDROID_CONFIG.md)
- **iOS**: See [IOS_CONFIG.md](./IOS_CONFIG.md)

Key configurations:
- Camera & microphone permissions
- Deep link intent filters / URL schemes
- Universal links (optional)
- App icons and splash screens

### 5. Sync Changes

After any web code changes, sync to native projects:

```bash
npm run sync
```

Or sync individually:
```bash
npm run sync:android
npm run sync:ios
```

### 6. Open in IDE

#### Android Studio:
```bash
npm run open:android
```

Then click the Play button to run on emulator or device.

#### Xcode (macOS only):
```bash
npm run open:ios
```

Select a simulator or device, then click Play (⌘R).

## Deep Link Testing

### Format

```
emcrm://open?contact=<name>
```

This navigates to:
```
https://script.google.com/.../exec?open=<name>
```

### Test on Android

Via ADB:
```bash
adb shell am start -W -a android.intent.action.VIEW -d "emcrm://open?contact=Angela%20Davis" com.elevatedmovements.crm
```

### Test on iOS Simulator

```bash
xcrun simctl openurl booted "emcrm://open?contact=Angela%20Davis"
```

### Test on iOS Device

1. Open Safari
2. Type in address bar: `emcrm://open?contact=Test`
3. Tap "Open" when prompted

## Development Workflow

### 1. Make Web Changes

Edit files in `src/`:
- `index.html` - Structure
- `app.js` - Logic
- `styles.css` - Styles

### 2. Rebuild and Sync

```bash
npm run build
npm run sync
```

### 3. Test in Native

Reload the app in Android Studio or Xcode to see changes.

## Build Commands

### All Commands

```bash
npm run build          # Build web assets (src → www)
npm run sync           # Sync web assets to native projects
npm run sync:android   # Sync Android only
npm run sync:ios       # Sync iOS only
npm run open:android   # Open Android Studio
npm run open:ios       # Open Xcode
npm run add:android    # Add Android platform
npm run add:ios        # Add iOS platform
npm run update         # Update Capacitor dependencies
```

## App Configuration

### App Info

Defined in `capacitor.config.ts`:

- **App ID**: `com.elevatedmovements.crm`
- **App Name**: `Elevated Movements CRM`
- **Display Name**: `EM CRM`

### Brand Colors

- **Primary**: `#36013f` (Deep purple)
- **Background**: `#f8f9fa` (Light gray)

### Web App URL

```
https://script.google.com/macros/s/AKfycbymRy5KW0vqL-cHcU73wzZtNe3J8syB8tbFVeM2wCzFpUCrJEF_BabEWSQSXLdSpdRH/exec
```

This is hardcoded in `src/app.js` as `BASE_URL`.

## Security

### Navigation Allowlist

Only these domains are allowed (configured in `capacitor.config.ts`):

- `script.google.com` (Apps Script)
- `accounts.google.com` (Google login)
- `*.googleusercontent.com` (Google assets)
- `www.google.com` (Auth flows)
- `ssl.gstatic.com` (Google static content)

### HTTPS Only

Cleartext (HTTP) traffic is disabled. Only HTTPS is allowed.

### No Secrets Embedded

The app does not contain API keys or secrets. Authentication is handled by Google's OAuth flow.

## Permissions

### Android

Defined in `AndroidManifest.xml`:
- Camera
- Microphone
- Internet
- Network state

### iOS

Defined in `Info.plist`:
- Camera (NSCameraUsageDescription)
- Microphone (NSMicrophoneUsageDescription)
- Photo Library (optional)

## Offline Support

The app uses an iframe-based architecture which delegates caching to the Google Apps Script web app. To add offline support:

1. Implement a service worker in the Apps Script project
2. Cache static assets (JS, CSS, images)
3. Show offline UI when network is unavailable

Note: Full offline functionality is limited by the Apps Script web app's architecture.

## Troubleshooting

### Build fails with "Cannot find module"

```bash
# Clean install
rm -rf node_modules package-lock.json
npm install
```

### Changes not appearing in app

```bash
# Rebuild and sync
npm run build
npm run sync
```

### Deep links not working

- **Android**: Check `AndroidManifest.xml` intent filters
- **iOS**: Check `Info.plist` URL schemes
- Test with command-line tools (see above)

### Camera/Microphone not working

- **Android**: Check `AndroidManifest.xml` permissions
- **iOS**: Check `Info.plist` usage descriptions
- Verify permissions granted in device settings

### Google auth issues

- Ensure `allowNavigation` includes all Google domains
- Check that iframe sandbox allows popups
- Test with a different Google account

### White screen on launch

- Check browser console in native IDE debuggers
- Verify `BASE_URL` is correct in `app.js`
- Check network connectivity

## Production Builds

### Android APK/AAB

```bash
cd android
./gradlew assembleRelease    # APK
./gradlew bundleRelease       # AAB (for Play Store)
```

Output:
- APK: `android/app/build/outputs/apk/release/app-release.apk`
- AAB: `android/app/build/outputs/bundle/release/app-release.aab`

### iOS IPA

In Xcode:
1. Product → Archive
2. Distribute App → App Store Connect
3. Upload to TestFlight

## Next Steps

1. **Add App Icons**
   - Android: Use Android Studio's Image Asset tool
   - iOS: Use Xcode's AppIcon asset catalog

2. **Create Splash Screens**
   - Generate images for all device densities
   - Place in native asset folders

3. **Set Up Universal Links**
   - Configure domain with `.well-known/apple-app-site-association`
   - Add associated domains in Xcode

4. **Test on Real Devices**
   - Install on physical Android device
   - Install on physical iPhone

5. **Prepare for Store Submission**
   - Write app descriptions
   - Create screenshots (all device sizes)
   - Set up privacy policy URL
   - Complete store listings

## Resources

- [Capacitor Docs](https://capacitorjs.com/docs)
- [Android Developer Guide](https://developer.android.com/)
- [iOS Developer Guide](https://developer.apple.com/ios/)
- [Deep Linking Guide](https://capacitorjs.com/docs/guides/deep-links)

## Support

For issues specific to:
- **Mobile app wrapper**: Check this README and config guides
- **CRM functionality**: Contact Elevated Movements support
- **Google Apps Script**: Check Apps Script project

## License

This mobile app wrapper is proprietary to Elevated Movements.
