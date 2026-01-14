# iOS Configuration Guide

After running `npm run add:ios`, you'll need to make the following manual changes to the iOS project.

## 1. Info.plist

Location: `ios/App/App/Info.plist`

### Add Privacy Permissions

Add these keys before the closing `</dict>` tag:

```xml
<!-- Camera Permission -->
<key>NSCameraUsageDescription</key>
<string>EM CRM needs camera access to scan QR codes and take photos.</string>

<!-- Microphone Permission -->
<key>NSMicrophoneUsageDescription</key>
<string>EM CRM needs microphone access for voice features.</string>

<!-- Photo Library (optional, if saving photos) -->
<key>NSPhotoLibraryAddUsageDescription</key>
<string>EM CRM needs permission to save photos to your library.</string>

<key>NSPhotoLibraryUsageDescription</key>
<string>EM CRM needs permission to access your photo library.</string>
```

### Add URL Scheme for Deep Links

```xml
<!-- Deep Link URL Schemes -->
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

### Add Universal Links (Associated Domains)

This requires a valid domain with an `apple-app-site-association` file.

```xml
<!-- Universal Links -->
<key>com.apple.developer.associated-domains</key>
<array>
    <string>applinks:elevatedmovements.com</string>
</array>
```

## 2. Xcode Project Settings

Open the project in Xcode: `npm run open:ios`

### General Tab

1. **Display Name**: `EM CRM`
2. **Bundle Identifier**: `com.elevatedmovements.crm`
3. **Version**: `1.0.0`
4. **Build**: `1`
5. **Deployment Target**: iOS 13.0 or higher

### Signing & Capabilities

1. **Signing**: Select your development team
2. **Automatically manage signing**: ✓ (enabled)

3. **Add Capability**: Associated Domains (for Universal Links)
   - Click "+ Capability"
   - Search for "Associated Domains"
   - Add domain: `applinks:elevatedmovements.com`

### Build Settings

Search for "Deployment Target" and ensure it's set to iOS 13.0 or higher.

## 3. Universal Links Setup (Optional - For Production)

### On Your Server

Create a file at:
`https://elevatedmovements.com/.well-known/apple-app-site-association`

Content:
```json
{
  "applinks": {
    "apps": [],
    "details": [
      {
        "appID": "TEAMID.com.elevatedmovements.crm",
        "paths": ["/app/*"]
      }
    ]
  }
}
```

Replace `TEAMID` with your Apple Developer Team ID (found in Xcode).

### Verify

Test at: https://branch.io/resources/aasa-validator/

## 4. Test Deep Links

### Via Terminal (Simulator):

```bash
# Start simulator
open -a Simulator

# Install app
npm run sync:ios
npm run open:ios
# Then run in Xcode

# Test deep link (while app is running)
xcrun simctl openurl booted "emcrm://open?contact=Angela%20Davis"

# Test universal link (when configured)
xcrun simctl openurl booted "https://elevatedmovements.com/app/open?contact=Angela%20Davis"
```

### Via Safari (Device):

1. Open Safari on your iOS device
2. Type in address bar: `emcrm://open?contact=Test`
3. Tap "Open" when prompted

## 5. App Icons & Splash Screen

### App Icons

Use Xcode's AppIcon asset:

1. Open Xcode: `npm run open:ios`
2. Navigate to: `App → Assets.xcassets → AppIcon`
3. Drag and drop icons for each required size:
   - 20pt: 40x40, 60x60
   - 29pt: 58x58, 87x87
   - 40pt: 80x80, 120x120
   - 60pt: 120x120, 180x180
   - 1024pt: 1024x1024 (App Store)

Or use online tools like:
- https://www.appicon.co/
- https://makeappicon.com/

### Splash Screen (Launch Storyboard)

Location: `ios/App/App/Assets.xcassets/Splash.imageset/`

1. Export splash images (PNG, transparent background):
   - splash.png (1x): 1334x1334
   - splash@2x.png (2x): 2668x2668
   - splash@3x.png (3x): 4002x4002

2. Background color is set in capacitor.config.ts (`#36013f`)

## 6. Build & Run

### For Simulator:

```bash
npm run sync:ios
npm run open:ios
```

Then in Xcode:
1. Select simulator (e.g., iPhone 15 Pro)
2. Click Play button (⌘R)

### For Device (Development):

1. Connect iPhone via USB
2. Select your device in Xcode
3. Click Play button (⌘R)
4. Trust the developer certificate on device:
   Settings → General → VPN & Device Management

### For TestFlight (Production):

```bash
# Archive the app in Xcode:
# Product → Archive
# Then: Distribute App → App Store Connect → Upload
```

## 7. Troubleshooting

### "Untrusted Enterprise Developer"
- Settings → General → VPN & Device Management
- Tap your developer account → Trust

### Deep links not working
- Verify URL scheme in Info.plist
- Check that `CFBundleURLSchemes` includes `emcrm`
- Test with `xcrun simctl openurl` command

### Camera/Microphone not working
- Check usage descriptions in Info.plist
- Verify permissions: Settings → EM CRM
- Reset privacy warnings: Settings → General → Reset → Reset Location & Privacy

### App not loading CRM
- Check network connectivity
- Verify allowNavigation in capacitor.config.ts
- Check Safari Web Inspector:
  1. Enable: Settings → Safari → Advanced → Web Inspector
  2. Safari (Mac) → Develop → [Your Device] → App

### Safe area issues (notch/home indicator)
- Ensure viewport includes `viewport-fit=cover`
- Use CSS `env(safe-area-inset-*)` variables
- Already implemented in styles.css

## 8. Performance Optimization

### Enable WKWebView optimizations:

In capacitor.config.ts (already configured):
```typescript
ios: {
  contentInset: 'automatic'
}
```

### Disable bounce scroll (optional):

Add to capacitor.config.ts:
```typescript
ios: {
  contentInset: 'automatic',
  scrollEnabled: false
}
```

## 9. App Store Submission

Before submitting to App Store:

1. **App Privacy**: Create privacy policy URL
2. **Screenshots**: Required for all device sizes
3. **App Description**: Write compelling copy
4. **Keywords**: Optimize for search
5. **Version**: Set to 1.0.0
6. **Build Number**: Increment for each upload
7. **Export Compliance**: Answer export questions

### Archive Checklist:
- [ ] Version and build number updated
- [ ] Release build configuration
- [ ] Signing with Distribution certificate
- [ ] All device sizes tested
- [ ] Privacy permissions working
- [ ] Deep links tested
- [ ] No debug code or logs
