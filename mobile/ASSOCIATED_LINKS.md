# HTTPS App/Universal Links

HTTPS link association is required for Auth.js email magic links to open and
complete sign-in inside the installed app.

The CRM exposes these public endpoints:

```text
https://crm.elevatedmovements.com/.well-known/assetlinks.json
https://crm.elevatedmovements.com/.well-known/apple-app-site-association
```

They intentionally return empty association lists until real signing identifiers
are configured. Placeholder identifiers are rejected rather than published.

## Android

Obtain the SHA-256 fingerprint from the same certificate used to sign the app:

```bash
keytool -list -v -keystore /secure/path/em-crm-release.jks -alias em-crm
```

Configure the deployed CRM environment:

```text
ANDROID_APP_LINKS_SHA256_CERT_FINGERPRINTS=AA:BB:...:FF
```

Multiple fingerprints (for example Play App Signing plus a local release key)
may be comma-separated. Do not commit keystores or passwords.

## iOS

Find the 10-character Team ID in the Apple Developer portal, enable **Associated
Domains** for `com.elevatedmovements.crm`, and configure:

```text
APPLE_TEAM_ID=A1B2C3D4E5
```

The native entitlement is `applinks:crm.elevatedmovements.com`.

## Deploy and verify

After setting the values, rebuild/restart the CRM deployment and confirm both
URLs return HTTP 200 JSON with the expected app identifier. They must not
redirect to `/auth/signin`.

Then uninstall and reinstall the native app before testing; Android and iOS cache
domain-association results.
