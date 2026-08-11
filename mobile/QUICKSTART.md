# EM CRM Mobile Quick Start

## Android on Windows

```powershell
cd F:\dev\em-crm-pwa\mobile
npm install
npm run build

# Run only when mobile/android does not exist:
npm run add:android

npm run assets
npm run sync:android
npm run open:android
```

In Android Studio, wait for Gradle sync, select an emulator or connected phone,
and click **Run**.

Test the custom link:

```powershell
adb shell am start -W -a android.intent.action.VIEW -d "emcrm://open?contact=Angela%20Davis" com.elevatedmovements.crm
```

Test the HTTPS App Link after association is configured:

```powershell
adb shell am start -W -a android.intent.action.VIEW -d "https://crm.elevatedmovements.com/contacts?q=Angela%20Davis" com.elevatedmovements.crm
```

## iOS on macOS

```bash
cd /path/to/CRM/mobile
npm install
npm run build

# Run only when mobile/ios does not exist:
npm run add:ios

npm run assets
npm run sync:ios
npm run open:ios
```

Choose an Apple Development team in Xcode, select a simulator or connected
iPhone, and click **Run**.

```bash
xcrun simctl openurl booted "emcrm://open?contact=Angela%20Davis"
```

For release signing and HTTPS magic-link handoff, continue with
[ASSOCIATED_LINKS.md](ASSOCIATED_LINKS.md), [ANDROID_CONFIG.md](ANDROID_CONFIG.md),
and [IOS_CONFIG.md](IOS_CONFIG.md).
