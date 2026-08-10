# Elevated Movements CRM V1.6.1

AI-powered Contact Relationship Management system built with Next.js 15, Prisma, PostgreSQL (pgvector), Auth.js, and Ollama.

## Features

- **Contact Management** — Full CRUD with lifecycle stages, tags, owner assignment, follow-up tracking
- **AI Memory Extraction** — Automatically extracts factual insights from interaction notes using Ollama (qwen2.5:7b-instruct)
- **Memory Inbox** — Review, approve, pin, or reject AI-proposed memory items with bulk actions
- **Semantic Search** — Natural language search across approved memories using pgvector cosine similarity
- **Opportunities Pipeline** — Kanban-style drag-and-drop board for tracking deals through stages
- **Task Management** — Priority levels (low/medium/high/urgent), due dates, contact linking
- **CSV Import** — 5-step staged wizard (Upload → Map → Validate → Run → Done) with deduplication preview
- **Saved Views** — Save and share filtered/sorted contact list configurations
- **Programs & Enrollments** — Track programs and contact enrollments
- **Workflow Automation** — n8n integration for building custom automation workflows
- **Role-Based Access Control** — Admin, partner_admin, staff, read_only roles with hierarchy
- **Auth.js Magic Links** — Passwordless email authentication via SMTP

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Framework | Next.js 15 (App Router) |
| Database | PostgreSQL 16 + pgvector |
| ORM | Prisma |
| Auth | Auth.js (NextAuth v4) with Email Provider |
| AI/LLM | Ollama (qwen2.5:7b-instruct + nomic-embed-text) |
| UI | Tailwind CSS + shadcn/ui + Radix UI |
| Automation | n8n (self-hosted) |
| Email (dev) | MailHog |
| Notifications | Sonner |

## Prerequisites

- Docker & Docker Compose
- Node.js 20+
- pnpm

## Quick Start

```bash
# 1. Clone the repository
git clone https://github.com/darnellt0/em-crm-pwa.git
cd em-crm-pwa

# 2. Create the canonical local environment file
cp .env.example .env
# Edit .env with your local credentials, allowlists, and secrets

# 3. Install dependencies and generate the Prisma client
pnpm install --frozen-lockfile

# 4. Start infrastructure (PostgreSQL + MailHog + n8n)
docker compose up -d

# 5. Run database migrations and seed users
pnpm db:push
pnpm db:seed

# 6. Start the development server
pnpm dev

# 7. In another terminal, verify the running system
pnpm verify
```

Open the URL configured in `NEXTAUTH_URL` and sign in with an allowlisted email. For local development, check MailHog at the URL configured in `NEXT_PUBLIC_MAIL_PREVIEW_URL`.

For Day 1 operating instructions, local backup, and import verification, see `docs/day-1-runbook.md`.

`.env` is canonical because Docker Compose and Prisma load it directly. Next.js
also loads an optional ignored `.env.local` file for machine-specific application
overrides; `pnpm verify` applies the same override order. Docker Compose does not
read `.env.local`.

### Quality Gates

`pnpm verify` checks Compose, PostgreSQL/pgvector, seeded admin access, Prisma,
TypeScript, ESLint, unit tests, the sign-in page, and protected API responses.
Docker infrastructure and the app must already be running. Ollama is checked but
remains optional.

Run the production build separately when changing application code:

```bash
pnpm typecheck
pnpm lint
pnpm test
pnpm build
```

### Service URLs

| Service | URL | Description |
|---------|-----|-------------|
| CRM App | [http://localhost:3001](http://localhost:3001) | Main application |
| MailHog | [http://localhost:8025](http://localhost:8025) | Email testing UI (catches all outbound emails in dev) |
| n8n | [http://localhost:5678](http://localhost:5678) | Workflow automation builder |

## Environment Variables

Copy `.env.example` to `.env` and configure it. Use `.env.local` only for
optional Next.js/verifier overrides that should not affect Docker Compose:

| Variable | Description |
|----------|-------------|
| `DATABASE_URL` | PostgreSQL connection string |
| `CRM_PRIVATE_BIND_IP` | Host IP allowed to serve the temporary MailHog UI; default `127.0.0.1` |
| `NEXTAUTH_SECRET` | Random secret for session encryption |
| `NEXTAUTH_URL` | Canonical app URL (e.g., `http://localhost:3001` or a private Tailscale address) |
| `NEXT_PUBLIC_MAIL_PREVIEW_URL` | Optional MailHog URL shown only for local testing; remove when using real SMTP |
| `ADMIN_EMAILS` | Comma-separated exact emails with full access; at least one is required |
| `PARTNER_ADMIN_EMAILS` | Exact emails allowed to import and perform destructive contact operations |
| `STAFF_EMAILS` | Exact emails allowed to perform routine CRM writes |
| `READ_ONLY_EMAILS` | Exact emails restricted to read operations |
| `ALLOWED_EMAILS` | Additional invited emails receiving the default `staff` role |
| `SMTP_HOST` | SMTP server hostname (use `127.0.0.1` for local MailHog) |
| `SMTP_PORT` | SMTP port (1025 for MailHog) |
| `SMTP_SECURE` | `true` for implicit TLS, normally on port 465 |
| `SMTP_USER` / `SMTP_PASSWORD` | Credentials for a real SMTP provider |
| `EMAIL_FROM` | Sender email address |
| `OLLAMA_URL` | Ollama API URL (default: `http://127.0.0.1:11434`) |
| `INTERNAL_SERVICE_TOKEN` | Read/internal token for the embedding worker and limited OpenClaw reads |
| `CAMPAIGN_STUDIO_SYNC_TOKEN` | Dedicated token accepted only by Campaign Studio synchronization endpoints |
| `CAMPAIGN_SYNC_DEFAULT_OWNER_EMAIL` | Optional CRM user assigned to contacts first created by Campaign Studio |
| `OPENCLAW_WRITE_TOKEN` | Separate token that can submit validated OpenClaw proposals but cannot execute them |

## Production Email Delivery

Local development sends magic links to MailHog. To switch the Windows production instance to Gmail or Google Workspace, first create a Google app password for the sender account, then run this from PowerShell:

```powershell
pnpm email:configure:gmail
```

The command prompts for the app password without displaying it, writes the Gmail SMTP settings to the ignored `.env.local` file, verifies a real test message, rebuilds the app, and restarts the scheduled production service. A failed verification or restart restores the prior MailHog configuration. See [GMAIL_SMTP_SETUP.md](GMAIL_SMTP_SETUP.md) for prerequisites and troubleshooting.

## Campaign Studio Integration

The CRM exposes dedicated token-authenticated endpoints at `/api/internal/campaign-sync/contacts` and `/api/internal/campaign-sync/events`. Configure `CAMPAIGN_STUDIO_SYNC_TOKEN` here with the same long random value used for `CRM_SYNC_TOKEN` in Campaign Studio. Do not reuse `INTERNAL_SERVICE_TOKEN` or `OPENCLAW_WRITE_TOKEN`.

Campaign Studio incrementally reads relationship fields from CRM and sends opted-in contacts plus campaign events back. Event IDs are stored in `CampaignSyncReceipt`, making event retries idempotent. Bounce, complaint, and unsubscribe events add `Do Not Market` tags and stop follow-up activity in CRM. Set `CAMPAIGN_SYNC_DEFAULT_OWNER_EMAIL` when contacts created by Campaign Studio should automatically belong to a specific CRM user.

## Role Hierarchy

| Role | Permissions |
|------|------------|
| `admin` | Full access, user management, settings |
| `partner_admin` | Manage contacts, tasks, programs (no user management) |
| `staff` | View/edit contacts, log interactions, manage tasks |
| `read_only` | View-only access |

**Role Assignment:**
- The configured role lists set initial roles for new users. Role changes made in Settings persist across sign-ins.
- `pnpm db:seed` intentionally reconciles roles from the environment, so rerunning it can replace role changes made in Settings.
- Only exact emails configured in the allowlist or role lists can request or redeem a magic link.
- Imports and destructive contact operations require `partner_admin` or `admin`.

## Backup and Restore

- **Backup:** `pnpm backup:db` (saves a compressed `.sql.gz` to the `backups/` folder)
- **Restore:** `pnpm restore:db ./backups/em_crm_backup_YYYYMMDD_HHMMSS.sql.gz`

## AI Features (Ollama)

The CRM uses Ollama for AI memory extraction and semantic search. This is **optional** — the CRM will function normally without it, but AI features will be disabled.

If you want to use AI features:
1. Install Ollama on your host machine.
2. Pull the required models:
   ```bash
   ollama pull qwen2.5:7b-instruct
   ollama pull nomic-embed-text
   ```
3. Ensure `OLLAMA_URL` in `.env` (or an optional `.env.local` override) points to your Ollama instance.

## Embedding Worker

To generate embeddings for approved memories, call the internal endpoint:

```bash
curl -X POST http://localhost:3001/api/embeddings/run \
  -H "x-internal-token: YOUR_INTERNAL_SERVICE_TOKEN" \
  -H "Content-Type: application/json"
```

This can be scheduled via cron, n8n workflow, or triggered after memory approval.

## OpenClaw Integration For Nia

Nia can read a limited operational CRM summary through the internal endpoint:

```bash
curl http://localhost:3001/api/internal/ops-summary \
  -H "x-internal-token: YOUR_INTERNAL_SERVICE_TOKEN"
```

The read endpoints return operational health and limited contact identity fields. They do not expose full CRM notes or memory bodies.

Nia can also submit proposals for five controlled actions: creating a task, logging an interaction, scheduling a follow-up, updating a lifecycle stage, or adding tags. Proposals use a separate `OPENCLAW_WRITE_TOKEN` and cannot directly change CRM data. An admin or partner admin must approve each proposal on the **Agent Approvals** page; only an `executed` proposal has changed the CRM.

Deletion, merges, imports, invoices, opportunities, user roles, bulk changes, and direct database access are not available to the OpenClaw integration. See `integrations/openclaw/README.md` for installation and security details.

## Saved Views

Saved Views let you persist filtered and sorted contact list configurations. From the Contacts page:

1. Apply filters (stage, search, tags) and sorting
2. Click **Save View** to name and save the current configuration
3. Toggle **Shared** to make the view available to all team members
4. Switch between saved views using the dropdown in the page header

## CSV Import Wizard

The import follows a 5-step staged workflow:

1. **Upload** — Drag-and-drop or browse for a CSV file
2. **Map Columns** — Auto-mapped columns with manual override (CSV column → CRM field)
3. **Validate** — Dry-run deduplication preview showing per-row actions:
   - **Will Create** — No matching contact found by email or phone
   - **Will Update** — Existing contact matched (tags are merged, not overwritten)
   - **Will Skip** — Row has insufficient identifying data
4. **Run** — Execute the import with the previewed actions
5. **Done** — Summary with created/updated/skipped/errored counts

---

## Build EM CRM App (Capacitor)

The supported Android/iOS client is in `mobile/`. It is a new Capacitor 8 shell
for the current Next.js/Auth.js CRM at
`https://crm.elevatedmovements.com`; it does not restore the retired Google Apps
Script wrapper.

```powershell
cd mobile
npm install
npm run build

# Create each platform once, if its directory is not already present:
npm run add:android
npm run add:ios       # macOS only

npm run assets
npm run sync
npm run open:android
npm run open:ios      # macOS only
```

Use `npm run sync:android` on Windows when the iOS project has not been created.
If a platform already exists, run its sync command instead of its add command.

The app uses `com.elevatedmovements.crm`, displays as **EM CRM**, allows only the
canonical HTTPS CRM origin, and preserves Auth.js rather than embedding secrets
or bypassing authentication. Verified HTTPS magic-link handoff additionally
requires the public Android signing fingerprint and Apple Team ID. See
[`mobile/README.md`](mobile/README.md) and
[`mobile/ASSOCIATED_LINKS.md`](mobile/ASSOCIATED_LINKS.md).

The root-level `manifest.json` and duplicate icons remain only as historical PWA
assets; the deployed web manifest is `public/manifest.json`.

## License

Private — Elevated Movements
