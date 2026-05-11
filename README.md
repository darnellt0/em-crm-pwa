# Elevated Movements CRM V1.6.1

AI-powered Contact Relationship Management system built with Next.js 14, Prisma, PostgreSQL (pgvector), Auth.js, and Ollama.

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
| Framework | Next.js 14 (App Router) |
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
- Node.js 18+
- pnpm

## Quick Start

```bash
# 1. Clone the repository
git clone https://github.com/darnellt0/em-crm-pwa.git
cd em-crm-pwa

# 2. Copy environment variables
cp .env.example .env.local
# Edit .env.local with your SMTP credentials and secrets

# 3. Start infrastructure (PostgreSQL + MailHog + n8n)
docker compose up -d

# 4. Install dependencies
pnpm install

# 5. Run database migrations and seed users
pnpm db:push
pnpm db:seed

# 6. Verify setup
pnpm verify

# 7. Start development server
pnpm dev
```

Open [http://localhost:3000](http://localhost:3000) and sign in with your email. For local development, check MailHog at [http://localhost:8025](http://localhost:8025) for your magic link.

### Service URLs

| Service | URL | Description |
|---------|-----|-------------|
| CRM App | [http://localhost:3000](http://localhost:3000) | Main application |
| MailHog | [http://localhost:8025](http://localhost:8025) | Email testing UI (catches all outbound emails in dev) |
| n8n | [http://localhost:5678](http://localhost:5678) | Workflow automation builder |

## Environment Variables

Copy `.env.example` to `.env.local` and configure:

| Variable | Description |
|----------|-------------|
| `DATABASE_URL` | PostgreSQL connection string |
| `NEXTAUTH_SECRET` | Random secret for session encryption |
| `NEXTAUTH_URL` | Base URL of your app (e.g., `http://localhost:3000`) |
| `SMTP_HOST` | SMTP server hostname (use `localhost` for local dev with MailHog) |
| `SMTP_PORT` | SMTP port (1025 for MailHog) |
| `EMAIL_FROM` | Sender email address |
| `OLLAMA_URL` | Ollama API URL (default: `http://127.0.0.1:11434`) |
| `INTERNAL_SERVICE_TOKEN` | Token for internal API calls (embedding worker) |

## Role Hierarchy

| Role | Permissions |
|------|------------|
| `admin` | Full access, user management, settings |
| `partner_admin` | Manage contacts, tasks, programs (no user management) |
| `staff` | View/edit contacts, log interactions, manage tasks |
| `read_only` | View-only access |

**Role Assignment:**
- Darnell and Shria are deterministically created as `admin` users via the `pnpm db:seed` script.
- Any other user who signs in for the first time will default to the `staff` role.

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
3. Ensure `OLLAMA_URL` in `.env.local` points to your Ollama instance.

## Embedding Worker

To generate embeddings for approved memories, call the internal endpoint:

```bash
curl -X POST http://localhost:3000/api/embeddings/run \
  -H "x-internal-token: YOUR_INTERNAL_SERVICE_TOKEN" \
  -H "Content-Type: application/json"
```

This can be scheduled via cron, n8n workflow, or triggered after memory approval.

## Internal Ops Summary For Nia

Nia can read a limited operational CRM summary through the internal endpoint:

```bash
curl http://localhost:3000/api/internal/ops-summary \
  -H "x-internal-token: YOUR_INTERNAL_SERVICE_TOKEN"
```

This endpoint is read-only and returns aggregate CRM health, pipeline, task, follow-up, and memory-review counts plus short focus lists. It does not expose full CRM notes or memory bodies.

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

## Legacy: PWA & Mobile Distribution

The original repository provided PWA assets and a Capacitor mobile wrapper for the Google Apps Script version of the CRM. Those files remain in the repository for reference:

- **manifest.json** — PWA manifest for the Apps Script web app
- **icon-192.png / icon-512.png** — App icons
- **mobile/** — Capacitor native app wrapper
- **tools/** — Icon generation scripts

See the `mobile/README.md` for the original Capacitor setup instructions.

## License

Private — Elevated Movements
