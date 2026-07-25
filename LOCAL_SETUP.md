# Local MVP Setup Guide

This guide covers how to set up the Elevated Movements CRM for local daily use on Windows (via WSL) or macOS.

## Prerequisites

1. **Docker Desktop** (Make sure WSL2 integration is enabled if on Windows)
2. **Node.js 20+** (We recommend using `nvm` or `nvm-windows`)
3. **pnpm** (`npm install -g pnpm`)
4. *(Optional)* **Ollama** installed on your host machine for AI features

## Step 1: Clone and Install

Open your terminal (WSL on Windows) and run:

```bash
git clone https://github.com/darnellt0/em-crm-pwa.git
cd em-crm-pwa
pnpm install
```

## Step 2: Environment Variables

Copy the example environment file:

```bash
cp .env.example .env.local
```

Open `.env.local` and update the following:

1. **`NEXTAUTH_SECRET`**: Generate a secure random string. You can run `openssl rand -base64 32` in your terminal and paste the result here.
2. **`INTERNAL_SERVICE_TOKEN`**: Generate another random string for internal API calls (like the embedding worker).
3. **`ADMIN_EMAILS`**: Enter the exact email addresses that should have full access, separated by commas. At least one is required.
4. **Role lists**: Add other invited users to `PARTNER_ADMIN_EMAILS`, `STAFF_EMAILS`, or `READ_ONLY_EMAILS`. These lists set the initial role for new users; later role changes in Settings persist across sign-ins. `ALLOWED_EMAILS` grants the initial `staff` role. Unlisted addresses are denied.
5. **`NEXTAUTH_URL`**: Set this to the exact URL both users will open. For private remote access, use this computer's Tailscale URL or IP, such as `http://100.x.y.z:3001`.
6. **`OLLAMA_URL`**:
   - If Ollama is running on your host machine (Windows/Mac), use `http://host.docker.internal:11434`
   - If Ollama is running directly in WSL or Linux, use `http://127.0.0.1:11434`

## Step 3: Start Infrastructure (Docker)

Start the PostgreSQL database, pgvector, MailHog (for emails), and n8n:

```bash
docker compose up -d
```

Verify everything is running:
- MailHog UI: http://localhost:8025
- n8n UI: http://localhost:5678

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

MailHog is a shared development inbox, not a production email service. For daily remote use, configure `SMTP_HOST`, `SMTP_PORT`, `SMTP_SECURE`, `SMTP_USER`, `SMTP_PASSWORD`, and `EMAIL_FROM` for a real SMTP provider, then remove `NEXT_PUBLIC_MAIL_PREVIEW_URL`.

Do not expose ports 5434, 5678, 8025, or 1025 to the public internet. Use Tailscale or another private network for multi-device access.

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

## Troubleshooting

- **Magic link fails or redirects to sign-in**: Ensure `NEXTAUTH_URL` exactly matches the URL you are visiting, including host and port.
- **Ollama connection refused**: Ensure Ollama is running and the `OLLAMA_URL` is correct for your environment. If using WSL, you may need to set `OLLAMA_HOST=0.0.0.0` in your Windows environment variables so WSL can reach it.
- **Database connection errors**: Ensure Docker Desktop is running and the `em_postgres` container is healthy.
