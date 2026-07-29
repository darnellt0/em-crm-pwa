# Gmail and Google Workspace Delivery

The CRM uses email magic links for sign-in. MailHog is appropriate for local testing, but Darnell and Shria need real email delivery for normal use.

## Google Account Prerequisites

1. Sign in to the Google account that will send CRM messages.
2. Enable 2-Step Verification.
3. Open the Google Account App Passwords page and create an app password for the CRM.
4. Keep the generated 16-character password available. Do not use the normal Google account password and do not paste either password into chat, an issue, or a committed file.

Google documentation:

- [Send email from a printer, scanner, or app](https://support.google.com/a/answer/176600)
- [Sign in with app passwords](https://support.google.com/accounts/answer/185833)

App passwords may be unavailable when a Workspace administrator disables them, the account uses security-key-only 2-Step Verification, or the account is enrolled in Advanced Protection. In that case, stop here and have the Workspace administrator enable an approved SMTP relay or use an OAuth-based mail integration.

## Activate Gmail Delivery

On the CRM Windows computer, open a regular PowerShell in the repository and run:

```powershell
cd F:\dev\em-crm-pwa
pnpm email:configure:gmail
```

The command defaults to the configured Shria account when no SMTP sender is already set. An explicit sender or test recipient can be supplied when needed:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File tools\configure-gmail-smtp.ps1 `
  -User sender@elevatedmovements.com `
  -Recipient recipient@example.com
```

Enter the Google app password at the hidden prompt. The command then:

1. Updates only the ignored `.env.local` file.
2. Connects to `smtp.gmail.com` over implicit TLS on port 465.
3. Sends a delivery test.
4. Builds the production app and restarts the `ElevatedMovementsCRM` scheduled task.
5. Confirms the CRM health endpoint is responding.

If verification, build, restart, or health checking fails, the command restores the previous email settings. MailHog therefore remains the working fallback until Gmail is verified.

## Verify or Recheck

Verify the configured SMTP connection without sending a message:

```powershell
pnpm email:verify
```

Verify it and send a test message:

```powershell
pnpm email:verify -- --send --to recipient@example.com
```

After activation, request a CRM magic link from the normal sign-in page and confirm it arrives in the recipient's Gmail inbox. Also check Spam once during initial setup.
