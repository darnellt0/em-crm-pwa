# Local MVP Verification Checklist

Run the automated checks first:

```bash
pnpm verify
```

Then manually confirm the following in the browser:

## Setup
- [ ] `pnpm install` completes without errors
- [ ] `docker compose up -d` starts all three services (postgres, mailhog, n8n)
- [ ] `pnpm db:push` applies schema without errors
- [ ] `pnpm db:seed` creates Darnell and Shria as admin users
- [ ] `pnpm dev` starts the app at http://localhost:3000

## Auth
- [ ] Sign-in page loads at http://localhost:3000/auth/signin
- [ ] Entering Darnell's email sends a magic link
- [ ] MailHog at http://localhost:8025 shows the email
- [ ] Clicking the magic link signs in successfully
- [ ] After sign-in, user is redirected to the dashboard
- [ ] Verify page at http://localhost:3000/auth/verify shows MailHog tip

## Dashboard
- [ ] Dashboard loads and shows stat cards
- [ ] Today's Focus panel shows tasks/follow-ups (or a clean empty state)
- [ ] Interaction sparkline chart renders

## Contacts
- [ ] Contacts list loads (or shows empty state with instructions)
- [ ] Can create a new contact
- [ ] Can edit a contact's details
- [ ] Can set a follow-up date
- [ ] Contact detail page shows interactions, tasks, and opportunities tabs
- [ ] Overdue task banner appears when a task is past due
- [ ] Empty states on tabs show actionable messages

## Interactions
- [ ] Can log an interaction from the contact detail page
- [ ] Interaction appears in the Interactions tab

## Tasks
- [ ] Can create a task from the Tasks page
- [ ] Can create a task from the contact detail page
- [ ] Can mark a task as done
- [ ] Overdue tasks are highlighted in red

## Pipeline
- [ ] Pipeline page loads with Kanban columns
- [ ] Can create an opportunity
- [ ] Can drag/move an opportunity between stages

## Programs
- [ ] Programs page loads (or shows empty state with instructions)
- [ ] Can create a program

## CSV Import
- [ ] Import page loads
- [ ] Can upload a CSV file and proceed through the 5-step wizard

## Memory Inbox
- [ ] Memory Inbox loads (or shows empty state with Ollama note)
- [ ] If Ollama is running: logging an interaction with a summary creates proposed memories

## Semantic Search
- [ ] Search page loads
- [ ] If Ollama is running: searching returns relevant memories

## Settings
- [ ] Settings page loads and shows user list
- [ ] Admin can change another user's role

## Backup
- [ ] `pnpm backup:db` creates a `.sql.gz` file in `backups/`
- [ ] `pnpm restore:db ./backups/<file>.sql.gz` restores the database
