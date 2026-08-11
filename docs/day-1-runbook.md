# EM CRM Day 1 Runbook

## Start

```powershell
cd F:\dev\em-crm-pwa
docker compose up -d
pnpm db:push
pnpm db:seed
pnpm dev
```

Open `http://localhost:3001`.

## Stop

Stop the dev server with `Ctrl+C`. To stop infrastructure:

```powershell
cd F:\dev\em-crm-pwa
docker compose stop
```

## Back Up

```powershell
cd F:\dev\em-crm-pwa
pnpm backup:db
```

Backups are written to `backups/` and ignored by Git.

## Sign In

CRM uses magic-link email auth. In local development, MailHog is available at `http://localhost:8025`.

Seeded admin emails:

- the addresses configured in `ADMIN_EMAILS` (see `.env`)


## Verify Imports

- Contacts: open `/contacts`.
- Imported notes are stored as `note` interactions.
- Starter saved views are seeded for follow-ups, Needs Review, Phone Only, Do Not Market, Shria-Owned, and High Priority.

## What Not To Touch Yet

- Do not trigger marketing automations from CRM import data.
- Do not run full imports until Darnell approves.
- Treat bounced/unsubscribed records as CRM metadata/tags only, not marketing permissions.

## Known Limitations

- Local Postgres uses host port `5434` on this machine because port `5432` is already occupied.
- AI memory features require Ollama to be running separately.

## Next Workflow

1. Review imported contacts and saved views.
2. Assign owners and follow-up dates.
3. Use `Needs Review` before any marketing decisions.
