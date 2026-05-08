# Local MVP Setup Guide

This guide covers how to set up the Elevated Movements CRM for local daily use on Windows (via WSL) or macOS.

## Prerequisites

1. **Docker Desktop** (Make sure WSL2 integration is enabled if on Windows)
2. **Node.js 18+** (We recommend using `nvm` or `nvm-windows`)
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
3. **`OLLAMA_URL`**: 
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

*Note: The seed script deterministically creates Darnell and Shria as `admin` users. Any other user who signs in for the first time will default to the `staff` role.*

## Step 5: Start the App

```bash
pnpm dev
```

The app will be available at http://localhost:3000.

## Step 6: Verify Setup

Run the verification script to ensure all infrastructure, database, and app components are healthy:

```bash
pnpm verify
```

## Step 7: Sign In

1. Go to http://localhost:3000
2. Enter your email (e.g., `darnell@elevatedmovements.com` or `shria@elevatedmovements.com`)
3. Open MailHog at http://localhost:8025
4. Find the "Sign in to Elevated Movements CRM" email and click the magic link.

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

- **Magic link fails or redirects to sign-in**: Ensure `NEXTAUTH_URL` in `.env.local` exactly matches the URL you are visiting (e.g., `http://localhost:3000`).
- **Ollama connection refused**: Ensure Ollama is running and the `OLLAMA_URL` is correct for your environment. If using WSL, you may need to set `OLLAMA_HOST=0.0.0.0` in your Windows environment variables so WSL can reach it.
- **Database connection errors**: Ensure Docker Desktop is running and the `em_postgres` container is healthy.
