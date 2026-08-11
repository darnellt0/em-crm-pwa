# Local MVP Setup Guide

This guide covers how to set up the Elevated Movements CRM for local daily use on Windows (via WSL) or macOS.

## Prerequisites

1. **Docker Desktop** (Make sure WSL2 integration is enabled if on Windows)
2. **Node.js 20+** (We recommend using `nvm` or `nvm-windows`)
3. **pnpm** (`npm install -g pnpm`)
4. **Bash** (Git for Windows or WSL on Windows) for backup and restore scripts
5. *(Optional)* **Ollama** installed on your host machine for AI features

## Step 1: Clone and Install

Open your terminal (WSL on Windows) and run:

```bash
git clone https://github.com/darnellt0/em-crm-pwa.git
cd em-crm-pwa
pnpm install --frozen-lockfile
```

## Step 2: Environment Variables

Copy the example environment file:

```bash
cp .env.example .env
```

Open `.env` and update the following:

1. **`NEXTAUTH_SECRET`**: Generate a secure random string. You can run `openssl rand -base64 32` in your terminal and paste the result here.
2. **`INTERNAL_SERVICE_TOKEN`**: Generate another random string for internal API calls (like the embedding worker).
3. **`ADMIN_EMAILS`**: Enter the exact email addresses that should have full access, separated by commas. At least one is required.
4. **Role lists**: Add other invited users to `PARTNER_ADMIN_EMAILS`, `STAFF_EMAILS`, or `READ_ONLY_EMAILS`. These lists set the initial role for new users; later role changes in Settings persist across sign-ins. `ALLOWED_EMAILS` grants the initial `staff` role. Unlisted addresses are denied.
5. **`NEXTAUTH_URL`**: Set this to the exact URL both users will open. For private remote access, use this computer's Tailscale URL or IP, such as `http://100.x.y.z:3001`.
6. **`CRM_PRIVATE_BIND_IP`**: Keep `127.0.0.1` unless another tailnet device must open MailHog. During local MailHog use, set it to the host's Tailscale IP. PostgreSQL, SMTP, and n8n remain localhost-only.
7. **`OPENCLAW_WRITE_TOKEN`**: Generate a third random string that is different from `INTERNAL_SERVICE_TOKEN`.
8. **`OLLAMA_URL`**:
   - If Ollama is running on your host machine (Windows/Mac), use `http://host.docker.internal:11434`
   - If Ollama is running directly in WSL or Linux, use `http://127.0.0.1:11434`

The ignored `.env.local` file is optional. Next.js and `pnpm verify` load it
after `.env` for machine-specific application overrides, but Docker Compose
does not read it. Keep Compose settings such as `CRM_POSTGRES_PORT` and
`CRM_PRIVATE_BIND_IP` in `.env`.

For daily production use, leave the local SMTP values in place until you have a Google app password, then follow `GMAIL_SMTP_SETUP.md`. Do not put a normal Google account password in the environment file.

## Step 3: Start Infrastructure (Docker)

Start the PostgreSQL database, pgvector, MailHog (for emails), and n8n:

```bash
docker compose up -d
```

Verify everything is running:
- MailHog UI: http://localhost:8025
- n8n UI: http://localhost:5678

*Note: n8n is optional — the CRM does not depend on it. If you don't need workflow automation yet, you can start just the required services with `docker compose up -d postgres mailhog`.*

## Step 4: Database Setup & Seeding

Push the schema to the database and seed the initial users (Darnell and Shria):

```bash
pnpm db:push
pnpm db:seed
```

The seed script intentionally reconciles the configured role lists when it runs. It never creates an account for an unlisted address. Because seeding resets configured roles, do not rerun it after changing roles in Settings unless that reset is intended.

## Step 5: Start the App

```bash
pnpm dev
```

The app listens on all network interfaces at port 3001. Open the exact URL configured in `NEXTAUTH_URL`.

## Step 6: Verify Setup

Run the verification script to ensure all infrastructure, database, and app components are healthy:

```bash
pnpm verify
```

## Step 7: Sign In

1. Open the URL from `NEXTAUTH_URL`.
2. Enter an email listed in one of the configured role lists.
3. For local testing, open MailHog at the URL in `NEXT_PUBLIC_MAIL_PREVIEW_URL`.
4. Find the "Sign in to Elevated Movements CRM" email and click the magic link.

## Sharing One Instance Between Two People

The CRM runs on a single host machine and shares one database. For a second person (e.g. Shria) to use the same instance from another computer:

1. **Connect both machines to the same network.** The simplest safe option is [Tailscale](https://tailscale.com) (free for personal use) — install it on both machines and note the host machine's Tailscale name or IP (e.g. `main-pc.tailnet-name.ts.net` or `100.x.y.z`). Being on the same home/office Wi-Fi also works; use the host's LAN IP.
2. **Point `NEXTAUTH_URL` at the shared address.** In `.env` on the host, set:
   ```
   NEXTAUTH_URL="http://<host-address>:3001"
   ```
   Then restart the app. Magic sign-in links are generated from this URL, so **both people must open the CRM at this address** (including on the host machine — not `localhost`).
3. **During local testing, expose only MailHog's UI on the private address.** Set `CRM_PRIVATE_BIND_IP=<host-address>` in `.env`, recreate MailHog with `docker compose up -d mailhog`, and open `http://<host-address>:8025`. Replace MailHog with real SMTP before depending on the CRM for daily operations.
4. **Do not port-forward these ports to the public internet.** The app runs over plain HTTP with a dev mail catcher; keep access limited to your LAN or tailnet.

For daily use, run the host in production mode (faster than the dev server):

```bash
pnpm build
pnpm start
```
MailHog is a shared development inbox, not a production email service. For daily remote use, configure `SMTP_HOST`, `SMTP_PORT`, `SMTP_SECURE`, `SMTP_USER`, `SMTP_PASSWORD`, and `EMAIL_FROM` for a real SMTP provider, then remove `NEXT_PUBLIC_MAIL_PREVIEW_URL`.

For Gmail or Google Workspace on the Windows production host, use `pnpm email:configure:gmail`. It verifies delivery before restarting and automatically restores the previous configuration on failure.

Do not expose ports 5434, 5678, 8025, or 1025 to the public internet. Use Tailscale or another private network for multi-device access.

## Phone Access (PWA over Tailscale HTTPS)

Phones need an **HTTPS** URL to install the CRM as an app (Add to Home Screen requires a secure context). Tailscale provides one for free, without exposing anything to the public internet:

1. **Install Tailscale on each phone** and sign in to the same tailnet as the host machine.
2. **Enable HTTPS on the tailnet.** In the [Tailscale admin console](https://login.tailscale.com/admin/dns), turn on **MagicDNS** and **HTTPS Certificates**.
3. **On the host machine**, publish the CRM to the tailnet with a trusted certificate:
   ```powershell
   tailscale serve --bg 3001
   ```
   This serves `https://<machine-name>.<tailnet-name>.ts.net` → `localhost:3001`, visible only to devices on your tailnet.
4. **Point the app at the new URL.** In `.env`, set `NEXTAUTH_URL="https://<machine-name>.<tailnet-name>.ts.net"` and restart the CRM. Everyone (desktop and phone) must use this URL from now on, since magic links are generated from it.
5. **On each phone**, open the URL in the browser, sign in, then use **Add to Home Screen** (Android Chrome: menu → *Add to Home screen*; iPhone Safari: Share → *Add to Home Screen*). The CRM now opens like a native app.

**iPhone caveat:** a magic link tapped in the Mail app opens Safari, whose sign-in session is separate from the installed home-screen app. Either use the CRM in Safari directly, or copy the magic-link URL from the email and paste it into the installed app once — sessions last a long time, so this is rare.

**Native mobile app:** the `mobile/` folder contains a Capacitor Android/iOS shell, but it is hard-wired to `https://crm.elevatedmovements.com` (a public domain that is not set up) and cannot reach a Tailscale-only CRM. Treat it as a future option; the PWA path above is the supported way to use the CRM on phones today.

## Automatic Production Startup

Build the current version once, then install the per-user Windows scheduled tasks:

```powershell
pnpm build
pnpm ops:install
```

The tasks start the CRM 45 seconds after sign-in, create a database backup daily at 7:00 PM, and verify the newest backup in a temporary database every Sunday at 7:30 PM. They run only while the configured Windows user is signed in.

Check the running system at any time:

```powershell
pnpm health:production
```

Remove the tasks with:

```powershell
Get-ScheduledTask -TaskName "ElevatedMovementsCRM*" | Unregister-ScheduledTask -Confirm:$false
```

## Backup and Restore

To create a compressed backup of your local database:
```bash
pnpm backup:db
```
*Backups are saved to the `backups/` directory as `.sql.gz` files.*

To restore a backup (this will overwrite your current database):
```bash
pnpm restore:db ./backups/em_crm_backup_YYYYMMDD_HHMMSS.sql.gz
```

Verify that the latest backup can be restored without touching the live database:

```powershell
pnpm backup:verify
```

## Troubleshooting

- **Magic link fails or redirects to sign-in**: Ensure `NEXTAUTH_URL` exactly matches the URL you are visiting, including host and port.
- **Ollama connection refused**: Ensure Ollama is running and the `OLLAMA_URL` is correct for your environment. If using WSL, you may need to set `OLLAMA_HOST=0.0.0.0` in your Windows environment variables so WSL can reach it.
- **Database connection errors**: Ensure Docker Desktop is running and the `em_postgres` container is healthy.
- **`pnpm verify` says the app is unavailable**: Start `pnpm dev` (or the production task) first, then run verification from a second terminal.
- **Prisma reports `EPERM` while reinstalling on Windows**: The running production server has the Prisma engine DLL open. Stop only the CRM task with `Stop-ScheduledTask -TaskName ElevatedMovementsCRM`, rerun `pnpm install --frozen-lockfile`, then restore service with `Start-ScheduledTask -TaskName ElevatedMovementsCRM`.
