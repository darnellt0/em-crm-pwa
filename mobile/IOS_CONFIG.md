# iOS Configuration

iOS generation and builds require macOS with Xcode 26 or newer.

```bash
cd mobile
npm install
npm run add:ios       # only when mobile/ios does not exist
npm run assets
npm run sync:ios
npm run open:ios
```

In Xcode:

1. Select the **App** target and set bundle identifier
   `com.elevatedmovements.crm`.
2. Select your Apple Development team under **Signing & Capabilities**.
3. Confirm **Associated Domains** includes
   `applinks:crm.elevatedmovements.com`.
4. Confirm the app display name is **EM CRM**.

`Info.plist` must contain:

- `NSCameraUsageDescription`
- `NSMicrophoneUsageDescription`
- the `emcrm` URL scheme
- `WKAppBoundDomains` entries for `localhost` and
  `crm.elevatedmovements.com`

The Associated Domains entitlement belongs in `App.entitlements`, not
`Info.plist`.

Test the custom scheme in Simulator:

```bash
xcrun simctl openurl booted "emcrm://open?contact=Angela%20Davis"
```

To make HTTPS links and Auth.js email callbacks open the app, configure the Apple
Team ID and redeploy the website as described in
[ASSOCIATED_LINKS.md](ASSOCIATED_LINKS.md).
