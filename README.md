# Elevated Movements CRM V1.6

AI-powered Contact Relationship Management system built with Next.js 14, Prisma, PostgreSQL (pgvector), Auth.js, and Ollama.

## Features

- **Contact Management** — Full CRUD with lifecycle stages, tags, owner assignment, follow-up tracking
- **AI Memory Extraction** — Automatically extracts factual insights from interaction notes using Ollama (qwen2.5:7b-instruct)
- **Memory Inbox** — Review, approve, pin, or reject AI-proposed memory items with bulk actions
- **Semantic Search** — Natural language search across approved memories using pgvector cosine similarity
- **Opportunities Pipeline** — Kanban-style drag-and-drop board for tracking deals through stages
- **Task Management** — Priority levels (low/medium/high/urgent), due dates, contact linking
- **CSV Import** — Upload CSV files with auto column mapping and deduplication
- **Programs & Enrollments** — Track programs and contact enrollments
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
cp .env.example .env
# Edit .env with your SMTP credentials and secrets

# 3. Start infrastructure (PostgreSQL + Ollama)
docker compose up -d

# 4. Pull Ollama models
docker exec ollama ollama pull qwen2.5:7b-instruct
docker exec ollama ollama pull nomic-embed-text

# 5. Install dependencies
pnpm install

# 6. Run database migrations
pnpm db:migrate

# 7. Start development server
pnpm dev
```

Open [http://localhost:3000](http://localhost:3000) and sign in with your email.

## Environment Variables

Copy `.env.example` to `.env` and configure:

| Variable | Description |
|----------|-------------|
| `DATABASE_URL` | PostgreSQL connection string |
| `NEXTAUTH_SECRET` | Random secret for session encryption |
| `NEXTAUTH_URL` | Base URL of your app (e.g., `http://localhost:3000`) |
| `SMTP_HOST` | SMTP server hostname |
| `SMTP_PORT` | SMTP port (587 for TLS) |
| `SMTP_USER` | SMTP username |
| `SMTP_PASS` | SMTP password |
| `EMAIL_FROM` | Sender email address |
| `OLLAMA_BASE_URL` | Ollama API URL (default: `http://localhost:11434`) |
| `INTERNAL_API_TOKEN` | Token for internal API calls (embedding worker) |
| `ADMIN_EMAILS` | Comma-separated admin email addresses |

## Project Structure

```
src/
├── app/
│   ├── (dashboard)/          # Dashboard pages (with sidebar layout)
│   │   ├── page.tsx          # Dashboard home
│   │   ├── contacts/         # Contacts list + detail
│   │   ├── tasks/            # Task management
│   │   ├── pipeline/         # Opportunities Kanban
│   │   ├── memory-inbox/     # AI memory review
│   │   ├── search/           # Semantic search
│   │   ├── programs/         # Programs management
│   │   ├── imports/          # CSV import
│   │   └── settings/         # User management + roles
│   ├── api/                  # API routes
│   │   ├── auth/             # NextAuth routes
│   │   ├── contacts/         # Contacts CRUD + bulk
│   │   ├── interactions/     # Interaction logging
│   │   ├── tasks/            # Task CRUD
│   │   ├── opportunities/    # Pipeline CRUD
│   │   ├── memory/           # Memory queue, bulk, search
│   │   ├── embeddings/       # Embedding worker
│   │   ├── programs/         # Programs CRUD
│   │   ├── imports/          # CSV import pipeline
│   │   ├── users/            # User management
│   │   └── dashboard/        # Dashboard stats
│   └── auth/signin/          # Magic link sign-in page
├── components/
│   ├── crm/                  # CRM-specific components
│   └── ui/                   # shadcn/ui components
├── hooks/                    # Custom React hooks
├── lib/
│   ├── ai/                   # Ollama integration
│   ├── auth/                 # Auth helpers + role guards
│   ├── db/                   # Prisma client
│   ├── phone/                # Phone normalization
│   └── validations/          # Zod schemas
└── types/                    # TypeScript declarations
prisma/
├── schema.prisma             # Database schema
└── migrations/               # pgvector setup
```

## Embedding Worker

To generate embeddings for approved memories, call the internal endpoint:

```bash
curl -X POST http://localhost:3000/api/embeddings/run \
  -H "Authorization: Bearer YOUR_INTERNAL_API_TOKEN" \
  -H "Content-Type: application/json"
```

This can be scheduled via cron or triggered after memory approval.

## Role Hierarchy

| Role | Permissions |
|------|------------|
| `admin` | Full access, user management, settings |
| `partner_admin` | Manage contacts, tasks, programs (no user management) |
| `staff` | View/edit contacts, log interactions, manage tasks |
| `read_only` | View-only access |

The first user whose email matches `ADMIN_EMAILS` is automatically assigned the `admin` role.

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
