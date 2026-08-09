# EM CRM Mobile

This directory contains the standalone Capacitor 8 client for Elevated
Movements CRM.

- App Store name: **Elevated Movements CRM**
- Device display name: **EM CRM**
- Bundle/application ID: `com.elevatedmovements.crm`
- Canonical CRM: `https://crm.elevatedmovements.com`

The native app starts from a small bundled shell and then navigates its WebView
to the allowlisted HTTPS CRM. It does not use an iframe, store credentials, skip
Auth.js, or include the retired Google Apps Script URL. Because the CRM is a
server-rendered Next.js application, an internet connection is required for CRM
data; the bundled launch/offline shell itself is cached.

This is a thin client for a private business system. Capacitor documents remote
WebView navigation as primarily a development feature, and public app stores may
require additional native value under their minimum-functionality policies.
Direct device/internal distribution is unaffected; review the current store
rules before a public listing.

## Prerequisites

- Node.js 22 or newer
- Android Studio 2025.2.1 or newer with an Android SDK (Android builds)
- macOS with Xcode 26 or newer and an Apple Developer account (iOS builds)

These versions follow the Capacitor 8 requirements. Android Studio's bundled
JDK is preferred over an older system Java installation.

## Install and build

```powershell
cd mobile
npm install
npm run build
```

`npm run build` bundles `src/app.js` and copies the local shell to `www/`.

## Native platforms

If the platform directory is already present, skip the corresponding `add`
command and run `sync` instead.

```powershell
# Android (Windows, macOS, or Linux)
npm run add:android
npm run assets
npm run sync:android
npm run open:android

# iOS (macOS only)
npm run add:ios
npm run assets
npm run sync:ios
npm run open:ios
```

After any change under `mobile/src/`, run `npm run sync` before rebuilding in
Android Studio or Xcode.

## Deep links and magic-link sign-in

The app accepts both forms:

```text
emcrm://open?contact=Angela%20Davis
https://crm.elevatedmovements.com/contacts?q=Angela%20Davis
```

The custom link opens the current contact-search route. HTTPS Universal/App
Links also preserve Auth.js callback URLs, allowing an email magic link to set
the session cookie inside the app's WebView.

Native link registration is included, but verified HTTPS links require the
public Apple Team ID and Android release-certificate SHA-256 fingerprint to be
configured on the deployed CRM. See [ASSOCIATED_LINKS.md](ASSOCIATED_LINKS.md).

## Security model

- Only HTTPS `crm.elevatedmovements.com` navigation is allowed in the app.
- Android cleartext and mixed content are disabled.
- Incoming URLs are parsed and checked before navigation.
- Authentication remains Auth.js email magic links and the existing email
  allowlist. The mobile client contains no service tokens or secrets.
- Camera and microphone usage descriptions are declared for CRM media features;
  the OS asks for access only if web code invokes those device APIs.

## Files

```text
mobile/
  assets/                 source icon and splash images
  src/                    bundled local launch/offline shell
  test/                   deep-link resolver tests
  android/                generated Android project
  ios/                    generated iOS project (created on macOS)
  capacitor.config.ts     app identity and WebView policy
```

## Troubleshooting

### Platform already exists

Do not rerun `npm run add:android` or `npm run add:ios`. Use:

```powershell
npm run sync:android
# or, on macOS
npm run sync:ios
```

### `npm run sync` fails because iOS is missing

On Windows, use `npm run sync:android`. On a Mac, create iOS once with
`npm run add:ios`, then run `npm run sync:ios`.

### `npm run assets` is missing

Use the committed `mobile/package.json` and run `npm install` from `mobile/`.
The `assets` script runs the installed `@capacitor/assets` package.

### Android uses Java 8

Open the project through Android Studio and set Gradle JDK to Android Studio's
bundled JDK under **Settings > Build Tools > Gradle**. Do not use an old Java 8
installation for Capacitor 8.

### Magic link opens the browser

Finish the domain-association setup, deploy the CRM, uninstall and reinstall the
native app, and verify both `/.well-known/` endpoints. Association files are
cached by mobile operating systems.
