# Backup and Restore Runbook

This guide explains how to safely back up and restore the Elevated Movements CRM local database.

## How to Create a Backup

To create a full backup of your local CRM database, run:

```bash
pnpm backup:db
```

This script will:
1. Connect to the local `em_postgres` Docker container.
2. Run `pg_dump` to extract all schema and data.
3. Compress the output into a `.gz` file.
4. Remove local backup files older than 30 days.

## Where Backups are Stored

Backups are saved in the `backups/` directory at the root of the project.
The files are named with a timestamp, for example:
`backups/em_crm_backup_20260508_143000.sql.gz`

*Note: The `backups/` directory is ignored by git, so your data will not be accidentally committed to the repository.*

## How to Restore

To restore the database from a previous backup, run the restore script and pass the path to the backup file:

```bash
pnpm restore:db ./backups/em_crm_backup_20260508_143000.sql.gz
```

**⚠️ WARNING:** Restoring a backup will **OVERWRITE** your current database. The script will prompt you for confirmation before proceeding.

## Non-Destructive Restore Verification

Verify the newest backup by restoring it into a temporary database:

```powershell
pnpm backup:verify
```

This confirms that the archive decompresses, PostgreSQL accepts the complete SQL dump, and the restored contact, user, and migration records are present. It never modifies the live `em_crm` database.

## Automatic Schedule

On the Windows CRM host, run `pnpm ops:install` once. This installs a daily backup task at 7:00 PM and a weekly restore-verification task on Sunday at 7:30 PM. The latest backup age is also included in `pnpm health:production`.

## Manual Restore Verification

1. After the restore script completes, restart your Next.js development server if it is running (`Ctrl+C` then `pnpm dev`).
2. Open the CRM in your browser (http://localhost:3001).
3. Check the **Dashboard** to ensure your stats match the time of the backup.
4. Open the **Contacts** list and verify your recent contacts are present.
5. If you see any errors, you can also check the database directly using Prisma Studio:
   ```bash
   pnpm db:studio
   ```
